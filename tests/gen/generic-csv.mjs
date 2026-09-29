// Seeded generator for the generic CSV template (architecture section 2.4). Writes a file of `rows`
// data rows and its own expected totals from simple integer arithmetic. Generated files are not
// committed: `node tests/gen/generic-csv.mjs [out.csv] [rows] [seed]` writes out.csv and
// out.expected.json; tests import `generate` directly.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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

const HEADER = 'time,type,instrument,market,side,size,price,fee,fee_currency,quote_currency,amount,currency,contract_value,id,stop,setup,notes';
const STOCKS = ['AAPL', 'MSFT', 'KO', 'SPY', 'TSLA'];
const cents = (n) => `${n < 0 ? '-' : ''}${Math.floor(Math.abs(n) / 100)}.${String(Math.abs(n) % 100).padStart(2, '0')}`;

// { text, expected: { rowsInFile, fills, cash, funding, skipped, feeCents, missingFees, withStop } }
export function generate(rows = 2000, seed = 42) {
  const rnd = mulberry32(seed);
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const lines = [HEADER];
  const e = { rowsInFile: rows, fills: 0, cash: 0, funding: 0, skipped: 0, feeCents: 0, missingFees: 0, withStop: 0 };
  let t = Date.UTC(2026, 0, 5, 14, 30);
  for (let i = 0; i < rows; i++) {
    t += 60000 + Math.floor(rnd() * 3600000);
    const iso = new Date(t).toISOString().slice(0, 19);
    const id = `r${i}`;
    const r = rnd();
    if (r < 0.03) {
      // No offset: skipped.
      lines.push(`${iso},trade,KO,stock,buy,1,60,0,USD,USD,,,,${id},,,`);
      e.skipped++;
    } else if (r < 0.06) {
      const kind = pick(['deposit', 'withdrawal', 'cash']);
      lines.push(`${iso}Z,${kind},,,,,,,,,${cents(1000 + Math.floor(rnd() * 100000))},USD,,${id},,,`);
      e.cash++;
    } else if (r < 0.08) {
      lines.push(`${iso}+00:00,funding,BTC-PERP,,,,,,,,${cents(Math.floor(rnd() * 400) - 200)},USD,,${id},,,`);
      e.funding++;
    } else {
      // Sells may come first: positions opened before the file. About half the trades lack a stop.
      const side = rnd() < 0.5 ? 'buy' : 'sell';
      const size = 1 + Math.floor(rnd() * 200);
      const priceCents = 1000 + Math.floor(rnd() * 50000);
      let fee = '';
      if (rnd() < 0.1) e.missingFees++;
      else { const f = Math.floor(rnd() * 500); fee = cents(f); e.feeCents += f; }
      let stop = '';
      if (rnd() < 0.5) { stop = cents(priceCents - 100); e.withStop++; }
      const type = rnd() < 0.3 ? '' : 'trade';
      lines.push(`${iso}-05:00,${type},${pick(STOCKS)},,${side},${size},${cents(priceCents)},${fee},USD,USD,,,,${id},${stop},,`);
      e.fills++;
    }
  }
  return { text: `${lines.join('\n')}\n`, expected: e };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = process.argv[2] || 'generic-gen.csv';
  const { text, expected } = generate(Number(process.argv[3]) || 2000, Number(process.argv[4]) || 42);
  writeFileSync(out, text);
  writeFileSync(out.replace(/\.csv$/, '') + '.expected.json', `${JSON.stringify(expected, null, 1)}\n`);
  console.log(`wrote ${out}`);
}
