// P2.6 position size. Every input is typed by the user: no default for any of them (W5).
// Size is rounded down to sizeStep and the risk recomputed at that size. Exact decimals.
import * as D from '../core/decimal.js';
import { pipSizeOf } from './sets.js';

const blank = (x) => x === null || x === undefined || x === '';

// Largest multiple of step not above x (x ≥ 0).
function floorTo(x, step) {
  const q = D.dec(x) / D.dec(step);
  return D.toString(q * D.dec(step));
}

export function positionSize(input = {}) {
  const { market, equity, riskPct, entry, stop, stopPips, pipValuePerLot, contractSize, quoteToAccount, sizeStep, instrument } = input;
  const forex = market === 'forex';
  const pipSize = forex && instrument ? (pipSizeOf(instrument) === 0.01 ? '0.01' : '0.0001') : null;
  const needs = forex
    ? { equity, riskPct, stopPips, pipValuePerLot, sizeStep }
    : { equity, riskPct, entry, stop, contractSize, quoteToAccount, sizeStep };
  const missing = Object.keys(needs).filter((k) => blank(needs[k]));
  if (!market) missing.unshift('market');
  if (missing.length) return { size: null, riskAmount: null, pipSize, missing, reason: 'missing_input' };

  const budget = D.div(D.mul(equity, riskPct), '100');
  const perUnit = forex
    ? D.mul(stopPips, pipValuePerLot)
    : D.mul(D.mul(D.abs(D.sub(entry, stop)), contractSize), quoteToAccount);
  if (D.sign(perUnit) <= 0 || D.sign(sizeStep) <= 0 || D.sign(budget) <= 0) {
    return { size: null, riskAmount: null, pipSize, missing: [], reason: D.sign(perUnit) <= 0 ? 'stop_at_entry' : 'not_positive' };
  }
  const size = floorTo(D.div(budget, perUnit), sizeStep);
  return { size, riskAmount: D.toNumber(D.mul(size, perUnit)), pipSize, missing: [], reason: null };
}
