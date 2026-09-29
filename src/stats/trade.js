// Per-trade figures: S1 gross, S2 money, S7 initial risk, S8 R and its breakdown, open risk.
// Pure: no clock, no I/O. Architecture section 3.1 and 3.2. Prices, sizes, fees and stops are
// decimal strings; P&L runs in binary64 and becomes integer minor units once per trade (D4).
import * as D from '../core/decimal.js';
import { roundMinor, minorDigits } from '../core/money.js';

const legsOf = (trade, kind) => trade.legs.filter((l) => l.kind === kind);
const num = (x) => (x === null || x === undefined ? null : D.toNumber(x));
const sideSign = (trade) => (trade.side === 'short' ? -1 : 1);

// Value per unit: the contract value of a crypto contract, else the contract size.
export function unitValue(trade) {
  const v = trade.contractValue !== null && trade.contractValue !== undefined ? trade.contractValue : trade.contractSize;
  return v === null || v === undefined ? 1 : D.toNumber(v);
}

// Size-weighted average price of one kind of leg, exact, as a decimal string; null without legs.
function averageDec(trade, kind) {
  const legs = legsOf(trade, kind);
  if (!legs.length) return null;
  const size = D.sum(legs.map((l) => l.size));
  if (D.isZero(size)) return null;
  return D.div(D.sum(legs.map((l) => D.mul(l.price, l.size))), size);
}

export function averages(trade) {
  const e = averageDec(trade, 'entry');
  const x = averageDec(trade, 'exit');
  return { avgEntry: e === null ? null : D.toNumber(e), avgExit: x === null ? null : D.toNumber(x) };
}

// Closed by the S3 rule: both kinds of leg exist and entry size minus exit size is exactly zero
// or equals the stored dust remainder.
export function isClosedTrade(trade) {
  const entries = legsOf(trade, 'entry');
  const exits = legsOf(trade, 'exit');
  // A position opened before the imported file whose result the person kept from the broker (import answer
  // keep_broker_pnl): the exits and the broker's own figure close it; there is no entry to average.
  if (!entries.length && trade.entryUnknown && exits.length && trade.broker && Number.isInteger(trade.broker.netMinor)) return true;
  if (!entries.length || !exits.length) return false;
  const rest = D.sub(D.sum(entries.map((l) => l.size)), D.sum(exits.map((l) => l.size)));
  return D.isZero(rest) || D.cmp(rest, trade.dustRemainder || '0') === 0;
}

export function firstEntry(trade) {
  const entry = legsOf(trade, 'entry').sort((a, b) => Date.parse(a.time) - Date.parse(b.time))[0];
  if (entry) return entry;
  // no entry leg (opened before the file): the earliest exit stands in for the time and the rate
  return trade.entryUnknown ? (legsOf(trade, 'exit').sort((a, b) => Date.parse(a.time) - Date.parse(b.time))[0] || null) : null;
}

// Close instant: the stored closeTime, else the last exit leg.
export function closeTimeOf(trade) {
  if (trade.closeTime) return trade.closeTime;
  const exits = legsOf(trade, 'exit').sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  return exits.length ? exits[exits.length - 1].time : null;
}

// S1. Σ exit legs (exit − average entry) × exit size × value per unit × exit leg rate, sign
// reversed for a short. Null for an open trade or a missing rate.
export function grossPnl(trade) {
  if (!isClosedTrade(trade) || trade.entryUnknown) return null;
  const avgEntry = averageDec(trade, 'entry');
  const unit = unitValue(trade);
  const sign = sideSign(trade);
  let gross = 0;
  for (const leg of legsOf(trade, 'exit')) {
    if (leg.quoteToAccount === null || leg.quoteToAccount === undefined) return null;
    gross += D.toNumber(D.sub(leg.price, avgEntry)) * D.toNumber(leg.size) * unit * leg.quoteToAccount * sign;
  }
  return gross;
}

// Minor-unit digits of a trade's account base currency.
export function baseDigits(trade, ctx) {
  const account = ctx?.accounts?.[trade.accountId];
  const ccy = account?.baseCurrency ?? trade.baseCurrency ?? null;
  const digitsOf = ctx?.digitsOf || minorDigits;
  return ccy ? digitsOf(ccy) : minorDigits('');
}

// S2. Integer minor units in the account's base currency, one rounding point each.
export function tradeMoney(trade, ctx) {
  if (isClosedTrade(trade) && trade.entryUnknown) {
    // only the broker's figure is known: gross and costs cannot be split, so the net stands for gross and costs are 0
    const net = trade.broker.netMinor;
    const funding = roundMinor(num(trade.funding) ?? 0, baseDigits(trade, ctx));
    return { grossMinor: net, feesMinor: 0, fundingMinor: funding, netMinor: net, recomputedNetMinor: null, source: 'broker' };
  }
  const gross = grossPnl(trade);
  if (gross === null) return null;
  let fees = 0;
  for (const leg of trade.legs) {
    if (leg.fee === null || leg.fee === undefined) continue;
    if (leg.feeToAccount === null || leg.feeToAccount === undefined) return null;
    fees += D.toNumber(leg.fee) * leg.feeToAccount;
  }
  const funding = num(trade.funding) ?? 0;
  const d = baseDigits(trade, ctx);
  const grossMinor = roundMinor(gross, d);
  const fundingMinor = roundMinor(funding, d);
  const recomputedNetMinor = roundMinor(gross - fees + funding, d);
  const brokerNet = trade.broker && Number.isInteger(trade.broker.netMinor) ? trade.broker.netMinor : null;
  const netMinor = brokerNet ?? recomputedNetMinor;
  return {
    grossMinor,
    feesMinor: grossMinor + fundingMinor - recomputedNetMinor,
    fundingMinor,
    netMinor,
    recomputedNetMinor,
    source: brokerNet === null ? 'app' : 'broker',
  };
}

