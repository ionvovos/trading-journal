import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcile, realisedTotal, reconcileQuantity, allocate, legRealised, findSubset, toleranceMinor, moneyCtx } from '../../src/import/reconcile.js';

const account = { id: 'acc', name: 'A', mode: 'real', baseCurrency: 'USD' };
const ctx = moneyCtx(account);
// stub for src/stats tradeMoney: trades carry their own net in `_net` (integration with stats runs in run.test.mjs)
const deps = { tradeMoney: (t) => (t._net === undefined || t._net === null ? null : { netMinor: t._net, recomputedNetMinor: t._net }) };

const leg = (id, kind, time, price, size, fee = '0', extra = {}) => ({ id, kind, time, zone: 'UTC', price, size, fee, feeCurrency: 'USD', feeToAccount: 1, quoteToAccount: 1, broker: null, source: {}, ...extra });
function trade(id, o) {
  return { id, accountId: 'acc', mode: 'real', market: 'stock', instrument: o.instrument ?? id, side: o.side ?? 'long', contractSize: '1', contractValue: null, legs: o.legs, holds: o.holds ?? [], excluded: o.excluded ?? null, dustRemainder: '0', broker: o.broker ?? null, entryUnknown: !!o.entryUnknown, closeTime: o.closeTime ?? null, _net: o.net };
}
const simple = (id, net, day, o = {}) => trade(id, { net, closeTime: `2026-03-${day}T15:00:00.000Z`, legs: [leg(`${id}a`, 'entry', `2026-03-${day}T10:00:00.000Z`, '10', '1'), leg(`${id}b`, 'exit', `2026-03-${day}T15:00:00.000Z`, '11', '1')], ...o });
const P = (from, to, zone = 'UTC') => ({ from, to, zone });

test('allocate: largest remainder, parts sum exactly to the total', () => {
  assert.deepEqual(allocate(100, ['1', '1', '1']), [34, 33, 33]);
  assert.deepEqual(allocate(-100, ['1', '1', '1']), [-34, -33, -33]);
  assert.deepEqual(allocate(9505, ['0.9995', '0.0005']).reduce((s, x) => s + x, 0), 9505);
  assert.deepEqual(allocate(10, ['1']), [10]);
  assert.deepEqual(allocate(7, ['0', '0']), [7, 0]);
  for (const total of [1, 99, -57, 12345]) assert.equal(allocate(total, ['0.1', '0.2', '0.7', '3']).reduce((s, x) => s + x, 0), total);
});

test('tolerance is 1 minor unit per closed trade, capped', () => {
  assert.equal(toleranceMinor({ closedTrades: 3, digits: 2 }), 3);
  assert.equal(toleranceMinor({ closedTrades: 500, digits: 2 }), 100);
  assert.equal(toleranceMinor({ closedTrades: 500, digits: 2, cap: '2.50' }), 250);
  assert.equal(toleranceMinor({ closedTrades: 0, digits: 2 }), 0);
  assert.equal(toleranceMinor({ closedTrades: 5, digits: 0, cap: '1.00' }), 1, 'JPY: 1 per trade, the cap is 1');
});

test('findSubset: smallest subset, at most 3, within tolerance', () => {
  const c = (n, a) => ({ cause: n, amountMinor: a });
  assert.deepEqual(findSubset([c('a', 500), c('b', 300), c('c', 200)], 500, 0).map((x) => x.cause), ['a']);
  assert.deepEqual(findSubset([c('a', 300), c('b', 200), c('c', 90)], 500, 0).map((x) => x.cause), ['a', 'b']);
  assert.deepEqual(findSubset([c('a', 300), c('b', 200)], 502, 3).map((x) => x.cause), ['a', 'b']);
  assert.equal(findSubset([c('a', 300), c('b', 200)], 700, 0), null);
  assert.equal(findSubset([c('a', 1), c('b', 2), c('c', 3), c('d', 4)], 10, 0), null, 'four items are not searched');
  assert.equal(findSubset([], 5, 0), null);
});

