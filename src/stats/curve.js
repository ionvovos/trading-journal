// S10 equity curve, S11 drawdown, equity at entry. Pure.
import * as D from '../core/decimal.js';
import { roundMinor, minorDigits } from '../core/money.js';
import { tradesOf, rowOf, byClose, displayDigits } from './sets.js';
import { closeTimeOf, firstEntry, isClosedTrade, tradeMoney } from './trade.js';

// Accounts in view: the listed ids; with 'all', the accounts of the view's mode when accounts
// carry a mode, else the accounts the set's trades belong to.
export function accountsInView(set, ctx) {
  const all = ctx?.accounts || {};
  if (Array.isArray(ctx?.accountIds)) return ctx.accountIds.filter((id) => all[id]);
  const ids = Object.keys(all);
  if (ids.some((id) => all[id].mode)) return ids.filter((id) => !ctx.mode || all[id].mode === ctx.mode);
  const used = new Set(tradesOf(set).map((t) => t.accountId));
  return ids.filter((id) => used.has(id));
}

// A base-currency decimal amount of an account in display minor units.
function accountToDisplayMinor(amount, accountId, ctx) {
  const account = ctx.accounts[accountId];
  const same = !ctx.displayCurrency || account.baseCurrency === ctx.displayCurrency;
  const rate = same ? 1 : account.toDisplayRate;
  if (rate === null || rate === undefined) return null;
  return roundMinor(D.toNumber(amount) * rate, displayDigits(ctx));
}

// S10. Start = Σ starting balances in view, then one point per trade close (ties by id).
// Cash movements are not points. `startBalanceKnown` is false when an account in view has none.
export function equityCurve(set, ctx) {
  const ids = accountsInView(set, ctx);
  let start = 0;
  let startBalanceKnown = ids.length > 0;
  for (const id of ids) {
    const sb = ctx.accounts[id].startBalance;
    if (sb === null || sb === undefined || sb === '') { startBalanceKnown = false; continue; }
    const m = accountToDisplayMinor(sb, id, ctx);
    if (m === null) { startBalanceKnown = false; continue; }
    start += m;
  }
  const points = [{ t: null, kind: 'start', ref: null, equityMinor: start }];
  let equity = start;
  for (const t of tradesOf(set).slice().sort(byClose)) {
    equity += rowOf(t, ctx).netMinor;
    points.push({ t: closeTimeOf(t), kind: 'trade', ref: t.id, equityMinor: equity });
  }
  return { points, startBalanceKnown };
}

// Cash movement as signed display minor units: deposits add, withdrawals subtract, 'other' is 0.
function cashMinor(c, ctx) {
  if (Number.isInteger(c.amountMinor)) return c.amountMinor;
  if (c.kind !== 'deposit' && c.kind !== 'withdrawal') return 0;
  const abs = D.abs(c.amount);
  const signed = c.kind === 'withdrawal' ? D.neg(abs) : abs;
  if (ctx?.accounts?.[c.accountId]) return accountToDisplayMinor(signed, c.accountId, ctx) ?? 0;
  const digits = (ctx?.digitsOf || minorDigits)(c.currency || ctx?.displayCurrency || '');
  return roundMinor(D.toNumber(signed), digits);
}

// S11. Amounts, peak, trough and recovery from the curve alone; percent denominators use equity
// including cash, E(t) = curve value at t + Σ deposits − withdrawals up to t.
export function drawdown(curve, { cash = [], ctx } = {}) {
  const points = curve.points;
  const moves = cash
    .map((c) => ({ ms: Date.parse(c.time ?? c.t), minor: cashMinor(c, ctx) }))
    .filter((c) => c.minor !== 0 && !Number.isNaN(c.ms));
  const cashUpTo = (p) => (p.t === null ? 0 : moves.filter((c) => c.ms <= Date.parse(p.t)).reduce((s, c) => s + c.minor, 0));
  const E = (i) => points[i].equityMinor + cashUpTo(points[i]);
  const ref = (i) => (i === null ? null : { t: points[i].t, tradeId: points[i].ref, equityMinor: points[i].equityMinor, index: i });

  let peakI = 0;
  let best = { maxMinor: 0, peak: null, trough: null };
  for (let i = 0; i < points.length; i += 1) {
    if (points[i].equityMinor > points[peakI].equityMinor) peakI = i;
    const fall = points[peakI].equityMinor - points[i].equityMinor;
    if (fall > best.maxMinor) best = { maxMinor: fall, peak: peakI, trough: i };
  }
  let recovery = null;
  if (best.trough !== null) {
    for (let i = best.trough + 1; i < points.length; i += 1) {
      if (points[i].equityMinor >= points[best.peak].equityMinor) { recovery = i; break; }
    }
  }
  const last = points.length - 1;
  const currentMinor = points.length ? points[peakI].equityMinor - points[last].equityMinor : 0;

  const pctOK = curve.startBalanceKnown !== false;
  let maxPct = null;
  let recoveryGainPct = null;
  let currentPct = null;
  let note = null;
  const lastT = points.length ? points[last].t : null;
  if (lastT !== null && moves.some((c) => c.ms <= Date.parse(lastT))) note = 'includes_cash';
  if (pctOK && points.length) {
    if (best.peak === null) {
      maxPct = 0;
      recoveryGainPct = 0;
    } else {
      const ep = E(best.peak);
      if (ep > 0) maxPct = best.maxMinor / ep;
      const et = E(best.trough);
      if (et > 0) recoveryGainPct = best.maxMinor / et;
      else note = 'equity_at_or_below_zero';
    }
    const ec = E(peakI);
    if (ec > 0) currentPct = currentMinor / ec;
  }
  return {
    maxMinor: best.maxMinor,
    maxPct,
    peak: ref(best.peak),
    trough: ref(best.trough),
    recovery: ref(recovery),
    currentMinor,
    currentPct,
    recoveryGainPct,
    note,
  };
}

// Account start balance + net of its trades closed before the entry + deposits − withdrawals
// before it, in base-currency minor units. Trades come from ctx.trades, cash from ctx.cash.
export function equityAtEntry(trade, ctx) {
  const account = ctx?.accounts?.[trade.accountId];
  if (!account || account.startBalance === null || account.startBalance === undefined || account.startBalance === '') return null;
  const entry = firstEntry(trade);
  if (!entry) return null;
  const at = Date.parse(entry.time);
  const d = (ctx.digitsOf || minorDigits)(account.baseCurrency);
  let equity = roundMinor(D.toNumber(account.startBalance), d);
  for (const t of ctx.trades || []) {
    if (t === trade || t.accountId !== trade.accountId) continue;
    if ((t.holds && t.holds.length) || t.excluded || !isClosedTrade(t)) continue;
    if (!(Date.parse(closeTimeOf(t)) < at)) continue;
    const m = tradeMoney(t, ctx);
    if (m) equity += m.netMinor;
  }
  for (const c of ctx.cash || []) {
    if (c.accountId !== trade.accountId || !(Date.parse(c.time) < at)) continue;
    if (c.kind !== 'deposit' && c.kind !== 'withdrawal') continue;
    const v = roundMinor(Math.abs(D.toNumber(c.amount)), d);
    equity += c.kind === 'deposit' ? v : -v;
  }
  return equity;
}
