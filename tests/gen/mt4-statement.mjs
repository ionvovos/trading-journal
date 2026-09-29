// Seeded generator for a large MT4 statement (architecture section 2.4, AC-U2.1).
// generate({ closedRows, seed }) -> { text, expected } where `expected` comes from simple
// arithmetic on the generated values (integer cents), not from the parser.
// CLI: node tests/gen/mt4-statement.mjs [closedRows] [outFile]  (generated files are not committed)

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

const PAIRS = [
  { item: 'eurusd', base: 110000, digits: 5 },
  { item: 'gbpusd', base: 127000, digits: 5 },
  { item: 'audusd', base: 66000, digits: 5 },
];

const pad = (n) => String(n).padStart(2, '0');
const cents = (c) => {
  const neg = c < 0;
  const a = Math.abs(c);
  const int = String(Math.floor(a / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${neg ? '-' : ''}${int}.${pad(a % 100)}`;
};
const price = (points, digits) => (points / 10 ** digits).toFixed(digits);

function stamp(minutes) {
  const d = new Date(Date.UTC(2026, 0, 5) + minutes * 60000);
  return `${d.getUTCFullYear()}.${pad(d.getUTCMonth() + 1)}.${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00`;
}

export function generate({ closedRows = 2000, seed = 42 } = {}) {
  const rnd = mulberry32(seed);
  const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
  const out = [];
  let ticket = 5000;
  let minute = 0;
  let depositCents = 0;
  let pnlCents = 0;
  let commissionCents = 0;
  let swapCents = 0;
  let trades = 0;
  let cashRows = 0;
  let cancelled = 0;
  let withStop = 0;

  const deposit = 5000000;
  depositCents += deposit;
  cashRows += 1;
  out.push(`<tr><td title="Deposit">${ticket++}</td><td>${stamp(minute)}</td><td>balance</td><td colspan=10>Deposit</td><td>${cents(deposit)}</td></tr>`);

  for (let i = 1; i < closedRows; i++) {
    minute += int(30, 300);
    const t = ticket++;
    const r = rnd();
    if (r < 0.03) {
      cancelled += 1;
      out.push(`<tr><td>${t}</td><td>${stamp(minute)}</td><td>${rnd() < 0.5 ? 'buy' : 'sell'} limit</td><td>0.10</td><td>eurusd</td><td>1.07000</td><td>0.00000</td><td>0.00000</td><td>${stamp(minute + 60)}</td><td>1.08000</td><td colspan=4>cancelled</td></tr>`);
      continue;
    }
    if (r < 0.05) {
      const amount = rnd() < 0.5 ? int(10000, 100000) : -int(10000, 50000);
      depositCents += amount;
      cashRows += 1;
      out.push(`<tr><td>${t}</td><td>${stamp(minute)}</td><td>balance</td><td colspan=10>${amount > 0 ? 'Deposit' : 'Withdrawal'}</td><td>${cents(amount)}</td></tr>`);
      continue;
    }
    const pair = PAIRS[int(0, PAIRS.length - 1)];
    const buy = rnd() < 0.5;
    const lots = int(1, 50); // hundredths of a lot
    const open = pair.base + int(-2000, 2000);
    const move = int(-150, 150); // points
    const close = open + move;
    // Profit in cents: move points x 10^-5 x lots/100 x 100000 x 100 cents = move x lots (quote USD).
    const profit = move * lots * (buy ? 1 : -1);
    const commission = -int(0, 5) * lots;
    const swap = int(-30, 10);
    const stopped = rnd() < 0.6;
    if (stopped) withStop += 1;
    const sl = stopped ? price(open + (buy ? -200 : 200), pair.digits) : price(0, pair.digits);
    trades += 1;
    pnlCents += profit;
    commissionCents += commission;
    swapCents += swap;
    const hold = int(5, 600);
    out.push(`<tr><td>${t}</td><td>${stamp(minute)}</td><td>${buy ? 'buy' : 'sell'}</td><td>${(lots / 100).toFixed(2)}</td><td>${pair.item}</td><td>${price(open, pair.digits)}</td><td>${sl}</td><td>${price(0, pair.digits)}</td><td>${stamp(minute + hold)}</td><td>${price(close, pair.digits)}</td><td>${cents(commission)}</td><td>0.00</td><td>${cents(swap)}</td><td>${cents(profit)}</td></tr>`);
  }

  const closedPnl = pnlCents + commissionCents + swapCents;
  const text = `<html><body><table>
<tr><td colspan=2><b>Account: 7654321</b></td><td colspan=2><b>Currency: USD</b></td></tr>
<tr><td colspan=13><b>Closed Transactions:</b></td></tr>
<tr><td>Ticket</td><td>Open Time</td><td>Type</td><td>Size</td><td>Item</td><td>Price</td><td>S / L</td><td>T / P</td><td>Close Time</td><td>Price</td><td>Commission</td><td>Taxes</td><td>Swap</td><td>Profit</td></tr>
${out.join('\n')}
<tr><td colspan=12><b>Closed P/L:</b></td><td colspan=2>${cents(closedPnl)}</td></tr>
<tr><td colspan=13><b>Open Trades:</b></td></tr>
<tr><td colspan=13><b>Summary:</b></td></tr>
<tr><td colspan=3><b>Deposit/Withdrawal:</b></td><td colspan=2><b>${cents(depositCents)}</b></td></tr>
<tr><td colspan=3><b>Closed Trade P/L:</b></td><td colspan=2><b>${cents(closedPnl)}</b></td></tr>
<tr><td colspan=3><b>Balance:</b></td><td colspan=2><b>${cents(depositCents + closedPnl)}</b></td></tr>
</table></body></html>
`;
  return {
    text,
    expected: {
      rowsInFile: closedRows,
      trades,
      fills: trades * 2,
      cash: cashRows,
      skipped: cancelled,
      withStop,
      profitCents: pnlCents,
      commissionCents,
      swapCents,
      closedPnlCents: closedPnl,
      depositCents,
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rows = Number(process.argv[2]) || 2000;
  const file = process.argv[3] || 'mt4-statement.generated.htm';
  const { text, expected } = generate({ closedRows: rows });
  writeFileSync(file, text);
  writeFileSync(`${file}.expected.json`, JSON.stringify(expected, null, 1));
  console.log(`wrote ${file} (${rows} rows)`);
}
