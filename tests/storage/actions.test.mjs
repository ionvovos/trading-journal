import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildManualTrade, patchTrade, applyStops, buildCash, createAccount, validateAccount, makeReconRecord, deleteAllData, normalizeInstrument, quoteCurrencyOf, defaultContractSize, stateOfResult } from '../../src/storage/actions.js';
import { createMemoryStore } from '../../src/storage/memory.js';
import { averagePrice, isClosed, tradeStatus } from '../../src/core/trade.js';

const account = { id: 'a1', name: 'IBKR', mode: 'real', baseCurrency: 'USD' };
const env = { account, declaredZone: 'Europe/Athens', now: '2026-09-29T10:00:00.000Z', id: 't1' };
const form = (o = {}) => ({
  instrument: 'aapl', market: 'stock', side: 'long', stop: '224.90',
  legs: [{ kind: 'entry', time: '2026-09-29T17:41', price: '227.40', size: '50', fee: '' }, { kind: 'exit', time: '2026-09-29T19:02', price: '229.10', size: '50', fee: '1.00' }],
  setup: 'breakout', notes: 'x', ...o,
});

test('a complete manual trade is stored as a closed trade with exact decimals (AC-P1.1, AC-P1.2)', () => {
  const { trade, errors, warnings } = buildManualTrade(form(), env);
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
  assert.equal(trade.instrument, 'AAPL');
  assert.equal(trade.accountId, 'a1');
  assert.equal(trade.mode, 'real');
  assert.equal(trade.entry, 'manual');
  assert.equal(trade.initialStop, '224.9');
  assert.equal(trade.stopSource, 'user');
  assert.deepEqual(trade.legs.map((l) => [l.id, l.kind, l.time, l.price, l.size, l.fee]), [
    ['t1:1', 'entry', '2026-09-29T14:41:00.000Z', '227.4', '50', '0'],
    ['t1:2', 'exit', '2026-09-29T16:02:00.000Z', '229.1', '50', '1'],
  ]);
  assert.equal(trade.legs[0].zone, 'Europe/Athens');
  assert.equal(trade.legs[0].quoteToAccount, 1);
  assert.equal(trade.legs[0].feeToAccount, 1);
  assert.equal(isClosed(trade), true);
  assert.equal(trade.closeTime, '2026-09-29T16:02:00.000Z');
  assert.equal(trade.quoteCurrency, 'USD');
  assert.equal(trade.contractSize, '1');
  assert.deepEqual(trade.holds, []);
});

test('scale-in and partial exits combine (AC-P1.4)', () => {
  const { trade } = buildManualTrade(form({ legs: [
    { kind: 'entry', time: '2026-03-02T16:40', price: '50', size: '30', fee: '1' },
    { kind: 'entry', time: '2026-03-02T17:10', price: '52', size: '20', fee: '1' },
    { kind: 'exit', time: '2026-03-02T22:30', price: '55', size: '50', fee: '1' },
  ] }), env);
  assert.equal(averagePrice(trade, 'entry'), '50.8');
  assert.equal(trade.legs.length, 3);
});

test('only instrument, side, size, entry price and entry time are required (AC-P1.2)', () => {
  const { trade, errors, warnings } = buildManualTrade({ instrument: 'MSFT', side: 'short', legs: [{ kind: 'entry', time: '2026-03-03T10:00', price: '410,5', size: '3' }] }, env);
  assert.deepEqual(errors, []);
  assert.equal(trade.legs[0].price, '410.5');
  assert.equal(trade.initialStop, null);
  assert.equal(tradeStatus(trade), 'open');
  assert.equal(trade.closeTime, null);
  assert.deepEqual(warnings.map((w) => w.code), ['no_stop'], 'saved without a stop: R will show as unknown (AC-P1.3)');
});

test('errors name the field and the reason; nothing is built', () => {
  const r = buildManualTrade({ instrument: '', side: '', stop: 'abc', legs: [{ kind: 'entry', time: 'never', price: '-1', size: '' }] }, env);
  assert.equal(r.trade, null);
  const codes = r.errors.map((e) => `${e.field}:${e.code}`);
  for (const c of ['instrument:required', 'side:required', 'entryPrice:positive', 'entrySize:required', 'entryTime:time', 'stop:number']) assert.ok(codes.includes(c), c);
  assert.equal(buildManualTrade({ instrument: 'A', side: 'long', legs: [] }, env).errors[0].code, 'required');
});

