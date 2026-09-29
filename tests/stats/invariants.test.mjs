// AC-P3.2 invariants on 250 generated trades (seeded mulberry32): both modes, three accounts
// (one in EUR with a display rate), all markets, some without stop, some break-even, some held
// out, excluded and open.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  closedSet, buckets, calendar, expectancy, explain, displayMinor, feeTotals, avgWinLoss, profitFactor, equityCurve,
  drawdown,
} from '../../src/stats/index.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = mulberry32(20260929);
const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

const ACCOUNTS = {
  'a-usd': { mode: 'real', baseCurrency: 'USD', startBalance: '20000', toDisplayRate: 1 },
  'a-eur': { mode: 'real', baseCurrency: 'EUR', startBalance: '15000', toDisplayRate: 1.0837 },
  'a-paper': { mode: 'paper', baseCurrency: 'USD', startBalance: '10000', toDisplayRate: 1 },
};
const INSTRUMENTS = {
  stock: [['AAPL', 'USD', '1', 100, 2], ['MSFT', 'USD', '1', 300, 2], ['SAP', 'EUR', '1', 150, 2]],
  crypto: [['BTC/USD', 'USD', '1', 60000, 2], ['ETH/USD', 'USD', '1', 2400, 2]],
  forex: [['EUR/USD', 'USD', '100000', 1.08, 5], ['USD/JPY', 'JPY', '100000', 150, 3], ['GBP/USD', 'USD', '100000', 1.27, 5]],
};
const SETUPS = ['breakout', 'pullback', 'range', null];

function makeLeg(id, kind, time, price, size, fee, rate) {
  return { id, kind, time, price, size, fee, feeCurrency: 'USD', feeToAccount: 1, quoteToAccount: rate, zone: 'UTC', source: {}, broker: null };
}

function generate(n) {
  const out = [];
  const t0 = Date.UTC(2026, 1, 1);
  for (let i = 0; i < n; i += 1) {
    const accountId = pick(Object.keys(ACCOUNTS));
    const market = pick(['stock', 'crypto', 'forex']);
    const [instrument, quote, contractSize, base, dp] = pick(INSTRUMENTS[market]);
    const side = rnd() < 0.3 ? 'short' : 'long';
    const sign = side === 'short' ? -1 : 1;
    const size = market === 'forex' ? (int(1, 30) / 10).toFixed(1) : market === 'crypto' ? (int(1, 5000) / 10000).toFixed(4) : String(int(1, 200));
    const entry = base * (1 + (rnd() - 0.5) * 0.1);
    const breakEven = rnd() < 0.08;
    const move = breakEven ? 0 : (rnd() - 0.45) * 0.04;
    const exit = entry * (1 + move);
    const rate = quote === 'JPY' ? 0.006644 : quote === 'EUR' ? 1.08 : 1;
    const fee = (x) => (breakEven ? '0' : x);
    const open = t0 + int(0, 88 * 24) * 3600000 + int(0, 59) * 60000;
    const closeAt = open + int(1, 72) * 3600000 + int(0, 59) * 1000;
    const iso = (ms) => new Date(ms).toISOString();
    const legs = [];
    const twoEntries = rnd() < 0.2 && market === 'stock' && Number(size) > 1;
    if (twoEntries) {
      const a = Math.floor(Number(size) / 2);
      legs.push(makeLeg(`G${i}-1`, 'entry', iso(open), entry.toFixed(dp), String(a), fee('1'), rate));
      legs.push(makeLeg(`G${i}-2`, 'entry', iso(open + 60000), entry.toFixed(dp), String(Number(size) - a), fee('0.5'), rate));
    } else {
      legs.push(makeLeg(`G${i}-1`, 'entry', iso(open), entry.toFixed(dp), size, fee((rnd() * 3).toFixed(2)), rate));
    }
    const kind = rnd();
    const isOpen = kind < 0.05;
    if (!isOpen) legs.push(makeLeg(`G${i}-x`, 'exit', iso(closeAt), breakEven ? entry.toFixed(dp) : exit.toFixed(dp), size, fee((rnd() * 3).toFixed(2)), rate));
    const noStop = rnd() < 0.2;
    out.push({
      id: `G${String(i).padStart(3, '0')}`, accountId, mode: ACCOUNTS[accountId].mode, market, instrument, side,
      contractSize, contractValue: null, quoteCurrency: quote, legs,
      initialStop: noStop ? null : (entry * (1 - sign * 0.01 * int(1, 5))).toFixed(dp),
      stopMoves: [], target: null, funding: market === 'forex' && !breakEven && rnd() < 0.3 ? -(rnd() * 2).toFixed(2) : 0,
      broker: null, setup: pick(SETUPS), plan: { followed: pick([true, false, null]) },
      holds: kind >= 0.05 && kind < 0.1 ? ['a-x'] : [], excluded: kind >= 0.1 && kind < 0.13 ? { by: 'user' } : null,
      dustRemainder: '0', closeDayOverride: null, closeTime: isOpen ? null : iso(closeAt),
    });
  }
  return out;
}

