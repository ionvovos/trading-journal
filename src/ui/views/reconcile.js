// Broker check (#/reconcile/:accountId, design/mockups reconcile-*): the broker's own figure for one account and period against the
// app's total. Net realised P&L first; the balance form only after "no position open at the start or end"; the quantity form for
// crypto. A difference names the trades that explain it with their amounts; what cannot be explained stays "unexplained".
// The state (reconciled, difference, skipped, not asked) is stored per account and period and stays on the dashboard until answered.
import { el, mount } from '../dom.js';
import { t, has } from '../../i18n/i18n.js';
import * as D from '../../core/decimal.js';
import { parseUserDecimal, minorDigits, roundMinor } from '../../core/money.js';
import { isValidZone } from '../../core/time.js';
import { reconcile, reconcileQuantity, moneyCtx } from '../../import/reconcile.js';
import { anomaliesForReconcile } from '../../import/run.js';
import { loadModel } from '../../storage/model.js';
import { makeReconRecord, stateOfResult } from '../../storage/actions.js';
import { periodLabel } from '../../storage/periods.js';
import { loadStats, detailBar, sectionHead, nowIso, pickSheet, toastMsg } from '../../storage/viewkit.js';

const CASH_KINDS = ['deposit', 'withdrawal', 'other'];

// Pure: crypto assets an account has traded, from stored trades.
export function assetsOf(trades, accountId) {
  return [...new Set(trades.filter((x) => x.accountId === accountId && x.market === 'crypto' && /\//.test(x.instrument)).flatMap((x) => x.instrument.split('/')))].sort();
}

// Pure: stored legs as the fills reconcileQuantity reads.
export function fillsOf(trades, accountId) {
  const out = [];
  for (const tr of trades) {
    if (tr.accountId !== accountId || tr.market !== 'crypto' || tr.excluded) continue;
    for (const l of tr.legs) {
      if (!l.source?.key) continue;
      const buy = (tr.side === 'long') === (l.kind === 'entry');
      out.push({ key: l.source.key, instrument: tr.instrument, side: buy ? 'buy' : 'sell', size: l.size, price: l.price, fee: l.fee, feeCurrency: l.feeCurrency, tradeId: tr.id });
    }
  }
  return out;
}

// Pure: stored cash of one account inside a period, summed by kind in minor units.
export function cashTotals(cash, accountId, period, digits) {
  const inside = cash.filter((c) => c.accountId === accountId && c.time.slice(0, 10) >= period.from && c.time.slice(0, 10) <= period.to);
  const sum = (kind) => inside.filter((c) => c.kind === kind).reduce((s, c) => s + roundMinor(Number(c.amount), digits), 0);
  return { depositsMinor: sum('deposit'), withdrawalsMinor: sum('withdrawal'), otherMinor: sum('other'), items: inside };
}

const toMinor = (text, digits) => { const v = parseUserDecimal(text ?? ''); return v === null ? null : roundMinor(D.toNumber(v), digits); };

export async function render(root, ctx, params) {
  const stats = await loadStats().catch(() => null);
  let disposed = false;
  let model = await loadModel(ctx.store);
  const account = model.accounts.find((a) => a.id === params.accountId);
  const q = params.query || {};
  if (!account) {
    mount(root, detailBar(ctx, { title: t('reconcile.title'), backHash: '#/accounts', backLabel: t('accounts.title') }), el('main', { class: 'content' }, ctx.ui.emptyState({ iconName: 'search', title: t('reconcile.missing.title'), body: t('reconcile.missing.body') })));
    return () => {};
  }
  const digits = minorDigits(account.baseCurrency);
  const imports = model.imports.filter((i) => i.accountId === account.id && i.status !== 'cancelled');
  const fromImport = imports.find((i) => i.id === q.import) ?? null;
  const zoneDefault = fromImport?.effectiveZone || fromImport?.fileZone || Object.values(account.fileZones || {})[0] || ctx.tz;
  const now = nowIso();
  const monthStart = `${now.slice(0, 7)}-01`;
  const period = { from: q.from || fromImport?.report?.period?.from || monthStart, to: q.to || fromImport?.report?.period?.to || now.slice(0, 10), zone: q.zone && isValidZone(q.zone) ? q.zone : zoneDefault };
  const assets = assetsOf(model.trades, account.id);
  const lastFormat = (fromImport ?? imports[imports.length - 1])?.formatId ?? null;
  const saved = model.reconciliations.find((r) => r.id === `${account.id}:${period.from}:${period.to}`);
  const st = {
    form: saved?.form && saved.form !== 'quantity' ? saved.form : (lastFormat === 'kraken-trades' && assets.length ? 'quantity' : 'net_pnl'),
    value: saved?.broker?.form === 'net_pnl' ? String(saved.broker.valueMinor / 10 ** digits) : '', confirmNoOpen: false,
    start: '', end: '', deposits: null, withdrawals: null, other: '', asset: assets[0] ?? null, startQty: '', brokerQty: '', result: null, qty: null, error: null,
  };
  const anomalies = () => anomaliesForReconcile(model.imports.filter((i) => i.accountId === account.id));

  async function compute() {
    st.error = null;
    model = await loadModel(ctx.store);
    if (!stats) { st.error = 'reconcile.error.stats'; return paint(); }
    const deps = { tradeMoney: stats.tradeMoney };
    const totals = cashTotals(model.cash, account.id, period, digits);
    try {
      if (st.form === 'quantity') {
        const fills = fillsOf(model.trades, account.id);
        const brokerQty = parseUserDecimal(st.brokerQty);
        if (brokerQty === null || !st.asset) { st.error = 'reconcile.error.number'; return paint(); }
        st.qty = reconcileQuantity({ fills, cash: model.cash.filter((c) => c.accountId === account.id && c.currency === st.asset), asset: st.asset, startQty: parseUserDecimal(st.startQty || '0') ?? '0', brokerQty });
        st.result = null;
        const rec = makeReconRecord({ account, period, form: 'quantity', state: st.qty.state === 'reconciled' ? 'reconciled' : 'difference', broker: { form: 'quantity', asset: st.asset, brokerQty: st.qty.brokerQty }, result: null, now, asset: st.asset });
        rec.differenceQty = st.qty.differenceQty;
        await ctx.store.reconciliations.put(rec);
      } else {
        let broker;
        if (st.form === 'balance') {
          const start = toMinor(st.start, digits); const end = toMinor(st.end, digits);
          const dep = st.deposits === null ? totals.depositsMinor : toMinor(st.deposits, digits);
          const wd = st.withdrawals === null ? totals.withdrawalsMinor : toMinor(st.withdrawals, digits);
          const other = toMinor(st.other || '0', digits);
          if ([start, end, dep, wd, other].some((x) => x === null)) { st.error = 'reconcile.error.number'; return paint(); }
          broker = { form: 'balance', startMinor: start, endMinor: end, depositsMinor: dep, withdrawalsMinor: Math.abs(wd), otherMinor: other, noOpenPositionsConfirmed: st.confirmNoOpen };
        } else {
          const v = toMinor(st.value, digits);
          if (v === null) { st.error = 'reconcile.error.number'; return paint(); }
          broker = { form: 'net_pnl', valueMinor: v };
        }
        const cap = String(ctx.settings.get('reconcileCap') ?? '1.00');
        st.result = reconcile({ trades: model.trades, cash: totals.items, account, period, broker, cap, ctx: moneyCtx(account, { tz: period.zone }), anomalies: anomalies() }, deps);
        st.qty = null;
        await ctx.store.reconciliations.put(makeReconRecord({ account, period, form: st.form, state: stateOfResult(st.result), broker, result: st.result, now }));
        ctx.bus.emit('reconcile-changed', { id: `${account.id}:${period.from}:${period.to}`, state: stateOfResult(st.result) });
      }
    } catch (e) {
      st.error = e.code && has(e.code) ? e.code : 'reconcile.error.generic';
      console.error('reconcile failed', e);
    }
    paint();
  }

  async function skip() {
    await ctx.store.reconciliations.put(makeReconRecord({ account, period, form: 'net_pnl', state: 'skipped', now }));
    ctx.bus.emit('reconcile-changed', { id: `${account.id}:${period.from}:${period.to}`, state: 'skipped' });
    toastMsg(ctx, t('reconcile.skipped'));
    ctx.navigate('#/home');
  }

  async function editPeriod() {
    const slot = el('div', { class: 'vstack' });
    const d = { ...period };
    let err;
    const draw = () => mount(slot, el('div', { class: 'grid2' }, ctx.ui.field({ label: t('reconcile.from'), placeholder: 'YYYY-MM-DD', inputmode: 'numeric', value: d.from, onInput: (v) => { d.from = v; } }), ctx.ui.field({ label: t('reconcile.to'), placeholder: 'YYYY-MM-DD', inputmode: 'numeric', value: d.to, onInput: (v) => { d.to = v; } })),
      el('button', { type: 'button', class: 'set-row', onClick: async () => { const v = await pickSheet(ctx, { title: t('import.zone.title'), value: d.zone, options: [...new Set([d.zone, 'UTC', 'America/New_York', 'Europe/London', 'Europe/Athens', ctx.tz])].map((z) => ({ value: z, label: z })) }); if (v !== undefined) { d.zone = v; draw(); } } }, el('span', { class: 'lbl' }, t('reconcile.zone')), el('span', { class: 'val' }, d.zone, ctx.ui.icon('right'))),
      err ? el('div', { class: 'err-msg' }, err) : null);
    draw();
    const s = ctx.ui.sheet({ title: t('reconcile.period'), body: slot, footer: ctx.ui.button({ label: t('sheet.save'), size: 'lg', block: true, onClick: () => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d.from) || !/^\d{4}-\d{2}-\d{2}$/.test(d.to) || d.from > d.to) { err = t('reconcile.period.bad'); draw(); return; }
      s.close();
      ctx.navigate(`#/reconcile/${account.id}?from=${d.from}&to=${d.to}&zone=${encodeURIComponent(d.zone)}${q.import ? `&import=${q.import}` : ''}`);
    } }) });
  }

  function resultBlock() {
    const { fmt, ui } = ctx;
    const ccy = account.baseCurrency;
    const m = (v) => fmt.money(v, ccy);
    if (st.qty) {
      const r = st.qty;
      const tradeOf = new Map(model.trades.flatMap((x) => x.legs.filter((l) => l.source?.key).map((l) => [l.source.key, x.id])));
      return el('section', { class: ['card', 'result', r.state === 'reconciled' ? 'ok' : 'open'] },
        el('div', { class: 'card-h' }, el('h3', null, r.state === 'reconciled' ? t('reconcile.qty.match') : t('reconcile.qty.diff')), ui.statusChip(r.state === 'reconciled' ? 'reconciled' : 'difference')),
        el('div', { class: 'kv' }, el('div', null, el('dt', null, t('reconcile.qty.implied')), el('dd', null, `${r.impliedQty} ${st.asset}`)), el('div', null, el('dt', null, t('reconcile.qty.broker')), el('dd', null, `${r.brokerQty} ${st.asset}`)), el('div', null, el('dt', null, t('reconcile.difference')), el('dd', null, `${r.differenceQty} ${st.asset}`))),
        r.state === 'reconciled' ? null : (r.explanations.length
          ? [sectionHead(t('reconcile.explains')), el('div', { class: 'list' }, ...r.explanations.map((e) => el('div', { class: 'row' }, el('div', { class: 'main' }, el('span', { class: 't' }, t(`reconcile.cause.${e.cause}`)), el('span', { class: 'd' }, (e.fillKeys || []).map((k) => tradeOf.get(k)).filter(Boolean).length ? [...new Set((e.fillKeys || []).map((k) => tradeOf.get(k)).filter(Boolean))].map((id) => el('a', { class: 'trade-link', href: `#/trade/${id}` }, model.trades.find((x) => x.id === id)?.instrument ?? id)) : '')), el('div', { class: 'end' }, el('span', { class: 'm num' }, `${e.qty} ${st.asset}`)))))]
          : el('p', { class: 'sub' }, t('reconcile.qty.unexplained', { x: `${r.unexplainedQty} ${st.asset}` }))));
    }
    const r = st.result;
    if (!r) return null;
    const trade = (id) => model.trades.find((x) => x.id === id);
    const lines = [
      r.costsMinor ? [t('reconcile.ours.beforeCosts'), m(r.beforeCostsMinor)] : null, [t('reconcile.ours.closed'), m(r.closedMinor)], r.openLegsMinor ? [t('reconcile.ours.openLegs'), m(r.openLegsMinor)] : null, [t('reconcile.ours'), m(r.oursMinor)], [t('reconcile.broker'), m(r.brokerMinor)],
      [t('reconcile.difference'), m(r.differenceMinor)], [t('reconcile.tolerance'), fmt.moneyPlain(r.toleranceMinor, ccy)],
    ].filter(Boolean);
    const matched = r.state === 'reconciled';
    return el('section', { class: ['card', 'result', matched ? 'ok' : 'open'] },
      el('div', { class: 'card-h' }, el('h3', null, matched ? t('reconcile.match', { x: fmt.moneyPlain(r.toleranceMinor, ccy) }) : t('reconcile.diff', { x: fmt.money(r.differenceMinor, ccy) })), ui.statusChip(matched ? 'reconciled' : 'difference')),
      matched && r.differenceMinor !== 0 ? el('p', { class: 'caption' }, t('reconcile.exact', { x: fmt.money(r.differenceMinor, ccy) })) : null,
      el('div', { class: 'kv' }, ...lines.map(([k, v]) => el('div', null, el('dt', null, k), el('dd', null, v)))),
      matched ? null : [
        r.explanations.length ? [sectionHead(t('reconcile.explains')), el('p', { class: 'caption' }, t('reconcile.explains.count', { n: r.headerCount })),
          el('div', { class: 'list' }, ...r.explanations.map((e) => el('div', { class: 'row' },
            el('div', { class: 'main' }, el('span', { class: 't' }, (e.instruments || []).join(', ') || t(`reconcile.cause.${e.cause}`)), el('span', { class: 'd' }, t(`reconcile.cause.${e.cause}`)),
              (e.tradeIds || []).map((id) => trade(id)).filter(Boolean).map((tr) => el('a', { class: 'trade-link', href: `#/trade/${tr.id}` }, `${tr.instrument} · ${fmt.date(tr.closeTime || tr.legs[0].time)}`))),
            el('div', { class: 'end' }, el('span', { class: 'm num' }, m(e.amountMinor))))))] : null,
        r.needsInput.length ? [sectionHead(t('reconcile.alsoCheck')), el('div', { class: 'list' }, ...r.needsInput.map((n) => el('a', { class: 'row', href: fromImport || n.anomalyId ? `#/import/${(n.anomalyId || '').split(':')[0]}` : '#/journal' }, el('div', { class: 'main' }, el('span', { class: 't' }, (n.instruments || []).join(', ')), el('span', { class: 'd' }, t(`reconcile.needs.${n.cause}`))), el('div', { class: 'end' }, ui.icon('right', 'chev')))))] : null,
        el('p', { class: r.explanations.length ? 'caption' : 'sub' }, r.explanations.length ? (r.unexplainedMinor ? t('reconcile.unexplained.rest', { x: m(r.unexplainedMinor) }) : '') : t('reconcile.unexplained', { x: fmt.moneyPlain(Math.abs(r.unexplainedMinor), ccy) })),
        r.balanceHint ? el('p', { class: 'caption' }, t('reconcile.cashCategory')) : null]);
  }

  function paint() {
    if (disposed) return;
    const { fmt, ui } = ctx;
    const totals = cashTotals(model.cash, account.id, period, digits);
    const forms = [{ value: 'net_pnl', label: t('reconcile.form.net') }, { value: 'balance', label: t('reconcile.form.balance') }];
    if (assets.length) forms.push({ value: 'quantity', label: t('reconcile.form.quantity') });
    const hintKey = `reconcile.hint.${lastFormat}`;
    let inputs;
    if (st.form === 'net_pnl') inputs = [ui.field({ label: t('reconcile.input.net'), value: st.value, inputmode: 'decimal', unit: account.baseCurrency, help: has(hintKey) ? t(hintKey) : t('reconcile.hint.generic'), onInput: (v) => { st.value = v; } })];
    else if (st.form === 'balance') {
      inputs = [
        el('button', { type: 'button', class: ['opt', st.confirmNoOpen && 'on'], 'aria-pressed': String(st.confirmNoOpen), onClick: () => { st.confirmNoOpen = !st.confirmNoOpen; paint(); } }, el('span', { class: ['check', st.confirmNoOpen && 'on'] }, st.confirmNoOpen ? ui.icon('check', 'sm') : null), el('span', null, t('reconcile.confirmNoOpen'), el('small', null, t('reconcile.confirmNoOpen.sub')))),
        st.confirmNoOpen ? el('div', { class: 'vstack' },
          el('div', { class: 'grid2' }, ui.field({ label: t('reconcile.balance.start'), value: st.start, inputmode: 'decimal', unit: account.baseCurrency, onInput: (v) => { st.start = v; } }), ui.field({ label: t('reconcile.balance.end'), value: st.end, inputmode: 'decimal', unit: account.baseCurrency, onInput: (v) => { st.end = v; } })),
          el('div', { class: 'grid2' }, ui.field({ label: t('reconcile.balance.deposits'), value: st.deposits ?? fmt.num(totals.depositsMinor / 10 ** digits, digits), inputmode: 'decimal', help: t('reconcile.balance.fromCash'), onInput: (v) => { st.deposits = v; } }), ui.field({ label: t('reconcile.balance.withdrawals'), value: st.withdrawals ?? fmt.num(Math.abs(totals.withdrawalsMinor) / 10 ** digits, digits), inputmode: 'decimal', onInput: (v) => { st.withdrawals = v; } })),
          ui.field({ label: t('reconcile.balance.other'), value: st.other, inputmode: 'decimal', help: t('reconcile.balance.other.help'), onInput: (v) => { st.other = v; } })) : null];
    } else {
      inputs = [
        assets.length > 1 ? el('div', { class: 'field' }, el('span', { class: 'lbl' }, t('reconcile.qty.asset')), ui.segmented({ ariaLabel: t('reconcile.qty.asset'), value: st.asset, options: assets.map((a) => ({ value: a, label: a })), onChange: (v) => { st.asset = v; paint(); } })) : null,
        el('div', { class: 'grid2' }, ui.field({ label: t('reconcile.qty.start'), value: st.startQty, inputmode: 'decimal', unit: st.asset, placeholder: '0', onInput: (v) => { st.startQty = v; } }), ui.field({ label: t('reconcile.qty.end'), value: st.brokerQty, inputmode: 'decimal', unit: st.asset, onInput: (v) => { st.brokerQty = v; } })),
        el('p', { class: 'caption' }, t('reconcile.qty.hint'))];
    }
    const lastSaved = model.reconciliations.find((r) => r.id === `${account.id}:${period.from}:${period.to}`);
    mount(root, detailBar(ctx, { title: t('reconcile.title'), backHash: fromImport ? `#/import/${fromImport.id}` : '#/home', backLabel: fromImport ? t('import.title') : t('nav.home') }),
      el('main', { class: 'content' },
        el('button', { type: 'button', class: 'card period-card', onClick: editPeriod },
          el('div', { class: 'main' }, el('div', { class: 'file-name' }, `${account.name} · ${periodLabel(period, fmt)}`), el('div', { class: 'caption num' }, `${t('reconcile.zoneName', { zone: period.zone })} · ${account.baseCurrency}`)), ui.icon('pencil', 'sm')),
        lastSaved && !st.result && !st.qty ? el('div', { class: 'row status-row' }, el('div', { class: 'main' }, el('span', { class: 't' }, t('reconcile.saved'))), el('div', { class: 'end' }, ui.statusChip(lastSaved.state))) : null,
        el('div', { class: 'field' }, el('span', { class: 'lbl' }, t('reconcile.form')), ui.segmented({ ariaLabel: t('reconcile.form'), value: st.form, options: forms, onChange: (v) => { st.form = v; st.result = null; st.qty = null; paint(); } })),
        ...inputs,
        st.error ? ui.stateBanner({ kind: 'danger', iconName: 'alert', body: t(st.error) }) : null,
        ui.button({ label: t('reconcile.compare'), size: 'lg', block: true, disabled: st.form === 'balance' && !st.confirmNoOpen, onClick: compute }),
        resultBlock(),
        el('div', { class: 'btn-row' }, ui.button({ label: t('reconcile.skip'), kind: 'plain', onClick: skip }), fromImport && (fromImport.anomalies || []).some((a) => !a.answer && !a.resolved && a.kind !== 'unreadable_rows') ? ui.button({ label: t('reconcile.answerQuestions'), kind: 'ghost', onClick: () => ctx.navigate(`#/import/${fromImport.id}`) }) : null),
        account.mode === 'paper' ? ui.stateBanner({ kind: 'neutral', iconName: 'info', body: t('accounts.paperNoCheck') }) : null));
  }
  paint();
  if (saved?.broker?.form === 'net_pnl' && stats) compute();
  return () => { disposed = true; };
}