test('realised total: closed trades in the period, exit legs of open trades on their own line', () => {
  const closed = simple('c1', 20700, '02');
  const outside = simple('c2', 999, '20');
  const held = simple('h', 4900, '03', { holds: ['opened_before_file'] });
  const excluded = simple('x', 777, '03', { excluded: { by: 'user' } });
  const paperish = { ...simple('p', 555, '03'), mode: 'paper' };
  const other = { ...simple('o', 444, '03'), accountId: 'elsewhere' };
  const openTrade = trade('eth', { legs: [leg('e1', 'entry', '2026-03-04T21:00:00.000Z', '2400', '1', '2.40'), leg('e2', 'exit', '2026-03-05T01:00:00.000Z', '2500', '0.9995', '2.49875')] });
  const r = realisedTotal({ trades: [closed, outside, held, excluded, paperish, other, openTrade], accountId: 'acc', period: P('2026-03-02', '2026-03-09'), ctx, account }, deps);
  assert.equal(r.closedMinor, 20700);
  assert.equal(r.closedTrades, 1);
  assert.equal(r.openLegsMinor, 9505, 'gross 99.95 less the exit fee and entry fees 2.40 x 0.9995 = 95.05245');
  assert.deepEqual(r.openLegs, [{ tradeId: 'eth', legId: 'e2', amountMinor: 9505 }]);
});

test('legRealised uses the broker figure when stored', () => {
  const t = trade('x', { legs: [leg('a', 'entry', '2026-03-02T10:00:00Z', '10', '1'), leg('b', 'exit', '2026-03-02T11:00:00Z', '11', '1', '0', { broker: { realizedPnl: '0.85' } })] });
  assert.equal(legRealised(t, t.legs[1], 2), 85);
  const short = trade('s', { side: 'short', legs: [leg('a', 'entry', '2026-03-02T10:00:00Z', '200', '10', '1'), leg('b', 'exit', '2026-03-02T11:00:00Z', '190', '5', '1')] });
  assert.equal(legRealised(short, short.legs[1], 2), 4850, 'gross 50.00 less the exit fee 1.00 and half the entry fee 0.50');
});

test('a period is cut in its own zone', () => {
  const t = trade('k', { net: 879, closeTime: '2026-03-31T22:30:00.000Z', legs: [leg('a', 'entry', '2026-03-31T20:00:00.000Z', '60000', '0.1'), leg('b', 'exit', '2026-03-31T22:30:00.000Z', '60100', '0.1')] });
  const utc = realisedTotal({ trades: [t], accountId: 'acc', period: P('2026-03-01', '2026-03-31', 'UTC'), ctx, account }, deps);
  const athens = realisedTotal({ trades: [t], accountId: 'acc', period: P('2026-03-01', '2026-03-31', 'Europe/Athens'), ctx, account }, deps);
  assert.equal(utc.closedMinor, 879);
  assert.equal(athens.closedMinor, 0, '01:30 on 1 April in Athens');
});

test('matches within the tolerance and shows the exact difference (AC-A1.2)', () => {
  const trades = [simple('a', 3000, '05'), simple('b', 2000, '06'), simple('c', 1418, '07')];
  const same = reconcile({ trades, account, period: P('2026-03-05', '2026-03-09'), broker: { form: 'net_pnl', valueMinor: 6418 }, ctx }, deps);
  assert.equal(same.state, 'reconciled');
  assert.equal(same.differenceMinor, 0);
  const within = reconcile({ trades, account, period: P('2026-03-05', '2026-03-09'), broker: { form: 'net_pnl', valueMinor: 6419 }, ctx }, deps);
  assert.equal(within.state, 'reconciled');
  assert.equal(within.differenceMinor, 1);
  assert.equal(within.toleranceMinor, 3);
  const open = reconcile({ trades, account, period: P('2026-03-05', '2026-03-09'), broker: { form: 'net_pnl', valueMinor: 7000 }, ctx }, deps);
  assert.equal(open.state, 'difference_open');
  assert.equal(open.differenceMinor, 582);
  assert.deepEqual(open.explanations, []);
  assert.equal(open.unexplainedMinor, 582, 'unexplained difference of 5.82, nothing listed as the cause (AC-A3.2)');
});

