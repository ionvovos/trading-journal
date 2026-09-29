// Monthly heat map: Monday-first 7 columns plus a Week column. A cell shows the day number and the rounded signed amount, three
// tint steps per sign by magnitude, loss cells hatched. Week and month totals come from the exact figures (S13, AC-P3.2), so day
// cells are rounded while totals are exact; the caller's caption says so.
import { el } from '../dom.js';
import { defaultFmt } from './defaultFmt.js';
import { MINUS } from '../../i18n/format.js';
import { t } from '../../i18n/i18n.js';

const HEAD = { en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], el: ['Δε', 'Τρ', 'Τε', 'Πε', 'Πα', 'Σα', 'Κυ'] };

export function calendarGrid({ year, month, days, weeks = [], fmt = defaultFmt(), ccy = 'USD', selected, today, onSelect, ariaLabel }) {
  const digits = 10 ** (fmt.minorDigits?.(ccy) ?? 2);
  const byDate = new Map(days.map((d) => [d.date, d]));
  const max = Math.max(1, ...days.map((d) => Math.abs(d.netMinor)));
  const level = (v) => { const a = Math.abs(v) / max; return (v > 0 ? 'g' : 'l') + (a < 1 / 3 ? 1 : a < 2 / 3 ? 2 : 3); };
  const short = (minor) => {
    const v = minor / digits;
    const sign = minor > 0 ? '+' : MINUS;
    return Math.abs(v) >= 1000 ? `${sign}${fmt.num(Math.abs(v) / 1000, 1)}k` : `${sign}${fmt.num(Math.round(Math.abs(v)), 0)}`;
  };
  const cells = HEAD[fmt.lang].map((h) => el('div', { class: 'h' }, h));
  cells.push(el('div', { class: 'h' }, t('calendar.week')));
  const first = new Date(Date.UTC(year, month - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const dim = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const rowsCount = Math.ceil((lead + dim) / 7);
  const iso = (d) => `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  for (let w = 0; w < rowsCount; w += 1) {
    let sum = 0; let any = false;
    for (let c = 0; c < 7; c += 1) {
      const d = w * 7 + c - lead + 1;
      if (d < 1 || d > dim) {
        const shown = d < 1 ? new Date(Date.UTC(year, month - 1, d)).getUTCDate() : d - dim;
        cells.push(el('div', { class: 'c out' }, el('span', { class: 'dn' }, shown)));
        continue;
      }
      const rec = byDate.get(iso(d));
      const cls = ['c', rec ? level(rec.netMinor) : 'none', iso(d) === selected && 'sel', iso(d) === today && 'today'];
      const cell = el(rec && onSelect ? 'button' : 'div', { class: cls, type: rec && onSelect ? 'button' : null, onClick: rec && onSelect ? () => onSelect(iso(d)) : null },
        el('span', { class: 'dn' }, d), rec ? el('span', { class: 'pv' }, short(rec.netMinor)) : null);
      if (rec) { sum += rec.netMinor; any = true; }
      cells.push(cell);
    }
    const wk = weeks[w]?.netMinor ?? sum;
    cells.push(el('div', { class: ['wk', any || weeks[w] ? (wk > 0 ? 'gain' : wk < 0 ? 'loss' : 'flat') : 'flat'] }, any || weeks[w] ? short(wk) : ''));
  }
  return el('div', { class: 'cal', role: 'grid', 'aria-label': ariaLabel }, ...cells);
}
