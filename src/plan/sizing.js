// Position-size helper (requirements AC-P2.6). Every input is typed by the user; nothing here proposes a percent, a stop or a
// size step. A missing input is named in `missing` and no size is returned. Pure.
import { dec, toString, mul, div, cmp, sign, abs, sub } from '../core/decimal.js';

const filled = (v) => v !== undefined && v !== null && String(v).trim() !== '';
const positive = (v) => filled(v) && sign(v) > 0;

// Pip size: 0.01 when the quote currency is JPY, else 0.0001. Instrument like "USD/JPY" or "USDJPY".
export function pipSizeOf(instrument) {
  const s = String(instrument ?? '').toUpperCase().replace(/[^A-Z]/g, '');
  if (s.length < 6) return null;
  return s.endsWith('JPY') ? '0.01' : '0.0001';
}

// Rounds a non-negative decimal down to a multiple of `step` (exact).
export function floorToStep(value, step) {
  const v = dec(value);
  const s = dec(step);
  if (s <= 0n) throw new RangeError('size step must be above zero');
  return toString((v / s) * s);
}

const isForex = (market) => market === 'forex';

// input: { market, instrument?, equity, riskPct, entry?, stop?, stopPips?, pipValuePerLot?, contractSize?, quoteToAccount?, sizeStep }
// -> { size: string|null, riskAmount: number|null, pipSize: string|null, missing: [names] }
export function positionSize(input = {}) {
  const { market, instrument, equity, riskPct, entry, stop, stopPips, pipValuePerLot, contractSize, quoteToAccount, sizeStep } = input;
  const pipSize = isForex(market) ? pipSizeOf(instrument) : null;
  const missing = [];
  if (!positive(equity)) missing.push('equity');
  if (!positive(riskPct)) missing.push('riskPct');
  if (!positive(sizeStep)) missing.push('sizeStep');
  let perUnit = null; // risk in account currency per one unit (share, coin, lot)
  if (isForex(market)) {
    if (!positive(stopPips)) missing.push('stopPips');
    if (!positive(pipValuePerLot)) missing.push('pipValuePerLot');
    if (!missing.includes('stopPips') && !missing.includes('pipValuePerLot')) perUnit = mul(stopPips, pipValuePerLot);
  } else {
    if (!filled(entry)) missing.push('entry');
    if (!filled(stop)) missing.push('stop');
    if (!positive(contractSize)) missing.push('contractSize');
    if (!positive(quoteToAccount)) missing.push('quoteToAccount');
    if (!missing.includes('entry') && !missing.includes('stop') && cmp(entry, stop) === 0) missing.push('stopDistance');
    if (!missing.some((m) => ['entry', 'stop', 'stopDistance', 'contractSize', 'quoteToAccount'].includes(m))) {
      perUnit = mul(mul(abs(sub(entry, stop)), contractSize), quoteToAccount);
    }
  }
  if (missing.length || perUnit === null) return { size: null, riskAmount: null, pipSize, missing };
  const riskMoney = div(mul(equity, riskPct), '100');
  const raw = div(riskMoney, perUnit);
  const size = floorToStep(raw, sizeStep);
  return { size, riskAmount: Number(mul(size, perUnit)), pipSize, missing: [] };
}
