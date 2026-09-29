// Per-trade arithmetic the plan checks and the review need: average prices, net, initial risk, R, holding time.
// Pure. Follows architecture section 3 (S1, S2, S7, S8): money rounds once per trade, R is not clipped, a broker figure wins.
// The statistics engine (src/stats) owns the published figures; tests/plan/derive.test.mjs checks this file against the same
// hand-computed fixture (tests/fixtures/stats/core.json), so the two cannot drift silently.
import { roundMinor, minorDigits } from '../core/money.js';

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const unit = (trade) => num(trade.contractValue) ?? num(trade.contractSize) ?? 1;
const signOf = (trade) => (trade.side === 'short' ? -1 : 1);
const ms = (iso) => Date.parse(iso);

export const entryLegs = (trade) => (trade.legs ?? []).filter((l) => l.kind === 'entry');
export const exitLegs = (trade) => (trade.legs ?? []).filter((l) => l.kind === 'exit');

export function entryTime(trade) {
  const times = entryLegs(trade).map((l) => ms(l.time)).filter(Number.isFinite);
  return times.length ? new Date(Math.min(...times)).toISOString() : null;
}

export function closeTime(trade) {
  if (trade.closeTime) return trade.closeTime;
  const times = exitLegs(trade).map((l) => ms(l.time)).filter(Number.isFinite);
  return times.length ? new Date(Math.max(...times)).toISOString() : null;
}

const sizeOf = (legs) => legs.reduce((s, l) => s + Number(l.size), 0);
const avgPrice = (legs) => {
  const size = sizeOf(legs);
  return size > 0 ? legs.reduce((s, l) => s + Number(l.price) * Number(l.size), 0) / size : null;
};

export const averageEntry = (trade) => avgPrice(entryLegs(trade));
export const averageExit = (trade) => avgPrice(exitLegs(trade));

export const isClosed = (trade) => {
  const inn = sizeOf(entryLegs(trade));
  const out = sizeOf(exitLegs(trade));
  return inn > 0 && out > 0 && Math.abs(inn - out) <= 1e-9 * inn + Number(trade.dustRemainder ?? 0);
};

// S7: entry legs |price - initial stop| x size x contract size x that leg's rate. Null with a reason when the stop is missing,
// at the entry or on the profit side.
export function initialRisk(trade) {
  const stop = num(trade.initialStop);
  if (stop === null) return { value: null, reason: 'no_stop' };
  const legs = entryLegs(trade);
  const s = signOf(trade);
  let total = 0;
  for (const l of legs) {
    const dist = (Number(l.price) - stop) * s;
    if (dist === 0) return { value: null, reason: 'stop_at_entry' };
    if (dist < 0) return { value: null, reason: 'stop_profit_side' };
    total += dist * Number(l.size) * unit(trade) * (l.quoteToAccount ?? 1);
  }
  return { value: total, reason: null };
}

// S1 and S2. Returns null for an open trade. `digits` = minor digits of the account's base currency.
export function tradeMoney(trade, { digits = 2 } = {}) {
  if (!isClosed(trade)) return null;
  const s = signOf(trade);
  const avgIn = avgPrice(entryLegs(trade));
  const gross = exitLegs(trade).reduce((sum, l) => sum + (Number(l.price) - avgIn) * s * Number(l.size) * unit(trade) * (l.quoteToAccount ?? 1), 0);
  const fees = (trade.legs ?? []).reduce((sum, l) => sum + (l.fee === null || l.fee === undefined ? 0 : Number(l.fee)) * (l.feeToAccount ?? 1), 0);
  const funding = Number(trade.funding ?? 0);
  const grossMinor = roundMinor(gross, digits);
  const fundingMinor = roundMinor(funding, digits);
  const recomputedNetMinor = roundMinor(gross - fees + funding, digits);
  const brokerNet = trade.broker?.netMinor;
  const netMinor = Number.isInteger(brokerNet) ? brokerNet : recomputedNetMinor;
  return { grossMinor, fundingMinor, netMinor, recomputedNetMinor, feesMinor: grossMinor + fundingMinor - netMinor, source: Number.isInteger(brokerNet) ? 'broker' : 'app' };
}

// S8, not clipped. Base-currency net over base-currency risk.
export function rMultiple(trade, { digits = 2 } = {}) {
  const money = tradeMoney(trade, { digits });
  const risk = initialRisk(trade);
  if (!money || risk.value === null || risk.value === 0) return null;
  return money.netMinor / 10 ** digits / risk.value;
}

export function holdSeconds(trade) {
  const a = entryTime(trade);
  const b = closeTime(trade);
  return a && b ? (ms(b) - ms(a)) / 1000 : null;
}

export const digitsFor = (trade, accounts) => minorDigits(accounts?.[trade.accountId]?.baseCurrency ?? trade.quoteCurrency ?? 'USD');

// Position value at entry in account currency: entry legs' price x size x contract size x rate.
export function positionValue(trade) {
  const legs = entryLegs(trade);
  if (!legs.length) return null;
  return legs.reduce((s, l) => s + Number(l.price) * Number(l.size) * unit(trade) * (l.quoteToAccount ?? 1), 0);
}

// Equity at entry (requirements term): the account's starting balance plus net of its counted trades closed before the
// entry plus deposits minus withdrawals before the entry. Null without a starting balance.
export function equityAtEntry(trade, { account, trades, cash = [], digits = 2 }) {
  if (!account || account.startBalance === null || account.startBalance === undefined || account.startBalance === '') return null;
  const at = entryTime(trade);
  if (!at) return null;
  let equity = Number(account.startBalance);
  for (const other of trades) {
    if (other.id === trade.id || other.accountId !== trade.accountId || other.mode !== trade.mode) continue;
    if (other.holds?.length || other.excluded) continue;
    const c = closeTime(other);
    if (!c || ms(c) >= ms(at)) continue;
    const m = tradeMoney(other, { digits });
    if (m) equity += m.netMinor / 10 ** digits;
  }
  for (const c of cash) {
    if (c.accountId !== trade.accountId || ms(c.time) >= ms(at)) continue;
    if (c.kind === 'deposit') equity += Number(c.amount);
    else if (c.kind === 'withdrawal') equity -= Math.abs(Number(c.amount));
  }
  return equity;
}
