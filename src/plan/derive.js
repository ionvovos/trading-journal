// Per-trade arithmetic the plan checks and the review need: average prices, net, initial risk, R, holding time.
// Pure. Follows architecture section 3 (S1, S2, S7, S8): money rounds once per trade, R is not clipped, a broker figure wins.
// The statistics engine (src/stats) owns the published figures; tests/plan/derive.test.mjs checks this file against the same
// hand-computed fixture (tests/fixtures/stats/core.json), so the two cannot drift silently.
// Per-trade figures the plan checks and the review read: money, initial risk, R, equity at entry, times. Since C5 landed these are the
// statistics engine's own (src/stats), so the review and the statistics screens cannot disagree; this file adapts their signatures
// (a stats ctx built from an accounts map) and keeps only the geometry the engine does not publish (legs, average prices, holding time,
// position value). tests/plan/derive.test.mjs checks it against the hand-computed fixture and tests/plan/deriveVsStats.test.mjs against
// the engine.
import { minorDigits } from '../core/money.js';
import {
  isClosedTrade, tradeMoney as statsMoney, initialRisk as statsRisk, rMultiple as statsR, firstEntry, closeTimeOf, averages,
} from '../stats/trade.js';
import { equityAtEntry as statsEquity } from '../stats/curve.js';

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const unit = (trade) => num(trade.contractValue) ?? num(trade.contractSize) ?? 1;
const ms = (iso) => Date.parse(iso);

export const entryLegs = (trade) => (trade.legs ?? []).filter((l) => l.kind === 'entry');
export const exitLegs = (trade) => (trade.legs ?? []).filter((l) => l.kind === 'exit');

// A trade with no legs (a placeholder row) has no times, is not closed and has no average prices.
const hasLegs = (trade) => Array.isArray(trade?.legs);
export const entryTime = (trade) => (hasLegs(trade) ? firstEntry(trade)?.time ?? null : null);
export const closeTime = (trade) => (hasLegs(trade) || trade?.closeTime ? closeTimeOf({ legs: [], ...trade }) : null);
export const isClosed = (trade) => hasLegs(trade) && isClosedTrade(trade);
export const averageEntry = (trade) => (hasLegs(trade) ? averages(trade).avgEntry : null);
export const averageExit = (trade) => (hasLegs(trade) ? averages(trade).avgExit : null);

// accounts: an array of accounts or a map by id; the stats ctx reads only baseCurrency and startBalance from it.
const accountMap = (accounts) => (Array.isArray(accounts) ? Object.fromEntries(accounts.map((a) => [a.id, a])) : accounts ?? {});
const statsCtx = (accounts, extra = {}) => ({ accounts: accountMap(accounts), digitsOf: minorDigits, ...extra });

export const digitsFor = (trade, accounts) => minorDigits(accountMap(accounts)[trade.accountId]?.baseCurrency ?? trade.quoteCurrency ?? 'USD');

// S7. { value, reason } (the engine also returns the per-leg risk).
export const initialRisk = (trade) => (hasLegs(trade) ? statsRisk(trade) : { value: null, perLeg: [], reason: 'no_entry' });

// S1 and S2. Null for an open trade. Integer minor units of the account's base currency.
export function tradeMoney(trade, { accounts } = {}) {
  if (!hasLegs(trade)) return null;
  return statsMoney(trade, statsCtx(accounts));
}

// S8, not clipped.
export function rMultiple(trade, { accounts } = {}) {
  if (!hasLegs(trade)) return null;
  return statsR(trade, statsCtx(accounts));
}

export function holdSeconds(trade) {
  const a = entryTime(trade);
  const b = closeTime(trade);
  return a && b ? (ms(b) - ms(a)) / 1000 : null;
}

// Position value at entry in account currency: entry legs' price x size x contract size x rate.
export function positionValue(trade) {
  const legs = entryLegs(trade);
  if (!legs.length) return null;
  return legs.reduce((s, l) => s + Number(l.price) * Number(l.size) * unit(trade) * (l.quoteToAccount ?? 1), 0);
}

// Equity at entry in account-currency major units: the engine's figure (start balance + counted trades closed before the entry + cash),
// divided by the minor unit. Null without a starting balance.
export function equityAtEntry(trade, { account, trades, cash = [] }) {
  if (!account) return null;
  const minor = statsEquity(trade, statsCtx({ [trade.accountId]: account }, { trades, cash }));
  return minor === null ? null : minor / 10 ** minorDigits(account.baseCurrency);
}
