// Log a trade by hand (#/trade/new, design/mockups log-trade, log-error). Only instrument, side, size, entry price and entry time
// are required (AC-P1.2); the result and the risk show as you type, with the arithmetic in words. `state.draft` prefills the form
// (sentence entry, position-size helper); `state.id` edits a hand-entered trade. A plan checklist (S3) runs first when one is active.
import { el, mount } from '../dom.js';
import { t } from '../../i18n/i18n.js';
import * as D from '../../core/decimal.js';
import { parseUserDecimal } from '../../core/money.js';
import { localParts } from '../../core/time.js';
import { loadModel, statsCtxFor } from '../../storage/model.js';
import { buildManualTrade, normalizeInstrument, MARKETS } from '../../storage/actions.js';
import { loadStats, nowIso, toastMsg, pickSheet } from '../../storage/viewkit.js';

const pad = (n) => String(n).padStart(2, '0');

// The form shows 'YYYY-MM-DD HH:MM' in a plain text field (no native date control); the draft keeps the ISO-like 'YYYY-MM-DDTHH:MM'.
export const timeText = (v) => String(v ?? '').replace('T', ' ');
export const fromTimeText = (v) => String(v ?? '').trim().replace(/\s+/, 'T');

// 'YYYY-MM-DDTHH:MM' wall time of an instant in a zone, for <input type="datetime-local">.
export function localInput(iso, zone) {
  const p = localParts(iso, zone);
  return `${p.date}T${pad(p.hour)}:${pad(p.minute)}`;
}

export function emptyDraft({ account, now, tz }) {
  return { accountId: account?.id ?? null, market: 'stock', instrument: '', side: 'long', size: '', entryPrice: '', entryTime: localInput(now, tz), stop: '', exitPrice: '', exitTime: localInput(now, tz), exitSize: '', fee: '', target: '', setup: '', notes: '', quoteToAccount: '', extra: [] };
}

// A stored hand-entered trade back into form fields (the first entry and first exit are the main fields, the rest are extra legs).
export function draftFromTrade(trade, tz) {
  const entries = trade.legs.filter((l) => l.kind === 'entry');
  const exits = trade.legs.filter((l) => l.kind === 'exit');
  const [e0, ...eRest] = entries;
  const [x0, ...xRest] = exits;
  const feeTotal = D.sum(trade.legs.map((l) => l.fee || '0'));
  return {
    accountId: trade.accountId, market: trade.market, instrument: trade.instrument, side: trade.side, size: e0.size, entryPrice: e0.price, entryTime: localInput(e0.time, tz),
    stop: trade.initialStop ?? '', exitPrice: x0?.price ?? '', exitTime: x0 ? localInput(x0.time, tz) : localInput(e0.time, tz), exitSize: x0 && x0.size !== e0.size ? x0.size : '', fee: D.isZero(feeTotal) ? '' : feeTotal,
    target: trade.target ?? '', setup: trade.setup ?? '', notes: trade.notes ?? '', quoteToAccount: trade.legs[0].quoteToAccount && trade.legs[0].quoteToAccount !== 1 ? String(trade.legs[0].quoteToAccount) : '',
    extra: [...eRest, ...xRest].map((l) => ({ kind: l.kind, time: localInput(l.time, tz), price: l.price, size: l.size, fee: l.fee === '0' ? '' : l.fee })),
  };
}

// The legs a draft describes, in the shape buildManualTrade takes. The total fee sits on the last leg of the main pair.
export function legsOf(draft) {
  const legs = [];
  const hasExit = String(draft.exitPrice).trim() !== '';
  legs.push({ kind: 'entry', time: draft.entryTime, price: draft.entryPrice, size: draft.size, fee: hasExit ? '' : draft.fee });
  if (hasExit) legs.push({ kind: 'exit', time: draft.exitTime, price: draft.exitPrice, size: String(draft.exitSize).trim() || draft.size, fee: draft.fee });
  for (const l of draft.extra || []) legs.push({ ...l });
  return legs;
}