test('a held-out trade that accounts for the difference is named with its amount', () => {
  const trades = [simple('a', 20700, '02'), simple('b', -12000, '03'), simple('c', 9800, '09'),
    trade('nvda', { instrument: 'NVDA', holds: ['opened_before_file'], broker: { netMinor: 4900 }, closeTime: '2026-03-06T15:00:00.000Z', legs: [leg('n1', 'exit', '2026-03-06T15:00:00.000Z', '111', '50')] })];
  const anomalies = [{ id: 'imp:opened_before_file', kind: 'opened_before_file', tradeIds: ['nvda'], answer: null }];
  const r = reconcile({ trades, account, period: P('2026-03-02', '2026-03-09'), broker: { form: 'net_pnl', valueMinor: 23400 }, ctx, anomalies }, deps);
  assert.equal(r.oursMinor, 18500);
  assert.equal(r.differenceMinor, 4900);
  assert.equal(r.state, 'difference_open');
  assert.equal(r.explanations.length, 1);
  assert.equal(r.explanations[0].cause, 'opened_before_file');
  assert.equal(r.explanations[0].amountMinor, 4900);
  assert.deepEqual(r.explanations[0].instruments, ['NVDA']);
  assert.equal(r.unexplainedMinor, 0);
  assert.equal(r.headerCount, 1);
  // after the user keeps the broker figure the trade is released and the check reconciles (AC-A3.3)
  const released = { ...trades[3], holds: [], entryUnknown: true };
  const after = reconcile({ trades: [...trades.slice(0, 3), released], account, period: P('2026-03-02', '2026-03-09'), broker: { form: 'net_pnl', valueMinor: 23400 }, ctx, anomalies }, deps);
  assert.equal(after.state, 'reconciled');
  assert.equal(after.oursMinor, 23400);
});

test('a missing fee is never fitted: needsInput, no amount, not counted in the header (V1-F1)', () => {
  const spy = trade('spy', { instrument: 'SPY', holds: ['missing_fee'], legs: [leg('s1', 'entry', '2026-03-11T14:40:00Z', '500', '10', null), leg('s2', 'exit', '2026-03-11T15:00:00Z', '505', '10', '1')], closeTime: '2026-03-11T15:00:00Z' });
  const ko = simple('ko', 0, '10');
  const r = reconcile({ trades: [ko, spy], account, period: P('2026-03-10', '2026-03-11', 'Europe/Athens'), broker: { form: 'net_pnl', valueMinor: 4700 }, ctx, anomalies: [{ id: 'imp:missing_fee', kind: 'missing_fee', tradeIds: ['spy'], answer: null }] }, deps);
  assert.equal(r.state, 'difference_open');
  assert.equal(r.differenceMinor, 4700);
  assert.deepEqual(r.explanations, []);
  assert.equal(r.unexplainedMinor, 4700);
  assert.equal(r.headerCount, 0);
  assert.equal(r.needsInput.length, 1);
  assert.equal(r.needsInput[0].cause, 'missing_fee');
  assert.deepEqual(r.needsInput[0].instruments, ['SPY']);
  assert.equal(r.needsInput[0].anomalyId, 'imp:missing_fee');
  assert.equal('amountMinor' in r.needsInput[0], false);
});

