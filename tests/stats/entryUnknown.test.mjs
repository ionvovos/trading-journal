// A trade whose opening lies before the imported file and whose result the person kept from the broker (import answer
// keep_broker_pnl) is a closed trade with the broker's net, no gross split and R unknown (AC-A2.3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isClosedTrade, tradeMoney, rMultiple, grossPnl, closedSet, buckets, holdingTime, equityCurve, explain } from '../../src/stats/index.js';
import { firstEntry } from '../../src/stats/trade.js';

const ctx = { mode: 'real', accountIds: 'all', displayCurrency: 'USD', tz: 'Europe/Athens', dayCutoffHour: 0, smallSampleMin: 30, accounts: { a: { mode: 'real', baseCurrency: 'USD', startBalance: '1000', toDisplayRate: 1 } }, cash: [] };
const trade = (o = {}) => ({ id: 'n', accountId: 'a', mode: 'real', market: 'stock', instrument: 'NVDA', side: 'long', contractSize: '1', quoteCurrency: 'USD', holds: [], excluded: null, dustRemainder: '0', initialStop: null, funding: 0, entryUnknown: true, broker: { netMinor: 4900, source: 'ibkr' }, closeTime: '2026-03-06T15:00:00.000Z',
  legs: [{ id: 'x', kind: 'exit', time: '2026-03-06T15:00:00.000Z', price: '111', size: '50', fee: '1', feeToAccount: 1, quoteToAccount: 1, broker: { realizedPnl: '49' } }], ...o });

test('closed by the broker figure, net is the broker net, R unknown', () => {
  const t = trade();
  assert.equal(isClosedTrade(t), true);
  assert.equal(grossPnl(t), null);
  assert.deepEqual(tradeMoney(t, ctx), { grossMinor: 4900, feesMinor: 0, fundingMinor: 0, netMinor: 4900, recomputedNetMinor: null, source: 'broker' });
  assert.equal(rMultiple(t, ctx), null);
  assert.equal(firstEntry(t).id, 'x');
});

test('without the broker figure, or without the flag, it stays open', () => {
  assert.equal(isClosedTrade(trade({ broker: null })), false);
  assert.equal(isClosedTrade(trade({ entryUnknown: false })), false);
});

test('it enters the statistics: set, buckets, holding time, curve, explain', () => {
  const t = trade();
  const set = closedSet([t], { mode: 'real' });
  assert.deepEqual(set.included.map((x) => x.id), ['n']);
  assert.equal(buckets(set, 'hour', ctx)[0].netMinor, 4900);
  assert.equal(buckets(set, 'weekday', ctx)[0].n, 1);
  assert.equal(holdingTime(set, ctx).winners.avgSeconds, 0);
  assert.equal(equityCurve(set, ctx).points.at(-1).equityMinor, 100000 + 4900);
  const ex = explain('S9', set, ctx);
  assert.deepEqual(ex.excluded.map((e) => e.reason), ['r_missing']);
});
