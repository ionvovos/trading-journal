// Kraken → History → Export → Trades, CSV. Architecture section 2.1 and 2.2, docs/cloud/C2-kraken.md.
// Source: https://support.kraken.com/articles/360001184886-how-to-interpret-trades-history-fields
// One row per fill; `time` is UTC; `fee` is in the quote currency even when Kraken deducted it in
// the base asset; the file states no realised P&L. Pure: no DOM, no clock, no network.

import { parseCsv } from '../csv.js';
import { parseDecimal } from '../../core/money.js';
import { cmp, decimalsOf, stepOf } from '../../core/decimal.js';
import { zonedToUtc } from '../../core/time.js';

const DETECT_COLUMNS = ['txid', 'ordertxid', 'pair', 'time', 'type', 'price', 'cost', 'fee', 'vol'];
const REQUIRED = ['txid', 'pair', 'time', 'type', 'price', 'vol'];

// Kraken's legacy asset codes that differ from the common ticker.
const ASSET_ALIASES = { XBT: 'BTC', XDG: 'DOGE' };
// Quote suffixes for pairs without the 4+4 legacy form, longest first.
const QUOTES = ['USDT', 'USDC', 'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'CHF', 'AUD'];

const asset = (code) => ASSET_ALIASES[code] || code;

// 'XXBTZUSD' -> { base: 'BTC', quote: 'USD' }; 'SOLUSD' -> { base: 'SOL', quote: 'USD' }; null when unknown.
export function splitPair(pair) {
  const p = String(pair || '').trim().toUpperCase();
  if (!/^[A-Z0-9]+$/.test(p)) return null;
  if (p.length === 8 && p[0] === 'X' && (p[4] === 'Z' || p[4] === 'X')) {
    return { base: asset(p.slice(1, 4)), quote: asset(p.slice(5, 8)) };
  }
  for (const q of QUOTES) {
    if (p.length > q.length && p.endsWith(q)) return { base: asset(p.slice(0, -q.length)), quote: q };
  }
  return null;
}

function firstLine(text) {
  let src = String(text);
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);
  for (const line of src.split(/\r\n|\r|\n/)) if (line.trim() !== '') return line;
  return '';
}

// Fraction digits as written ("0.05000000" -> 8); the normalised value when the text has grouping.
function rawDecimals(text, normalised) {
  try { return decimalsOf(text); } catch { return decimalsOf(normalised); }
}

const headerNames =(cells) => cells.map((c) => String(c).trim().toLowerCase());

function detect(text) {
  const line = firstLine(text);
  if (!line) return 0;
  const { rows } = parseCsv(line);
  const names = new Set(headerNames(rows[0] || []));
  const found = DETECT_COLUMNS.filter((c) => names.has(c)).length;
  return found === DETECT_COLUMNS.length ? 0.95 : 0.5 * (found / DETECT_COLUMNS.length);
}

function parse(text, { fileZone = 'UTC' } = {}) {
  const { rows, delimiter, lines } = parseCsv(text);
  const result = {
    rowsInFile: Math.max(0, rows.length - 1), fills: [], cash: [], funding: [], skipped: [], openAtEnd: [],
    fileSummary: null, accountCurrency: null, sizeStep: null,
  };
  if (rows.length === 0) return result;

  const names = headerNames(rows[0]);
  const col = Object.fromEntries(names.map((n, i) => [n, i]).reverse()); // first occurrence wins
  if (REQUIRED.some((n) => col[n] === undefined)) throw new Error('import.error.columns');
  const cell = (r, name) => (col[name] === undefined ? '' : String(r[col[name]] ?? '').trim());

  let maxDecimals = -1;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const row = lines[i];
    const skip = (reasonKey) => result.skipped.push({ row, reasonKey, raw: r.join(delimiter) });

    const time = zonedToUtc(cell(r, 'time'), fileZone || 'UTC');
    if (!time) { skip('import.skip.date'); continue; }
    const pair = splitPair(cell(r, 'pair'));
    if (!pair) { skip('import.skip.pair'); continue; }
    const side = cell(r, 'type').toLowerCase();
    if (side !== 'buy' && side !== 'sell') { skip('import.skip.side'); continue; }

    const volText = cell(r, 'vol');
    const size = parseDecimal(volText);
    const price = parseDecimal(cell(r, 'price'));
    const feeText = cell(r, 'fee');
    const fee = feeText === '' ? null : parseDecimal(feeText); // blank fee = missing (anomaly later)
    const marginText = cell(r, 'margin');
    const margin = marginText === '' ? '0' : parseDecimal(marginText);
    if (size === null || price === null || margin === null || (feeText !== '' && fee === null)) {
      skip('import.skip.number');
      continue;
    }

    maxDecimals = Math.max(maxDecimals, rawDecimals(volText, size));
    result.fills.push({
      key: `kraken:${cell(r, 'txid')}`,
      time,
      instrument: `${pair.base}/${pair.quote}`,
      market: 'crypto',
      side,
      size,
      price,
      fee,
      feeCurrency: pair.quote,
      quoteCurrency: pair.quote,
      contractSize: '1',
      positionId: null,
      openClose: null,
      broker: null,
      stop: null,
      stopSource: null,
      target: null,
      quoteToAccount: null,
      setup: null,
      notes: cmp(margin, '0') > 0 ? 'margin' : null,
      row,
    });
  }
  if (maxDecimals >= 0) result.sizeStep = stepOf(maxDecimals);
  return result;
}

export const format = {
  id: 'kraken-trades',
  market: 'crypto',
  labelKey: 'import.format.kraken',
  statesZone: true,
  detect,
  parse,
};
