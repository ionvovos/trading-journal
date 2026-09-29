// Equity curve: one point per closed trade (S10). Hand-written SVG, 296 units wide (the content width at 360 px), so 11 px text
// never renders smaller. Points: [{ v: number in display units, t: ISO time }]. Grid steps are nice numbers so a 10,000 paper
// account shows 10,000-10,060, not a flat line; a `k` suffix only when the step is 100 or more.
import { svg } from '../dom.js';
import { defaultFmt } from './defaultFmt.js';

const W = 296;
const NICE = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000];
export const niceStep = (range) => NICE.find((s) => range / s <= 3) ?? 10000;
const kfmt = (v, dec) => `${(v / 1000).toFixed(1).replace('.', dec)}k`;

// x axis: the first date with its month, then day numbers about a week apart inside one month; month names across months.
export function xLabels(points, fmt) {
  if (points.length < 2 || !points[0].t) return [];
  const first = fmt.parts(points[0].t);
  const last = fmt.parts(points[points.length - 1].t);
  const dayOf = (p) => Date.UTC(p.y, p.m - 1, p.d) / 86400000;
  const spanDays = dayOf(last) - dayOf(first);
  const labels = [{ index: 0, text: fmt.date(points[0].t), anchor: 'start' }];
  const indexAtOrAfter = (target) => points.findIndex((p) => { const q = fmt.parts(p.t); return dayOf(q) >= target; });
  if (spanDays <= 45) {
    for (let d = 7; d <= spanDays; d += 7) {
      const i = indexAtOrAfter(dayOf(first) + d);
      if (i > 0 && i !== labels[labels.length - 1].index) labels.push({ index: i, text: String(fmt.parts(points[i].t).d), anchor: 'middle' });
    }
    // Always close the axis with the last date when it is not too near the previous label.
    const end = points.length - 1;
    const prev = labels[labels.length - 1].index;
    if (end - prev >= Math.max(2, points.length * 0.18)) labels.push({ index: end, text: String(last.d), anchor: 'middle' });
  } else {
    let m = first.m; let y = first.y;
    for (let k = 0; k < 24; k += 1) {
      m += 1; if (m > 12) { m = 1; y += 1; }
      const i = indexAtOrAfter(Date.UTC(y, m - 1, 1) / 86400000);
      if (i > 0 && i !== labels[labels.length - 1].index) labels.push({ index: i, text: fmt.monthShort(m), anchor: 'middle' });
      if (y > last.y || (y === last.y && m >= last.m)) break;
    }
  }
  return labels;
}

export function lineChart({ points, fmt = defaultFmt(), height = 120, drawdown, ariaLabel, showX = true, animate = true }) {
  const h = height;
  const pw = W - 42; const top = 14; const ph = h - top - (showX ? 18 : 4);
  const vs = points.map((p) => p.v);
  const step = niceStep(Math.max(...vs) - Math.min(...vs));
  const lo = Math.floor(Math.min(...vs) / step) * step;
  const hi = Math.max(Math.ceil(Math.max(...vs) / step) * step, lo + step);
  const x = (i) => (points.length < 2 ? pw : (i / (points.length - 1)) * pw);
  const y = (v) => top + ph - ((v - lo) / (hi - lo)) * ph;
  const dec = fmt.lang === 'el' ? ',' : '.';
  const label = (v) => (step >= 100 ? kfmt(v, dec) : fmt.num(v, 0));
  const f1 = (n) => n.toFixed(1);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${f1(x(i))},${f1(y(p.v))}`).join('');
  const last = points.length - 1;

  const kids = [];
  for (let v = lo; v <= hi + 1e-9; v += step) {
    kids.push(svg('line', { class: 'grid', x1: 0, x2: W, y1: f1(y(v)), y2: f1(y(v)) }));
    kids.push(svg('text', { x: W, y: f1(y(v) - 4), 'text-anchor': 'end' }, label(v)));
  }
  kids.push(svg('path', { class: 'eq-fill', d: `${line}L${f1(x(last))},${top + ph}L0,${top + ph}Z` }));
  if (drawdown) {
    const { peakIndex: pi, troughIndex: ti } = drawdown;
    kids.push(svg('rect', { class: 'band', x: f1(x(pi)), y: top, width: f1(x(ti) - x(pi)), height: ph }));
    kids.push(svg('line', { class: 'ddmark', x1: f1(x(ti)), x2: f1(x(ti)), y1: f1(y(points[pi].v)), y2: f1(y(points[ti].v)) }));
    kids.push(svg('circle', { class: 'peak', cx: f1(x(pi)), cy: f1(y(points[pi].v)), r: 3.5 }));
    kids.push(svg('circle', { class: 'peak dd', cx: f1(x(ti)), cy: f1(y(points[ti].v)), r: 3.5 }));
    if (drawdown.label) kids.push(svg('text', { class: 'lbl-loss', x: f1((x(pi) + x(ti)) / 2), y: top + 12, 'text-anchor': 'middle' }, drawdown.label));
  }
  kids.push(svg('path', { class: ['eq', animate && 'draw'], d: line, pathLength: 1 }));
  kids.push(svg('circle', { class: 'dot-eq', cx: f1(x(last)), cy: f1(y(points[last].v)), r: 4 }));
  if (showX) for (const l of xLabels(points, fmt)) kids.push(svg('text', { x: f1(x(l.index)), y: h - 2, 'text-anchor': l.anchor }, l.text));
  return svg('svg', { class: 'chart', viewBox: `0 0 ${W} ${h}`, role: 'img', 'aria-label': ariaLabel }, ...kids);
}
