// Trade detail (#/trade/:id, design/mockups trade-detail, trade-detail-fx): result and R with the arithmetic, legs, fees and funding,
// stop (with where it came from), plan mark, notes, and what the person may still do: add or change a stop, add an exit, edit a
// hand-entered trade, leave it out of the statistics, delete it.
import { el, mount } from '../dom.js';
import { t } from '../../i18n/i18n.js';
import * as D from '../../core/decimal.js';
import { loadModel, statsCtxFor } from '../../storage/model.js';
import { patchTrade, applyStops } from '../../storage/actions.js';
import { averagePrice, tradeStatus, positionSize } from '../../core/trade.js';
import { loadStats, detailBar, sectionHead, sizeText, sideText, confirmSheet, toastMsg, nowIso } from '../../storage/viewkit.js';

const kv = (rows) => el('div', { class: 'kv' }, ...rows.filter(Boolean).map(([k, v]) => el('div', null, el('dt', null, k), el('dd', null, v))));

function stopSheet(ctx, trade, done) {
  let v = trade.initialStop ?? '';
  let error;
  const slot = el('div');
  const draw = () => mount(slot, ctx.ui.field({ label: t('trade.stop.field'), value: v, inputmode: 'decimal', error, help: trade.stopSource === 'file_at_close' ? t('trade.stop.atClose') : undefined, onInput: (x) => { v = x; } }));
  draw();
  const s = ctx.ui.sheet({ title: t('trade.stop.title'), body: slot, footer: ctx.ui.button({ label: t('sheet.save'), size: 'lg', block: true, onClick: async () => {
    const r = applyStops([trade], [{ tradeId: trade.id, stop: v }], nowIso());
    if (r.errors.length) { error = t(`form.error.${r.errors[0].code}`); draw(); return; }
    if (r.trades[0]) await ctx.store.trades.put(r.trades[0]);
    s.close();
    ctx.bus.emit('trades-changed');
    done();
  } }) });
}

