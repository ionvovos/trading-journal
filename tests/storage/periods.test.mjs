import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodsFor, byUrgency, monthRange, periodLabel, shiftPeriod } from '../../src/storage/periods.js';
import { createFormat } from '../../src/i18n/format.js';

const leg = (id, kind, time) => ({ id, kind, time, price: '10', size: '1', fee: '0' });
const manual = (id, accountId, close) => ({ id, accountId, entry: 'manual', holds: [], closeTime: close, legs: [leg(`${id}a`, 'entry', close.replace('T15', 'T10')), leg(`${id}b`, 'exit', close)], dustRemainder: '0' });
const model = (o = {}) => ({
  accounts: [{ id: 'ib', name: 'IBKR', mode: 'real' }, { id: 'kr', name: 'Kraken', mode: 'real' }, { id: 'pp', name: 'Paper', mode: 'paper' }],
  trades: [], imports: [], reconciliations: [], ...o,
});

test('an import period appears per account with the state left on it', () => {
  const m = model({
    imports: [
      { id: 'i1', accountId: 'ib', status: 'open', effectiveZone: 'America/New_York', report: { period: { from: '2026-03-02', to: '2026-03-09', zone: 'America/New_York' } } },
      { id: 'i2', accountId: 'kr', status: 'open', report: { period: { from: '2026-03-04', to: '2026-03-05', zone: 'UTC' } } },
      { id: 'i3', accountId: 'kr', status: 'cancelled', report: { period: { from: '2026-01-01', to: '2026-01-02', zone: 'UTC' } } },
      { id: 'i4', accountId: 'pp', status: 'open', report: { period: { from: '2026-03-04', to: '2026-03-05', zone: 'UTC' } } },
    ],
    reconciliations: [{ id: 'ib:2026-03-02:2026-03-09', accountId: 'ib', state: 'difference', from: '2026-03-02', to: '2026-03-09' }],
  });
  const list = periodsFor(m);
  assert.deepEqual(list.map((p) => [p.accountName, p.state, p.importId]), [['IBKR', 'difference', 'i1'], ['Kraken', 'not_asked', 'i2']]);
  assert.equal(list[0].period.zone, 'America/New_York');
  assert.equal(list[0].record.state, 'difference');
});

test('hand-entered trades give their recent months; older months and held trades do not', () => {
  const m = model({ trades: [
    manual('a', 'ib', '2026-03-10T15:00:00.000Z'), manual('b', 'ib', '2026-02-10T15:00:00.000Z'), manual('c', 'ib', '2025-11-10T15:00:00.000Z'),
    { ...manual('d', 'ib', '2026-04-10T15:00:00.000Z'), holds: ['x'] }, { ...manual('e', 'ib', '2026-04-11T15:00:00.000Z'), entry: 'import' },
    { ...manual('f', 'pp', '2026-03-10T15:00:00.000Z') },
  ] });
  const list = periodsFor(m, { tz: 'Europe/Athens', months: 2 });
  assert.deepEqual(list.map((p) => `${p.accountName} ${p.period.from}..${p.period.to}`), ['IBKR 2026-03-01..2026-03-31', 'IBKR 2026-02-01..2026-02-28']);
  assert.equal(list[0].period.zone, 'Europe/Athens');
});

test('a period typed on the dashboard stays listed; quantity records do not appear as periods', () => {
  const m = model({ reconciliations: [
    { id: 'ib:2026-03-01:2026-03-15', accountId: 'ib', state: 'skipped', from: '2026-03-01', to: '2026-03-15', zone: 'UTC' },
    { id: 'kr:qty:BTC', accountId: 'kr', state: 'reconciled', form: 'quantity' },
  ] });
  const list = periodsFor(m);
  assert.deepEqual(list.map((p) => [p.accountName, p.state]), [['IBKR', 'skipped']]);
});

test('urgency order: difference, not asked, skipped, reconciled', () => {
  const l = [{ state: 'reconciled', period: { to: 'b' } }, { state: 'skipped', period: { to: 'b' } }, { state: 'not_asked', period: { to: 'b' } }, { state: 'difference', period: { to: 'a' } }];
  assert.deepEqual(byUrgency(l).map((x) => x.state), ['difference', 'not_asked', 'skipped', 'reconciled']);
});

test('month range, label and shift', () => {
  assert.deepEqual(monthRange('2026-02'), { from: '2026-02-01', to: '2026-02-28' });
  assert.deepEqual(monthRange('2028-02'), { from: '2028-02-01', to: '2028-02-29' });
  const fmt = createFormat({ lang: 'en', tz: 'UTC' });
  assert.equal(periodLabel({ from: '2026-03-01', to: '2026-03-31' }, fmt), 'Mar 2026');
  assert.equal(periodLabel({ from: '2026-03-02', to: '2026-03-09' }, fmt), '2 Mar – 9 Mar 2026');
  assert.deepEqual(shiftPeriod({ from: '2026-03-01', to: '2026-03-05', zone: 'UTC' }, 7), { from: '2026-03-08', to: '2026-03-12', zone: 'UTC' });
});
