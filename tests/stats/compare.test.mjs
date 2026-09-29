import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareModes, equityAtEntry } from '../../src/stats/index.js';
import { core } from './helpers.mjs';

const { ctx, trades } = core;
const ctxByMode = { real: { ...ctx, mode: 'real' }, paper: { ...ctx, mode: 'paper' } };
const byId = Object.fromEntries(trades.map((t) => [t.id, t]));

test('compareModes: both modes over 2-11 March', () => {
  const c = compareModes(trades, { from: '2026-03-02', to: '2026-03-11' }, ctxByMode);
  assert.equal(c.missing, null);
  assert.equal(c.real.n, 7);
  assert.deepEqual(c.real.tradeIds, ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']);
  assert.equal(c.paper.n, 1);
  assert.deepEqual(c.paper.tradeIds, ['T10']);
  assert.equal(c.real.ruleFollowing.followed, 4);
  assert.equal(c.real.ruleFollowing.marked, 6);
  assert.equal(c.paper.ruleFollowing.value, 1);
  assert.equal(c.real.tradesPerDay.days, 7);
  assert.equal(c.real.afterLoss.count, 0);
  assert.equal(c.real.riskPctAtEntry.n, 6);
  assert.equal(c.paper.riskPctAtEntry.n, 1);
  // T10: risk 0.005 x 0.1 x 100000 = 50 on 10,000 equity = 0.5 %
  assert.ok(Math.abs(c.paper.riskPctAtEntry.value - 0.5) <= 1e-9);
});

test('compareModes: paper missing over 2-10 March', () => {
  const c = compareModes(trades, { from: '2026-03-02', to: '2026-03-10' }, ctxByMode);
  assert.equal(c.missing, 'paper');
  assert.equal(c.paper.n, 0);
  assert.equal(c.real.n, 7);
});

test('compareModes: entries within the window of a losing close', () => {
  const late = { ...byId.T3, id: 'Tq', legs: byId.T3.legs.map((l) => ({ ...l, time: l.kind === 'entry' ? '2026-03-03T15:30:00Z' : '2026-03-03T16:00:00Z' })), closeTime: '2026-03-03T16:00:00Z' };
  const c = compareModes([...trades, late], { from: '2026-03-02', to: '2026-03-11', lossWindowMin: 30 }, ctxByMode);
  assert.deepEqual(c.real.afterLoss.tradeIds, ['Tq']);
  const c10 = compareModes([...trades, late], { from: '2026-03-02', to: '2026-03-11', lossWindowMin: 10 }, ctxByMode);
  assert.deepEqual(c10.real.afterLoss.tradeIds, []);
});

test('equityAtEntry: start + earlier closes + cash, null without a start balance', () => {
  const c = { ...ctx, trades, cash: [{ accountId: 'acc-ibkr', time: '2026-03-01T00:00:00Z', kind: 'withdrawal', amount: '100', currency: 'USD' }] };
  assert.equal(equityAtEntry(byId.T6, c), 400000 + 20700 - 12000 - 10000);
  assert.equal(equityAtEntry(byId.T1, c), 400000 - 10000);
  const none = { ...c, accounts: { ...ctx.accounts, 'acc-ibkr': { ...ctx.accounts['acc-ibkr'], startBalance: null } } };
  assert.equal(equityAtEntry(byId.T6, none), null);
});
