import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupFills, legsAsFills, collectExistingKeys, isCloseBySource } from '../../src/import/group.js';
import { averagePrice, positionSize, tradeStatus, isClosed } from '../../src/core/trade.js';
import * as D from '../../src/core/decimal.js';

const account = { id: 'acc', baseCurrency: 'USD' };
const base = { account, importId: 'imp1', declaredZone: 'Europe/Athens', fileZone: 'UTC', now: '2026-09-29T00:00:00.000Z' };

let n = 0;
function fill(o) {
  n++;
  return {
    key: o.key ?? `k:${n}`, time: o.time, instrument: o.instrument ?? 'AAPL', market: o.market ?? 'stock', side: o.side,
    size: o.size, price: o.price, fee: o.fee === undefined ? '1' : o.fee, feeCurrency: o.feeCurrency ?? 'USD', quoteCurrency: o.quoteCurrency ?? 'USD',
    contractSize: '1', positionId: o.positionId ?? null, openClose: o.openClose ?? null, broker: o.broker ?? null,
    stop: o.stop ?? null, stopSource: o.stop ? 'file_initial' : null, target: null, quoteToAccount: o.quoteToAccount ?? null, setup: o.setup ?? null, notes: o.notes ?? null, row: o.row ?? n,
  };
}
const T = (h, m = 0) => `2026-03-02T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`;

// gross - fees + funding in minor units, the way stats does it for these plain USD fixtures
const money = (t) => {
  const entries = t.legs.filter((l) => l.kind === 'entry');
  const exits = t.legs.filter((l) => l.kind === 'exit');
  const es = D.sum(entries.map((l) => l.size));
  const avg = D.div(D.sum(entries.map((l) => D.mul(l.price, l.size))), es);
  const dir = t.side === 'long' ? 1 : -1;
  const gross = exits.reduce((s, l) => s + dir * (Number(l.price) - Number(avg)) * Number(l.size) * Number(t.contractSize) * (l.quoteToAccount ?? 1), 0);
  const fees = t.legs.reduce((s, l) => s + Number(l.fee || 0) * (l.feeToAccount ?? 1), 0);
  return { recomputedNetMinor: Math.round((gross - fees + t.funding) * 100) };
};

test('scale-in and scale-out combine into one trade with the size-weighted average (AC-P1.4)', () => {
  const r = groupFills({ ...base, fills: [
    fill({ side: 'buy', size: '30', price: '50', time: T(14, 40), stop: '48', setup: 'breakout' }),
    fill({ side: 'buy', size: '20', price: '52', time: T(15, 10) }),
    fill({ side: 'sell', size: '50', price: '55', time: T(20, 30) }),
  ] });
  assert.equal(r.trades.length, 1);
  const t = r.trades[0];
  assert.equal(t.side, 'long');
  assert.equal(averagePrice(t, 'entry'), '50.8');
  assert.equal(averagePrice(t, 'exit'), '55');
  assert.equal(t.legs.length, 3);
  assert.deepEqual(t.legs.map((l) => l.kind), ['entry', 'entry', 'exit']);
  assert.equal(positionSize(t), '0');
  assert.equal(tradeStatus(t), 'closed');
  assert.equal(t.closeTime, T(20, 30));
  assert.equal(t.initialStop, '48');
  assert.equal(t.stopSource, 'file_initial');
  assert.equal(t.setup, 'breakout');
  assert.deepEqual(t.holds, []);
  assert.deepEqual(r.anomalies, []);
  assert.equal(t.accountId, 'acc');
  assert.equal(t.mode, 'real');
  assert.equal(t.legs[0].zone, 'Europe/Athens');
  assert.equal(t.legs[0].feeToAccount, 1);
  assert.equal(t.legs[0].quoteToAccount, 1);
});

