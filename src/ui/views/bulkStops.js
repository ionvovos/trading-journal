// Bulk initial stops (#/stops, AC-P1.11, design/mockups stops): every trade without a stop on one screen; R appears as you type.
// Leave a trade empty and its R stays unknown. An MT4 stop read from the file is labelled "stop at close".
import { el, mount } from '../dom.js';
import { t } from '../../i18n/i18n.js';
import * as D from '../../core/decimal.js';
import { loadModel, statsCtxFor } from '../../storage/model.js';
import { applyStops } from '../../storage/actions.js';
import { tradeStatus, averagePrice } from '../../core/trade.js';
import { loadStats, detailBar, sizeText, sideText, toastMsg, nowIso } from '../../storage/viewkit.js';

// Pure: the trades that need a stop, newest first.
export function stopCandidates(trades, mode, accountFilter = 'all') {
  return trades
    .filter((x) => x.mode === mode && (accountFilter === 'all' || x.accountId === accountFilter) && !x.excluded && tradeStatus(x) !== 'held')
    .sort((a, b) => ((b.closeTime || b.legs[0].time) < (a.closeTime || a.legs[0].time) ? -1 : 1));
}

export async function render(root, ctx) {
  const stats = await loadStats().catch(() => null);
  let disposed = false;
  let showAll = false;
  const typed = new Map();

  async function paint() {
    const model = await loadModel(ctx.store);
    if (disposed) return;
    const { fmt, ui } = ctx;
    const all = stopCandidates(model.trades, ctx.mode, ctx.accountFilter);
    const without = all.filter((x) => !x.initialStop);
    const list = showAll ? all : without;
    const sctx = statsCtxFor(ctx, model, { accountIds: 'all' });
    const rKnown = () => {
      let known = 0;
      for (const tr of all) {
        const stop = typed.has(tr.id) && typed.get(tr.id).trim() !== '' ? typed.get(tr.id) : tr.initialStop;
        if (!stop || !stats) continue;
        const parsed = applyStops([tr], [{ tradeId: tr.id, stop }], 'x').trades[0] ?? tr;
        if (stats.initialRisk(parsed)?.value != null) known++;
      }
      return known;
    };
    const bar = el('div', { class: 'progress-slot' });
    const drawBar = () => { const known = rKnown(); mount(bar, el('section', { class: 'card' }, el('div', { class: 'spread' }, el('span', { class: 'sub' }, t('stops.known')), el('b', { class: 'num' }, t('stops.knownOf', { a: known, b: all.length }))), ui.progress({ done: known, total: Math.max(1, all.length), label: '' }))); };

    const row = (tr) => {
      const acct = model.accounts.find((a) => a.id === tr.accountId);
      const entry = averagePrice(tr, 'entry');
      const exit = averagePrice(tr, 'exit');
      const note = el('span', { class: 'err-msg warn-msg' });
      const input = ui.field({ label: t('stops.field', { instrument: tr.instrument }), value: typed.get(tr.id) ?? tr.initialStop ?? '', inputmode: 'decimal', placeholder: t('stops.ph'), onInput: (v) => {
        typed.set(tr.id, v);
        note.textContent = '';
        const r = v.trim() === '' ? { trades: [], errors: [] } : applyStops([tr], [{ tradeId: tr.id, stop: v }], 'x');
        if (r.errors.length) note.textContent = t(`form.error.${r.errors[0].code}`);
        else if (r.trades[0] && stats) { const risk = stats.initialRisk(r.trades[0]); if (risk?.value == null) note.textContent = t(`form.stop.${risk?.reason ?? 'no_stop'}`); else note.textContent = t('stops.oneR', { x: `${fmt.num(risk.value, fmt.minorDigits(acct?.baseCurrency ?? 'USD'))} ${acct?.baseCurrency ?? ''}` }); }
        drawBar();
      } });
      return el('div', { class: 'stop-row' },
        el('div', { class: 'main' }, el('div', { class: 't' }, `${tr.instrument} · ${sideText(tr)} ${sizeText(tr, fmt)}`), el('div', { class: 'caption num' }, [t('stops.in', { x: fmt.num(D.toNumber(entry), 2) }), exit ? t('stops.out', { x: fmt.num(D.toNumber(exit), 2) }) : null, fmt.date(tr.closeTime || tr.legs[0].time)].filter(Boolean).join(' · ')), tr.stopSource === 'file_at_close' ? el('div', { class: 'caption' }, t('trade.stop.atCloseShort')) : null),
        input, note);
    };

    const save = async () => {
      const entries = [...typed.entries()].map(([tradeId, stop]) => ({ tradeId, stop }));
      const r = applyStops(all, entries, nowIso());
      if (r.trades.length) await ctx.store.trades.putMany(r.trades);
      typed.clear();
      ctx.bus.emit('trades-changed');
      toastMsg(ctx, t('stops.saved', { n: r.set }));
      if (r.errors.length) paint(); else ctx.navigate('#/journal');
    };

    mount(root, detailBar(ctx, { title: t('stops.title'), backHash: '#/journal', backLabel: t('nav.journal') }),
      el('main', { class: 'content' },
        el('p', { class: 'sub' }, t('stops.lead')), bar,
        el('div', { class: 'chips' },
          el('button', { type: 'button', class: 'chip', 'aria-pressed': String(!showAll), onClick: () => { showAll = false; paint(); } }, t('stops.filter.none'), ' ', el('span', { class: 'count' }, String(without.length))),
          el('button', { type: 'button', class: 'chip', 'aria-pressed': String(showAll), onClick: () => { showAll = true; paint(); } }, t('stops.filter.all'), ' ', el('span', { class: 'count' }, String(all.length)))),
        list.length ? el('div', { class: 'list' }, ...list.map(row)) : ui.emptyState({ iconName: 'target', title: t('stops.empty.title'), body: t('stops.empty.body') }),
        list.length ? ui.button({ label: t('stops.save'), size: 'lg', block: true, onClick: save }) : null));
    drawBar();
  }
  await paint();
  return () => { disposed = true; };
}