// netMinor converted to the display currency with the account's rate and rounded once.
export function displayMinor(trade, ctx) {
  const m = tradeMoney(trade, ctx);
  if (!m) return null;
  return toDisplay(m.netMinor, trade, ctx);
}

// Any base-currency minor amount of a trade in display minor units.
export function toDisplay(minor, trade, ctx) {
  const account = ctx?.accounts?.[trade.accountId];
  const base = account?.baseCurrency;
  const display = ctx?.displayCurrency;
  if (!account || !display || base === display) return minor;
  const rate = trade.toDisplayRate ?? account.toDisplayRate;
  if (rate === null || rate === undefined) return null;
  const digitsOf = ctx.digitsOf || minorDigits;
  return roundMinor((minor / 10 ** digitsOf(base)) * rate, digitsOf(display));
}

// S7. Σ entry legs |entry − initial stop| × size × value per unit × that leg's rate.
export function initialRisk(trade) {
  const stop = trade.initialStop;
  if (stop === null || stop === undefined || stop === '') return { value: null, perLeg: [], reason: 'no_stop' };
  const avgEntry = averageDec(trade, 'entry');
  if (avgEntry === null) return { value: null, perLeg: [], reason: 'no_entry' };
  const side = D.cmp(avgEntry, stop) * sideSign(trade);
  if (side === 0) return { value: null, perLeg: [], reason: 'stop_at_entry' };
  if (side < 0) return { value: null, perLeg: [], reason: 'stop_profit_side' };
  const unit = unitValue(trade);
  const perLeg = [];
  let value = 0;
  for (const leg of legsOf(trade, 'entry')) {
    if (leg.quoteToAccount === null || leg.quoteToAccount === undefined) return { value: null, perLeg: [], reason: 'rate_missing' };
    const v = D.toNumber(D.abs(D.sub(leg.price, stop))) * D.toNumber(leg.size) * unit * leg.quoteToAccount;
    perLeg.push({ legId: leg.id, value: v });
    value += v;
  }
  if (!(value > 0)) return { value: null, perLeg: [], reason: 'stop_at_entry' };
  return { value, perLeg, reason: null };
}

// S8. R = (netMinor / 10^digits) / initial risk, not clipped. Null when risk or money is unknown.
export function rMultiple(trade, ctx) {
  const risk = initialRisk(trade).value;
  if (risk === null) return null;
  const m = tradeMoney(trade, ctx);
  if (!m) return null;
  return m.netMinor / 10 ** baseDigits(trade, ctx) / risk;
}

// Split of an R below −1: the stop's −1R, slippage of the exits past the stop, costs, rest.
export function rBreakdown(trade, ctx) {
  const r = rMultiple(trade, ctx);
  if (r === null || !(r < -1)) return null;
  const risk = initialRisk(trade).value;
  const m = tradeMoney(trade, ctx);
  const scale = 10 ** baseDigits(trade, ctx);
  const unit = unitValue(trade);
  const sign = sideSign(trade);
  let slippage = 0;
  for (const leg of legsOf(trade, 'exit')) {
    slippage += D.toNumber(D.sub(leg.price, trade.initialStop)) * D.toNumber(leg.size) * unit * leg.quoteToAccount * sign;
  }
  const slippageR = slippage / risk;
  const costsR = (m.netMinor - m.grossMinor) / scale / risk;
  let otherR = r - (-1 + slippageR + costsR);
  if (Math.abs(otherR) < 1e-9) otherR = 0;
  return { r, base: -1, slippageR, costsR, otherR };
}

// Open risk from the current stop (last stop move, else the initial stop): size × distance.
export function openRisk(trade, ctx) {
  if (isClosedTrade(trade)) return null;
  const moves = trade.stopMoves || [];
  const last = moves.length ? moves[moves.length - 1] : null;
  const stop = last ? (last.stop ?? last.price ?? last.value ?? last) : trade.initialStop;
  if (stop === null || stop === undefined || typeof stop === 'object') return null;
  const avgEntry = averageDec(trade, 'entry');
  if (avgEntry === null) return null;
  const size = D.sub(D.sum(legsOf(trade, 'entry').map((l) => l.size)), D.sum(legsOf(trade, 'exit').map((l) => l.size)));
  const rate = firstEntry(trade).quoteToAccount;
  if (rate === null || rate === undefined) return null;
  const amount = D.toNumber(D.sub(avgEntry, stop)) * sideSign(trade) * D.toNumber(size) * unitValue(trade) * rate;
  const amountMinor = roundMinor(Math.max(amount, 0), baseDigits(trade, ctx));
  const risk = initialRisk(trade).value;
  return { amountMinor, r: risk === null ? null : Math.max(amount, 0) / risk };
}
