// Trade helpers shared by import, reconcile and the views. Pure; sizes and prices are decimal strings.
import * as D from './decimal.js';

export const sumSize = (legs, kind) => D.sum(legs.filter((l) => l.kind === kind).map((l) => l.size));

// Entry size minus exit size, exactly.
export function positionSize(trade) {
  return D.sub(sumSize(trade.legs, 'entry'), sumSize(trade.legs, 'exit'));
}

// Size-weighted average price of the legs of one kind ('entry' | 'exit'); null without legs.
export function averagePrice(trade, kind) {
  const legs = trade.legs.filter((l) => l.kind === kind);
  if (!legs.length) return null;
  const size = D.sum(legs.map((l) => l.size));
  if (D.isZero(size)) return null;
  const value = D.sum(legs.map((l) => D.mul(l.price, l.size)));
  return D.div(value, size);
}

// A trade is closed when both kinds of leg exist and the remainder is zero or equals its dust
// remainder; a trade whose opening lies before the imported file (entryUnknown, the user kept the
// broker's figure) is closed by its exits alone.
export function isClosed(trade) {
  if (!trade.legs.length) return false;
  const hasExit = trade.legs.some((l) => l.kind === 'exit');
  if (trade.entryUnknown) return hasExit && !!trade.broker;
  if (!hasExit || !trade.legs.some((l) => l.kind === 'entry')) return false;
  const rest = positionSize(trade);
  return D.isZero(rest) || D.cmp(rest, trade.dustRemainder || '0') === 0;
}

// 'held' (an unanswered import anomaly), 'closed' or 'open'. Held wins, as in closedSet.
export function tradeStatus(trade) {
  if (trade.holds && trade.holds.length) return 'held';
  return isClosed(trade) ? 'closed' : 'open';
}

export function firstEntryLeg(trade) {
  return trade.legs.filter((l) => l.kind === 'entry').sort((a, b) => a.time.localeCompare(b.time))[0] || null;
}

export function lastExitLeg(trade) {
  const exits = trade.legs.filter((l) => l.kind === 'exit').sort((a, b) => a.time.localeCompare(b.time));
  return exits[exits.length - 1] || null;
}

// closeTime of a closed trade = time of its last exit leg; null while open.
export function closeTimeOf(trade) {
  return isClosed(trade) ? (lastExitLeg(trade)?.time ?? null) : null;
}
