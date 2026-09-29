// Statistics for a screen: one call turns the stored journal into every figure S3-S18 for a mode, account filter and period,
// through src/stats (pure, never AI). The dashboard, the statistics screen, the calendar and the drill-down all read this.
import { localParts } from '../core/time.js';
import { isClosed, tradeStatus } from '../core/trade.js';
import { statsCtxFor, loadModel } from './model.js';
import { loadStats, closeDay, toDisplayMinor } from './viewkit.js';
import { monthRange } from './periods.js';

const idOf = (x) => (typeof x === 'string' ? x : x.id);

// The calendar month of the most recent close in the trades (ctx.tz, day cut-off applied), or of `now` when there is none.
export function defaultMonth(trades, ctx, now = new Date().toISOString()) {
  const days = trades.filter((tr) => isClosed(tr) && !(tr.holds && tr.holds.length) && !tr.excluded).map((tr) => closeDay(tr, ctx)).filter(Boolean).sort();
  const nowMonth = localParts(now, ctx.tz).date.slice(0, 7);
  if (days.some((d) => d.slice(0, 7) === nowMonth)) return nowMonth;
  return days.length ? days[days.length - 1].slice(0, 7) : nowMonth;
}

// period: { from, to } inclusive local dates, or null for all time.
export const inPeriod = (tr, ctx, period) => {
  if (!period) return true;
  const d = closeDay(tr, ctx);
  return !!d && d >= period.from && d <= period.to;
};

export const monthPeriod = (month) => monthRange(month);

// computeStats(ctx, model, { period, filter }) -> everything the statistics screens show, or null when src/stats is missing.
export async function computeStats(ctx, model, { period = null, sctxOverrides = {} } = {}) {
  const stats = await loadStats();
  const sctx = statsCtxFor(ctx, model, sctxOverrides);
  const byId = new Map(model.trades.map((tr) => [tr.id, tr]));
  const inMode = model.trades.filter((tr) => tr.mode === ctx.mode);
  const wanted = inMode.filter((tr) => (sctx.accountIds === 'all' || sctx.accountIds.includes(tr.accountId)));
  const set = stats.closedSet(model.trades, { mode: sctx.mode, accountIds: sctx.accountIds });
  const resolve = (list) => (list || []).map((x) => (typeof x === 'string' ? byId.get(x) : x)).filter(Boolean);
  const included = resolve(set.included).filter((tr) => inPeriod(tr, ctx, period));
  const excluded = { open: resolve(set.excluded?.open), heldOut: resolve(set.excluded?.heldOut), userExcluded: resolve(set.excluded?.userExcluded), otherMode: resolve(set.excluded?.otherMode), otherAccount: resolve(set.excluded?.otherAccount) };
  const money = new Map();
  for (const tr of included) money.set(tr.id, tr.entryUnknown ? { netMinor: tr.broker?.netMinor ?? null } : stats.tradeMoney(tr, sctx));
  const accounts = new Map(model.accounts.map((a) => [a.id, a]));
  const displayCcy = sctx.displayCurrency;
  // accounts in another currency than the display currency with no typed rate: their figures cannot be added, so the screens say so
  const needsRate = [...new Map(included.filter((tr) => { const a = accounts.get(tr.accountId); return a && a.baseCurrency !== displayCcy && !(a.toDisplayRate > 0); }).map((tr) => [tr.accountId, accounts.get(tr.accountId)])).values()].map((a) => ({ id: a.id, name: a.name, from: a.baseCurrency, to: displayCcy }));
  const displayNet = (tr) => { const m = money.get(tr.id); return m && m.netMinor !== null && m.netMinor !== undefined ? toDisplayMinor(m.netMinor, accounts.get(tr.accountId), displayCcy) : null; };
  const netMinor = included.reduce((s, tr) => s + (displayNet(tr) ?? 0), 0);
  const curve = stats.equityCurve(included, sctx);
  const cashInView = model.cash.filter((c) => sctx.accountIds === 'all' ? accounts.get(c.accountId)?.mode === ctx.mode : sctx.accountIds.includes(c.accountId));
  const drawdown = stats.drawdown(curve, { cash: cashInView, ctx: sctx });
  return {
    stats, sctx, period, set: { included, excluded }, included, excluded, wanted, money, displayNet, needsRate, netMinor, currency: displayCcy, accounts, cash: cashInView,
    winRate: stats.winRate(included, sctx), avgWinLoss: stats.avgWinLoss(included, sctx), profitFactor: stats.profitFactor(included, sctx),
    expectancy: stats.expectancy(included, sctx), curve, drawdown,
    feeTotals: stats.feeTotals(included, sctx), streaks: stats.streaks(included, sctx), ruleFollowing: stats.ruleFollowing(included, sctx), holding: stats.holdingTime(included, sctx),
    pipsByPair: stats.pipsByPair(included),
    counts: { open: excluded.open.length, heldOut: excluded.heldOut.length, excluded: excluded.userExcluded.length },
    rMissing: included.filter((tr) => !tr.entryUnknown && stats.rMultiple(tr, sctx) == null).length + included.filter((tr) => tr.entryUnknown).length,
  };
}

// Index of the curve point for a drawdown marker ({ tradeId } or { t }), or null.
export function pointIndex(curve, marker) {
  if (!marker) return null;
  const pts = curve.points || [];
  const i = pts.findIndex((p) => (marker.tradeId && p.ref === marker.tradeId) || (!marker.tradeId && marker.t && p.t === marker.t));
  return i === -1 ? null : i;
}

export const idsOfSet = (list) => list.map(idOf);
export const statusCounts = (trades) => trades.reduce((acc, tr) => { const s = tradeStatus(tr); acc[s] = (acc[s] || 0) + 1; return acc; }, {});

export { loadModel };
