// The statistics as the screens read them (statsModel, getSummary) over the hand-computed journal of tests/fixtures/stats/core.json,
// and the export then import round trip that must reproduce every figure (AC-P3.5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMemoryStore } from '../../src/storage/memory.js';
import { getSummary } from '../../src/storage/summary.js';
import { computeStats, defaultMonth, monthPeriod, inPeriod } from '../../src/storage/statsModel.js';
import { loadModel } from '../../src/storage/model.js';
import { buildExport, parseExport, mergeImport } from '../../src/storage/exportImport.js';
import { createFormat } from '../../src/i18n/format.js';

const core = JSON.parse(readFileSync(new URL('../fixtures/stats/core.json', import.meta.url), 'utf8'));
const acc = (id) => ({ id, name: id, mode: id === 'acc-paper' ? 'paper' : 'real', baseCurrency: 'USD', startBalance: core.ctx.accounts[id].startBalance, toDisplayRate: 1 });

async function seeded() {
  const store = createMemoryStore();
  await store.accounts.putMany(Object.keys(core.ctx.accounts).map(acc));
  await store.trades.putMany(core.trades);
  return store;
}
const viewCtx = (store, mode = 'real') => ({ store, mode, lang: 'en', tz: 'Europe/Athens', accountFilter: 'all', settings: { get: (k) => ({ dayCutoffHour: 0, smallSampleMin: 30, exportReminderEvery: 50 })[k] }, displayCurrency: () => 'USD', fmt: createFormat({ lang: 'en', tz: 'Europe/Athens' }) });

test('computeStats reproduces the fixture figures S3-S6, S9, S16', async () => {
  const store = await seeded();
  const s = await computeStats(viewCtx(store), await loadModel(store), { period: null });
  const ex = core.expected;
  assert.deepEqual(s.included.map((t) => t.id), ex.S3.included);
  assert.deepEqual(s.excluded.open.map((t) => t.id), ex.S3.excluded.open);
  assert.deepEqual(s.excluded.heldOut.map((t) => t.id), ex.S3.excluded.heldOut);
  assert.deepEqual(s.counts, { open: 1, heldOut: 1, excluded: 0 });
  assert.equal(s.netMinor, ex.totalNetMinor);
  assert.ok(Math.abs(s.winRate.value - ex.S4.value) < 1e-9);
  assert.ok(Math.abs(s.profitFactor.value - ex.S6.value) < 1e-9);
  assert.ok(Math.abs(s.expectancy.r.value - ex.S9.r.value) < 1e-9);
  assert.equal(s.expectancy.r.rMissing, ex.S9.r.rMissing);
  assert.equal(s.rMissing, 1);
  assert.equal(s.ruleFollowing.followed, ex.S16.followed);
  assert.equal(s.curve.points.at(-1).equityMinor, 1000000 + ex.totalNetMinor, 'start balances of the four real accounts plus the net');
  assert.equal(s.drawdown.maxMinor, ex.S11.maxMinor);
});

test('paper mode shows the paper trade alone', async () => {
  const store = await seeded();
  const s = await computeStats(viewCtx(store, 'paper'), await loadModel(store), { period: null });
  assert.deepEqual(s.included.map((t) => t.id), ['T10']);
});

test('a month period keeps the trades closed in that month in the declared zone', async () => {
  const store = await seeded();
  const ctx = viewCtx(store);
  const model = await loadModel(store);
  assert.equal(defaultMonth(model.trades.filter((t) => t.mode === 'real'), ctx, '2026-09-29T00:00:00Z'), '2026-03');
  assert.deepEqual(monthPeriod('2026-03'), { from: '2026-03-01', to: '2026-03-31' });
  const s = await computeStats(ctx, model, { period: monthPeriod('2026-03') });
  assert.equal(s.included.length, 7);
  const none = await computeStats(ctx, model, { period: monthPeriod('2026-02') });
  assert.equal(none.included.length, 0);
  assert.equal(inPeriod({ closeTime: '2026-03-04T22:30:00.000Z' }, ctx, { from: '2026-03-05', to: '2026-03-05' }), true, 'closes 00:30 on the 5th in Athens');
});

test('getSummary gives the dashboard its fields', async () => {
  const store = await seeded();
  const sum = await getSummary(viewCtx(store));
  assert.equal(sum.currency, 'USD');
  assert.equal(sum.closed, 7);
  assert.equal(sum.netMinor, core.expected.totalNetMinor);
  assert.equal(sum.periodLabel, 'March');
  assert.equal(sum.curve.points.length, 8);
  assert.equal(sum.winRate.n, 7);
  assert.equal(sum.expectancy.r.n, 6);
  assert.deepEqual(sum.counts, { open: 1, heldOut: 1, excluded: 0 });
  assert.equal(sum.recent.length, 3);
  assert.deepEqual(sum.recent.map((r) => r.instrument).length, 3);
  assert.ok(sum.drawdown.maxMinor > 0);
  assert.equal(typeof sum.drawdown.peakIndex, 'number');
  assert.equal(sum.exportDue.due, false);
  assert.ok(Array.isArray(sum.reconcileStates));
});

test('export then import into an empty install reproduces every figure (AC-P3.5)', async () => {
  const a = await seeded();
  const file = await buildExport(a, { now: '2026-09-29T10:00:00Z' });
  const parsed = parseExport(JSON.stringify(file));
  assert.equal(parsed.ok, true);
  const b = createMemoryStore();
  await mergeImport(b, parsed.data);
  const sa = await computeStats(viewCtx(a), await loadModel(a), { period: null });
  const sb = await computeStats(viewCtx(b), await loadModel(b), { period: null });
  const pick = (s) => ({ net: s.netMinor, per: s.included.map((t) => [t.id, s.money.get(t.id).netMinor, s.stats.rMultiple(t, s.sctx)]), win: s.winRate, pf: s.profitFactor, exp: s.expectancy, dd: s.drawdown, fees: s.feeTotals, streaks: s.streaks, hold: s.holding, cal: s.stats.calendar(s.included, { year: 2026, month: 3 }, s.sctx), buckets: ['setup', 'market', 'weekday', 'hour', 'session'].map((k) => s.stats.buckets(s.included, k, s.sctx)) });
  assert.deepEqual(pick(sb), pick(sa));
});
