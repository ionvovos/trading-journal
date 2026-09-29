// Generic CSV template, the app's own format (architecture section 2.1, spec docs/cloud/C4-generic.md).
// Pure. Columns by header name in any order; each `time` carries its own offset, so no zone is asked.

import { parseCsv } from '../csv.js';
import { parseDecimal } from '../../core/money.js';
import { cmp, decimalsOf, stepOf } from '../../core/decimal.js';
import { zonedToUtc } from '../../core/time.js';

export const HEADER = ['time', 'type', 'instrument', 'market', 'side', 'size', 'price', 'fee', 'fee_currency',
  'quote_currency', 'amount', 'currency', 'contract_value', 'id', 'stop', 'setup', 'notes'];
const REQUIRED = ['time', 'instrument', 'side', 'size', 'price'];
const NUMERIC = ['size', 'price', 'fee', 'amount', 'contract_value', 'stop'];
const CASH_KINDS = { deposit: 'deposit', withdrawal: 'withdrawal', cash: 'other' };
const MARKETS = ['stock', 'crypto', 'forex'];

// "2026-03-10T10:00:00+02:00", "…Z", "…+0200"; seconds and fraction optional.
const ISO_TIME = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2}(?:[.,]\d+)?)?)\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i;

let isoCurrencies = null;
function isIsoCurrency(code) {
  if (!isoCurrencies) {
    try { isoCurrencies = new Set(Intl.supportedValuesOf('currency')); } catch { isoCurrencies = new Set(); }
  }
  return isoCurrencies.has(String(code).toUpperCase());
}

// { base, quote } of "EUR/USD", "EURUSD" (both ISO) or "BTC/USDT"; null otherwise.
function splitPair(instrument) {
  const s = instrument.toUpperCase();
  const slash = /^([A-Z0-9]+)\/([A-Z0-9]+)$/.exec(s);
  if (slash) return { base: slash[1], quote: slash[2] };
  const six = /^([A-Z]{3})([A-Z]{3})$/.exec(s);
  if (six && isIsoCurrency(six[1]) && isIsoCurrency(six[2])) return { base: six[1], quote: six[2] };
  return null;
}

// Market when the `market` cell is blank: two ISO currencies → forex; `/` or `-PERP` with a non-ISO
// base → crypto; else stock.
export function inferMarket(instrument) {
  const s = String(instrument).trim().toUpperCase();
  const pair = splitPair(s);
  if (pair && isIsoCurrency(pair.base) && isIsoCurrency(pair.quote)) return 'forex';
  const base = pair ? pair.base : /-PERP$/.test(s) ? s.slice(0, -5) : null;
  if (base !== null && !isIsoCurrency(base)) return 'crypto';
  return 'stock';
}

// Instant of an ISO 8601 time with `Z` or an offset: { utc } | { reasonKey }.
function readTime(text) {
  const m = ISO_TIME.exec(text);
  if (!m) return { reasonKey: 'import.skip.date' };
  if (!m[3]) return { reasonKey: 'import.skip.timeOffset' };
  const local = zonedToUtc(`${m[1]}T${m[2].replace(',', '.')}`, 'UTC');
  if (!local) return { reasonKey: 'import.skip.date' };
  let offsetMs = 0;
  if (m[3].toUpperCase() !== 'Z') {
    const o = /^([+-])(\d{2}):?(\d{2})?$/.exec(m[3]);
    const h = Number(o[2]);
    const mi = Number(o[3] || 0);
    if (h > 23 || mi > 59) return { reasonKey: 'import.skip.date' };
    offsetMs = (o[1] === '-' ? -1 : 1) * (h * 60 + mi) * 60000;
  }
  return { utc: new Date(Date.parse(local) - offsetMs).toISOString() };
}

function headerIndex(row) {
  const idx = {};
  row.forEach((name, i) => {
    const k = String(name).trim().toLowerCase();
    if (k && !(k in idx)) idx[k] = i;
  });
  return idx;
}

// ',' when the file is `;`-delimited and its numbers are written like "1,5"; else '.'.
function decimalOf(rows, idx, delimiter) {
  if (delimiter !== ';') return '.';
  for (const row of rows) {
    for (const col of NUMERIC) {
      if (!(col in idx)) continue;
      if (/^-?\d+,\d+$/.test(String(row[idx[col]] ?? '').trim())) return ',';
    }
  }
  return '.';
}

// Fraction digits as written ("0,50" with decimal ',' → 2); an exponent falls back to the normalised value.
function rawDecimals(text, decimal, normalised) {
  if (/e/i.test(text)) return decimalsOf(normalised);
  const at = text.lastIndexOf(decimal);
  return at === -1 ? 0 : text.length - at - 1;
}

