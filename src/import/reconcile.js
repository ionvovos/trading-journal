// Broker check (the angle, K1): compares the app's realised total with the broker's own figure and
// names the trades that explain a difference. Code only, no model. Architecture section 5.1.
// Pure: money for a whole trade comes from deps.tradeMoney (src/stats), per exit leg from this file.
import * as D from '../core/decimal.js';
import { minorDigits, roundMinor } from '../core/money.js';
import { localParts } from '../core/time.js';
import { isClosed } from '../core/trade.js';

export const DEFAULT_CAP = '1.00';
const MAX_CANDIDATES = 24;
const MAX_SUBSET = 3;

const err = (code) => Object.assign(new Error(code), { code });

export function moneyCtx(account, { mode = 'real', tz = 'UTC', dayCutoffHour = 0, extra = {} } = {}) {
  return {
    mode, accountIds: 'all', displayCurrency: account.baseCurrency, digitsOf: minorDigits, tz, dayCutoffHour, smallSampleMin: 30,
    accounts: { [account.id]: { baseCurrency: account.baseCurrency, startBalance: account.startBalance ?? null, toDisplayRate: 1 } }, cash: [], ...extra,
  };
}

const dateIn = (isoUtc, zone) => localParts(isoUtc, zone).date;
const inPeriod = (isoUtc, period) => {
  const d = dateIn(isoUtc, period.zone);
  return d >= period.from && d <= period.to;
};

// Largest-remainder split of `total` (integer) over `weights` (decimal strings); the parts sum exactly to total.
export function allocate(total, weights) {
  const w = weights.map((x) => D.dec(x));
  const sum = w.reduce((s, x) => s + x, 0n);
  if (sum === 0n) return weights.map((_, i) => (i === 0 ? total : 0));
  const neg = total < 0;
  const abs = BigInt(Math.abs(total));
  const raw = w.map((x) => (abs * x) / sum);
  const rem = w.map((x, i) => ({ i, r: (abs * x) % sum }));
  let left = abs - raw.reduce((s, x) => s + x, 0n);
  rem.sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  const out = raw.map(Number);
  for (const { i } of rem) { if (left <= 0n) break; out[i] += 1; left -= 1n; }
  return out.map((x) => (neg ? -x : x));
}

const legRate = (l) => (l.quoteToAccount ?? 1);
const feeRate = (l) => (l.feeToAccount ?? 1);

// Realised amount of one exit leg of a trade at average cost, in minor units (architecture 5.1):
// the leg's broker figure when stored, else (exit - average entry) x size x contract x rate,
// less the exit fee and the entry fees pro rata by exited size.
export function legRealised(trade, leg, digits) {
  if (leg.broker && leg.broker.realizedPnl !== undefined && leg.broker.realizedPnl !== null) return roundMinor(D.toNumber(leg.broker.realizedPnl), digits);
  const entries = trade.legs.filter((l) => l.kind === 'entry' && l.time <= leg.time);
  if (!entries.length) return 0;
  const size = D.sum(entries.map((l) => l.size));
  const avg = D.div(D.sum(entries.map((l) => D.mul(l.price, l.size))), size);
  const dir = trade.side === 'long' ? 1 : -1;
  const contract = Number(trade.contractValue ?? trade.contractSize ?? 1);
  const gross = dir * (Number(leg.price) - Number(avg)) * Number(leg.size) * contract * legRate(leg);
  const entryFees = entries.reduce((s, l) => s + Number(l.fee || 0) * feeRate(l), 0);
  const fees = Number(leg.fee || 0) * feeRate(leg) + entryFees * (Number(leg.size) / Number(size));
  return roundMinor(gross - fees, digits);
}

// What one trade adds to the app's total for a period: { closedMinor, legs: [{ legId, amountMinor }] }.
// A closed trade with every exit leg inside the period counts whole (closedMinor); otherwise each exit
// leg inside the period counts on its own (legs), allocated from the trade net when it is closed.
export function tradeContribution(trade, period, ctx, deps, digits) {
  const exits = trade.legs.filter((l) => l.kind === 'exit');
  const inside = exits.filter((l) => inPeriod(l.time, period));
  if (!inside.length) return { closedMinor: 0, legs: [] };
  const closed = isClosed(trade);
  if (closed) {
    const net = trade.entryUnknown ? trade.broker?.netMinor : deps.tradeMoney(trade, ctx)?.netMinor;
    if (net === undefined || net === null) return { closedMinor: 0, legs: [] };
    if (inside.length === exits.length) return { closedMinor: net, legs: [], closedTrade: true };
    const parts = allocate(net, exits.map((l) => l.size));
    return { closedMinor: 0, legs: exits.flatMap((l, i) => (inside.includes(l) ? [{ legId: l.id, amountMinor: parts[i] }] : [])) };
  }
  return { closedMinor: 0, legs: inside.map((l) => ({ legId: l.id, amountMinor: legRealised(trade, l, digits) })) };
}

