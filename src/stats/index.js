// Statistics engine (architecture section 3): pure, never AI. Re-exports every figure.
export {
  grossPnl, tradeMoney, initialRisk, rMultiple, rBreakdown, openRisk, averages, isClosedTrade, displayMinor,
} from './trade.js';
export {
  closedSet, winRate, avgWinLoss, profitFactor, expectancy, feeTotals, streaks, ruleFollowing, pips, pipsByPair,
  holdingTime, pipSizeOf,
} from './sets.js';
export { equityCurve, drawdown, equityAtEntry } from './curve.js';
export { buckets, calendar, sessionOf, closeDayOf, SESSIONS } from './buckets.js';
export { compareModes } from './compare.js';
export { explain } from './explain.js';
export { positionSize } from './sizing.js';
