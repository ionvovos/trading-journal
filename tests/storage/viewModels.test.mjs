import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFilters, needsYou } from '../../src/ui/views/journal.js';
import { stopCandidates } from '../../src/ui/views/bulkStops.js';
import { optionsFor } from '../../src/ui/views/import.js';
import { assetsOf, fillsOf, cashTotals } from '../../src/ui/views/reconcile.js';
import { emptyDraft, legsOf, toForm, draftFromTrade, localInput } from '../../src/ui/views/tradeForm.js';
import { buildManualTrade } from '../../src/storage/actions.js';
import { groupByDay, dayLabel, toDisplayMinor, sizeText } from '../../src/storage/viewkit.js';
import { createFormat } from '../../src/i18n/format.js';
import { registerCatalogue, setLang } from '../../src/i18n/i18n.js';
import dataEn from '../../src/i18n/en/data.js';
import shellEn from '../../src/i18n/en/shell.js';

registerCatalogue('en', { ...shellEn, ...dataEn });
setLang('en');

const leg = (id, kind, time, price = '10', size = '1', extra = {}) => ({ id, kind, time, price, size, fee: '0', feeCurrency: 'USD', ...extra });
const tr = (id, o = {}) => ({ id, accountId: 'a', mode: 'real', market: 'stock', instrument: id.toUpperCase(), side: 'long', holds: [], excluded: null, initialStop: null, importId: null, setup: null, plan: null, dustRemainder: '0', closeTime: null, legs: [leg(`${id}1`, 'entry', '2026-03-02T10:00:00Z')], ...o });
const closed = (id, o = {}) => tr(id, { closeTime: '2026-03-02T15:00:00.000Z', legs: [leg(`${id}1`, 'entry', '2026-03-02T10:00:00Z'), leg(`${id}2`, 'exit', '2026-03-02T15:00:00.000Z', '11')], ...o });
const F = (o = {}) => ({ account: 'all', market: 'all', setup: 'all', result: 'all', plan: 'all', ...o });

test('journal filters: account, market, setup (including none), result and plan', () => {
  const trades = [closed('a', { setup: 'breakout', plan: { followed: true } }), closed('b', { accountId: 'b', market: 'crypto', plan: { followed: false } }), closed('c', { setup: 'pullback' })];
  const net = { a: 100, b: -50, c: 0 };
  const netOf = (x) => net[x.id];
  const ids = (f) => applyFilters(trades, F(f), netOf).map((x) => x.id);
  assert.deepEqual(ids({}), ['a', 'b', 'c']);
  assert.deepEqual(ids({ account: 'b' }), ['b']);
  assert.deepEqual(ids({ market: 'crypto' }), ['b']);
  assert.deepEqual(ids({ setup: 'breakout' }), ['a']);
  assert.deepEqual(ids({ setup: '' }), ['b'], 'the empty setup means "No setup"');
  assert.deepEqual(ids({ result: 'win' }), ['a']);
  assert.deepEqual(ids({ result: 'loss' }), ['b']);
  assert.deepEqual(ids({ result: 'even' }), ['c']);
  assert.deepEqual(ids({ plan: 'followed' }), ['a']);
  assert.deepEqual(ids({ plan: 'off' }), ['b']);
  assert.deepEqual(ids({ plan: 'unmarked' }), ['c']);
  assert.deepEqual(applyFilters(trades, F({ result: 'win' }), () => null), [], 'no result known: not a winner');
});

test('needs you: held, open and no-stop trades, no-stop grouped by import', () => {
  const trades = [
    tr('held', { holds: ['missing_fee'], importId: 'i1' }), tr('open1', { initialStop: '9' }), closed('nostop1', { importId: 'i1' }), closed('nostop2', { importId: 'i1' }),
    closed('withstop', { initialStop: '9' }), closed('hand', { accountId: 'a' }), closed('gone', { excluded: { by: 'user' } }),
  ];
  const n = needsYou(trades, new Map());
  assert.deepEqual(n.held.map((x) => x.id), ['held']);
  assert.deepEqual(n.open.map((x) => x.id), ['open1']);
  assert.deepEqual(n.noStop.map((g) => [g.key, g.trades.length]).sort(), [['i1', 2], ['manual:a', 1]]);
});

test('bulk stops: candidates are the trades of the mode without a held hold, newest first', () => {
  const trades = [closed('a', { closeTime: '2026-03-01T10:00:00Z' }), closed('b', { closeTime: '2026-03-05T10:00:00Z' }), closed('h', { holds: ['x'] }), closed('p', { mode: 'paper' }), closed('x', { excluded: { by: 'user' } }), closed('o', { accountId: 'other' })];
  assert.deepEqual(stopCandidates(trades, 'real').map((x) => x.id), ['b', 'o', 'a']);
  assert.deepEqual(stopCandidates(trades, 'real', 'a').map((x) => x.id), ['b', 'a']);
});

test('import options: keeping the broker P&L needs a broker figure on the trade', () => {
  const anomaly = { kind: 'opened_before_file', tradeIds: ['x'] };
  assert.deepEqual(optionsFor(anomaly, [{ id: 'x', broker: null }]).map((o) => [o.id, o.disabled]), [['enter_open', false], ['keep_broker_pnl', true], ['exclude', false]]);
  assert.equal(optionsFor(anomaly, [{ id: 'x', broker: { netMinor: 4900 } }])[1].disabled, false);
  assert.deepEqual(optionsFor({ kind: 'near_duplicate', tradeIds: [] }, []).map((o) => o.id), ['merge', 'keep_both']);
});