const trades = generate(250);
const MONTHS = [[2026, 2], [2026, 3], [2026, 4], [2026, 5]];

for (const mode of ['real', 'paper']) {
  const ctx = {
    mode, accountIds: 'all', displayCurrency: 'USD', tz: 'Europe/Athens', dayCutoffHour: 0, smallSampleMin: 30,
    accounts: ACCOUNTS, cash: [],
  };
  const set = closedSet(trades, ctx);
  const total = set.included.reduce((s, t) => s + displayMinor(t, ctx), 0);

  test(`${mode}: the generated set covers the cases`, () => {
    assert.ok(set.included.length > 50);
    assert.ok(set.included.some((t) => t.initialStop === null));
    assert.ok(set.included.some((t) => displayMinor(t, ctx) === 0));
    assert.ok(set.included.some((t) => t.side === 'short'));
    assert.equal(new Set(set.included.map((t) => t.market)).size, 3);
    assert.ok(set.excluded.heldOut.length > 0 && set.excluded.open.length > 0 && set.excluded.otherMode.length > 0);
  });

  test(`${mode}: day cells and week rows sum to the month; months to the total`, () => {
    let months = 0;
    for (const [year, month] of MONTHS) {
      const c = calendar(set, { year, month }, ctx);
      assert.equal(c.days.reduce((s, d) => s + d.netMinor, 0), c.monthMinor);
      assert.equal(c.weeks.reduce((s, w) => s + w.netMinor, 0), c.monthMinor);
      months += c.monthMinor;
    }
    assert.equal(months, total);
  });

  test(`${mode}: every bucket dimension sums to the total`, () => {
    for (const by of ['setup', 'market', 'instrument', 'account', 'hour', 'weekday', 'session']) {
      const rows = buckets(set, by, ctx);
      assert.equal(rows.reduce((s, r) => s + r.netMinor, 0), total, by);
      assert.equal(rows.reduce((s, r) => s + r.n, 0), set.included.length, `${by} n`);
    }
    assert.ok(buckets(set, 'setup', ctx).some((r) => r.key === null), 'No setup present');
  });

  test(`${mode}: R-known + R-unknown = |S3|; expectancy forms agree`, () => {
    const e = expectancy(set, ctx);
    assert.equal(e.r.n + e.r.rMissing, set.included.length);
    assert.ok(e.r.rMissing > 0);
    assert.ok(Math.abs(e.r.value - e.r.byParts) <= 1e-9);
  });

  test(`${mode}: explain lists sum to each headline`, () => {
    const check = (r) => {
      for (const m of r.params.money || []) assert.equal(m.items.reduce((s, i) => s + i.valueMinor, 0), m.totalMinor, m.name);
      return r;
    };
    const net = check(explain('S2', set, ctx)).params.money[0];
    assert.equal(net.totalMinor, total);
    const f = feeTotals(set, ctx);
    const fees = check(explain('S14', set, ctx)).params.money;
    assert.equal(fees[0].totalMinor, f.feesMinor);
    assert.equal(fees[1].totalMinor, f.fundingMinor);
    const a = avgWinLoss(set, ctx);
    const wl = check(explain('S6', set, ctx));
    assert.ok(Math.abs(wl.params.money[0].totalMinor / a.nWin / 100 - a.avgWin) <= 1e-9);
    const pf = profitFactor(set, ctx);
    assert.ok(Math.abs(wl.params.money[0].totalMinor / -wl.params.money[1].totalMinor - pf.value) <= 1e-12);
    const dd = check(explain('S11', set, ctx));
    assert.equal(dd.params.money[0].totalMinor, drawdown(equityCurve(set, ctx)).maxMinor);
    for (const by of ['setup', 'market', 'account', 'weekday', 'session']) {
      for (const row of buckets(set, by, ctx)) {
        assert.equal(check(explain('S12', set, ctx, { by, key: row.key })).params.money[0].totalMinor, row.netMinor);
      }
    }
    for (const [year, month] of MONTHS) {
      const c = calendar(set, { year, month }, ctx);
      assert.equal(check(explain('S13', set, ctx, { year, month })).params.money[0].totalMinor, c.monthMinor);
      for (const d of c.days) {
        assert.equal(explain('S13', set, ctx, { year, month, date: d.date }).params.money[0].totalMinor, d.netMinor);
      }
    }
  });
}