test('an exit larger than the entry is refused', () => {
  const r = buildManualTrade(form({ legs: [{ kind: 'entry', time: '2026-03-02T10:00', price: '10', size: '5' }, { kind: 'exit', time: '2026-03-02T11:00', price: '11', size: '6' }] }), env);
  assert.deepEqual(r.errors, [{ field: 'exitSize', code: 'oversize_exit' }]);
});

test('warnings: stop on the profit side and stop at the entry price', () => {
  assert.deepEqual(buildManualTrade(form({ stop: '230' }), env).warnings.map((w) => w.code), ['stop_profit_side']);
  assert.deepEqual(buildManualTrade(form({ stop: '227.4' }), env).warnings.map((w) => w.code), ['stop_at_entry']);
  assert.deepEqual(buildManualTrade(form({ side: 'short', stop: '224.9' }), env).warnings.map((w) => w.code), ['stop_profit_side']);
});

test('forex: pair normalised, contract size 100000, quote currency needs a rate when it is not the account currency', () => {
  assert.equal(normalizeInstrument('eurusd', 'forex'), 'EUR/USD');
  assert.equal(normalizeInstrument('btc/usd', 'crypto'), 'BTC/USD');
  assert.equal(quoteCurrencyOf('USD/JPY', 'USD'), 'JPY');
  assert.equal(quoteCurrencyOf('AAPL', 'USD'), 'USD');
  assert.equal(defaultContractSize('forex', 'EUR/USD'), '100000');
  assert.equal(defaultContractSize('stock', 'AAPL'), '1');
  const legs = [{ kind: 'entry', time: '2026-03-06T03:00', price: '150', size: '0.1' }, { kind: 'exit', time: '2026-03-06T05:00', price: '150.5', size: '0.1' }];
  const noRate = buildManualTrade({ instrument: 'usdjpy', market: 'forex', side: 'short', legs }, env);
  assert.deepEqual(noRate.errors, [{ field: 'quoteToAccount', code: 'rate_required' }]);
  const ok = buildManualTrade({ instrument: 'usdjpy', market: 'forex', side: 'short', quoteToAccount: '0,006644', legs }, env);
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.trade.instrument, 'USD/JPY');
  assert.equal(ok.trade.contractSize, '100000');
  assert.equal(ok.trade.quoteCurrency, 'JPY');
  assert.equal(ok.trade.legs[0].quoteToAccount, 0.006644);
  const usd = buildManualTrade({ instrument: 'eurusd', market: 'forex', side: 'long', legs }, env);
  assert.equal(usd.trade.legs[0].quoteToAccount, 1);
});

test('editing keeps what the form does not own', () => {
  const first = buildManualTrade(form(), env).trade;
  const stored = { ...first, plan: { planId: 'P', followed: true }, moodBefore: 3, createdAt: '2026-01-01T00:00:00Z' };
  const edited = buildManualTrade(form({ stop: '226' }), { ...env, existing: stored, now: '2026-09-30T00:00:00Z' }).trade;
  assert.equal(edited.id, 't1');
  assert.equal(edited.initialStop, '226');
  assert.deepEqual(edited.plan, { planId: 'P', followed: true });
  assert.equal(edited.moodBefore, 3);
  assert.equal(edited.createdAt, '2026-01-01T00:00:00Z');
  assert.equal(edited.updatedAt, '2026-09-30T00:00:00Z');
});

test('patchTrade changes only the fields a person may edit', () => {
  const t = buildManualTrade(form(), env).trade;
  const p = patchTrade(t, { notes: 'later', instrument: 'HACK', legs: [], holds: ['x'] }, 'now');
  assert.equal(p.notes, 'later');
  assert.equal(p.instrument, 'AAPL');
  assert.equal(p.legs.length, 2);
  assert.deepEqual(p.holds, []);
  assert.equal(p.updatedAt, 'now');
});

test('bulk stops: many trades on one screen, blanks skipped, bad values reported (AC-P1.11)', () => {
  const t = (id) => ({ ...buildManualTrade(form({ stop: '' }), { ...env, id }).trade });
  const trades = [t('a'), t('b'), t('c'), t('d')];
  const r = applyStops(trades, [{ tradeId: 'a', stop: '224,5' }, { tradeId: 'b', stop: '' }, { tradeId: 'c', stop: 'x' }, { tradeId: 'd', stop: '-1' }, { tradeId: 'zzz', stop: '5' }], 'now');
  assert.equal(r.set, 1);
  assert.equal(r.trades[0].initialStop, '224.5');
  assert.equal(r.trades[0].stopSource, 'user');
  assert.deepEqual(r.errors, [{ tradeId: 'c', code: 'number' }, { tradeId: 'd', code: 'positive' }, { tradeId: 'zzz', code: 'unknown_trade' }]);
});

