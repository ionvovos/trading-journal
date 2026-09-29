// R histogram: 0.5R bins from at most -1.5R to at least 3R, count above each bar with a surface-coloured halo, bars below 0R
// hatched loss, above solid gain. The mean line has its label in a row of its own above the bars, so no count sits under it.
import { svg } from '../dom.js';
import { defaultFmt } from './defaultFmt.js';
import { MINUS } from '../../i18n/format.js';

const W = 296;
export const R_EDGES = [-Infinity, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5, 3, Infinity];

// counts(rs) -> 11 bin counts for an array of R values.
export const binR = (rs) => R_EDGES.slice(0, -1).map((lo, i) => rs.filter((r) => r >= lo && r < R_EDGES[i + 1]).length);

export function histogram({ counts, mean, meanText, fmt = defaultFmt(), height = 146, ariaLabel }) {
  const h = height; const top = 34; const ph = h - top - 22;
  const max = Math.max(1, ...counts);
  const bw = W / counts.length;
  const xr = (r) => ((r + 2) / 5.5) * W; // -2 .. 3.5
  const mx = xr(mean);
  const f1 = (n) => n.toFixed(1);
  const kids = [svg('line', { class: 'zero', x1: xr(0), x2: xr(0), y1: top - 4, y2: top + ph })];
  counts.forEach((n, i) => {
    const bh = (n / max) * ph;
    const negative = i < 4;
    kids.push(svg('rect', { class: negative ? 'lossbar' : 'gainbar', x: f1(i * bw + 2), y: f1(top + ph - bh), width: f1(bw - 4), height: f1(bh), rx: 2 }));
  });
  kids.push(svg('line', { class: 'zero', x1: 0, x2: W, y1: top + ph, y2: top + ph }));
  counts.forEach((n, i) => kids.push(svg('text', { class: 'halo', x: f1(i * bw + bw / 2), y: f1(top + ph - (n / max) * ph - 4), 'text-anchor': 'middle' }, String(n))));
  kids.push(svg('line', { class: 'mean-line', x1: f1(mx), x2: f1(mx), y1: 14, y2: top - 8 }));
  kids.push(svg('path', { class: 'mean-tri', d: `M${f1(mx - 4)},${top - 9}L${f1(mx + 4)},${top - 9}L${f1(mx)},${top - 3}Z` }));
  kids.push(svg('path', { class: 'mean-tri', d: `M${f1(mx - 4)},${top + ph + 7}L${f1(mx + 4)},${top + ph + 7}L${f1(mx)},${top + ph + 1}Z` }));
  kids.push(svg('text', { class: 'hl mean-text', x: f1(mx + 5), y: 11 }, meanText));
  for (const r of [-2, -1, 0, 1, 2, 3]) {
    kids.push(svg('text', { x: f1(xr(r)), y: h - 2, 'text-anchor': r === -2 ? 'start' : 'middle' }, `${r > 0 ? '+' : r < 0 ? MINUS : ''}${fmt.num(Math.abs(r), 0)}R`));
  }
  return svg('svg', { class: 'chart', viewBox: `0 0 ${W} ${h}`, role: 'img', 'aria-label': ariaLabel }, ...kids);
}
