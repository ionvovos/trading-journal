// MetaTrader 4 account history report (HTML). Architecture section 2.1 / 2.2, cloud spec C3.
// Server time is not in the file: the caller passes `fileZone` (IANA name or `ny+7`), asked once
// per broker account. Prices, sizes and money stay decimal strings; only the implied
// `quoteToAccount` ratio is a number.

import { htmlRows } from '../htmlTable.js';
import { parseDecimal } from '../../core/money.js';
import { sub, mul, div, neg, add, cmp, isZero, toNumber, decimalsOf, stepOf } from '../../core/decimal.js';
import { zonedToUtc } from '../../core/time.js';

const TICKET = /^\d+$/;
const PENDING = /^(buy|sell) (limit|stop)$/;
const PAIR = /^[a-z]{6}$/;
const CHAIN = /^(from|to) #(\d+)$/i;

// "2026.03.05 09:00:00" -> "2026-03-05T09:00:00" (seconds optional).
function localTime(text) {
  const m = /^(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}:\d{2}(?::\d{2})?)$/.exec(text.trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}` : null;
}

function instrumentOf(item) {
  const s = item.trim().toLowerCase();
  if (PAIR.test(s)) {
    const up = s.toUpperCase();
    return { instrument: `${up.slice(0, 3)}/${up.slice(3)}`, quoteCurrency: up.slice(3), contractSize: '100000' };
  }
  return { instrument: item.trim().toUpperCase(), quoteCurrency: null, contractSize: '1' };
}

const nonZero = (v) => (v !== null && !isZero(v) ? v : null);

// Profit / ((close - open) x sign x size x contractSize); null when the move is zero.
function impliedRate(profit, open, close, isBuy, size, contractSize) {
  const move = sub(close, open);
  if (isZero(move)) return null;
  const denom = mul(mul(mul(move, isBuy ? '1' : '-1'), size), contractSize);
  if (isZero(denom)) return null;
  return toNumber(div(profit, denom));
}

export const format = {
  id: 'mt4-statement',
  market: 'forex',
  labelKey: 'import.format.mt4',
  statesZone: false,

  detect(text) {
    const s = String(text);
    if (!s.includes('Closed Transactions:')) return 0;
    return /<tr\b[^]*?Ticket[^]*?Open Time/i.test(s) ? 0.95 : 0.3;
  },

  parse(text, { fileZone } = {}) {
    if (!fileZone) throw new RangeError('mt4-statement needs fileZone');
    const rows = htmlRows(text);
    let accountCurrency = null;
    let section = null; // 'closed' | 'open' | 'summary'
    const closed = [];
    const open = [];
    const summary = {};

    rows.forEach((r, i) => {
      const cells = r.cells;
      if (!cells.length) return;
      const first = cells[0].text;
      if (accountCurrency === null) {
        for (const c of cells) {
          const m = /^Currency:\s*([A-Za-z]{3,5})$/.exec(c.text);
          if (m) { accountCurrency = m[1].toUpperCase(); break; }
        }
      }
      if (first === 'Closed Transactions:') { section = 'closed'; return; }
      if (first === 'Open Trades:') { section = 'open'; return; }
      if (first === 'Summary:') { section = 'summary'; return; }
      if (section === 'summary') {
        for (let j = 0; j + 1 < cells.length; j++) {
          const label = cells[j].text;
          if (label === 'Deposit/Withdrawal:' || label === 'Closed Trade P/L:' || label === 'Balance:') {
            summary[label] = parseDecimal(cells[j + 1].text);
          }
        }
        return;
      }
      if ((section === 'closed' || section === 'open') && TICKET.test(first)) {
        (section === 'closed' ? closed : open).push({ row: i + 1, cells });
      }
    });

    // Ticket chains: `from #N` / `to #N` in the ticket title link partial closes; root = first ticket.
    const parent = new Map();
    const chained = new Set();
    for (const { cells } of [...closed, ...open]) {
      const ticket = cells[0].text;
      const m = CHAIN.exec(cells[0].title);
      if (!m) continue;
      const other = m[2];
      chained.add(ticket).add(other);
      if (m[1].toLowerCase() === 'from') parent.set(ticket, other);
      else parent.set(other, ticket);
    }
    const rootOf = (t) => {
      if (!chained.has(t)) return null;
      const seen = new Set();
      let cur = t;
      while (parent.has(cur) && !seen.has(cur)) { seen.add(cur); cur = parent.get(cur); }
      return cur;
    };

    const fills = [];
    const cash = [];
    const skipped = [];
    const openAtEnd = [];
    let sizeDecimals = null;
    const raw = (cells) => cells.map((c) => c.text).join('\t');
    const skip = (row, cells, reasonKey) => skipped.push({ row, reasonKey, raw: raw(cells) });

    // Fields shared by the open and the close fill of one row; null plus a skip key when unreadable.
    const readTrade = (cells, withClose) => {
      const t = (k) => (cells[k] ? cells[k].text : '');
      const openLocal = localTime(t(1));
      const time = openLocal && zonedToUtc(openLocal, fileZone);
      if (!time) return { reasonKey: 'import.skip.date' };
      const size = parseDecimal(t(3));
      const price = parseDecimal(t(5));
      const sl = parseDecimal(t(6));
      const tp = parseDecimal(t(7));
      const closePrice = parseDecimal(t(9));
      const commission = parseDecimal(t(10));
      const taxes = parseDecimal(t(11));
      const swap = parseDecimal(t(12));
      const profit = parseDecimal(t(13));
      if (cells.length < 14 || [size, price, sl, tp, closePrice, commission, taxes, swap, profit].includes(null) || cmp(size, '0') <= 0) {
        return { reasonKey: 'import.skip.number' };
      }
      let closeTime = null;
      if (withClose) {
        const closeLocal = localTime(t(8));
        closeTime = closeLocal && zonedToUtc(closeLocal, fileZone);
        if (!closeTime) return { reasonKey: 'import.skip.date' };
      }
      if (sizeDecimals === null || decimalsOf(t(3).trim()) > sizeDecimals) sizeDecimals = decimalsOf(t(3).trim());
      return { time, closeTime, size, price, sl, tp, closePrice, commission, taxes, swap, profit, item: t(4) };
    };

    const baseFill = (ticket, row, d, isBuy) => {
      const ins = instrumentOf(d.item);
      const stop = nonZero(d.sl);
      return {
        instrument: ins.instrument, market: 'forex', size: d.size,
        feeCurrency: accountCurrency, quoteCurrency: ins.quoteCurrency, contractSize: ins.contractSize,
        positionId: rootOf(ticket), openClose: null,
        stop, stopSource: stop ? 'file_at_close' : null, target: nonZero(d.tp),
        quoteToAccount: impliedRate(d.profit, d.price, d.closePrice, isBuy, d.size, ins.contractSize),
        setup: null, notes: null, row,
      };
    };

    for (const { row, cells } of closed) {
      const ticket = cells[0].text;
      const type = (cells[2] ? cells[2].text : '').toLowerCase();
      if (type === 'balance' || type === 'credit') {
        const amount = parseDecimal(cells[cells.length - 1].text);
        const openLocal = localTime(cells[1] ? cells[1].text : '');
        const time = openLocal && zonedToUtc(openLocal, fileZone);
        if (amount === null) { skip(row, cells, 'import.skip.number'); continue; }
        if (!time) { skip(row, cells, 'import.skip.date'); continue; }
        const kind = type === 'credit' ? 'other' : cmp(amount, '0') > 0 ? 'deposit' : 'withdrawal';
        cash.push({ row, kind, amount, currency: accountCurrency, time, key: `mt4:${ticket}:cash` });
        continue;
      }
      if (PENDING.test(type)) { skip(row, cells, 'import.skip.cancelled'); continue; }
      if (type !== 'buy' && type !== 'sell') { skip(row, cells, 'import.skip.type'); continue; }
      const d = readTrade(cells, true);
      if (d.reasonKey) { skip(row, cells, d.reasonKey); continue; }
      const isBuy = type === 'buy';
      const base = baseFill(ticket, row, d, isBuy);
      fills.push({
        key: `mt4:${ticket}:open`, time: d.time, ...base,
        side: isBuy ? 'buy' : 'sell', price: d.price, fee: null, broker: null,
      });
      fills.push({
        key: `mt4:${ticket}:close`, time: d.closeTime, ...base,
        side: isBuy ? 'sell' : 'buy', price: d.closePrice, fee: neg(add(d.commission, d.taxes)),
        broker: { commission: d.commission, taxes: d.taxes, swap: d.swap, profit: d.profit },
      });
    }

    for (const { row, cells } of open) {
      const ticket = cells[0].text;
      const type = (cells[2] ? cells[2].text : '').toLowerCase();
      if (PENDING.test(type)) { skip(row, cells, 'import.skip.cancelled'); continue; }
      if (type !== 'buy' && type !== 'sell') { skip(row, cells, 'import.skip.type'); continue; }
      const d = readTrade(cells, false);
      if (d.reasonKey) { skip(row, cells, d.reasonKey); continue; }
      const isBuy = type === 'buy';
      openAtEnd.push({
        key: `mt4:${ticket}:open`, time: d.time, ...baseFill(ticket, row, d, isBuy),
        side: isBuy ? 'buy' : 'sell', price: d.price, fee: null, broker: null,
      });
    }

    const hasSummary = ['Deposit/Withdrawal:', 'Closed Trade P/L:', 'Balance:'].some((k) => summary[k] != null);
    return {
      rowsInFile: closed.length + open.length,
      fills,
      cash,
      funding: [],
      skipped,
      openAtEnd,
      fileSummary: hasSummary
        ? {
            closedPnl: summary['Closed Trade P/L:'] ?? null,
            deposits: summary['Deposit/Withdrawal:'] ?? null,
            balance: summary['Balance:'] ?? null,
            currency: accountCurrency,
          }
        : null,
      accountCurrency,
      sizeStep: sizeDecimals === null ? null : stepOf(sizeDecimals),
    };
  },
};
