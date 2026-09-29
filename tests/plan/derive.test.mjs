import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tradeMoney, initialRisk, rMultiple, holdSeconds, isClosed, averageEntry, averageExit, equityAtEntry } from '../../src/plan/derive.js';

const core = JSON.parse(readFileSync(new URL('../fixtures/stats/core.json', import.meta.url), 'utf8'));
const trades = Object.fromEntries(core.trades.map((t) => [t.id, t]));

// The same hand-computed fixture the statistics engine is tested against: the two implementations cannot drift apart silently.
for (const [id, want] of Object.entries(core.expected.perTrade)) {
  test(`derive matches the hand-computed fixture for ${id}`, () => {
    const t = trades[id];
    assert.equal(isClosed(t), true);
    const money = tradeMoney(t, { digits: 2 });
    assert.equal(money.netMinor, want.netMinor, 'net');
    assert.equal(money.grossMinor, want.grossMinor, 'gross');
    assert.equal(money.feesMinor, want.feesMinor, 'fees');
    assert.equal(money.source, want.source);
    const risk = initialRisk(t);
    assert.equal(risk.reason, want.riskReason);
    if (want.initialRisk === null) assert.equal(risk.value, null);
    else assert.ok(Math.abs(risk.value - want.initialRisk) < 1e-6, `risk ${risk.value} vs ${want.initialRisk}`);
    const r = rMultiple(t, { digits: 2 });
    if (want.r === null) assert.equal(r, null);
    else assert.ok(Math.abs(r - want.r) < 1e-6, `R ${r} vs ${want.r}`);
    assert.ok(Math.abs(averageEntry(t) - want.avgEntry) < 1e-6);
    assert.ok(Math.abs(averageExit(t) - want.avgExit) < 1e-9);
  });
}

test('an open trade has no money and no R', () => {
  assert.equal(isClosed(trades.T8), false);
  assert.equal(tradeMoney(trades.T8), null);
  assert.equal(rMultiple(trades.T8), null);
});

test('holding time from the first entry to the close (S18 fixture)', () => {
  assert.equal(holdSeconds(trades.T1), 21000);
  assert.equal(holdSeconds(trades.T2), 2400);
  assert.equal(holdSeconds(trades.T5), 7200);
});

test('a stop on the profit side or at the entry gives unknown risk with the reason', () => {
  const t = structuredClone(trades.T1);
  t.initialStop = '60';
  assert.deepEqual(initialRisk(t), { value: null, reason: 'stop_profit_side' });
  t.initialStop = '50';
  assert.equal(initialRisk(t).reason, 'stop_at_entry');
});

test('equity at entry: start balance plus counted trades closed before the entry plus cash', () => {
  const acc = { id: 'acc-ibkr', startBalance: '4000' };
  const t2 = trades.T2;
  assert.equal(equityAtEntry(t2, { account: acc, trades: core.trades, digits: 2 }), 4000 + 207);
  assert.equal(equityAtEntry(t2, { account: acc, trades: core.trades, digits: 2, cash: [{ accountId: 'acc-ibkr', time: '2026-03-03T00:00:00Z', kind: 'deposit', amount: '100' }] }), 4307);
  assert.equal(equityAtEntry(t2, { account: { id: 'acc-ibkr' }, trades: core.trades }), null, 'no starting balance, no percent');
});