test('cash movements', () => {
  const ok = buildCash({ kind: 'deposit', amount: '1 000,50', time: '2026-03-02' }, { account, now: 'n', id: 'c1' });
  assert.deepEqual(ok.cash, { id: 'c1', accountId: 'a1', time: '2026-03-02', kind: 'deposit', amount: '1000.5', currency: 'USD', importId: null, key: null, note: '' });
  assert.equal(buildCash({ kind: 'other', amount: '-5', time: '2026-03-02' }, { account, id: 'c2' }).cash.amount, '-5');
  assert.equal(buildCash({ kind: 'deposit', amount: '-5', time: '2026-03-02' }, { account }).errors[0].code, 'positive');
  assert.equal(buildCash({ kind: 'deposit', amount: '5', time: 'x' }, { account }).errors[0].code, 'time');
  assert.equal(buildCash({ kind: 'nope', amount: '5', time: '2026-03-02' }, { account }).errors[0].code, 'required');
});

test('accounts', () => {
  const a = createAccount({ name: ' IBKR ', mode: 'real', baseCurrency: 'usd', startBalance: '10 000' }, { now: 'n', id: 'a1' });
  assert.deepEqual(validateAccount(a, []), []);
  assert.equal(a.startBalance, '10000');
  assert.equal(a.baseCurrency, 'USD');
  assert.deepEqual(validateAccount(a, [{ id: 'other', name: 'ibkr' }]).map((e) => e.code), ['duplicate']);
  assert.deepEqual(validateAccount(createAccount({ name: '', baseCurrency: '1' }, { now: 'n' }), []).map((e) => `${e.field}:${e.code}`), ['name:required', 'baseCurrency:currency']);
  assert.equal(createAccount({ name: 'P', mode: 'paper', baseCurrency: 'EUR' }, { now: 'n' }).startBalance, null);
});

test('reconciliation record and state mapping', () => {
  const r = makeReconRecord({ account, period: { from: '2026-03-02', to: '2026-03-09', zone: 'UTC' }, state: 'difference', broker: { form: 'net_pnl', valueMinor: 100 }, result: { oursMinor: 90, openLegsMinor: 0, differenceMinor: 10, toleranceMinor: 1, explanations: [] }, now: 'n' });
  assert.equal(r.id, 'a1:2026-03-02:2026-03-09');
  assert.equal(r.differenceMinor, 10);
  assert.equal(makeReconRecord({ account, period: { from: 'a', to: 'b' }, state: 'skipped', now: 'n', asset: 'BTC' }).id, 'a1:qty:BTC');
  assert.equal(stateOfResult({ state: 'reconciled' }), 'reconciled');
  assert.equal(stateOfResult({ state: 'difference_open' }), 'difference');
});

test('delete all data empties the stores, the own key and the journal caches (AC-P8.9)', async () => {
  const store = createMemoryStore();
  await store.trades.put({ id: 't' });
  await store.setSetting('lang', 'el');
  const ls = new Map([['trading-journal.ai-key', 'sk-secret'], ['trading-journal.theme', 'dark'], ['other.app', 'keep']]);
  const storage = { get length() { return ls.size; }, key: (i) => [...ls.keys()][i], removeItem: (k) => ls.delete(k) };
  const cacheNames = ['tj-v1', 'tj-cdn', 'webllm/model', 'webllm/wasm', 'journal-thumbs'];
  const caches = { keys: async () => [...cacheNames], delete: async (n) => { cacheNames.splice(cacheNames.indexOf(n), 1); return true; } };
  const kept = await deleteAllData({ store, storage, caches, alsoModel: false });
  assert.deepEqual(await store.trades.getAll(), []);
  assert.deepEqual(await store.allSettings(), {});
  assert.deepEqual([...ls.keys()], ['other.app']);
  assert.deepEqual(kept.localStorage.sort(), ['trading-journal.ai-key', 'trading-journal.theme']);
  assert.deepEqual(cacheNames, ['tj-v1', 'tj-cdn', 'webllm/model', 'webllm/wasm'].filter((n) => n !== 'journal-thumbs'), 'model caches stay unless asked; the shell cache stays');
  await deleteAllData({ store, storage, caches, alsoModel: true });
  assert.deepEqual(cacheNames, ['tj-v1']);
});
