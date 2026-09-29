import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  closedSet, buckets, calendar, feeTotals, streaks, ruleFollowing, pips, pipsByPair, holdingTime, SESSIONS,
} from '../../src/stats/index.js';
import { core, close } from './helpers.mjs';

const { ctx, trades, expected } = core;
const byId = Object.fromEntries(trades.map((t) => [t.id, t]));
const set = closedSet(trades, ctx);

const ORDER = {
  setup: ['breakout', 'pullback', 'null'],
  market: ['crypto', 'forex', 'stock'],
  weekday: ['1', '2', '3', '4', '5'],
  hour: ['3', '9', '11', '15', '16', '23'],
  account: ['acc-ibkr', 'acc-kraken', 'acc-manual', 'acc-mt4'],
  session: ['tokyo', 'us_regular', 'us_extended', 'none'],
};

for (const [by, rows] of Object.entries(expected.S12)) {
  test(`S12 buckets by ${by}`, () => {
    const got = buckets(set, by, ctx);
    assert.deepEqual(got.map((r) => String(r.key)), ORDER[by], 'fixed neutral order');
    assert.equal(got.length, Object.keys(rows).length);
    for (const row of got) {
      const e = rows[String(row.key)];
      assert.ok(e, `unexpected bucket ${row.key}`);
      assert.equal(row.n, e.n);
      assert.equal(row.netMinor, e.netMinor);
      close(row.winRate, e.winRate, `${row.key} winRate`);
      close(row.expectancyR, e.expectancyR, `${row.key} expectancyR`);
      assert.equal(row.rKnown, e.rKnown);
      assert.deepEqual(row.tradeIds, e.tradeIds);
      assert.deepEqual(Object.keys(row).sort(), ['expectancyR', 'key', 'n', 'netMinor', 'rKnown', 'tradeIds', 'winRate']);
    }
  });
}

test('S12: "No setup" comes after named setups; session order is the listed one', () => {
  const extra = [...set.included, { ...byId.T1, id: 'Tz', setup: 'zz' }];
  assert.deepEqual(buckets(extra, 'setup', ctx).map((r) => r.key), ['breakout', 'pullback', 'zz', null]);
  assert.deepEqual(SESSIONS.slice(0, 5), ['london_ny_overlap', 'london', 'new_york', 'tokyo', 'sydney']);
});

test('S12: instrument buckets alphabetical', () => {
  assert.deepEqual(buckets(set, 'instrument', ctx).map((r) => r.key), ['AAPL', 'BTC/USD', 'EUR/USD', 'KO', 'MSFT', 'TSLA', 'USD/JPY']);
});

test('S13 calendar in the declared zone', () => {
  const e = expected.S13;
  const c = calendar(set, { year: e.year, month: e.month }, ctx);
  assert.deepEqual(Object.fromEntries(c.days.map((d) => [d.date, d.netMinor])), e.days);
  assert.deepEqual(c.weeks, e.weeks);
  assert.equal(c.monthMinor, e.monthMinor);
  assert.equal(c.days.find((d) => d.date === '2026-03-05').n, 2);
});

test('S13 calendar in UTC', () => {
  const c = calendar(set, { year: 2026, month: 3 }, { ...ctx, tz: 'UTC' });
  assert.deepEqual(Object.fromEntries(c.days.map((d) => [d.date, d.netMinor])), expected.S13_utc.days);
});

test('S13: closeDayOverride wins', () => {
  const moved = set.included.map((t) => (t.id === 'T1' ? { ...t, closeDayOverride: '2026-02-28' } : t));
  const c = calendar(moved, { year: 2026, month: 3 }, ctx);
  assert.equal(c.monthMinor, expected.S13.monthMinor - 20700);
  assert.equal(calendar(moved, { year: 2026, month: 2 }, ctx).monthMinor, 20700);
});

test('S14 fees and funding', () => {
  const f = feeTotals(set, ctx);
  for (const [k, v] of Object.entries(expected.S14)) close(f[k], v, k);
});

test('S15 streaks', () => {
  assert.deepEqual(streaks(set, ctx), expected.S15);
});

test('S16 rule following', () => {
  const r = ruleFollowing(set);
  for (const [k, v] of Object.entries(expected.S16)) close(r[k], v, k);
});

test('S17 pips', () => {
  for (const [id, e] of Object.entries(expected.S17.perTrade)) {
    const p = pips(byId[id]);
    for (const [k, v] of Object.entries(e)) close(p[k], v, `${id} ${k}`);
  }
  assert.equal(pips(byId.T1), null);
  const got = pipsByPair(set);
  assert.equal(got.length, expected.S17.byPair.length);
  expected.S17.byPair.forEach((e, i) => {
    assert.equal(got[i].instrument, e.instrument);
    close(got[i].pips, e.pips, e.instrument);
    assert.equal(got[i].n, e.n);
  });
});

test('S18 holding time', () => {
  const h = holdingTime(set, ctx);
  for (const k of ['winners', 'losers']) {
    close(h[k].avgSeconds, expected.S18[k].avgSeconds, k);
    assert.equal(h[k].n, expected.S18[k].n);
  }
});
