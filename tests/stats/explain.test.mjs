import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closedSet, explain, feeTotals, equityCurve, drawdown, buckets, calendar } from '../../src/stats/index.js';
import { core } from './helpers.mjs';

const { ctx, trades, expected } = core;
const set = closedSet(trades, ctx);

function sumsHold(result) {
  for (const m of result.params.money || []) {
    assert.equal(m.items.reduce((s, i) => s + i.valueMinor, 0), m.totalMinor, `${m.name} items sum to the headline`);
    for (const i of m.items) assert.ok(Number.isInteger(i.valueMinor));
  }
}

const moneyOf = (r, name) => r.params.money.find((m) => m.name === name);

test('explain lists the excluded trades with their reason', () => {
  const r = explain('S2', set, ctx);
  assert.deepEqual(r.excluded, [
    { id: 'T8', reason: 'open' }, { id: 'T9', reason: 'held_out' }, { id: 'T10', reason: 'other_mode' },
  ]);
  assert.deepEqual(r.includedIds, expected.S3.included);
  assert.equal(r.formulaKey, 'stats.formula.S2');
});

test('explain S2: net items sum to the total', () => {
  const r = explain('S2', set, ctx);
  sumsHold(r);
  assert.equal(moneyOf(r, 'net').totalMinor, expected.totalNetMinor);
});

test('explain S5 and S6: winners and losers', () => {
  for (const id of ['S5', 'S6']) {
    const r = explain(id, set, ctx);
    sumsHold(r);
    assert.equal(moneyOf(r, 'wins').totalMinor, 59332);
    assert.equal(moneyOf(r, 'losses').totalMinor, -15442);
  }
});

test('explain S8 and S9: R-missing trades listed', () => {
  const r = explain('S8', set, ctx);
  assert.deepEqual(r.includedIds, ['T1', 'T2', 'T3', 'T4', 'T5', 'T7']);
  assert.ok(r.excluded.some((e) => e.id === 'T6' && e.reason === 'r_missing'));
  const e = explain('S9', set, ctx);
  sumsHold(e);
  assert.equal(e.params.rValues.length, expected.S9.r.n);
});

test('explain S10 and S11', () => {
  const r10 = explain('S10', set, ctx);
  sumsHold(r10);
  const pts = equityCurve(set, ctx).points;
  assert.equal(moneyOf(r10, 'net').totalMinor, pts[pts.length - 1].equityMinor - pts[0].equityMinor);
  const r11 = explain('S11', set, ctx);
  sumsHold(r11);
  assert.deepEqual(r11.includedIds, ['T2']);
  assert.equal(moneyOf(r11, 'drawdown').totalMinor, drawdown(equityCurve(set, ctx)).maxMinor);
});

test('explain S12 buckets and S13 days', () => {
  for (const by of Object.keys(expected.S12)) {
    for (const row of buckets(set, by, ctx)) {
      const r = explain('S12', set, ctx, { by, key: row.key });
      sumsHold(r);
      assert.equal(moneyOf(r, 'net').totalMinor, row.netMinor);
      assert.deepEqual(r.includedIds, row.tradeIds);
    }
  }
  const month = explain('S13', set, ctx, { year: 2026, month: 3 });
  sumsHold(month);
  assert.equal(moneyOf(month, 'net').totalMinor, expected.S13.monthMinor);
  for (const d of calendar(set, { year: 2026, month: 3 }, ctx).days) {
    const r = explain('S13', set, ctx, { year: 2026, month: 3, date: d.date });
    assert.equal(moneyOf(r, 'net').totalMinor, expected.S13.days[d.date]);
  }
});

test('explain S14: fee and funding items', () => {
  const r = explain('S14', set, ctx);
  sumsHold(r);
  const f = feeTotals(set, ctx);
  assert.equal(moneyOf(r, 'fees').totalMinor, f.feesMinor);
  assert.equal(moneyOf(r, 'funding').totalMinor, f.fundingMinor);
});

test('explain S4, S15-S18 name their trades', () => {
  assert.equal(explain('S4', set, ctx).params.n, 7);
  assert.deepEqual(explain('S15', set, ctx).params, expected.S15);
  const s16 = explain('S16', set, ctx);
  assert.deepEqual(s16.includedIds, ['T1', 'T2', 'T3', 'T4', 'T5', 'T7']);
  assert.ok(s16.excluded.some((e) => e.id === 'T6' && e.reason === 'unmarked'));
  assert.deepEqual(explain('S17', set, ctx).includedIds, ['T4', 'T5']);
  assert.equal(explain('S18', set, ctx).params.winners.n, 4);
  assert.throws(() => explain('S99', set, ctx), RangeError);
});