test('short trade and independent instruments', () => {
  const r = groupFills({ ...base, fills: [
    fill({ instrument: 'TSLA', side: 'sell', size: '10', price: '200', time: T(13) }),
    fill({ instrument: 'MSFT', side: 'buy', size: '5', price: '50', time: T(13, 5) }),
    fill({ instrument: 'TSLA', side: 'buy', size: '10', price: '190', time: T(17) }),
  ] });
  const tsla = r.trades.find((t) => t.instrument === 'TSLA');
  const msft = r.trades.find((t) => t.instrument === 'MSFT');
  assert.equal(tsla.side, 'short');
  assert.equal(tradeStatus(tsla), 'closed');
  assert.equal(tradeStatus(msft), 'open');
  assert.equal(msft.closeTime, null);
});

test('the same input always gives the same trades and ids', () => {
  const fills = [fill({ key: 'a', side: 'buy', size: '1', price: '1', time: T(9) }), fill({ key: 'b', side: 'sell', size: '1', price: '2', time: T(10) })];
  const one = groupFills({ ...base, fills });
  const two = groupFills({ ...base, fills: [...fills].reverse() });
  assert.deepEqual(one.trades, two.trades);
  assert.equal(one.trades[0].id, 'imp1:a');
  assert.equal(one.trades[0].legs[1].id, 'imp1:a:2');
});

test('keys already stored are matched and dropped (AC-P1.10)', () => {
  const fills = [fill({ key: 'a', side: 'buy', size: '1', price: '1', time: T(9) }), fill({ key: 'b', side: 'sell', size: '1', price: '2', time: T(10) })];
  const r = groupFills({ ...base, fills, existingKeys: ['a', 'b'] });
  assert.equal(r.matched, 2);
  assert.equal(r.trades.length, 0);
  const half = groupFills({ ...base, fills, existingKeys: new Set(['a']) });
  assert.equal(half.matched, 1);
  assert.equal(half.trades.length, 1);
});

test('flip: split at zero, fee pro rata by size, both trades held until answered', () => {
  const fills = [
    fill({ key: 'f1', side: 'buy', size: '10', price: '100', time: T(9), fee: '1' }),
    fill({ key: 'f2', side: 'sell', size: '15', price: '110', time: T(10), fee: '3' }),
    fill({ key: 'f3', side: 'buy', size: '5', price: '105', time: T(11), fee: '1' }),
  ];
  const r = groupFills({ ...base, fills });
  assert.equal(r.trades.length, 2);
  const [a, b] = r.trades;
  assert.equal(a.side, 'long');
  assert.equal(b.side, 'short');
  assert.equal(a.legs[1].size, '10');
  assert.equal(a.legs[1].fee, '2');
  assert.equal(b.legs[0].size, '5');
  assert.equal(b.legs[0].fee, '1');
  assert.equal(b.id, 'imp1:f2~s');
  assert.equal(b.legs[0].source.key, 'f2');
  assert.deepEqual(a.holds, ['flip']);
  assert.deepEqual(b.holds, ['flip']);
  assert.equal(r.anomalies.length, 1);
  assert.equal(r.anomalies[0].kind, 'flip');
  assert.deepEqual(r.anomalies[0].tradeIds, [a.id, b.id]);
  assert.equal(r.anomalies[0].id, 'imp1:flip');
  const split = groupFills({ ...base, fills, answers: { flip: { optionId: 'split' } } });
  assert.deepEqual(split.trades.map((t) => t.holds), [[], []]);
  const excl = groupFills({ ...base, fills, answers: { flip: { optionId: 'exclude' } } });
  assert.deepEqual(excl.trades.map((t) => t.excluded?.by), ['import', 'import']);
  assert.equal(excl.trades[0].excluded.anomalyId, 'imp1:flip');
  assert.equal(excl.trades.length, 2, 'excluded trades stay in the journal');
});

