// Format registry. One id per named format (architecture section 2.1); adding a format is one module in
// src/import/formats/, one line here, one fixture pair, one test file (section 2.4).
import { format as ibkr } from './formats/ibkr-activity.js';
import { format as kraken } from './formats/kraken-trades.js';
import { format as mt4 } from './formats/mt4-statement.js';
import { format as generic } from './formats/generic-csv.js';

export const FORMAT_IDS = ['ibkr-activity', 'kraken-trades', 'mt4-statement', 'generic-csv'];
export const MIN_CONFIDENCE = 0.6;

// Live list of the format objects in FORMAT_IDS order (tests may swap its content).
export const formats = [ibkr, kraken, mt4, generic];

// Kept from the dynamic-import days so callers need not change: resolves at once with the list.
export const loadFormats = async () => formats;

export function getFormat(id) {
  return formats.find((f) => f.id === id) || null;
}

// { format, score, scores } where format is the highest scorer at or above MIN_CONFIDENCE (first
// registered wins a tie), else null so the caller asks the user which format the file is.
export function detectFormat(text) {
  const scores = formats.map((f) => ({ id: f.id, score: Number(f.detect(text)) || 0 }));
  let best = null;
  for (const s of scores) if (s.score >= MIN_CONFIDENCE && (!best || s.score > best.score)) best = s;
  return { format: best ? getFormat(best.id) : null, score: best ? best.score : 0, scores };
}
