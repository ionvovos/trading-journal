import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePlan, normalizePlan, emptyPlan, ruleFollowing, checklistResult, sameDayBefore, hasRules } from '../../src/plan/check.js';

const leg = (kind, time, price, size, fee = '0') => ({ id: `${kind}-${time}`, kind, time, price, size, fee, feeToAccount: 1, quoteToAccount: 1 });
const trade = (id, entryAt, exitAt, entry, exit, over = {}) => ({
  id, accountId: 'a', mode: 'real', side: 'long', contractSize: '1', legs: [leg('entry', entryAt, entry, '50'), leg('exit', exitAt, exit, '50')],
  initialStop: '98', setup: 'breakout', closeTime: exitAt, holds: [], excluded: null, ...over,
});
const plan = { id: 'P', items: [{ id: 'i1', text: 'x' }], setups: ['breakout'], hours: [{ from: '09:30', to: '11:30' }], dailyCap: 2, riskPct: '1', dailyLossLimitPct: '2' };
const ny = 'America/New_York';

test('each check the code can decide, pass and fail (AC-P2.3)', () => {
  const ok = trade('t', '2026-09-07T13:45:00Z', '2026-09-07T15:00:00Z', '100', '104');
  const good = evaluatePlan(ok, plan, { sameDayTrades: [], equityAtEntryMinor: 1000000, tz: ny });
  assert.deepEqual(good.auto, { hours: 'pass', dailyCap: 'pass', risk: 'pass', dailyLossLimit: 'pass', stop: 'pass', setup: 'pass' });
  assert.equal(good.suggestedFollowed, true);

  const late = trade('t', '2026-09-07T17:00:00Z', '2026-09-07T18:00:00Z', '100', '104', { initialStop: null, setup: 'fade' });
  const bad = evaluatePlan(late, plan, { sameDayTrades: [{}, {}], equityAtEntryMinor: 1000000, tz: ny });
  assert.equal(bad.auto.hours, 'fail');
  assert.equal(bad.auto.dailyCap, 'fail', 'third trade of the day with a cap of 2');
  assert.equal(bad.auto.stop, 'fail');
  assert.equal(bad.auto.setup, 'fail');
  assert.equal(bad.suggestedFollowed, false);
});

test('risk above the plan percent fails, at the percent passes', () => {
  const t = trade('t', '2026-09-07T13:45:00Z', '2026-09-07T15:00:00Z', '100', '104'); // risk 100
  assert.equal(evaluatePlan(t, plan, { equityAtEntryMinor: 1000000, tz: ny }).auto.risk, 'pass', '100 / 10,000.00 = 1.0%');
  assert.equal(evaluatePlan(t, plan, { equityAtEntryMinor: 900000, tz: ny }).auto.risk, 'fail', '100 / 9,000 = 1.11%');
});

test('daily loss limit: closed loss of the day before the entry at or beyond the limit fails', () => {
  const loss = trade('l', '2026-09-07T13:35:00Z', '2026-09-07T14:00:00Z', '100', '96'); // -200 on 10,000 = 2%
  const t = trade('t', '2026-09-07T14:30:00Z', '2026-09-07T15:00:00Z', '100', '104');
  assert.equal(evaluatePlan(t, plan, { sameDayTrades: [loss], equityAtEntryMinor: 1000000, tz: ny }).auto.dailyLossLimit, 'fail');
  const small = trade('l', '2026-09-07T13:35:00Z', '2026-09-07T14:00:00Z', '100', '98'); // -100 = 1%
  assert.equal(evaluatePlan(t, plan, { sameDayTrades: [small], equityAtEntryMinor: 1000000, tz: ny }).auto.dailyLossLimit, 'pass');
  const notYet = trade('l', '2026-09-07T13:35:00Z', '2026-09-07T15:30:00Z', '100', '96'); // closes after the entry
  assert.equal(evaluatePlan(t, plan, { sameDayTrades: [notYet], equityAtEntryMinor: 1000000, tz: ny }).auto.dailyLossLimit, 'pass');
});