test('opened_before_file: a close with no opening leg (IBKR code C)', () => {
  const closer = fill({ key: 'ibkr:NVDA#1', instrument: 'NVDA', side: 'sell', size: '50', price: '111', time: T(15), openClose: 'C', fee: '1', broker: { commission: '1', realizedPnl: '49', basis: '5600' } });
  const r = groupFills({ ...base, fills: [closer] }, { tradeMoney: money });
  const t = r.trades[0];
  assert.equal(t.side, 'long');
  assert.deepEqual(t.legs.map((l) => l.kind), ['exit']);
  assert.deepEqual(t.holds, ['opened_before_file']);
  assert.equal(t.broker.netMinor, 4900);
  assert.equal(t.broker.source, 'ibkr');
  assert.equal(tradeStatus(t), 'held');
  assert.equal(r.anomalies[0].kind, 'opened_before_file');

  const kept = groupFills({ ...base, fills: [closer], answers: { opened_before_file: { optionId: 'keep_broker_pnl' } } }, { tradeMoney: money }).trades[0];
  assert.deepEqual(kept.holds, []);
  assert.equal(kept.entryUnknown, true);
  assert.equal(isClosed(kept), true);
  assert.equal(kept.broker.netMinor, 4900);

  const entered = groupFills({ ...base, fills: [closer], answers: { opened_before_file: { optionId: 'enter_open', value: { price: '110', date: '2026-02-20' } } } }, { tradeMoney: money });
  const e = entered.trades[0];
  assert.deepEqual(e.holds, []);
  assert.deepEqual(e.legs.map((l) => l.kind), ['entry', 'exit']);
  assert.equal(e.legs[0].price, '110');
  assert.equal(e.legs[0].size, '50');
  assert.equal(e.legs[0].time, '2026-02-19T22:00:00.000Z');
  assert.equal(averagePrice(e, 'entry'), '110');
  assert.equal(money(e).recomputedNetMinor, 4900, 'gross (111 - 110) x 50 = 50, less the 1.00 fee');
});

test('an enter_open answer without a price or date leaves the trade held', () => {
  const closer = fill({ key: 'ibkr:X#1', instrument: 'X', side: 'sell', size: '5', price: '10', time: T(15), openClose: 'C', broker: { commission: '1', realizedPnl: '4' } });
  const t = groupFills({ ...base, fills: [closer], answers: { opened_before_file: { optionId: 'enter_open', value: { price: '9' } } } }).trades[0];
  assert.deepEqual(t.holds, ['opened_before_file']);
});

test('Kraken spot sell with no position is a close by its source; margin is not', () => {
  assert.equal(isCloseBySource({ key: 'kraken:T1', side: 'sell', notes: null }), true);
  assert.equal(isCloseBySource({ key: 'kraken:T1', side: 'sell', notes: 'margin' }), false);
  assert.equal(isCloseBySource({ key: 'kraken:T1', side: 'buy' }), false);
  assert.equal(isCloseBySource({ key: 'gen:g1', side: 'sell' }), false);
  assert.equal(isCloseBySource({ key: 'ibkr:x', side: 'buy', openClose: 'C' }), true);
  const r = groupFills({ ...base, fills: [fill({ key: 'kraken:T1', instrument: 'BTC/USD', market: 'crypto', side: 'sell', size: '0.1', price: '60000', time: T(9) })] });
  assert.deepEqual(r.trades[0].holds, ['opened_before_file']);
});

test('consecutive closes from before the file join one exit-only trade', () => {
  const c = (k, h) => fill({ key: `ibkr:X#${k}`, instrument: 'X', side: 'sell', size: '10', price: '10', time: T(h), openClose: 'C', broker: { realizedPnl: '5', commission: '1' } });
  const r = groupFills({ ...base, fills: [c(1, 9), c(2, 10), fill({ key: 'ibkr:X#3', instrument: 'X', side: 'buy', size: '2', price: '9', time: T(11), openClose: 'O' })] });
  assert.equal(r.trades.length, 2);
  assert.equal(r.trades[0].legs.length, 2);
  assert.equal(r.trades[0].broker.netMinor, 1000);
  assert.equal(r.trades[1].side, 'long');
});