test('reconcile helpers: assets, fills and cash totals', () => {
  const crypto = (id, o = {}) => tr(id, { market: 'crypto', instrument: 'BTC/USD', legs: [leg(`${id}1`, 'entry', '2026-03-04T10:00:00Z', '60000', '0.5', { fee: '18', source: { key: `kraken:${id}` } }), leg(`${id}2`, 'exit', '2026-03-04T11:00:00Z', '61000', '0.2', { fee: '0', source: { key: `kraken:${id}x` } })], ...o });
  const trades = [crypto('t1'), crypto('t2', { accountId: 'b' }), tr('stock')];
  assert.deepEqual(assetsOf(trades, 'a'), ['BTC', 'USD']);
  const fills = fillsOf(trades, 'a');
  assert.deepEqual(fills.map((f) => [f.key, f.side, f.size]), [['kraken:t1', 'buy', '0.5'], ['kraken:t1x', 'sell', '0.2']]);
  const short = crypto('s', { side: 'short' });
  assert.deepEqual(fillsOf([short], 'a').map((f) => f.side), ['sell', 'buy']);
  const cash = [{ accountId: 'a', kind: 'deposit', amount: '200', time: '2026-03-02' }, { accountId: 'a', kind: 'withdrawal', amount: '50.50', time: '2026-03-03T10:00:00Z' }, { accountId: 'a', kind: 'other', amount: '-1.25', time: '2026-03-09' }, { accountId: 'a', kind: 'deposit', amount: '999', time: '2026-04-01' }, { accountId: 'b', kind: 'deposit', amount: '5', time: '2026-03-02' }];
  const t = cashTotals(cash, 'a', { from: '2026-03-01', to: '2026-03-31' }, 2);
  assert.deepEqual([t.depositsMinor, t.withdrawalsMinor, t.otherMinor, t.items.length], [20000, 5050, -125, 3]);
});

test('trade form: draft, legs and the form fed to the builder', () => {
  const now = '2026-09-29T14:41:00.000Z';
  assert.equal(localInput(now, 'Europe/Athens'), '2026-09-29T17:41');
  const d = { ...emptyDraft({ account: { id: 'a' }, now, tz: 'Europe/Athens' }), instrument: 'aapl', size: '50', entryPrice: '227.40', exitPrice: '229.10', fee: '1', stop: '224.90' };
  assert.deepEqual(legsOf(d).map((l) => [l.kind, l.size, l.price, l.fee]), [['entry', '50', '227.40', ''], ['exit', '50', '229.10', '1']]);
  assert.deepEqual(legsOf({ ...d, exitPrice: '' }).map((l) => [l.kind, l.fee]), [['entry', '1']], 'without an exit the fee sits on the entry');
  assert.deepEqual(legsOf({ ...d, exitSize: '20', extra: [{ kind: 'exit', time: 'x', price: '230', size: '30', fee: '' }] }).map((l) => l.size), ['50', '20', '30']);
  const env = { account: { id: 'a', mode: 'real', baseCurrency: 'USD' }, declaredZone: 'Europe/Athens', now, id: 't1' };
  const built = buildManualTrade(toForm(d), env);
  assert.deepEqual(built.errors, []);
  const back = draftFromTrade(built.trade, 'Europe/Athens');
  assert.equal(back.entryPrice, '227.4');
  assert.equal(back.exitPrice, '229.1');
  assert.equal(back.size, '50');
  assert.equal(back.exitSize, '');
  assert.equal(back.fee, '1');
  assert.equal(back.entryTime, '2026-09-29T17:41');
  const rebuilt = buildManualTrade(toForm(back), { ...env, existing: built.trade });
  assert.deepEqual(rebuilt.trade.legs.map((l) => [l.price, l.size, l.fee]), built.trade.legs.map((l) => [l.price, l.size, l.fee]));
});

test('viewkit: day groups, display currency, size text', () => {
  const ctx = { tz: 'Europe/Athens', settings: { get: () => 0 }, lang: 'en', fmt: createFormat({ lang: 'en', tz: 'Europe/Athens' }) };
  const days = groupByDay([closed('a', { closeTime: '2026-03-04T22:30:00.000Z' }), closed('b', { closeTime: '2026-03-05T10:00:00.000Z' }), closed('c', { closeTime: '2026-03-02T10:00:00.000Z', closeDayOverride: '2026-03-01' })], ctx);
  assert.deepEqual(days.map((d) => [d.date, d.trades.map((x) => x.id)]), [['2026-03-05', ['b', 'a']], ['2026-03-01', ['c']]]);
  assert.match(dayLabel('2026-03-05', ctx), /^Thu 5 Mar/);
  assert.equal(toDisplayMinor(1000, { baseCurrency: 'USD' }, 'USD'), 1000);
  assert.equal(toDisplayMinor(1000, { baseCurrency: 'USD', toDisplayRate: 0.92 }, 'EUR'), 920);
  assert.equal(toDisplayMinor(1000, { baseCurrency: 'USD', toDisplayRate: 150 }, 'JPY'), 1500);
  assert.equal(toDisplayMinor(null, {}, 'USD'), null);
  const fmt = ctx.fmt;
  assert.equal(sizeText(tr('a', { legs: [leg('1', 'entry', 't', '10', '50')] }), fmt), '50 shares');
  assert.equal(sizeText(tr('a', { market: 'crypto', instrument: 'BTC/USD', legs: [leg('1', 'entry', 't', '10', '0.05')] }), fmt), '0.05 BTC');
  assert.equal(sizeText(tr('a', { market: 'forex', instrument: 'EUR/USD', legs: [leg('1', 'entry', 't', '1', '1')] }), fmt), '1.00 lots');
});
