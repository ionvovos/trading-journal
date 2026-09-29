// Figures over a closed-trade set: S3-S6, S9, S14-S18. Pure.
// A `set` is the `included` array of closedSet, or the closedSet result itself.
import { minorDigits, roundMinor } from '../core/money.js';
import {
  isClosedTrade, tradeMoney, rMultiple, initialRisk, displayMinor, toDisplay, closeTimeOf, firstEntry,
  averages, baseDigits,
} from './trade.js';

export const tradesOf = (set) => (Array.isArray(set) ? set : set?.included || []);

export function displayDigits(ctx) {
  const ccy = ctx?.displayCurrency;
  if (!ccy) return minorDigits('');
  return (ctx.digitsOf || minorDigits)(ccy);
}

// Close order: close instant, ties by trade id.
export function byClose(a, b) {
  const d = Date.parse(closeTimeOf(a)) - Date.parse(closeTimeOf(b));
  if (d) return d;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

const cache = new WeakMap();
const noCtx = {};
// Per-trade figures used by every aggregate, computed once per (ctx, trade).
export function rowOf(trade, ctx) {
  const key = ctx || noCtx;
  let m = cache.get(key);
  if (!m) { m = new WeakMap(); cache.set(key, m); }
  let row = m.get(trade);
  if (!row) {
    const money = tradeMoney(trade, ctx);
    const risk = initialRisk(trade).value;
    row = {
      trade,
      id: trade.id,
      money,
      netMinor: money ? displayMinor(trade, ctx) : null,
      feesMinor: money ? toDisplay(money.feesMinor, trade, ctx) : null,
      fundingMinor: money ? toDisplay(money.fundingMinor, trade, ctx) : null,
      risk,
      r: rMultiple(trade, ctx),
      scale: 10 ** baseDigits(trade, ctx),
    };
    m.set(trade, row);
  }
  return row;
}

export const rowsOf = (set, ctx) => tradesOf(set).map((t) => rowOf(t, ctx));

// S3. Order of the checks: other mode, other account, held out, user-excluded, open.
export function closedSet(trades, { mode, accountIds = 'all', filter } = {}) {
  const included = [];
  const excluded = { open: [], heldOut: [], userExcluded: [], otherMode: [], otherAccount: [] };
  const accounts = accountIds === 'all' || accountIds === undefined || accountIds === null ? null : new Set(accountIds);
  for (const t of trades) {
    if (mode && t.mode !== mode) { excluded.otherMode.push(t); continue; }
    if (accounts && !accounts.has(t.accountId)) { excluded.otherAccount.push(t); continue; }
    if (filter && !filter(t)) continue;
    if (t.holds && t.holds.length > 0) { excluded.heldOut.push(t); continue; }
    if (t.excluded) { excluded.userExcluded.push(t); continue; }
    if (!isClosedTrade(t)) { excluded.open.push(t); continue; }
    included.push(t);
  }
  included.sort(byClose);
  return { included, excluded };
}

const sumBy = (rows, f) => rows.reduce((s, r) => s + f(r), 0);

// S4. Winner netMinor > 0, loser < 0, break-even neither.
export function winRate(set, ctx) {
  const rows = rowsOf(set, ctx);
  const wins = rows.filter((r) => r.netMinor > 0).length;
  const losses = rows.filter((r) => r.netMinor < 0).length;
  const n = rows.length;
  return { value: n ? wins / n : null, wins, losses, breakEven: n - wins - losses, n };
}

// S5. Averages in display major units (avgLoss as a positive magnitude); R over R-known trades.
export function avgWinLoss(set, ctx) {
  const rows = rowsOf(set, ctx);
  const scale = 10 ** displayDigits(ctx);
  const win = rows.filter((r) => r.netMinor > 0);
  const loss = rows.filter((r) => r.netMinor < 0);
  const winR = rows.filter((r) => r.r !== null && r.r > 0);
  const lossR = rows.filter((r) => r.r !== null && r.r < 0);
  return {
    avgWin: win.length ? sumBy(win, (r) => r.netMinor) / win.length / scale : null,
    avgLoss: loss.length ? -sumBy(loss, (r) => r.netMinor) / loss.length / scale : null,
    nWin: win.length,
    nLoss: loss.length,
    avgWinR: winR.length ? sumBy(winR, (r) => r.r) / winR.length : null,
    avgLossR: lossR.length ? -sumBy(lossR, (r) => r.r) / lossR.length : null,
    nWinR: winR.length,
    nLossR: lossR.length,
  };
}

// S6. Never Infinity: no trades or no losses give null with a reason.
export function profitFactor(set, ctx) {
  const rows = rowsOf(set, ctx);
  if (!rows.length) return { value: null, reason: 'no_trades' };
  const wins = sumBy(rows.filter((r) => r.netMinor > 0), (r) => r.netMinor);
  const losses = -sumBy(rows.filter((r) => r.netMinor < 0), (r) => r.netMinor);
  if (losses === 0) return { value: null, reason: 'no_losses' };
  return { value: wins / losses, reason: null };
}

// Expectancy in R from a list of R values: the mean and the by-parts form.
export function expectancyOfR(rs) {
  const n = rs.length;
  if (!n) return { value: null, byParts: null, n: 0 };
  const wins = rs.filter((r) => r > 0);
  const losses = rs.filter((r) => r < 0);
  const avgWin = wins.length ? wins.reduce((s, r) => s + r, 0) / wins.length : 0;
  const avgLoss = losses.length ? -losses.reduce((s, r) => s + r, 0) / losses.length : 0;
  return {
    value: rs.reduce((s, r) => s + r, 0) / n,
    byParts: (wins.length / n) * avgWin - (losses.length / n) * avgLoss,
    n,
  };
}

// S9.
export function expectancy(set, ctx) {
  const rows = rowsOf(set, ctx);
  const rs = rows.filter((r) => r.r !== null).map((r) => r.r);
  const e = expectancyOfR(rs);
  const n = rows.length;
  const min = ctx?.smallSampleMin ?? 30;
  return {
    r: { value: e.value, n: e.n, rMissing: n - e.n, byParts: e.byParts },
    money: { valueMinor: n ? roundMinor(sumBy(rows, (r) => r.netMinor) / n, 0) : null, n },
    smallSample: n < min || e.n < min,
  };
}

// S14. Fees and funding in display minor units; R figures are cost / risk over R-known trades.
export function feeTotals(set, ctx) {
  const rows = rowsOf(set, ctx);
  const rKnown = rows.filter((r) => r.r !== null);
  return {
    feesMinor: sumBy(rows, (r) => r.feesMinor),
    fundingMinor: sumBy(rows, (r) => r.fundingMinor),
    feesR: sumBy(rKnown, (r) => r.money.feesMinor / r.scale / r.risk),
    fundingR: sumBy(rKnown, (r) => -r.money.fundingMinor / r.scale / r.risk),
    nR: rKnown.length,
  };
}

// S15. Close order; a break-even trade ends both runs.
export function streaks(set, ctx) {
  const rows = tradesOf(set).slice().sort(byClose).map((t) => rowOf(t, ctx));
  let longestWin = 0;
  let longestLoss = 0;
  let kind = null;
  let length = 0;
  for (const r of rows) {
    const k = r.netMinor > 0 ? 'win' : r.netMinor < 0 ? 'loss' : null;
    if (k && k === kind) length += 1;
    else { kind = k; length = k ? 1 : 0; }
    if (kind === 'win') longestWin = Math.max(longestWin, length);
    if (kind === 'loss') longestLoss = Math.max(longestLoss, length);
  }
  return { longestWin, longestLoss, current: { kind, length } };
}

// S16. followed / marked; unmarked counted beside it. tradeIds are the marked trades.
export function ruleFollowing(set) {
  const trades = tradesOf(set);
  const marked = trades.filter((t) => t.plan && typeof t.plan.followed === 'boolean');
  const followed = marked.filter((t) => t.plan.followed).length;
  return {
    value: marked.length ? followed / marked.length : null,
    followed,
    marked: marked.length,
    unmarked: trades.length - marked.length,
    tradeIds: marked.map((t) => t.id),
  };
}

// S17. Forex only: pip 0.01 when the quote currency is JPY, else 0.0001.
export function pipSizeOf(instrument, quoteCurrency) {
  const q = quoteCurrency || String(instrument || '').replace(/[^A-Za-z]/g, '').slice(3);
  return String(q).toUpperCase() === 'JPY' ? 0.01 : 0.0001;
}

export function pips(trade) {
  if (trade.market !== 'forex' || !isClosedTrade(trade)) return null;
  const pipSize = pipSizeOf(trade.instrument, trade.quoteCurrency);
  const { avgEntry, avgExit } = averages(trade);
  const sign = trade.side === 'short' ? -1 : 1;
  const stop = trade.initialStop;
  return {
    resultPips: ((avgExit - avgEntry) * sign) / pipSize,
    stopPips: stop === null || stop === undefined ? null : Math.abs(avgEntry - Number(stop)) / pipSize,
    pipSize,
  };
}

// Summed only within one pair; pairs in alphabetical order.
export function pipsByPair(set) {
  const by = new Map();
  for (const t of tradesOf(set)) {
    const p = pips(t);
    if (!p) continue;
    const row = by.get(t.instrument) || { instrument: t.instrument, pips: 0, n: 0 };
    row.pips += p.resultPips;
    row.n += 1;
    by.set(t.instrument, row);
  }
  return [...by.values()].sort((a, b) => (a.instrument < b.instrument ? -1 : a.instrument > b.instrument ? 1 : 0));
}

// S18. First entry to close, in seconds.
export function holdingTime(set, ctx) {
  const acc = { winners: [], losers: [] };
  for (const r of rowsOf(set, ctx)) {
    const s = (Date.parse(closeTimeOf(r.trade)) - Date.parse(firstEntry(r.trade).time)) / 1000;
    if (r.netMinor > 0) acc.winners.push(s);
    else if (r.netMinor < 0) acc.losers.push(s);
  }
  const avg = (xs) => ({ avgSeconds: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null, n: xs.length });
  return { winners: avg(acc.winners), losers: avg(acc.losers) };
}