test('dust: a remainder below the threshold closes the trade and asks', () => {
  const fills = [
    fill({ key: 'e', instrument: 'ETH/USD', market: 'crypto', side: 'buy', size: '1', price: '2400', time: T(9), fee: '2.4' }),
    fill({ key: 'x', instrument: 'ETH/USD', market: 'crypto', side: 'sell', size: '0.9995', price: '2500', time: T(10), fee: '2.49875' }),
  ];
  const open = groupFills({ ...base, fills, dustThreshold: '0.00000001' });
  assert.equal(tradeStatus(open.trades[0]), 'open');
  assert.equal(positionSize(open.trades[0]), '0.0005');
  assert.deepEqual(open.anomalies, []);

  const dust = groupFills({ ...base, fills, dustThreshold: '0.001' });
  const t = dust.trades[0];
  assert.equal(t.dustRemainder, '0.0005');
  assert.deepEqual(t.holds, ['dust']);
  assert.equal(dust.anomalies[0].kind, 'dust');
  assert.deepEqual(dust.anomalies[0].detail.remainders, { [t.id]: '0.0005' });

  const closed = groupFills({ ...base, fills, dustThreshold: '0.001', answers: { dust: { optionId: 'close_with_remainder' } } }).trades[0];
  assert.deepEqual(closed.holds, []);
  assert.equal(isClosed(closed), true);
  assert.equal(closed.dustRemainder, '0.0005');

  const kept = groupFills({ ...base, fills, dustThreshold: '0.001', answers: { dust: { optionId: 'keep_open' } } }).trades[0];
  assert.equal(kept.dustRemainder, '0');
  assert.equal(tradeStatus(kept), 'open');

  const perAccount = groupFills({ ...base, account: { ...account, dustThresholds: { 'ETH/USD': '0.001' } }, fills });
  assert.equal(perAccount.trades[0].dustRemainder, '0.0005', 'the account setting applies');
});

test('missing_fee: a blank fee holds the trade; 0 is not an anomaly', () => {
  const fills = [
    fill({ key: 'gen:g3', instrument: 'SPY', side: 'buy', size: '10', price: '500', time: T(9), fee: null, row: 4 }),
    fill({ key: 'gen:g4', instrument: 'SPY', side: 'sell', size: '10', price: '505', time: T(10), fee: '1', row: 5 }),
  ];
  const r = groupFills({ ...base, fills });
  assert.deepEqual(r.trades[0].holds, ['missing_fee']);
  assert.equal(r.trades[0].legs[0].fee, null);
  assert.equal(r.anomalies[0].kind, 'missing_fee');
  assert.deepEqual(r.anomalies[0].detail.fills[r.trades[0].id], { 'gen:g3': 4 });

  const zero = groupFills({ ...base, fills, answers: { missing_fee: { optionId: 'fee_zero' } } }).trades[0];
  assert.deepEqual(zero.holds, []);
  assert.equal(zero.legs[0].fee, '0');

  for (const value of [{ fill: 'g3', value: '2.00' }, { 'gen:g3': '2.00' }, { g3: '2.00' }]) {
    const typed = groupFills({ ...base, fills, answers: { missing_fee: { optionId: 'enter_fee', value } } }).trades[0];
    assert.deepEqual(typed.holds, [], JSON.stringify(value));
    assert.equal(typed.legs[0].fee, '2');
  }
  const incomplete = groupFills({ ...base, fills, answers: { missing_fee: { optionId: 'enter_fee', value: { 'gen:other': '2' } } } }).trades[0];
  assert.deepEqual(incomplete.holds, ['missing_fee'], 'no value for the empty fee: still held');
  const excluded = groupFills({ ...base, fills, answers: { missing_fee: { optionId: 'exclude' } } }).trades[0];
  assert.deepEqual(excluded.holds, []);
  assert.equal(excluded.excluded.by, 'import');
  const zeroFee = groupFills({ ...base, fills: fills.map((f) => ({ ...f, fee: '0' })) });
  assert.deepEqual(zeroFee.anomalies, []);
});