const isCounted = (t, accountId, mode) => t.accountId === accountId && t.mode === mode && !(t.holds && t.holds.length) && !t.excluded;

// realisedTotal({ trades, accountId, period, ctx }, deps) -> { closedMinor, openLegsMinor, openLegs, closedTrades }
export function realisedTotal({ trades, accountId, period, ctx, account }, deps) {
  const acct = account || { id: accountId, baseCurrency: ctx.accounts[accountId].baseCurrency };
  const digits = minorDigits(acct.baseCurrency);
  const mode = ctx.mode || 'real';
  let closedMinor = 0;
  let closedTrades = 0;
  const openLegs = [];
  for (const t of trades) {
    if (!isCounted(t, accountId, mode)) continue;
    const c = tradeContribution(t, period, ctx, deps, digits);
    closedMinor += c.closedMinor;
    if (c.closedTrade) closedTrades++;
    for (const l of c.legs) openLegs.push({ tradeId: t.id, legId: l.legId, amountMinor: l.amountMinor });
  }
  return { closedMinor, openLegsMinor: openLegs.reduce((s, l) => s + l.amountMinor, 0), openLegs, closedTrades };
}

export function toleranceMinor({ closedTrades, digits, cap = DEFAULT_CAP }) {
  const capMinor = roundMinor(Number(cap), digits);
  return Math.min(closedTrades, capMinor);
}

function cashMinor(c, digits) {
  return c.amountMinor !== undefined ? c.amountMinor : roundMinor(Number(c.amount), digits);
}

// Smallest subset (at most MAX_SUBSET of the first MAX_CANDIDATES) whose amounts sum to target within tol.
export function findSubset(candidates, target, tol) {
  const list = candidates.slice(0, MAX_CANDIDATES);
  let best = null;
  const consider = (idx, sum) => {
    const resid = Math.abs(target - sum);
    if (resid > tol) return;
    if (!best || idx.length < best.idx.length || (idx.length === best.idx.length && resid < best.resid)) best = { idx: [...idx], resid };
  };
  for (let k = 1; k <= MAX_SUBSET && !best; k++) {
    const walk = (start, idx, sum) => {
      if (idx.length === k) { consider(idx, sum); return; }
      for (let i = start; i < list.length; i++) { idx.push(i); walk(i + 1, idx, sum + list[i].amountMinor); idx.pop(); }
    };
    walk(0, [], 0);
  }
  return best ? best.idx.map((i) => list[i]) : null;
}

const instrumentsOf = (ids, byId) => [...new Set(ids.map((id) => byId.get(id)?.instrument).filter(Boolean))];

