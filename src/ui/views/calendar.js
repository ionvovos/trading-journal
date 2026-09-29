// Calendar (#/calendar?m=YYYY-MM; design/mockups calendar): net P&L per day of close in the declared zone with the day cut-off,
// weeks Monday to Sunday summed over their days in the month, and the trades of the tapped day (S13).
import { el, mount } from '../dom.js';
import { t } from '../../i18n/i18n.js';
import { loadModel } from '../../storage/model.js';
import { computeStats, defaultMonth } from '../../storage/statsModel.js';
import { closeDay, sizeText, sideText, detailBar } from '../../storage/viewkit.js';
import { shiftMonth } from './stats.js';
import { localParts } from '../../core/time.js';

export async function render(root, ctx, params = {}) {
  let disposed = false;
  let month = /^\d{4}-\d{2}$/.test(params.query?.m || '') ? params.query.m : null;
  let selected = null;

  async function paint() {
    const model = await loadModel(ctx.store);
    if (disposed) return;
    const { fmt, ui } = ctx;
    if (!month) month = defaultMonth(model.trades.filter((x) => x.mode === ctx.mode), ctx);
    const [year, mon] = month.split('-').map(Number);
    let s;
    try { s = await computeStats(ctx, model, { period: null }); } catch (e) { console.error('calendar failed', e); s = null; }
    if (disposed) return;
    const ccy = ctx.displayCurrency();
    const bar = ui.topbar({ mode: ctx.mode, paper: ctx.mode === 'paper', title: t('calendar.title'), back: { label: t('nav.stats'), onClick: () => ctx.navigate('#/stats/overview') }, right: ui.modeBadge(ctx.mode) });
    if (!s) { mount(root, bar, el('main', { class: 'content' }, ui.stateBanner({ kind: 'danger', iconName: 'alert', title: t('home.error.title'), body: t('home.error.body') }))); return; }
    const cal = s.stats.calendar(s.included, { year, month: mon }, s.sctx);
    const days = (Array.isArray(cal.days) ? cal.days : Object.entries(cal.days).map(([date, netMinor]) => ({ date, netMinor }))).map((d) => ({ date: d.date, netMinor: d.netMinor, n: d.n }));
    const todayDate = localParts(new Date().toISOString(), ctx.tz).date;
    const monthTitle = fmt.date(`${month}-15T12:00:00Z`, { style: 'monthYear', zone: 'UTC' });
    const dayTrades = selected ? s.included.filter((tr) => closeDay(tr, ctx) === selected) : [];
    const dayTotal = dayTrades.reduce((sum, tr) => sum + (s.displayNet(tr) ?? 0), 0);
    const rowFor = (tr) => {
      const net = s.displayNet(tr);
      const r = tr.entryUnknown ? null : s.stats.rMultiple(tr);
      return ui.listRow({ market: tr.market, title: tr.instrument, meta: `${sideText(tr)} ${sizeText(tr, fmt)}${tr.setup ? ` · ${tr.setup}` : ''}`, money: net === null ? null : { text: fmt.money(net, ccy), value: net }, r: r == null ? null : fmt.r(r), rTone: r ? (r > 0 ? 'gain' : 'loss') : 'muted', paper: ctx.mode === 'paper', href: `#/trade/${tr.id}` });
    };
    mount(root, bar, el('main', { class: 'content' },
      el('section', { class: 'card' },
        el('div', { class: 'spread' }, ui.iconButton({ iconName: 'left', label: t('calendar.prev'), onClick: () => { month = shiftMonth(month, -1); selected = null; paint(); } }),
          el('div', { class: 'cal-title' }, el('div', null, monthTitle), el('div', { class: 'num' }, ui.delta(fmt.money(cal.monthMinor, ccy), cal.monthMinor > 0 ? 'gain' : cal.monthMinor < 0 ? 'loss' : 'flat'))),
          ui.iconButton({ iconName: 'right', label: t('calendar.next'), onClick: () => { month = shiftMonth(month, 1); selected = null; paint(); } })),
        ui.calendarGrid({ year, month: mon, days, weeks: cal.weeks, fmt, ccy, selected, today: todayDate, onSelect: (date) => { selected = selected === date ? null : date; paint(); }, ariaLabel: t('calendar.aria', { month: monthTitle }) }),
        el('p', { class: 'caption' }, t('calendar.note', { cutoff: `${String(Number(ctx.settings.get('dayCutoffHour') || 0)).padStart(2, '0')}:00`, tz: ctx.tz }))),
      selected ? [el('div', { class: 'day-h' }, el('span', null, `${fmt.date(`${selected}T12:00:00Z`, { zone: 'UTC' })} · ${t('calendar.trades', { n: dayTrades.length })}`), el('span', { class: 'num' }, ui.delta(fmt.money(dayTotal, ccy), dayTotal > 0 ? 'gain' : dayTotal < 0 ? 'loss' : 'flat'))), el('div', { class: 'list' }, ...dayTrades.map(rowFor))] : null,
      !s.included.length ? ui.emptyState({ iconName: 'calendar', title: t('stats.empty.title'), body: t('stats.empty.body') }) : null));
  }
  await paint();
  const offs = [ctx.bus.on('trades-changed', paint), ctx.bus.on('account-filter-changed', paint)];
  return () => { disposed = true; offs.forEach((o) => o()); };
}
