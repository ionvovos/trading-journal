// Seeded generator for a large IBKR Activity Statement CSV (AC-U2.1, architecture section 2.4).
// Writes the file to a temp dir and returns its own expected totals from simple arithmetic.
// Includes closing rows with no opening row (positions opened before the file), SubTotal rows
// that are not counted, a few non-stock rows that are skipped, and times across both US clock
// changes. Run directly (`node tests/gen/ibkr-activity.mjs [seed]`) to print the result.

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SYMBOLS = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMD', 'KO', 'JPM', 'XOM', 'META', 'AMZN'];
const pad = (n) => String(n).padStart(2, '0');
const cents = (c) => `${c < 0 ? '-' : ''}${Math.floor(Math.abs(c) / 100)}.${pad(Math.abs(c) % 100)}`;

// { path, dir, rows, fills, skipped, cash, closesWithoutOpen, commFeeSum } where rows counts
// Trades Data rows written (the "2,000 rows"), commFeeSum = Σ Comm/Fee over the fill rows.
export function generate({ seed = 20260929, rows = 2000, dir } = {}) {
  const rand = mulberry32(seed);
  const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
  const out = [
    'Statement,Header,Field Name,Field Value',
    'Statement,Data,Title,Activity Statement',
    'Account Information,Header,Field Name,Field Value',
    'Account Information,Data,Base Currency,USD',
    'Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code',
  ];
  const position = new Map(SYMBOLS.map((s) => [s, 0]));
  let fills = 0;
  let skipped = 0;
  let closesWithoutOpen = 0;
  let feeCents = 0;
  let written = 0;
  // One trading day step per ~8 rows from 2 Jan 2026: covers the March and November clock changes.
  let day = Date.UTC(2026, 0, 2);
  while (written < rows) {
    if (written % 8 === 0) day += 86400000;
    const date = new Date(day);
    const dt = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}, ${pad(int(9, 15))}:${pad(int(0, 59))}:${pad(int(0, 59))}`;
    if (rand() < 0.02) {
      out.push(`Trades,Data,Order,Forex,USD,EUR.USD,"${dt}",1000,1.08,1.08,-1080,-2,0,0,0,O`);
      skipped++;
      written++;
      continue;
    }
    const sym = SYMBOLS[int(0, SYMBOLS.length - 1)];
    const pos = position.get(sym);
    const priceCents = int(1000, 50000);
    const fee = -int(0, 300); // cents, Comm/Fee is negative (a cost) or zero
    let qty;
    let code;
    let realized = 0;
    if (pos === 0 && rand() < 0.15) {
      // Close of a position opened before the file.
      qty = rand() < 0.5 ? -int(1, 100) : int(1, 100);
      code = 'C';
      realized = int(-50000, 50000);
      closesWithoutOpen++;
    } else if (pos !== 0 && rand() < 0.5) {
      qty = -pos;
      code = 'C';
      realized = int(-50000, 50000);
      position.set(sym, 0);
    } else {
      const dir = pos === 0 ? (rand() < 0.7 ? 1 : -1) : Math.sign(pos);
      qty = dir * int(1, 100);
      code = 'O';
      position.set(sym, pos + qty);
    }
    const proceeds = -qty * priceCents;
    const basis = code === 'C' ? -(proceeds + fee - realized) : -(proceeds + fee);
    out.push(`Trades,Data,Order,Stocks,USD,${sym},"${dt}",${qty},${cents(priceCents)},${cents(priceCents)},${cents(proceeds)},${cents(fee)},${cents(basis)},${cents(realized)},0,${code}`);
    fills++;
    feeCents += fee;
    written++;
    if (written % 250 === 0) out.push(`Trades,SubTotal,,Stocks,USD,${sym},,0,,,0,0,0,0,0,`);
  }
  out.push('Trades,Total,,Stocks,USD,,,,,,0,0,0,0,0,');
  out.push('Deposits & Withdrawals,Header,Currency,Settle Date,Description,Amount');
  out.push('Deposits & Withdrawals,Data,USD,2026-01-02,Electronic Fund Transfer,100000');
  out.push('Deposits & Withdrawals,Data,USD,2026-06-01,Disbursement,-2500');
  out.push('Deposits & Withdrawals,Data,Total,,,97500');

  const target = dir || mkdtempSync(join(tmpdir(), 'ibkr-gen-'));
  const path = join(target, `ibkr-activity-${seed}.csv`);
  writeFileSync(path, out.join('\n') + '\n');
  return { path, dir: target, rows: written, fills, skipped, cash: 2, closesWithoutOpen, commFeeSum: cents(feeCents) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(generate({ seed: process.argv[2] ? Number(process.argv[2]) : undefined }));
}
