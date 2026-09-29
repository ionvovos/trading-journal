// barList({ rows: [{ label, value, n, meta, valueText }] }): diverging bars from a centre zero line, gain solid to the right,
// loss hatched to the left, ONE colour rule and no highlight: rows render in exactly the order given (AC-B1.4, no best or worst).
import { el } from '../dom.js';
import { defaultFmt } from './defaultFmt.js';
import { delta, toneOf } from '../components/figure.js';

export function barList({ rows, fmt = defaultFmt(), ccy = 'USD', compact = false, ariaLabel }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  return el('div', { class: ['bucket-list', compact && 'hours'], role: 'list', 'aria-label': ariaLabel },
    ...rows.map((r) => {
      const tone = toneOf(r.value);
      const bar = el('span', { class: ['bar', r.value < 0 ? 'l' : 'g'] });
      bar.style.width = `${(Math.abs(r.value) / max) * 50}%`;
      return el('div', { class: 'bk', role: 'listitem' },
        el('span', { class: 'name' }, r.label),
        delta(r.valueText ?? fmt.money(r.value, ccy), tone),
        el('span', { class: 'meta' }, r.meta ?? ''),
        el('span', { class: 'track' }, r.value === 0 ? null : bar));
    }));
}