// reconcile({ trades, cash, account, period, broker, cap, ctx, anomalies }, deps)
//   broker: { form: 'net_pnl', valueMinor } | { form: 'balance', startMinor, endMinor, depositsMinor, withdrawalsMinor, otherMinor, noOpenPositionsConfirmed }
//   anomalies: import anomalies of the account [{ id, kind, tradeIds, answer, fileZone }] (tz_edge needs fileZone)
export function reconcile({ trades, cash = [], account, period, broker, cap = DEFAULT_CAP, ctx, anomalies = [] }, deps) {
  if (account.mode === 'paper') throw err('reconcile.paper');
  const digits = minorDigits(account.baseCurrency);
  const cx = ctx || moneyCtx(account);
  let brokerMinor;
  if (broker.form === 'balance') {
    if (!broker.noOpenPositionsConfirmed) throw err('reconcile.balance.confirmNoOpenPositions');
    brokerMinor = broker.endMinor - broker.startMinor - (broker.depositsMinor || 0) + (broker.withdrawalsMinor || 0) - (broker.otherMinor || 0);
  } else brokerMinor = broker.valueMinor;

  const total = realisedTotal({ trades, accountId: account.id, period, ctx: cx, account }, deps);
  const oursMinor = total.closedMinor + total.openLegsMinor;
  const differenceMinor = brokerMinor - oursMinor;
  const tol = toleranceMinor({ closedTrades: total.closedTrades, digits, cap });
  const base = {
    oursMinor, closedMinor: total.closedMinor, openLegsMinor: total.openLegsMinor, openLegs: total.openLegs, brokerMinor, differenceMinor,
    toleranceMinor: tol, explanations: [], needsInput: [], unexplainedMinor: 0, headerCount: 0,
  };
  if (Math.abs(differenceMinor) <= tol) return { ...base, state: 'reconciled' };

  const mine = trades.filter((t) => t.accountId === account.id && t.mode === (cx.mode || 'real'));
  const byId = new Map(mine.map((t) => [t.id, t]));
  const candidates = [];
  const needs = new Map();
  const anomalyOf = (kind, tradeId) => anomalies.find((a) => a.kind === kind && a.tradeIds.includes(tradeId));

  // held-out trades: what they would add if released; missing fee and missing rate carry no amount
  for (const t of mine) {
    if (t.excluded || !t.holds || !t.holds.length) continue;
    const money = t.entryUnknown || !isClosed(t) ? null : deps.tradeMoney(t, cx);
    for (const kind of t.holds) {
      if (kind === 'missing_fee' || kind === 'rate_missing') {
        if (!needs.has(kind)) needs.set(kind, { cause: kind, tradeIds: [], anomalyId: anomalyOf(kind, t.id)?.id ?? null });
        needs.get(kind).tradeIds.push(t.id);
        continue;
      }
      if (kind === 'tz_edge' || kind === 'near_duplicate' || kind === 'contract_size_missing') continue;
      let amount = null;
      if (kind === 'opened_before_file' || kind === 'broker_mismatch') amount = t.broker?.netMinor ?? money?.netMinor ?? null;
      else amount = money?.netMinor ?? null;
      if (amount !== null && amount !== 0 && t.holds.every((h) => h === kind || (h !== 'missing_fee' && h !== 'rate_missing'))) {
        candidates.push({ cause: kind, tradeIds: [t.id], amountMinor: amount, anomalyId: anomalyOf(kind, t.id)?.id ?? null });
      }
    }
  }
  // duplicates kept by the user count in the total: removing them changes the total by their contribution
  for (const a of anomalies) {
    if (a.kind !== 'near_duplicate' || a.answer?.optionId !== 'keep_both') continue;
    for (const id of a.tradeIds) {
      const t = byId.get(id);
      if (!t || (t.holds && t.holds.length) || t.excluded) continue;
      const c = tradeContribution(t, period, cx, deps, digits);
      const amount = c.closedMinor + c.legs.reduce((s, l) => s + l.amountMinor, 0);
      if (amount) candidates.push({ cause: 'duplicate', tradeIds: [id], amountMinor: -amount, anomalyId: a.id });
    }
  }
  // trades closed on the other side of the period edge only because of the zone used
  for (const a of anomalies) {
    if (a.kind !== 'tz_edge' || !a.fileZone) continue;
    for (const id of a.tradeIds) {
      const t = byId.get(id);
      if (!t || t.excluded || !t.closeTime || (t.holds && t.holds.some((h) => h !== 'tz_edge'))) continue;
      const inFile = dateIn(t.closeTime, a.fileZone) >= period.from && dateIn(t.closeTime, a.fileZone) <= period.to;
      const inZone = inPeriod(t.closeTime, period);
      if (inFile && !inZone) {
        const net = deps.tradeMoney(t, cx)?.netMinor;
        if (net) candidates.push({ cause: 'tz_edge', tradeIds: [id], amountMinor: net, anomalyId: a.id });
      }
    }
  }
  // exit legs counted for a trade that is still open (or closes outside the period)
  const legsByTrade = new Map();
  for (const l of total.openLegs) {
    if (!legsByTrade.has(l.tradeId)) legsByTrade.set(l.tradeId, []);
    legsByTrade.get(l.tradeId).push(l);
  }
  for (const [id, legs] of legsByTrade) {
    const amount = legs.reduce((s, l) => s + l.amountMinor, 0);
    if (amount) candidates.push({ cause: 'partial_exit_open', tradeIds: [id], legIds: legs.map((l) => l.legId), amountMinor: -amount, anomalyId: null });
  }
  // balance form: cash items of kind other in the period not entered as other
  if (broker.form === 'balance') {
    for (const c of cash) {
      if (c.kind !== 'other' || (c.accountId !== undefined && c.accountId !== account.id)) continue;
      if (c.time && !inPeriod(/T/.test(c.time) ? c.time : `${c.time}T12:00:00Z`, period)) continue;
      const amount = cashMinor(c, digits);
      if (amount) candidates.push({ cause: 'cash_items', cashIds: [c.id], tradeIds: [], amountMinor: amount, anomalyId: null });
    }
  }

  const found = findSubset(candidates, differenceMinor, tol);
  const explanations = (found || []).map((c) => ({ ...c, instruments: instrumentsOf(c.tradeIds || [], byId) }));
  const explained = explanations.reduce((s, e) => s + e.amountMinor, 0);
  return {
    ...base,
    state: 'difference_open',
    explanations,
    needsInput: [...needs.values()].map((n) => ({ ...n, instruments: instrumentsOf(n.tradeIds, byId) })),
    unexplainedMinor: found ? differenceMinor - explained : differenceMinor,
    headerCount: new Set(explanations.flatMap((e) => e.tradeIds || [])).size,
    balanceHint: broker.form === 'balance' && !found ? 'cash_items' : null,
  };
}

