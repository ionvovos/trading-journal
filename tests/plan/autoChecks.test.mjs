import test from 'node:test';
import assert from 'node:assert/strict';
import { autoChecks } from '../../src/ui/views/checklist.js';

const leg = (kind, time, price, size) => ({ id: `${kind}${time}`, kind, time, price, size, fee: '0', feeToAccount: 1, quoteToAccount: 1 });
const closed = (id, entryAt, exitAt, entry, exit) => ({ id, accountId: 'a', mode: 'real', side: 'long', contractSize: '1', legs: [leg('entry', entryAt, entry, '50'), leg('exit', exitAt, exit, '50')], initialStop: '98', closeTime: exitAt, holds: [], excluded: null });
const plan = { id: 'P', name: 'x', items: [], setups: [], hours: [{ from: '09:30', to: '11:30' }], dailyCap: 2, riskPct: null, dailyLossLimitPct: '2' };
const accounts = [{ id: 'a', baseCurrency: 'USD', startBalance: '10000' }];
const ny = 'America/New_York';

test('the pre-trade rows: hours now, trades so far today, loss so far today as a percent of equity', () => {
  const trades = [closed('l', '2026-09-07T13:35:00Z', '2026-09-07T14:00:00Z', '100', '96')]; // -200; equity at entry is 9,800
  const draft = { id: 'draft', accountId: 'a', mode: 'real', side: 'long', legs: [{ kind: 'entry', time: '2026-09-07T14:30:00Z', price: '1', size: '1' }] };
  const c = autoChecks(plan, draft, { trades, cash: [], accounts, tz: ny });
  assert.equal(c.auto.hours, 'pass', '10:30 New York');
  assert.equal(c.auto.dailyCap, 'pass');
  assert.equal(c.todayCount, 1);
  assert.equal(c.auto.dailyLossLimit, 'fail');
  assert.ok(Math.abs(c.lostPct - (-200 / 9800) * 100) < 1e-9, 'a percent of equity at entry, as the requirements define it');
});

test('a third trade of the day fails a cap of two, and the hours row fails outside the window', () => {
  const trades = [closed('a1', '2026-09-07T13:35:00Z', '2026-09-07T13:50:00Z', '100', '101'), closed('a2', '2026-09-07T14:00:00Z', '2026-09-07T14:10:00Z', '100', '101')];
  const draft = { id: 'draft', accountId: 'a', mode: 'real', side: 'long', legs: [{ kind: 'entry', time: '2026-09-07T18:00:00Z', price: '1', size: '1' }] };
  const c = autoChecks(plan, draft, { trades, cash: [], accounts, tz: ny });
  assert.equal(c.auto.dailyCap, 'fail');
  assert.equal(c.auto.hours, 'fail', '14:00 New York');
});

test('without a starting balance the loss limit is unknown and no percent is computed', () => {
  const c = autoChecks(plan, { id: 'draft', accountId: 'a', mode: 'real', side: 'long', legs: [{ kind: 'entry', time: '2026-09-07T14:30:00Z', price: '1', size: '1' }] }, { trades: [], cash: [], accounts: [{ id: 'a', baseCurrency: 'USD' }], tz: ny });
  assert.equal(c.auto.dailyLossLimit, 'unknown');
  assert.equal(c.lostPct, null);
});