test('missing_fee: a per-trade override beats the answer for all', () => {
  const mk = (p) => [
    fill({ key: `${p}1`, instrument: p, side: 'buy', size: '1', price: '10', time: T(9), fee: null }),
    fill({ key: `${p}2`, instrument: p, side: 'sell', size: '1', price: '11', time: T(10), fee: '0' }),
  ];
  const r = groupFills({ ...base, fills: [...mk('A'), ...mk('B')], answers: { missing_fee: { optionId: 'fee_zero' } }, overrides: { missing_fee: { 'imp1:B1': { optionId: 'exclude' } } } });
  assert.equal(r.trades.length, 2);
  const [a, b] = r.trades;
  assert.equal(a.excluded, null);
  assert.equal(b.excluded.by, 'import');
  assert.equal(a.legs[0].fee, '0');
});

test('rate_missing: a quote or fee currency other than the base holds the trade until a rate is given', () => {
  const fills = [
    fill({ key: 'k1', instrument: 'BTC/EUR', market: 'crypto', side: 'buy', size: '0.01', price: '50000', time: T(9), fee: '0.55', feeCurrency: 'EUR', quoteCurrency: 'EUR' }),
    fill({ key: 'k2', instrument: 'BTC/EUR', market: 'crypto', side: 'sell', size: '0.01', price: '100000', time: T(10), fee: '0.56', feeCurrency: 'EUR', quoteCurrency: 'EUR' }),
  ];
  const r = groupFills({ ...base, fills });
  const t = r.trades[0];
  assert.deepEqual(t.holds, ['rate_missing']);
  assert.deepEqual(r.anomalies[0].detail.currencies, ['EUR']);
  assert.equal(t.legs[0].quoteToAccount, null);
  assert.equal(t.legs[0].feeToAccount, null);
  for (const value of [1.1, { EUR: 1.1 }, '1.1']) {
    const ok = groupFills({ ...base, fills, answers: { rate_missing: { optionId: 'rate', value } } }).trades[0];
    assert.deepEqual(ok.holds, [], JSON.stringify(value));
    assert.equal(ok.legs[0].quoteToAccount, 1.1);
    assert.equal(ok.legs[0].feeToAccount, 1.1);
  }
  const other = groupFills({ ...base, fills, answers: { rate_missing: { optionId: 'rate', value: { GBP: 1.2 } } } }).trades[0];
  assert.deepEqual(other.holds, ['rate_missing']);
  const over = groupFills({ ...base, fills, answers: { rate_missing: { optionId: 'rate', value: 1.1 } }, overrides: { rate_missing: { 'imp1:k1': { optionId: 'rate', value: 1.2 } } } }).trades[0];
  assert.equal(over.legs[0].quoteToAccount, 1.2);
});

test('near_duplicate against an earlier import: keep_both or merge', () => {
  const stored = [{ key: 'kraken:OLD1', time: T(9), instrument: 'BTC/USD', side: 'buy', size: '0.05', price: '60000', tradeId: 'old' }];
  const fills = [
    fill({ key: 'kraken:NEW1', instrument: 'BTC/USD', market: 'crypto', side: 'buy', size: '0.05', price: '60000.0', time: '2026-03-02T09:00:00.600Z' }),
    fill({ key: 'kraken:NEW2', instrument: 'BTC/USD', market: 'crypto', side: 'sell', size: '0.05', price: '62000', time: T(11) }),
  ];
  const held = groupFills({ ...base, fills, existingLegs: stored });
  assert.deepEqual(held.trades[0].holds, ['near_duplicate']);
  assert.deepEqual(held.anomalies[0].detail.pairs, { 'kraken:NEW1': 'kraken:OLD1' });
  const both = groupFills({ ...base, fills, existingLegs: stored, answers: { near_duplicate: { optionId: 'keep_both' } } });
  assert.deepEqual(both.trades[0].holds, []);
  assert.equal(both.trades[0].legs.length, 2);
  const merged = groupFills({ ...base, fills, existingLegs: stored, answers: { near_duplicate: { optionId: 'merge' } } });
  assert.equal(merged.matched, 1);
  assert.deepEqual(merged.dropped, ['kraken:NEW1']);
  assert.equal(merged.trades.length, 1);
  assert.equal(merged.trades[0].legs.length, 1);
  const far = groupFills({ ...base, fills: [{ ...fills[0], time: '2026-03-02T09:00:02.000Z' }], existingLegs: stored });
  assert.deepEqual(far.anomalies, [], 'two seconds apart is not a near duplicate');
  const sameKey = groupFills({ ...base, fills: [{ ...fills[0], key: 'kraken:OLD1' }], existingLegs: stored, existingKeys: ['kraken:OLD1'] });
  assert.equal(sameKey.matched, 1);
});