test('a duplicate kept by the user is named with a negative amount; a partial exit of an open trade too', () => {
  const btc1 = trade('btc1', { instrument: 'BTC/USD', net: 18972, closeTime: '2026-03-04T22:30:00.000Z', legs: [leg('a', 'entry', '2026-03-04T21:30:00.000Z', '60000', '0.0833'), leg('b', 'exit', '2026-03-04T22:30:00.000Z', '62400', '0.0833')] });
  const btc2 = { ...btc1, id: 'btc2', legs: btc1.legs.map((l) => ({ ...l, id: `${l.id}2` })) };
  const eth = trade('eth', { instrument: 'ETH/USD', legs: [leg('e1', 'entry', '2026-03-04T21:00:00.000Z', '2400', '1', '2.40'), leg('e2', 'exit', '2026-03-05T01:00:00.000Z', '2500', '0.9995', '2.49875')] });
  const anomalies = [{ id: 'imp2:near_duplicate', kind: 'near_duplicate', tradeIds: ['btc2'], answer: { optionId: 'keep_both' } }];
  const period = P('2026-03-04', '2026-03-05');
  const dup = reconcile({ trades: [btc1, btc2, eth], account, period, broker: { form: 'net_pnl', valueMinor: 28477 }, ctx, anomalies }, deps);
  assert.equal(dup.oursMinor, 47449);
  assert.equal(dup.closedMinor, 37944);
  assert.equal(dup.openLegsMinor, 9505);
  assert.equal(dup.differenceMinor, -18972);
  assert.deepEqual(dup.explanations.map((e) => [e.cause, e.amountMinor, e.instruments]), [['duplicate', -18972, ['BTC/USD']]]);
  const partial = reconcile({ trades: [btc1, eth], account, period, broker: { form: 'net_pnl', valueMinor: 18972 }, ctx }, deps);
  assert.equal(partial.differenceMinor, -9505);
  assert.deepEqual(partial.explanations.map((e) => [e.cause, e.amountMinor, e.instruments]), [['partial_exit_open', -9505, ['ETH/USD']]]);
  assert.equal(partial.unexplainedMinor, 0);
});

test('tz_edge: a trade closed on the other side of the period edge in the chosen zone is named', () => {
  const t = trade('k', { instrument: 'BTC/USD', net: 879, closeTime: '2026-03-31T22:30:00.000Z', legs: [leg('a', 'entry', '2026-03-31T20:00:00.000Z', '60000', '0.1'), leg('b', 'exit', '2026-03-31T22:30:00.000Z', '60100', '0.1')] });
  const anomalies = [{ id: 'imp:tz_edge', kind: 'tz_edge', tradeIds: ['k'], answer: { optionId: 'month_after' }, fileZone: 'UTC' }];
  const athens = reconcile({ trades: [t], account, period: P('2026-03-01', '2026-03-31', 'Europe/Athens'), broker: { form: 'net_pnl', valueMinor: 879 }, ctx, anomalies }, deps);
  assert.equal(athens.oursMinor, 0);
  assert.equal(athens.differenceMinor, 879);
  assert.deepEqual(athens.explanations.map((e) => [e.cause, e.amountMinor]), [['tz_edge', 879]]);
  const utc = reconcile({ trades: [t], account, period: P('2026-03-01', '2026-03-31', 'UTC'), broker: { form: 'net_pnl', valueMinor: 879 }, ctx, anomalies }, deps);
  assert.equal(utc.state, 'reconciled');
});

test('balance form (AC-A1.4) and cash items outside trades', () => {
  const trades = [simple('t', 22000, '05')];
  const broker = { form: 'balance', startMinor: 1000000, endMinor: 1042000, depositsMinor: 20000, withdrawalsMinor: 0, otherMinor: 0, noOpenPositionsConfirmed: true };
  const period = P('2026-03-01', '2026-03-31');
  const ok = reconcile({ trades, account, period, broker, ctx }, deps);
  assert.equal(ok.brokerMinor, 22000);
  assert.equal(ok.state, 'reconciled');
  const cash = [{ id: 'c1', accountId: 'acc', kind: 'deposit', amountMinor: 20000, time: '2026-03-02' }, { id: 'c2', accountId: 'acc', kind: 'other', amountMinor: 500, time: '2026-03-15' }];
  const interest = reconcile({ trades, cash, account, period, broker: { ...broker, endMinor: 1042500 }, ctx }, deps);
  assert.equal(interest.differenceMinor, 500);
  assert.deepEqual(interest.explanations.map((e) => [e.cause, e.cashIds, e.amountMinor]), [['cash_items', ['c2'], 500]]);
  assert.equal(interest.unexplainedMinor, 0);
  const noneStored = reconcile({ trades, account, period, broker: { ...broker, endMinor: 1042500 }, ctx }, deps);
  assert.equal(noneStored.unexplainedMinor, 500);
  assert.equal(noneStored.balanceHint, 'cash_items', 'names cash items outside trades as a category to check, without an amount');
  assert.throws(() => reconcile({ trades, account, period, broker: { ...broker, noOpenPositionsConfirmed: false }, ctx }, deps), (e) => e.code === 'reconcile.balance.confirmNoOpenPositions');
  const wd = reconcile({ trades, account, period, broker: { ...broker, endMinor: 1040000, depositsMinor: 0, withdrawalsMinor: 0, otherMinor: -2000 }, ctx }, deps);
  assert.equal(wd.brokerMinor, 1040000 - 1000000 + 2000);
});

