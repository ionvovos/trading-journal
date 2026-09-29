import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closedSet, expectancy, equityCurve, drawdown, displayMinor } from '../../src/stats/index.js';
import { core, close } from './helpers.mjs';

const { ctx, trades, expected } = core;
const set = closedSet(trades, ctx);

test('S9 expectancy in R and money', () => {
  const e = expectancy(set, ctx);
  close(e.r.value, expected.S9.r.value, 'r.value');
  close(e.r.byParts, expected.S9.r.byParts, 'r.byParts');
  assert.equal(e.r.n, expected.S9.r.n);
  assert.equal(e.r.rMissing, expected.S9.r.rMissing);
  assert.ok(Math.abs(e.r.value - e.r.byParts) <= 1e-9);
  assert.equal(e.money.valueMinor, expected.S9.moneyMinor.value);
  assert.equal(e.money.n, expected.S9.moneyMinor.n);
  assert.equal(e.smallSample, expected.S9.smallSample);
});

test('total net of the set', () => {
  assert.equal(set.included.reduce((s, t) => s + displayMinor(t, ctx), 0), expected.totalNetMinor);
});

test('S10 equity curve: start balances in view, one point per close, no cash points', () => {
  const c = equityCurve(set, ctx);
  assert.deepEqual(c.points, expected.S10.points);
  assert.equal(c.startBalanceKnown, true);
  const withCash = equityCurve(set, { ...ctx, cash: [{ accountId: 'acc-ibkr', time: '2026-03-03T00:00:00Z', kind: 'deposit', amount: '500', currency: 'USD' }] });
  assert.deepEqual(withCash.points, expected.S10.points);
});

test('S11 drawdown', () => {
  const d = drawdown(equityCurve(set, ctx), { cash: [] });
  const e = expected.S11;
  assert.equal(d.maxMinor, e.maxMinor);
  close(d.maxPct, e.maxPct, 'maxPct');
  for (const k of ['peak', 'trough', 'recovery']) {
    assert.equal(d[k].t, e[k].t, `${k}.t`);
    assert.equal(d[k].tradeId, e[k].tradeId, `${k}.tradeId`);
    assert.equal(d[k].equityMinor, e[k].equityMinor, `${k}.equityMinor`);
  }
  assert.equal(d.currentMinor, e.currentMinor);
  close(d.currentPct, e.currentPct, 'currentPct');
  close(d.recoveryGainPct, e.recoveryGainPct, 'recoveryGainPct');
  assert.equal(d.note, e.note);
});

test('S11 percent is absent without a starting balance', () => {
  const accounts = Object.fromEntries(Object.entries(ctx.accounts).map(([k, v]) => [k, { ...v, startBalance: null }]));
  const d = drawdown(equityCurve(set, { ...ctx, accounts }));
  assert.equal(d.maxMinor, 12000);
  assert.equal(d.maxPct, null);
  assert.equal(d.recoveryGainPct, null);
});