test('legsAsFills and collectExistingKeys read stored trades', () => {
  const r = groupFills({ ...base, fills: [
    fill({ key: 'a', side: 'buy', size: '1', price: '10', time: T(9) }),
    fill({ key: 'b', side: 'sell', size: '1', price: '12', time: T(10) }),
  ] });
  const trade = { ...r.trades[0], fundingEntries: [{ key: 'fund1' }] };
  assert.deepEqual(legsAsFills([trade]).map((f) => [f.key, f.side]), [['a', 'buy'], ['b', 'sell']]);
  const short = { ...trade, side: 'short' };
  assert.deepEqual(legsAsFills([short]).map((f) => f.side), ['sell', 'buy']);
  assert.deepEqual([...collectExistingKeys([trade], [{ key: 'cash1' }, { key: null }])].sort(), ['a', 'b', 'cash1', 'fund1']);
});

test('tz_edge: a close near a month boundary in the declared zone when the zones differ', () => {
  const fills = [
    fill({ key: 'e', instrument: 'BTC/USD', market: 'crypto', side: 'buy', size: '0.1', price: '60000', time: '2026-03-31T20:00:00.000Z' }),
    fill({ key: 'x', instrument: 'BTC/USD', market: 'crypto', side: 'sell', size: '0.1', price: '60100', time: '2026-03-31T22:30:00.000Z' }),
  ];
  const r = groupFills({ ...base, fills, fileZone: 'UTC', declaredZone: 'Europe/Athens' });
  const t = r.trades[0];
  assert.deepEqual(t.holds, ['tz_edge']);
  assert.deepEqual(r.anomalies[0].detail.boundaries, { [t.id]: '2026-04-01' });
  const after = groupFills({ ...base, fills, fileZone: 'UTC', declaredZone: 'Europe/Athens', answers: { tz_edge: { optionId: 'month_after' } } }).trades[0];
  assert.deepEqual(after.holds, []);
  assert.equal(after.closeDayOverride, '2026-04-01');
  const before = groupFills({ ...base, fills, fileZone: 'UTC', declaredZone: 'Europe/Athens', answers: { tz_edge: { optionId: 'month_before' } } }).trades[0];
  assert.equal(before.closeDayOverride, '2026-03-31');
  assert.deepEqual(groupFills({ ...base, fills, fileZone: 'Europe/Athens', declaredZone: 'Europe/Athens' }).anomalies, [], 'same zone: no question');
  assert.deepEqual(groupFills({ ...base, fills, fileZone: null, declaredZone: 'Europe/Athens' }).anomalies, []);
  const mid = groupFills({ ...base, fills: fills.map((f) => ({ ...f, time: f.time.replace('03-31', '03-14') })), fileZone: 'UTC', declaredZone: 'Europe/Athens' });
  assert.deepEqual(mid.anomalies, []);
});