test('without a starting balance risk and loss limit are unknown, never computed', () => {
  const t = trade('t', '2026-09-07T13:45:00Z', '2026-09-07T15:00:00Z', '100', '104');
  const r = evaluatePlan(t, plan, { equityAtEntryMinor: null, tz: ny });
  assert.equal(r.auto.risk, 'unknown');
  assert.equal(r.auto.dailyLossLimit, 'unknown');
});

test('a rule the plan does not have gives no key; no plan gives nothing', () => {
  const t = trade('t', '2026-09-07T13:45:00Z', '2026-09-07T15:00:00Z', '100', '104');
  assert.deepEqual(Object.keys(evaluatePlan(t, { id: 'P', items: [] }, {}).auto), ['stop']);
  assert.deepEqual(evaluatePlan(t, null, {}), { auto: {}, suggestedFollowed: null });
});

test('sameDayBefore: earlier trades of the same local day and mode only', () => {
  const a = trade('a', '2026-09-07T13:45:00Z', '2026-09-07T14:00:00Z', '1', '1');
  const b = trade('b', '2026-09-07T15:00:00Z', '2026-09-07T16:00:00Z', '1', '1');
  const other = trade('c', '2026-09-08T13:45:00Z', '2026-09-08T14:00:00Z', '1', '1');
  const paper = { ...trade('d', '2026-09-07T13:00:00Z', '2026-09-07T14:00:00Z', '1', '1'), mode: 'paper' };
  assert.deepEqual(sameDayBefore(b, [a, b, other, paper], ny).map((x) => x.id), ['a']);
});

test('the plan has no default for risk per trade, daily loss limit, stop distance or size (AC-P2.1)', () => {
  const p = emptyPlan('p1');
  assert.equal(p.riskPct, null);
  assert.equal(p.dailyLossLimitPct, null);
  assert.equal(p.dailyCap, null);
  assert.equal(hasRules(p), false);
  const n = normalizePlan({ id: 'p1', name: ' x ', items: [{ text: ' a ' }, { text: ' ' }], setups: ['a', 'a', ' '], hours: [{ from: '9:30', to: '11:00' }, { from: 'x', to: 'y' }], dailyCap: '3', riskPct: '', dailyLossLimitPct: '0' });
  assert.deepEqual(n.items, [{ id: 'i1', text: 'a' }]);
  assert.deepEqual(n.setups, ['a']);
  assert.equal(n.hours.length, 1);
  assert.equal(n.dailyCap, 3);
  assert.equal(n.riskPct, null);
  assert.equal(n.dailyLossLimitPct, null);
  assert.equal(hasRules(n), true);
});

test('rule-following rate: followed over marked, unmarked counted beside it (AC-P2.4)', () => {
  const t = (id, followed) => ({ id, plan: { followed } });
  const r = ruleFollowing([t('a', true), t('b', true), t('c', false), t('d', null), { id: 'e' }]);
  assert.equal(r.value, 2 / 3);
  assert.deepEqual([r.followed, r.marked, r.unmarked], [2, 3, 2]);
  assert.deepEqual(r.tradeIds, ['a', 'b', 'c']);
  assert.equal(ruleFollowing([]).value, null);
});

test('checklist: ticks, left items and a skipped step; skipping never blocks (AC-P2.2)', () => {
  const p = { id: 'P', items: [{ id: 'i1', text: 'a' }, { id: 'i2', text: 'b' }] };
  assert.deepEqual(checklistResult(p, { i1: true }), { planId: 'P', skipped: false, items: { i1: true, i2: null }, ticked: 1, total: 2 });
  assert.deepEqual(checklistResult(p, { i1: true }, true), { planId: 'P', skipped: true, items: { i1: null, i2: null }, ticked: 0, total: 2 });
});
