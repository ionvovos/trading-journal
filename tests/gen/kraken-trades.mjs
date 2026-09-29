// Seeded generator for a Kraken trades CSV (architecture section 2.4, AC-U2.1). Writes the file
// and returns its own expected totals from integer arithmetic, independent of the parser.
// Includes sells with no earlier buy (positions opened before the file) and a few unreadable rows.
// Usage: node tests/gen/kraken-trades.mjs [rows] [seed]  → prints the path and the totals.

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

const HEADER = '"txid","ordertxid","pair","time","type","ordertype","price","cost","fee","vol","margin","misc","ledgers"';
// pair, instrument, price range in whole quote units
const PAIRS = [
  ['XXBTZUSD', 'BTC/USD', 50000, 70000],
  ['XETHZUSD', 'ETH/USD', 2000, 3000],
  ['XXBTZEUR', 'BTC/EUR', 45000, 60000],
  ['SOLUSD', 'SOL/USD', 100, 200],
  ['XDGUSD', 'DOGE/USD', 1, 2],
  ['ETHUSDT', 'ETH/USDT', 2000, 3000],
];

const pad = (n, w = 2) => String(n).padStart(w, '0');
// Integer count of 10^-d units to a fixed decimal string ("300000", 5 -> "3.00000").
const fixed = (units, d) => {
  const s = String(units).padStart(d + 1, '0');
  return `${s.slice(0, s.length - d)}.${s.slice(s.length - d)}`;
};

// { text, rows, fills, skipped, feeSum, instruments } for `rows` data rows.
export function generateText({ rows = 2000, seed = 20260929 } = {}) {
  const rnd = mulberry32(seed);
  const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
  const lines = [HEADER];
  let feeUnits = 0n; // Σ fee in 10^-5 quote units
  let fills = 0;
  let skipped = 0;
  const instruments = {};
  let t = Date.UTC(2025, 0, 1, 0, 0, 0);
  for (let i = 1; i <= rows; i++) {
    t += int(60, 4 * 3600) * 1000 + int(0, 9999) / 10;
    const d = new Date(Math.floor(t));
    const frac = pad(Math.round((t % 1000) * 10), 4);
    const time = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${frac}`;
    const [pair, instrument, lo, hi] = PAIRS[int(0, PAIRS.length - 1)];
    const type = rnd() < 0.5 ? 'buy' : 'sell';
    const priceUnits = BigInt(int(lo * 100, hi * 100)) * 1000n; // 10^-5
    const volUnits = BigInt(int(1, 200000000)); // 10^-8
    const costUnits = (priceUnits * volUnits + 50000000n) / 100000000n; // 10^-5, rounded
    const feeU = (costUnits * 26n + 5000n) / 10000n; // 0.26 %
    const bad = rnd() < 0.01;
    const n = pad(i, 6);
    const price = bad ? 'n/a' : fixed(priceUnits, 5);
    lines.push(`"T${n}-GEN00-${n}","O${n}-GEN00-${n}","${pair}","${time}","${type}","limit",${price},${fixed(costUnits, 5)},${fixed(feeU, 5)},${fixed(volUnits, 8)},0.00000,"","L${n}"`);
    if (bad) { skipped++; continue; }
    fills++;
    feeUnits += feeU;
    instruments[instrument] = (instruments[instrument] || 0) + 1;
  }
  const feeSum = fixed(feeUnits, 5).replace(/\.?0+$/, '');
  return { text: `${lines.join('\n')}\n`, rows, fills, skipped, feeSum, instruments };
}

// Writes the file into `dir` (a new temp dir by default) and returns { path, ...generateText }.
export function generate({ rows = 2000, seed = 20260929, dir } = {}) {
  const out = generateText({ rows, seed });
  const folder = dir || mkdtempSync(join(tmpdir(), 'kraken-gen-'));
  const path = join(folder, `kraken-trades-${rows}.csv`);
  writeFileSync(path, out.text);
  return { path, ...out };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { path, text, ...totals } = generate({ rows: Number(process.argv[2]) || 2000, seed: Number(process.argv[3]) || 20260929 });
  console.log(JSON.stringify({ path, ...totals }, null, 1));
}