test('funding: attached to the open trade on that instrument, unmatched and foreign-currency entries ask', () => {
  const fills = [
    fill({ key: 'e', instrument: 'BTC-PERP', market: 'crypto', side: 'buy', size: '1', price: '60000', time: T(9) }),
    fill({ key: 'x', instrument: 'BTC-PERP', market: 'crypto', side: 'sell', size: '1', price: '60100', time: T(18) }),
  ];
  const funding = [
    { key: 'f1', instrument: 'BTC-PERP', time: T(12), amount: '-1.50', currency: 'USD' },
    { key: 'f2', instrument: 'BTC-PERP', time: '2026-03-03T12:00:00.000Z', amount: '-2', currency: 'USD' },
    { key: 'f3', instrument: 'ETH-PERP', time: T(12), amount: '-1', currency: 'USD' },
    { key: 'f4', instrument: 'BTC-PERP', time: T(13), amount: '-1', currency: 'EUR' },
  ];
  const r = groupFills({ ...base, fills, funding });
  assert.equal(r.trades[0].funding, -1.5);
  assert.deepEqual(r.trades[0].fundingEntries.map((e) => e.key), ['f1']);
  assert.equal(r.trades[0].holds.length, 0, 'unmatched funding does not hold trades');
  const a = r.anomalies.find((x) => x.kind === 'funding_unmatched');
  assert.deepEqual(a.detail.entries.map((e) => [e.key, e.reason]), [['f2', 'no_trade'], ['f3', 'no_trade'], ['f4', 'currency']]);
  assert.deepEqual(a.tradeIds, []);
  const attached = groupFills({ ...base, fills, funding, answers: {}, overrides: { funding_unmatched: { f2: { optionId: 'attach', value: r.trades[0].id } } } });
  assert.equal(attached.trades[0].funding, -3.5);
  const known = groupFills({ ...base, fills, funding, existingKeys: ['f1'] });
  assert.equal(known.trades[0].funding, 0);
  assert.equal(known.matched, 1);
  const ignored = groupFills({ ...base, fills, funding: [funding[1]], overrides: { funding_unmatched: { f2: { optionId: 'ignore' } } } });
  assert.deepEqual(ignored.anomalies, []);
});

test('positionId groups a ticket chain; MT4 broker figures and swap', () => {
  const mt4 = (o) => fill({ ...o, positionId: '1004', key: o.key, instrument: 'GBP/USD', market: 'forex' });
  const fills = [
    { ...mt4({ key: 'mt4:1004:open', side: 'buy', size: '0.1', price: '1.27', time: T(7), fee: '0' }), contractSize: '100000', quoteToAccount: 1 },
    { ...mt4({ key: 'mt4:1004:close', side: 'sell', size: '0.1', price: '1.275', time: T(8), fee: '0', broker: { commission: '0', taxes: '0', swap: '0', profit: '50' } }), contractSize: '100000', quoteToAccount: 1 },
    { ...mt4({ key: 'mt4:1005:open', side: 'buy', size: '0.2', price: '1.27', time: T(7), fee: '0' }), contractSize: '100000', quoteToAccount: 1 },
    { ...mt4({ key: 'mt4:1005:close', side: 'sell', size: '0.2', price: '1.268', time: T(13), fee: '0', broker: { commission: '0', taxes: '0', swap: '-0.5', profit: '-40' } }), contractSize: '100000', quoteToAccount: 1 },
  ];
  const r = groupFills({ ...base, fills }, { tradeMoney: (t) => ({ recomputedNetMinor: 1050 }) });
  assert.equal(r.trades.length, 1);
  const t = r.trades[0];
  assert.equal(t.legs.length, 4);
  assert.equal(t.contractSize, '100000');
  assert.equal(t.broker.source, 'mt4');
  assert.equal(t.broker.netMinor, 950, 'profit 50 - 40 + swap -0.5');
  assert.equal(t.broker.swapMinor, -50);
  assert.equal(t.funding, -0.5);
  assert.deepEqual(t.holds, ['broker_mismatch'], 'broker 9.50 against a recomputed 10.50 differs by more than one minor unit');
  const ok = groupFills({ ...base, fills }, { tradeMoney: () => ({ recomputedNetMinor: 951 }) }).trades[0];
  assert.deepEqual(ok.holds, [], 'one minor unit is within tolerance');
  const used = groupFills({ ...base, fills, answers: { broker_mismatch: { optionId: 'use_broker' } } }, { tradeMoney: () => ({ recomputedNetMinor: 1050 }) }).trades[0];
  assert.deepEqual(used.holds, []);
});

