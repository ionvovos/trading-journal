// Renders every shared chart on the L2d sample dataset (harness only), to check them at 390x844 and 360x800 in both themes and
// against the stats mockups: equity with drawdown marks, underwater, R histogram, bucket bars (setup and hours), calendar.
import { TRADES, S, equityPoints, ddStats, DAYS, RBINS } from '../../design/tools/lib.mjs';
import { ui } from '../../src/ui/components/index.js';
import { el } from '../../src/ui/dom.js';
import { createFormat, MINUS } from '../../src/i18n/format.js';

const iso = (d) => `2026-09-${String(d).padStart(2, '0')}T12:00:00Z`;
const cents = (v) => Math.round(v * 100);

export function renderCharts(root, lang) {
  const fmt = createFormat({ lang, tz: 'Europe/Athens', navLang: 'en-GB' });
  const src = equityPoints();
  const pts = src.map((p) => ({ t: iso(p.day), v: p.v, day: p.day }));
  const d = ddStats(src);
  const peakIndex = src.indexOf(d.peak); const troughIndex = src.indexOf(d.trough);
  const card = (title, ...kids) => el('section', { class: 'card' }, el('div', { class: 'card-h' }, el('h3', null, title)), ...kids);
  const rows = S.setups.map((s) => ({ label: s.key, value: cents(s.net), meta: `n ${s.n} · ${fmt.pct(s.winRate, 0)} won` }));
  const hours = S.hours.map((h) => ({ label: String(h.key).padStart(2, '0'), value: cents(h.net), meta: `n ${h.n}` }));
  root.append(el('main', { class: 'content' },
    card('Equity, with the drawdown span', ui.lineChart({ points: pts, fmt, height: 160, drawdown: { peakIndex, troughIndex, label: `${MINUS}${fmt.num(Math.abs(d.pct), 1)}%` }, ariaLabel: 'Equity curve' })),
    card('Drawdown from the peak', ui.underwaterChart({ points: pts, fmt, ariaLabel: 'Drawdown' })),
    card('R distribution', ui.histogram({ counts: RBINS.map((b) => b[2]), mean: S.expR, meanText: `average +${fmt.num(S.expR, 2)}R`, fmt, ariaLabel: 'R histogram' })),
    card('By setup', ui.barList({ rows, fmt, ccy: 'USD' })),
    card('By hour', ui.barList({ rows: hours.filter((h) => h.meta !== 'n 0'), fmt, ccy: 'USD', compact: true })),
    card('September', ui.calendarGrid({ year: 2026, month: 9, days: DAYS.map(([day, net, n]) => ({ date: `2026-09-${String(day).padStart(2, '0')}`, netMinor: cents(net), n })), fmt, ccy: 'USD', selected: '2026-09-28', today: '2026-09-29' })),
  ));
  return TRADES.length;
}