// Quantity form (AC-A1.5, crypto): the quantity the imported fills imply against the broker's ending quantity.
// reconcileQuantity({ fills, cash, asset, startQty = '0', brokerQty, tolerance = '0' })
//   fills: parse fills of the account (instrument 'BTC/USD'); cash: transfers of the asset [{ id, kind, amount, currency }]
export function reconcileQuantity({ fills, cash = [], asset, startQty = '0', brokerQty, tolerance = '0' }) {
  const parts = (instrument) => instrument.split('/');
  let implied = D.toString(startQty);
  const candidates = [];
  for (const f of fills) {
    const [b, q] = parts(f.instrument);
    const buy = f.side === 'buy';
    if (b === asset) {
      implied = buy ? D.add(implied, f.size) : D.sub(implied, f.size);
      if (f.fee !== null && f.fee !== undefined && !D.isZero(f.fee)) {
        if (f.feeCurrency === asset) implied = D.sub(implied, f.fee);
        else if (f.feeCurrency === q && !D.isZero(f.price)) candidates.push({ cause: 'fee_in_asset', fillKeys: [f.key], qty: D.neg(D.div(f.fee, f.price)) });
      }
    } else if (q === asset) {
      const value = D.mul(f.size, f.price);
      implied = buy ? D.sub(implied, value) : D.add(implied, value);
      if (f.fee !== null && f.fee !== undefined && f.feeCurrency === asset) implied = D.sub(implied, f.fee);
    }
  }
  for (const c of cash) {
    if (c.currency !== undefined && c.currency !== asset) continue;
    const amount = c.kind === 'withdrawal' ? D.neg(D.abs(c.amount)) : D.abs(c.amount);
    implied = D.add(implied, amount);
    if (!D.isZero(amount)) candidates.push({ cause: 'transfer', cashIds: [c.id], qty: D.neg(amount) });
  }
  const diff = D.sub(brokerQty, implied);
  const out = { impliedQty: implied, brokerQty: D.toString(brokerQty), differenceQty: diff, explanations: [], unexplainedQty: diff, state: 'reconciled' };
  if (D.cmp(D.abs(diff), tolerance) <= 0) return out;
  out.state = 'difference_open';
  // subset search on exact decimals: fees only lower the quantity, so their candidates already carry the sign
  const list = candidates.slice(0, MAX_CANDIDATES);
  let best = null;
  for (let k = 1; k <= MAX_SUBSET && !best; k++) {
    const walk = (start, idx, sum) => {
      if (idx.length === k) {
        const resid = D.abs(D.sub(diff, sum));
        if (D.cmp(resid, tolerance) <= 0 && (!best || D.cmp(resid, best.resid) < 0)) best = { idx: [...idx], resid };
        return;
      }
      for (let i = start; i < list.length; i++) { idx.push(i); walk(i + 1, idx, D.add(sum, list[i].qty)); idx.pop(); }
    };
    walk(0, [], '0');
  }
  if (best) {
    // fee candidates of the same cause are one explanation (the two buy fills' fees), transfers stay separate
    const chosen = best.idx.map((i) => list[i]);
    const grouped = [];
    for (const c of chosen) {
      const g = grouped.find((x) => x.cause === c.cause && c.cause === 'fee_in_asset');
      if (g) { g.fillKeys.push(...c.fillKeys); g.qty = D.add(g.qty, c.qty); } else grouped.push({ ...c, fillKeys: c.fillKeys ? [...c.fillKeys] : undefined });
    }
    out.explanations = grouped;
    out.unexplainedQty = D.sub(diff, D.sum(chosen.map((c) => c.qty)));
  }
  return out;
}