export const format = {
  id: 'generic-csv',
  market: 'any',
  labelKey: 'import.format.generic',
  statesZone: true,

  detect(text) {
    const src = String(text).replace(/^﻿/, '');
    const first = src.split(/\r\n|\n|\r/).find((l) => l.trim() !== '');
    if (!first) return 0;
    const { rows } = parseCsv(first);
    if (!rows.length) return 0;
    const idx = headerIndex(rows[0]);
    return REQUIRED.every((c) => c in idx) ? 0.95 : 0;
  },

  parse(text) {
    const { rows, delimiter, lines } = parseCsv(text);
    const out = {
      rowsInFile: 0, fills: [], cash: [], funding: [], skipped: [], openAtEnd: [],
      fileSummary: null, accountCurrency: null, sizeStep: '1',
    };
    if (!rows.length) return out;
    const idx = headerIndex(rows[0]);
    const body = [];
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].every((c) => String(c).trim() === '')) continue;
      body.push({ cells: rows[i], row: lines[i] });
    }
    out.rowsInFile = body.length;
    const decimal = decimalOf(body.map((b) => b.cells), idx, delimiter);
    const seen = new Map();
    let sizeDecimals = 0;

    for (const { cells, row } of body) {
      const get = (col) => (col in idx ? String(cells[idx[col]] ?? '').trim() : '');
      const raw = cells.join(delimiter);
      const skip = (reasonKey) => out.skipped.push({ row, reasonKey, raw, id: get('id') || null });
      const num = (col) => (get(col) === '' ? null : parseDecimal(get(col), decimal));
      const bad = (col) => get(col) !== '' && num(col) === null;

      const type = get('type').toLowerCase() || 'trade';
      if (type !== 'trade' && type !== 'funding' && !(type in CASH_KINDS)) { skip('import.skip.type'); continue; }
      if (get('time') === '') { skip('import.skip.missing'); continue; }
      const t = readTime(get('time'));
      if (t.reasonKey) { skip(t.reasonKey); continue; }
      const time = t.utc;

      const makeKey = (side, size, price) => {
        if (get('id')) return `gen:${get('id')}`;
        const base = `gen:${get('time')}|${type}|${get('instrument')}|${side}|${size}|${price}`;
        const n = (seen.get(base) || 0) + 1;
        seen.set(base, n);
        return `${base}#${n}`;
      };

      if (type === 'funding' || type in CASH_KINDS) {
        if (get('amount') === '' || (type === 'funding' && get('instrument') === '')) { skip('import.skip.missing'); continue; }
        const amount = num('amount');
        if (amount === null) { skip('import.skip.number'); continue; }
        const currency = get('currency').toUpperCase() || null;
        const key = makeKey('', '', '');
        if (type === 'funding') out.funding.push({ row, instrument: get('instrument'), time, amount, currency, key });
        else out.cash.push({ row, kind: CASH_KINDS[type], amount, currency, time, key });
        continue;
      }

      if (REQUIRED.some((c) => get(c) === '')) { skip('import.skip.missing'); continue; }
      const side = get('side').toLowerCase();
      if (side !== 'buy' && side !== 'sell') { skip('import.skip.side'); continue; }
      const size = num('size');
      const price = num('price');
      if (size === null || price === null || bad('fee') || bad('stop') || bad('contract_value')) { skip('import.skip.number'); continue; }
      if (cmp(size, '0') <= 0) { skip('import.skip.number'); continue; }
      const marketCell = get('market').toLowerCase();
      if (marketCell && !MARKETS.includes(marketCell)) { skip('import.skip.market'); continue; }

      const instrument = get('instrument');
      const market = marketCell || inferMarket(instrument);
      const pair = market === 'stock' ? null : splitPair(instrument);
      const quoteCurrency = get('quote_currency').toUpperCase() || (pair ? pair.quote : null) || get('currency').toUpperCase() || null;
      const stop = num('stop');
      sizeDecimals = Math.max(sizeDecimals, rawDecimals(get('size'), decimal, size));

      out.fills.push({
        key: makeKey(side, get('size'), get('price')),
        time, instrument, market, side, size, price,
        fee: num('fee'),
        feeCurrency: get('fee_currency').toUpperCase() || quoteCurrency,
        quoteCurrency,
        contractSize: market === 'forex' ? '100000' : '1',
        contractValue: num('contract_value'),
        positionId: null, openClose: null, broker: null,
        stop, stopSource: stop === null ? null : 'file_initial', target: null,
        quoteToAccount: null,
        setup: get('setup') || null,
        notes: get('notes') || null,
        row,
      });
    }
    out.sizeStep = stepOf(Math.min(sizeDecimals, 18));
    return out;
  },
};