export function toForm(draft) {
  return { instrument: draft.instrument, market: draft.market, side: draft.side, legs: legsOf(draft), stop: draft.stop, target: draft.target, setup: draft.setup, notes: draft.notes, quoteToAccount: draft.quoteToAccount };
}

const fieldError = (errors, name) => errors.find((e) => e.field === name);

export async function render(root, ctx, params = {}) {
  const stats = await loadStats().catch(() => null);
  const model = await loadModel(ctx.store);
  const accounts = model.accounts.filter((a) => a.mode === ctx.mode);
  const editing = params.state?.id ? model.trades.find((x) => x.id === params.state.id) : null;
  const now = nowIso();
  let account = accounts.find((a) => a.id === (editing?.accountId ?? params.state?.draft?.accountId)) ?? (ctx.accountFilter !== 'all' ? accounts.find((a) => a.id === ctx.accountFilter) : null) ?? accounts[0] ?? null;
  const draft = editing ? draftFromTrade(editing, ctx.tz) : { ...emptyDraft({ account, now, tz: ctx.tz }), ...(params.state?.draft ?? {}) };
  draft.accountId = account?.id ?? null;
  let errors = [];
  let planMark = editing?.plan ?? null;

  if (!editing && ctx.data?.runChecklist && !params.state?.checklistDone) {
    try { planMark = await ctx.data.runChecklist(ctx, draft); } catch (e) { console.error('checklist failed', e); }
  }

  const host = el('div', { class: 'app-form' });
  const summary = el('div', { class: 'vstack' });
  const legList = el('div', { class: 'field' });

  const value = (k) => draft[k];
  const bind = (k) => (v) => { draft[k] = v; refresh(); };
  const err = (name) => { const e = fieldError(errors, name); return e ? t(`form.error.${e.code}`) : undefined; };

  function preview() {
    if (!account) return null;
    const r = buildManualTrade(toForm(draft), { account, declaredZone: ctx.tz, now, id: editing?.id ?? 'preview' });
    return r.trade ? r : null;
  }

  function refresh() {
    const built = preview();
    const nodes = [];
    if (built && stats) {
      const sctx = statsCtxFor(ctx, { ...model, trades: [], cash: model.cash }, { accountIds: 'all' });
      sctx.accounts[account.id] = { baseCurrency: account.baseCurrency, startBalance: account.startBalance ?? null, toDisplayRate: 1 };
      const trade = built.trade;
      const ccy = account.baseCurrency;
      const risk = stats.initialRisk(trade);
      if (trade.initialStop) {
        const eq = stats.equityAtEntry?.(trade, { ...sctx, trades: model.trades }) ?? null;
        nodes.push(el('div', { class: 'card tint' },
          el('div', { class: 'spread' }, el('span', { class: 'sub' }, t('form.risk.title')), el('b', { class: 'num' }, risk?.value != null ? `${ctx.fmt.num(risk.value, ctx.fmt.minorDigits(ccy))} ${ccy}` : t('figure.rUnknown'))),
          risk?.value != null && eq ? el('div', { class: 'caption' }, t('form.risk.pct', { pct: ctx.fmt.pct((risk.value * 10 ** ctx.fmt.minorDigits(ccy) / eq) * 100, 2) })) : null,
          risk?.value == null ? el('div', { class: 'caption' }, t(`form.stop.${risk?.reason ?? 'no_stop'}`)) : null,
          el('a', { class: 'link', href: '#/sizing' }, t('form.risk.sizeFrom'))));
      }
      const money = stats.tradeMoney(trade, sctx);
      if (money) {
        const r = stats.rMultiple(trade, sctx);
        const d = ctx.fmt.minorDigits(ccy);
        nodes.push(el('div', { class: 'card tint' },
          el('div', { class: 'spread' }, el('span', { class: 'sub' }, t('form.result.title')), el('b', { class: 'num' }, ctx.ui.delta(ctx.fmt.money(money.netMinor, ccy), money.netMinor > 0 ? 'gain' : money.netMinor < 0 ? 'loss' : 'flat'), r != null ? ` · ${ctx.fmt.r(r)}` : ` · ${t('figure.rUnknown')}`)),
          el('p', { class: 'caption' }, t('form.result.formula', { gross: ctx.fmt.money(money.grossMinor, ccy, { signed: false }), fees: ctx.fmt.moneyPlain(money.feesMinor, ccy), net: ctx.fmt.money(money.netMinor, ccy, { signed: false }), digits: d }))));
      }
      for (const w of built.warnings) if (w.code !== 'partial_exit') nodes.push(ctx.ui.stateBanner({ kind: 'neutral', iconName: 'info', body: t(`form.stop.${w.code}`) }));
    }
    mount(summary, ...nodes);
    drawLegs();
  }

  function legRow(l, i) {
    const shown = ctx.fmt.parts(new Date(`${l.time}:00`).toISOString(), 'UTC');
    return el('div', { class: 'leg' }, el('span', { class: 'side' }, t(l.kind === 'entry' ? (draft.side === 'long' ? 'label.side.buy' : 'label.side.sell') : (draft.side === 'long' ? 'label.side.sell' : 'label.side.buy'))),
      el('span', null, `${l.size} @ ${l.price}`), el('span', { class: 'caption' }, `${pad(shown.d)}.${pad(shown.m)} ${pad(shown.h)}:${pad(shown.min)}`),
      el('button', { type: 'button', class: 'icon-btn hit', 'aria-label': t('form.leg.remove'), onClick: () => { draft.extra.splice(i, 1); refresh(); } }, ctx.ui.icon('x', 'sm')));
  }
  function drawLegs() {
    mount(legList, el('span', { class: 'lbl' }, t('form.legs')),
      el('div', { class: 'list' }, ...(draft.extra || []).map(legRow),
        ctx.ui.button({ label: t('form.leg.add'), kind: 'ghost', iconName: 'plus', block: true, onClick: () => legSheet() })));
  }
  function legSheet() {
    const l = { kind: 'entry', time: draft.exitTime || draft.entryTime, price: '', size: '', fee: '' };
    const slot = el('div', { class: 'vstack' });
    let legErrors = [];
    const draw = () => mount(slot,
      el('div', { class: 'field' }, el('span', { class: 'lbl' }, t('form.leg.kind')), ctx.ui.segmented({ ariaLabel: t('form.leg.kind'), value: l.kind, options: [{ value: 'entry', label: t('form.leg.scaleIn') }, { value: 'exit', label: t('form.leg.partialExit') }], onChange: (v) => { l.kind = v; } })),
      el('div', { class: 'grid2' }, ctx.ui.field({ label: t('form.size'), value: l.size, inputmode: 'decimal', error: legErrors.includes('size') ? t('form.error.number') : undefined, onInput: (v) => { l.size = v; } }), ctx.ui.field({ label: t('form.price'), value: l.price, inputmode: 'decimal', error: legErrors.includes('price') ? t('form.error.number') : undefined, onInput: (v) => { l.price = v; } })),
      el('div', { class: 'grid2' }, ctx.ui.field({ label: t('form.time'), value: timeText(l.time), placeholder: t('form.time.ph'), inputmode: 'numeric', onInput: (v) => { l.time = fromTimeText(v); } }), ctx.ui.field({ label: t('form.fees'), value: l.fee, inputmode: 'decimal', onInput: (v) => { l.fee = v; } })));
    draw();
    const s = ctx.ui.sheet({ title: t('form.leg.add'), body: slot, footer: ctx.ui.button({ label: t('sheet.save'), size: 'lg', block: true, onClick: () => {
      legErrors = [];
      if (parseUserDecimal(l.size) === null) legErrors.push('size');
      if (parseUserDecimal(l.price) === null) legErrors.push('price');
      if (legErrors.length) { draw(); return; }
      draft.extra.push({ ...l });
      s.close();
      refresh();
    } }) });
  }

  async function save() {
    if (!account) return;
    const r = buildManualTrade(toForm(draft), { account, declaredZone: ctx.tz, now: nowIso(), existing: editing });
    errors = r.errors;
    if (!r.trade) { paint(); return; }
    const trade = { ...r.trade, plan: planMark ?? r.trade.plan };
    await ctx.store.trades.put(trade);
    try { await ctx.data?.afterSave?.(ctx, trade); } catch (e) { console.error('afterSave failed', e); }
    ctx.bus.emit('trades-changed');
    toastMsg(ctx, t('form.saved'));
    ctx.navigate(editing ? `#/trade/${trade.id}` : '#/journal');
  }

  const setups = () => [...new Set([...model.trades.map((x) => x.setup).filter(Boolean), ...model.plans.flatMap((p) => p.setups || [])])].sort((a, b) => a.localeCompare(b));

  function paint() {
    const unit = draft.market === 'forex' ? t('form.unit.lots') : draft.market === 'crypto' ? (normalizeInstrument(draft.instrument, 'crypto').split(/[/-]/)[0] || t('form.unit.units')) : t('form.unit.shares');
    const ccy = account?.baseCurrency ?? '';
    const needRate = account && draft.instrument && (() => { const q = normalizeInstrument(draft.instrument, draft.market).match(/[/-]([A-Z]{3,5})$/); return q && q[1] !== account.baseCurrency; })();
    mount(host,
      ctx.ui.topbar({ mode: ctx.mode, paper: ctx.mode === 'paper', title: editing ? t('form.edit') : t('form.title'), back: { label: t('sheet.cancel'), onClick: () => ctx.navigate(editing ? `#/trade/${editing.id}` : '#/journal') }, right: ctx.ui.modeBadge(ctx.mode) }),
      el('main', { class: 'content' },
        !account ? ctx.ui.stateBanner({ kind: 'attention', iconName: 'alert', title: t('form.noAccount.title'), body: t('form.noAccount.body'), href: '#/accounts' }) : null,
        ctx.mode === 'paper' ? ctx.ui.stateBanner({ kind: 'neutral', iconName: 'paper', body: t('form.paper.note') }) : null,
        !editing ? el('a', { class: 'sentence', href: '#/sentence' }, el('span', { class: 'txt' }, el('span', { class: 'muted' }, t('form.sentence.hint'))), el('span', { class: 'go' }, ctx.ui.icon('send'))) : null,
        accounts.length > 1 ? el('div', { class: 'field' }, el('span', { class: 'lbl' }, t('form.account')), ctx.ui.segmented({ ariaLabel: t('form.account'), value: draft.accountId, options: accounts.map((a) => ({ value: a.id, label: a.name })), onChange: (v) => { draft.accountId = v; account = accounts.find((a) => a.id === v); paint(); } })) : null,
        el('div', { class: 'field' }, el('span', { class: 'lbl' }, t('form.market')), ctx.ui.segmented({ ariaLabel: t('form.market'), value: draft.market, options: MARKETS.map((m) => ({ value: m, label: t(`market.${m}`) })), onChange: (v) => { draft.market = v; paint(); } })),
        el('div', { class: 'grid2' },
          ctx.ui.field({ label: t('form.instrument'), value: draft.instrument, error: err('instrument'), placeholder: draft.market === 'forex' ? 'EUR/USD' : draft.market === 'crypto' ? 'BTC/USD' : 'AAPL', onInput: (v) => { draft.instrument = v; refresh(); }, onChange: () => paint() }),
          el('div', { class: 'field' }, el('span', { class: 'lbl' }, t('form.side')), ctx.ui.segmented({ ariaLabel: t('form.side'), cls: 'tall', value: draft.side, options: [{ value: 'long', label: t('label.side.long') }, { value: 'short', label: t('label.side.short') }], onChange: (v) => { draft.side = v; refresh(); } }))),
        el('div', { class: 'grid2' },
          ctx.ui.field({ label: t('form.size'), value: draft.size, inputmode: 'decimal', unit, error: err('entrySize'), onInput: bind('size') }),
          ctx.ui.field({ label: t('form.entry'), value: draft.entryPrice, inputmode: 'decimal', unit: ccy, error: err('entryPrice'), onInput: bind('entryPrice') })),
        el('div', { class: 'grid2' },
          ctx.ui.field({ label: t('form.entryTime'), value: timeText(draft.entryTime), placeholder: t('form.time.ph'), inputmode: 'numeric', error: err('entryTime'), onInput: (v) => { draft.entryTime = fromTimeText(v); refresh(); } }),
          ctx.ui.field({ label: t('form.stop'), value: draft.stop, inputmode: 'decimal', error: err('stop'), onInput: bind('stop') })),
        needRate ? ctx.ui.field({ label: t('form.rate', { ccy: normalizeInstrument(draft.instrument, draft.market).split(/[/-]/).pop(), to: account.baseCurrency }), value: draft.quoteToAccount, inputmode: 'decimal', error: err('quoteToAccount'), help: t('form.rate.help'), onInput: bind('quoteToAccount') }) : null,
        summary,
        el('div', { class: 'grid2' },
          ctx.ui.field({ label: t('form.exit'), value: draft.exitPrice, inputmode: 'decimal', unit: ccy, error: err('exitPrice'), onInput: bind('exitPrice') }),
          ctx.ui.field({ label: t('form.exitTime'), value: timeText(draft.exitTime), placeholder: t('form.time.ph'), inputmode: 'numeric', error: err('exitTime'), onInput: (v) => { draft.exitTime = fromTimeText(v); refresh(); } })),
        (draft.extra || []).some((l) => l.kind === 'exit') || draft.exitSize ? ctx.ui.field({ label: t('form.exitSize'), value: draft.exitSize, inputmode: 'decimal', unit, error: err('exitSize'), help: t('form.exitSize.help'), onInput: bind('exitSize') }) : null,
        el('div', { class: 'grid2' },
          ctx.ui.field({ label: t('form.fees'), value: draft.fee, inputmode: 'decimal', unit: ccy, error: err('exitFee') || err('entryFee'), onInput: bind('fee') }),
          ctx.ui.field({ label: t('form.target'), value: draft.target, inputmode: 'decimal', placeholder: t('form.optional'), error: err('target'), onInput: bind('target') })),
        legList,
        el('div', { class: 'field' }, el('span', { class: 'lbl' }, t('form.setup')),
          el('div', { class: 'chips' }, ...setups().map((s) => el('button', { type: 'button', class: 'chip', 'aria-pressed': String(draft.setup === s), onClick: () => { draft.setup = draft.setup === s ? '' : s; paint(); } }, s)),
            el('button', { type: 'button', class: 'chip', onClick: () => newSetup() }, ctx.ui.icon('plus', 'sm'), t('form.setup.new')))),
        ctx.ui.field({ label: t('form.notes'), value: draft.notes, onInput: (v) => { draft.notes = v; } }),
        errors.length ? ctx.ui.stateBanner({ kind: 'danger', iconName: 'alert', title: t('form.errors.title'), body: t('form.errors.body') }) : null,
        ctx.ui.button({ label: t('form.save'), size: 'lg', block: true, disabled: !account, onClick: save })));
    refresh();
  }

  function newSetup() {
    let name = '';
    const s = ctx.ui.sheet({ title: t('form.setup.new'), body: ctx.ui.field({ label: t('form.setup.name'), onInput: (v) => { name = v; } }), footer: ctx.ui.button({ label: t('sheet.save'), size: 'lg', block: true, onClick: () => { if (name.trim()) { draft.setup = name.trim(); s.close(); paint(); } } }) });
  }

  mount(root, host);
  paint();
  return () => {};
}

export const pickAccount = pickSheet;

// Contract for the sentence entry and the position-size helper (architecture section 10): open the form prefilled.
export function openTradeForm(ctx, draft) {
  ctx.navigate('#/trade/new', { draft });
}
