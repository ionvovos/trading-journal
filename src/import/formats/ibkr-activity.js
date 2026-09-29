// Interactive Brokers Activity Statement, CSV download. Architecture section 2.1 / 2.2, cloud C1.
// Many sections in one file: column 1 is the section, column 2 the row type (Header, Data,
// SubTotal, Total). Columns are mapped by name from the section's most recent Header row.
// Reads only Trades, Deposits & Withdrawals and Account Information (Base Currency).
// Pure: no DOM, no clock. Prices, sizes and money stay decimal strings.

import { parseCsv } from '../csv.js';
import { parseDecimal } from '../../core/money.js';
import { abs, neg, cmp, sign, decimalsOf, stepOf } from '../../core/decimal.js';
import { zonedToUtc } from '../../core/time.js';

const TRADES = 'Trades';
const CASH = 'Deposits & Withdrawals';
const ACCOUNT = 'Account Information';
const DETECT = /^﻿?Trades,Header,DataDiscriminator/m;
const DATE_TIME = /^(\d{4}-\d{2}-\d{2}),?\s+(\d{2}:\d{2}(?::\d{2})?)$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// A row as CSV text again, for `skipped[].raw`.
function rowText(cells) {
  return cells.map((c) => (/[",\r\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',');
}

// "2026-03-02, 09:40:00" as wall time in `zone` to UTC ISO, or null when unreadable.
function toUtc(text, zone) {
  const m = DATE_TIME.exec(String(text || '').trim());
  return m ? zonedToUtc(`${m[1]}T${m[2]}`, zone) : null;
}

export const format = {
  id: 'ibkr-activity',
  market: 'stock',
  labelKey: 'import.format.ibkr',
  statesZone: false,

  detect(text) {
    return typeof text === 'string' && DETECT.test(text) ? 0.95 : 0;
  },

  parse(text, { fileZone } = {}) {
    if (!fileZone) throw new RangeError('ibkr-activity needs fileZone (asked once per broker account)');
    const { rows } = parseCsv(text, { delimiter: ',' });
    const headers = new Map(); // section -> { column name: index }
    const seen = new Map(); // key base -> occurrences so far
    const fills = [];
    const cash = [];
    const skipped = [];
    let rowsInFile = 0;
    let accountCurrency = null;
    let maxDecimals = null;

    const keyOf = (base) => {
      const n = (seen.get(base) || 0) + 1;
      seen.set(base, n);
      return `${base}#${n}`;
    };

    rows.forEach((cells, i) => {
      const row = i + 1;
      const section = (cells[0] || '').trim();
      const kind = (cells[1] || '').trim();
      if (kind === 'Header') {
        const map = {};
        cells.forEach((name, at) => { if (at >= 2) map[name.trim()] = at; });
        headers.set(section, map);
        return;
      }
      if (kind !== 'Data') return; // SubTotal, Total and anything else: ignored, not counted

      if (section === ACCOUNT) {
        if ((cells[2] || '').trim() === 'Base Currency' && (cells[3] || '').trim()) accountCurrency = cells[3].trim();
        return;
      }

      const cols = headers.get(section);
      const get = (name) => (cols && cols[name] !== undefined ? (cells[cols[name]] ?? '') : '').trim();

      if (section === CASH) {
        const currency = get('Currency');
        if (currency === 'Total') return;
        rowsInFile++;
        const amount = parseDecimal(get('Amount'));
        const settle = get('Settle Date');
        if (amount === null) { skipped.push({ row, reasonKey: 'import.skip.number', raw: rowText(cells) }); return; }
        if (!DATE.test(settle)) { skipped.push({ row, reasonKey: 'import.skip.date', raw: rowText(cells) }); return; }
        cash.push({
          row,
          kind: cmp(amount, '0') > 0 ? 'deposit' : 'withdrawal',
          amount: abs(amount), // magnitude; `kind` carries the direction
          currency,
          time: settle,
          key: keyOf(`ibkr:cash|${currency}|${settle}|${get('Description')}|${get('Amount')}`),
        });
        return;
      }

      if (section !== TRADES) return;
      if (get('DataDiscriminator') !== 'Order') return;
      rowsInFile++;
      const skip = (reasonKey) => skipped.push({ row, reasonKey, raw: rowText(cells) });

      if (get('Asset Category') !== 'Stocks') { skip('import.skip.assetClass'); return; }
      const qtyText = get('Quantity');
      const priceText = get('T. Price');
      const feeText = get('Comm/Fee');
      const dateText = get('Date/Time');
      const quantity = parseDecimal(qtyText);
      const price = parseDecimal(priceText);
      const commFee = feeText === '' ? null : parseDecimal(feeText);
      if (quantity === null || sign(quantity) === 0 || price === null || (feeText !== '' && commFee === null)) {
        skip('import.skip.number');
        return;
      }
      const time = toUtc(dateText, fileZone);
      if (time === null) { skip('import.skip.date'); return; }

      const size = abs(quantity);
      const d = decimalsOf(size);
      if (maxDecimals === null || d > maxDecimals) maxDecimals = d;

      const code = get('Code').toUpperCase();
      const openClose = code[0] === 'O' || code[0] === 'C' ? code[0] : null;
      const commission = commFee === null ? null : neg(commFee);
      const broker = { commission };
      if (openClose === 'C') {
        const realized = parseDecimal(get('Realized P/L'));
        const basis = parseDecimal(get('Basis'));
        broker.realizedPnl = realized;
        broker.basis = basis === null ? null : abs(basis);
      }
      const symbol = get('Symbol');
      const currency = get('Currency') || null;
      fills.push({
        key: keyOf(`ibkr:${symbol}|${dateText}|${qtyText}|${priceText}|${feeText}`),
        time,
        instrument: symbol,
        market: 'stock',
        side: sign(quantity) > 0 ? 'buy' : 'sell',
        size,
        price,
        fee: commission,
        feeCurrency: currency,
        quoteCurrency: currency,
        contractSize: '1',
        positionId: null,
        openClose,
        broker,
        stop: null,
        stopSource: null,
        target: null,
        quoteToAccount: null,
        setup: null,
        notes: null,
        row,
      });
    });

    return {
      rowsInFile,
      fills,
      cash,
      funding: [],
      skipped,
      openAtEnd: [],
      fileSummary: null,
      accountCurrency,
      sizeStep: stepOf(maxDecimals ?? 0),
    };
  },
};
