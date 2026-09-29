// Underwater chart: drawdown from the running peak, on the same x axis as the equity curve. Amounts come from the trades-only
// curve (S11); the percentage denominator is the caller's business. Ticks every 500 (or a nice step for small accounts).
import { svg } from '../dom.js';
import { defaultFmt } from './defaultFmt.js';
import { niceStep, xLabels } from './lineChart.js';
import { MINUS } from '../../i18n/format.js';

const W = 296;

export function underwaterChart({ points, fmt = defaultFmt(), height = 78, ariaLabel, troughLabel }) {
  const h = height; const pw = W - 42; const ph = h - 18;
  let peak = -Infinity;
  const dd = points.map((p) => { peak = Math.max(peak, p.v); return p.v - peak; });
  const min = Math.min(...dd, 0);
  const step = min === 0 ? 1 : Math.min(500, niceStep(-min));
  const lo = Math.floor(min / step) * step || -step;
  const x = (i) => (points.length < 2 ? pw : (i / (points.length - 1)) * pw);
  const y = (v) => (v / lo) * ph;
  const f1 = (n) => n.toFixed(1);
  const area = `M0,0${dd.map((v, i) => `L${f1(x(i))},${f1(y(v))}`).join('')}L${pw},0Z`;
  const kids = [];
  for (let v = 0; v >= lo; v -= step) {
    kids.push(svg('line', { class: v ? 'grid' : 'zero', x1: 0, x2: pw, y1: f1(y(v)), y2: f1(y(v)) }));
    kids.push(svg('text', { x: W, y: f1(y(v) + (v ? -4 : 12)), 'text-anchor': 'end' }, v ? `${MINUS}${fmt.num(-v, 0)}` : '0'));
  }
  const ti = dd.indexOf(min);
  kids.push(svg('path', { class: 'dd', d: area }));
  if (min < 0) kids.push(svg('text', { class: 'lbl-loss', x: f1(x(ti) + 8), y: f1(y(min) + 2) }, troughLabel ?? `${MINUS}${fmt.num(-min, 2)}`));
  for (const l of xLabels(points, fmt)) kids.push(svg('text', { x: f1(x(l.index)), y: h - 2, 'text-anchor': l.anchor }, l.text));
  return svg('svg', { class: 'chart', viewBox: `0 0 ${W} ${h}`, role: 'img', 'aria-label': ariaLabel }, ...kids);
}
