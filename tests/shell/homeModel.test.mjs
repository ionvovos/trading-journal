// buildHomeModel: turns getSummary output into what the dashboard shows. Pure, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHomeModel } from '../../src/ui/views/home.js';
import { createFormat } from '../../src/i18n/format.js';

const fmt = createFormat({ lang: 'en', tz: 'Europe/Athens', navLang: 'en-GB' });
const base = { mode: 'real', fmt, ccy: 'USD', now: new Date('2026-09-29T12:00:00Z') };

const summary = {
  currency: 'USD', netMinor: 128460, closed: 38,
  curve: [{ t: '2026-09-01T12:00:00Z', v: 12500 }, { t: '2026-09-29T12:00:00Z', v: 13784.6 }],
  expectancy: { r: { value: 0.16, n: 35, rMissing: 3 } }, winRate: { value: 18 / 38, wins: 18, n: 38 },
  drawdown: { maxMinor: 84230, maxPct: 0.061 }, counts: { open: 2, heldOut: 1, excluded: 0 },
  reconcileStates: [{ accountId: 'a', accountName: 'IBKR', state: 'difference', differenceMinor: 4030 }, { accountId: 'b', state: 'reconciled' }],
  recent: [1, 2, 3, 4, 5].map((i) => ({ id: `t${i}`, instrument: 'AAPL', netMinor: i })),
};

test('fractions become percentages once, and the counts and states pass through', () => {
  const m = buildHomeModel(summary, base);
  assert.equal(m.closed, 38); assert.equal(m.netMinor, 128460); assert.equal(m.empty, false);
  assert.ok(Math.abs(m.winRate.value - 47.368) < 0.01); assert.ok(Math.abs(m.drawdown.pct - 6.1) < 1e-9);
  assert.deepEqual(m.counts, { open: 2, heldOut: 1, excluded: 0 });
  assert.equal(m.differences.length, 1); assert.equal(m.differences[0].accountName, 'IBKR');
  assert.equal(m.states[1].state, 'reconciled'); assert.equal(m.recent.length, 3);
  assert.equal(m.period, 'September');
});

test('the curve can arrive as points with equityMinor (the stats shape) and needs two points to draw', () => {
  const m = buildHomeModel({ ...summary, curve: { points: [{ t: 'x', equityMinor: 1250000 }, { t: 'y', equityMinor: 1378460 }] } }, base);
  assert.deepEqual(m.points.map((p) => p.v), [12500, 13784.6]);
  assert.deepEqual(buildHomeModel({ ...summary, curve: [{ t: 'x', v: 1 }] }, base).points, [], 'a single point is not a chart');
});

test('an absent field stays null, never a guess', () => {
  const m = buildHomeModel({ currency: 'EUR', netMinor: 0, closed: 3 }, { ...base, ccy: 'EUR' });
  assert.equal(m.expectancy, null); assert.equal(m.winRate, null); assert.equal(m.drawdown, null); assert.equal(m.followed, null);
  assert.deepEqual(m.states, []); assert.deepEqual(m.recent, []); assert.equal(m.currency, 'EUR');
});

test('no closed trades and none open means the empty state, never a chart (AC-U1.2)', () => {
  assert.equal(buildHomeModel({ closed: 0, counts: { open: 0 } }, base).empty, true);
  assert.equal(buildHomeModel(undefined, base).empty, true);
  assert.equal(buildHomeModel({ closed: 0, counts: { open: 2 } }, base).empty, false);
  assert.deepEqual(buildHomeModel({ closed: 0 }, base).points, []);
});

test('paper mode keeps the plan-following figure', () => {
  const m = buildHomeModel({ closed: 6, followed: { followed: 6, marked: 6 } }, { ...base, mode: 'paper' });
  assert.deepEqual(m.followed, { followed: 6, marked: 6 }); assert.equal(m.mode, 'paper');
});