test('MT4 contract size unknown: asks once per symbol and stores the answer on the account', () => {
  const f = (o) => ({ ...fill({ instrument: 'XAU/USD', market: 'forex', fee: '0', ...o }), contractSize: '1', quoteToAccount: null });
  const fills = [f({ key: 'mt4:1:open', side: 'buy', size: '1', price: '2000', time: T(7) }), f({ key: 'mt4:1:close', side: 'sell', size: '1', price: '2000', time: T(8), broker: { commission: '0', taxes: '0', swap: '0', profit: '0' } })];
  const r = groupFills({ ...base, fills });
  assert.deepEqual(r.trades[0].holds, ['contract_size_missing']);
  assert.deepEqual(r.anomalies[0].detail.symbols, ['XAU/USD']);
  const answered = groupFills({ ...base, fills, answers: { contract_size_missing: { optionId: 'value', value: { 'XAU/USD': '100' } } } });
  assert.deepEqual(answered.trades[0].holds, []);
  assert.equal(answered.trades[0].legs[0].quoteToAccount, 100);
  assert.deepEqual(answered.accountUpdates.contractValues, { 'XAU/USD': '100' });
  const stored = groupFills({ ...base, account: { ...account, contractValues: { 'XAU/USD': '100' } }, fills });
  assert.deepEqual(stored.trades[0].holds, []);
});

test('several anomaly kinds in one import: one anomaly per kind, ordered', () => {
  const fills = [
    fill({ key: 'a1', instrument: 'A', side: 'buy', size: '1', price: '10', time: T(9), fee: null }),
    fill({ key: 'a2', instrument: 'A', side: 'sell', size: '1', price: '11', time: T(10), fee: '0' }),
    fill({ key: 'b1', instrument: 'B', side: 'buy', size: '1', price: '10', time: T(9), fee: null }),
    fill({ key: 'b2', instrument: 'B', side: 'sell', size: '1', price: '11', time: T(10), fee: '0' }),
  ];
  const r = groupFills({ ...base, fills });
  assert.equal(r.anomalies.length, 1);
  assert.equal(r.anomalies[0].kind, 'missing_fee');
  assert.equal(r.anomalies[0].tradeIds.length, 2, 'one question listing every affected trade (AC-A2.2)');
});

test('a clean import raises no question and holds nothing (AC-A2.4)', () => {
  const r = groupFills({ ...base, fills: [fill({ side: 'buy', size: '1', price: '10', time: T(9) }), fill({ side: 'sell', size: '1', price: '11', time: T(10) })] });
  assert.deepEqual(r.anomalies, []);
  assert.deepEqual(r.trades.map((t) => t.holds), [[]]);
});

test('MT4 opening fills carry no fee of their own (commission is on the closing row): not a missing fee', () => {
  const f = (k, side, price, time, fee) => ({ ...fill({ key: k, instrument: 'EUR/USD', market: 'forex', side, size: '0.2', price, time, fee }), contractSize: '100000', quoteToAccount: 1 });
  const r = groupFills({ ...base, fills: [f('mt4:1:open', 'buy', '1.085', T(7), null), f('mt4:1:close', 'sell', '1.09', T(12), '1.4')] });
  assert.deepEqual(r.anomalies, []);
  assert.equal(r.trades[0].legs[0].fee, '0');
  assert.deepEqual(r.trades[0].holds, []);
  const generic = groupFills({ ...base, fills: [f('gen:1', 'buy', '1.085', T(7), null), f('gen:2', 'sell', '1.09', T(12), '1.4')] });
  assert.equal(generic.anomalies[0].kind, 'missing_fee', 'other formats still ask');
});