test('hand-entered period with a zero broker figure reconciles (AC-A1.1)', () => {
  const r = reconcile({ trades: [], account, period: P('2026-03-10', '2026-03-10', 'Europe/Athens'), broker: { form: 'net_pnl', valueMinor: 0 }, ctx }, deps);
  assert.equal(r.state, 'reconciled');
  assert.equal(r.toleranceMinor, 0);
});

test('paper accounts never reconcile (AC-P4.4)', () => {
  assert.throws(() => reconcile({ trades: [], account: { ...account, mode: 'paper' }, period: P('2026-03-01', '2026-03-31'), broker: { form: 'net_pnl', valueMinor: 0 }, ctx }, deps), (e) => e.code === 'reconcile.paper');
});

test('quantity form: fees deducted in the asset explain the gap (AC-A1.5)', () => {
  const f = (key, side, size, price, fee) => ({ key, instrument: 'BTC/USD', side, size, price, fee, feeCurrency: 'USD' });
  const fills = [f('kraken:1', 'buy', '0.3', '60000', '18'), f('kraken:2', 'buy', '0.2', '60000', '12'), f('kraken:3', 'sell', '0.2', '61000', '0')];
  const r = reconcileQuantity({ fills, asset: 'BTC', startQty: '0', brokerQty: '0.2995' });
  assert.equal(r.impliedQty, '0.3');
  assert.equal(r.differenceQty, '-0.0005');
  assert.equal(r.state, 'difference_open');
  assert.equal(r.explanations.length, 1);
  assert.equal(r.explanations[0].cause, 'fee_in_asset');
  assert.deepEqual(r.explanations[0].fillKeys, ['kraken:1', 'kraken:2']);
  assert.equal(r.explanations[0].qty, '-0.0005');
  assert.equal(r.unexplainedQty, '0');
  assert.equal(reconcileQuantity({ fills, asset: 'BTC', brokerQty: '0.3' }).state, 'reconciled');
  const none = reconcileQuantity({ fills, asset: 'BTC', brokerQty: '0.29' });
  assert.deepEqual(none.explanations, []);
  assert.equal(none.unexplainedQty, '-0.01');
  const transfer = reconcileQuantity({ fills, cash: [{ id: 'w1', kind: 'withdrawal', amount: '0.1', currency: 'BTC' }], asset: 'BTC', brokerQty: '0.2' });
  assert.equal(transfer.impliedQty, '0.2', 'a stored withdrawal lowers the implied quantity');
  assert.equal(transfer.state, 'reconciled');
});

test('quantity form: a quote-side asset and a fee charged in the asset', () => {
  const fills = [{ key: 'k1', instrument: 'ETH/BTC', side: 'buy', size: '2', price: '0.05', fee: '0.0001', feeCurrency: 'BTC' }];
  const r = reconcileQuantity({ fills, asset: 'BTC', startQty: '1', brokerQty: '0.8999' });
  assert.equal(r.impliedQty, '0.8999', '1 - 2 x 0.05 - fee');
  assert.equal(r.state, 'reconciled');
});