export async function render(root, ctx, params) {
  const stats = await loadStats().catch(() => null);
  let disposed = false;
  async function paint() {
    const model = await loadModel(ctx.store);
    if (disposed) return;
    const trade = model.trades.find((x) => x.id === params.id);
    const { fmt, ui } = ctx;
    if (!trade) {
      mount(root, detailBar(ctx, { title: t('trade.title'), backHash: '#/journal', backLabel: t('nav.journal') }), el('main', { class: 'content' }, ui.emptyState({ iconName: 'search', title: t('trade.missing.title'), body: t('trade.missing.body') })));
      return;
    }
    const account = model.accounts.find((a) => a.id === trade.accountId);
    const ccy = account?.baseCurrency ?? ctx.displayCurrency();
    const status = tradeStatus(trade);
    const sctx = statsCtxFor(ctx, model, { accountIds: 'all', mode: trade.mode });
    let money = null; let r = null; let risk = null; let breakdown = null; let pips = null;
    if (stats) {
      try {
        money = trade.entryUnknown ? { netMinor: trade.broker?.netMinor, grossMinor: null, feesMinor: null, fundingMinor: null, source: 'broker' } : stats.tradeMoney(trade, sctx);
        if (!trade.entryUnknown) { r = stats.rMultiple(trade); risk = stats.initialRisk(trade); breakdown = stats.rBreakdown?.(trade) ?? null; }
        if (trade.market === 'forex') pips = stats.pips?.(trade) ?? null;
      } catch (e) { console.error('trade money failed', e); }
    }
    const tone = money?.netMinor > 0 ? 'gain' : money?.netMinor < 0 ? 'loss' : 'flat';
    const entry = averagePrice(trade, 'entry');
    const exit = averagePrice(trade, 'exit');
    const digitsOf = (s) => Math.min(8, Math.max(2, D.decimalsOf(s ?? '0')));
    const numFmt = (s) => (s === null ? '–' : fmt.num(D.toNumber(s), digitsOf(s)));

    const banners = [];
    if (status === 'held') banners.push(ui.stateBanner({ kind: 'attention', iconName: 'alert', title: t('trade.held.title'), body: t(`journal.hold.${trade.holds[0]}`), href: trade.importId ? `#/import/${trade.importId}` : undefined }));
    if (trade.excluded) banners.push(ui.stateBanner({ kind: 'neutral', iconName: 'info', title: t('trade.excluded.title'), body: t(trade.excluded.by === 'user' ? 'trade.excluded.user' : 'trade.excluded.import') }));
    if (status === 'open') banners.push(ui.stateBanner({ kind: 'neutral', iconName: 'clock', body: t('trade.open.note', { n: fmt.num(D.toNumber(positionSize(trade)), 2) }) }));
    if (trade.dustRemainder && !D.isZero(trade.dustRemainder)) banners.push(ui.stateBanner({ kind: 'neutral', iconName: 'info', body: t('trade.dust', { x: trade.dustRemainder }) }));

    const head = el('section', { class: ['card', 'hero-card', trade.mode === 'paper' && 'paper'] },
      el('div', { class: 'hero-label' }, `${trade.instrument} · ${sideText(trade)} ${sizeText(trade, fmt)}`, ui.modeBadge(trade.mode)),
      money?.netMinor !== undefined && money?.netMinor !== null && status !== 'open' ? ui.hero({ text: fmt.money(money.netMinor, ccy), tone, ccy }) : el('div', { class: 'sub' }, status === 'open' ? t('trade.open.title') : t('trade.noMoney')),
      el('div', { class: 'row-r' },
        r !== null && r !== undefined ? el('button', { type: 'button', class: ['chip', 'r-chip', r > 0 ? 'gain' : r < 0 ? 'loss' : ''], onClick: () => ctx.navigate(`#/learn/r`) }, fmt.r(r)) : el('span', { class: 'chip muted' }, t('figure.rUnknown')),
        risk?.value != null ? el('span', { class: 'caption num' }, t('trade.risk', { x: `${fmt.num(risk.value, fmt.minorDigits(ccy))} ${ccy}` })) : (risk?.reason ? el('span', { class: 'caption' }, t(`form.stop.${risk.reason}`)) : null)),
      breakdown ? el('p', { class: 'caption' }, t('trade.breakdown', { base: fmt.r(breakdown.base), slip: fmt.r(breakdown.slippageR), costs: fmt.r(breakdown.costsR), other: breakdown.otherR ? `, ${fmt.r(breakdown.otherR)}` : '' })) : null);

    const legs = el('div', { class: 'list' }, ...[...trade.legs].sort((a, b) => (a.time < b.time ? -1 : 1)).map((l) => {
      const buy = (trade.side === 'long') === (l.kind === 'entry');
      return el('div', { class: 'leg' }, el('span', { class: 'side' }, t(buy ? 'label.side.buy' : 'label.side.sell')), el('span', { class: 'num' }, `${l.size} @ ${l.price}`), el('span', { class: 'caption' }, `${fmt.date(l.time)} ${fmt.time(l.time)}`));
    }));

    const stopLine = trade.initialStop ? `${numFmt(trade.initialStop)}${trade.stopSource === 'file_at_close' ? ` · ${t('trade.stop.atCloseShort')}` : ''}` : t('trade.stop.none');
    const details = kv([
      [t('trade.avgEntry'), numFmt(entry)], exit ? [t('trade.avgExit'), numFmt(exit)] : null,
      money && money.grossMinor !== null ? [t('trade.gross'), fmt.money(money.grossMinor, ccy)] : null,
      money && money.feesMinor !== null ? [t('trade.fees'), fmt.money(-Math.abs(money.feesMinor), ccy)] : null,
      money && money.fundingMinor ? [t('trade.funding'), fmt.money(money.fundingMinor, ccy)] : null,
      money?.source === 'broker' ? [t('trade.source'), t('trade.source.broker')] : null,
      [t('trade.stop'), stopLine], trade.target ? [t('trade.target'), numFmt(trade.target)] : null,
      pips ? [t('trade.pips'), `${fmt.pips(pips.resultPips)} / ${t('trade.stopPips', { n: fmt.num(pips.stopPips, 1) })}`] : null,
      trade.setup ? [t('trade.setup'), trade.setup] : null,
      trade.plan && trade.plan.followed !== undefined ? [t('trade.plan'), t(trade.plan.followed ? 'trade.plan.followed' : 'trade.plan.off')] : null,
      account ? [t('trade.account'), account.name] : null,
    ]);

    const actions = [
      !trade.initialStop || trade.stopSource === 'file_at_close' ? ui.button({ label: trade.initialStop ? t('trade.stop.change') : t('trade.stop.add'), kind: 'secondary', block: true, onClick: () => stopSheet(ctx, trade, paint) }) : ui.button({ label: t('trade.stop.change'), kind: 'plain', block: true, onClick: () => stopSheet(ctx, trade, paint) }),
      trade.entry === 'manual' ? ui.button({ label: status === 'open' ? t('trade.addExit') : t('trade.edit'), kind: 'plain', block: true, onClick: () => ctx.navigate('#/trade/new', { id: trade.id }) }) : null,
      trade.excluded && trade.excluded.by === 'user' ? ui.button({ label: t('trade.include'), kind: 'plain', block: true, onClick: async () => { await ctx.store.trades.put(patchTrade(trade, { excluded: null }, nowIso())); ctx.bus.emit('trades-changed'); paint(); } })
        : !trade.excluded ? ui.button({ label: t('trade.exclude'), kind: 'plain', block: true, onClick: async () => { await ctx.store.trades.put(patchTrade(trade, { excluded: { by: 'user', anomalyId: null } }, nowIso())); ctx.bus.emit('trades-changed'); toastMsg(ctx, t('trade.excluded.done')); paint(); } }) : null,
      ui.button({ label: t('trade.delete'), kind: 'danger', block: true, onClick: async () => {
        const ok = await confirmSheet(ctx, { title: t('trade.delete.title'), body: t('trade.delete.body', { instrument: trade.instrument }), confirmLabel: t('trade.delete'), danger: true });
        if (ok) { await ctx.store.trades.delete(trade.id); ctx.bus.emit('trades-changed'); ctx.navigate('#/journal'); }
      } }),
    ];

    mount(root, detailBar(ctx, { title: trade.instrument, backHash: '#/journal', backLabel: t('nav.journal') }),
      el('main', { class: 'content' }, ...banners, head, sectionHead(t('trade.legs')), legs, details,
        trade.notes ? [sectionHead(t('trade.notes')), el('p', { class: 'sub note-text' }, trade.notes)] : null,
        trade.importId ? el('a', { class: 'link-row', href: `#/import/${trade.importId}` }, t('trade.importReport'), ctx.ui.icon('right', 'chev')) : null,
        el('div', { class: 'action-stack' }, ...actions)));
  }
  await paint();
  const off = ctx.bus.on('trades-changed', paint);
  return () => { disposed = true; off(); };
}
