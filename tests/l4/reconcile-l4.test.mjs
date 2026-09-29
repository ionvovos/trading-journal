// L4 broker-check scenarios (requirements A1-A3), written from the requirements with numbers computed by hand, run end to end:
// file text -> real parser -> grouping -> statistics engine -> reconcile. None of the input files or expected values is an S2 fixture.
// Cases: a partial exit on a trade still open at the period end, a closing fill with no opening leg in the journal (before and after
// the answer), a missing fee that must never be fitted to a residual (before and after the answer), the spot quantity check, and
// the balance form with a cash item outside trades.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runImport, answerAnomaly, anomaliesForReconcile } from '../../src/import/run.js';
import { reconcile, reconcileQuantity, moneyCtx } from '../../src/import/reconcile.js';
import { tradeMoney, initialRisk } from '../../src/stats/index.js';

const NOW = '2026-09-29T10:00:00.000Z';
const deps = { tradeMoney, initialRisk };
const account = { id: 'acc', name: 'acc', mode: 'real', baseCurrency: 'USD', startBalance: null, toDisplayRate: 1, fileZones: {}, dustThresholds: {}, contractValues: {} };
const GEN = 'time,type,instrument,market,side,size,price,fee,fee_currency,quote_currency,amount,currency,contract_value,id,stop,setup,notes\n';
const KRK = '"txid","ordertxid","pair","time","type","ordertype","price","cost","fee","vol","margin","misc","ledgers"\n';

const run = (text, formatId, fileZone = null, importId = 'imp1') => runImport(
  { text, fileName: `${importId}.csv`, formatId, account, fileZone, declaredZone: 'UTC', existing: { trades: [], cash: [] }, now: NOW, importId }, { deps });
const answer = (res, kind, body) => answerAnomaly(res.importRecord, res.trades, res.importRecord.anomalies.find((a) => a.kind === kind).id, body, { account, existing: { trades: [], cash: [] }, deps, now: NOW });
const check = (res, period, broker) => reconcile({
  trades: res.trades, cash: res.cash, account, period, broker, ctx: moneyCtx(account, { tz: period.zone }), anomalies: anomaliesForReconcile([res.importRecord]),
}, deps);
const P = (from, to) => ({ from, to, zone: 'UTC' });

test('A1.2 partial exit: the exit leg of a trade still open at period end is its own line; a broker figure that leaves it out is explained by it', async () => {
  const res = await run(`${GEN}`
    + '2026-04-06T10:00:00+00:00,trade,XYZ,stock,buy,100,10,1,USD,USD,,,,a1,9,,\n'
    + '2026-04-07T10:00:00+00:00,trade,XYZ,stock,sell,40,12,0.40,USD,USD,,,,a2,,,\n'
    + '2026-04-08T10:00:00+00:00,trade,QQQ,stock,buy,10,50,0,USD,USD,,,,b1,48,,\n'
    + '2026-04-09T10:00:00+00:00,trade,QQQ,stock,sell,10,52,0,USD,USD,,,,b2,,,\n', 'generic-csv');
  assert.equal(res.importRecord.anomalies.length, 0, 'a clean file raises no question');
  assert.equal(res.trades.every((t) => t.holds.length === 0), true);
  // hand: QQQ closed +20.00. XYZ exit leg: (12 - 10) x 40 = 80.00 less entry fee 1.00 x 40/100 = 0.40 less exit fee 0.40 = 79.20 -> 7920 minor
  const period = P('2026-04-06', '2026-04-09');
  const whole = check(res, period, { form: 'net_pnl', valueMinor: 9920 });
  assert.equal(whole.state, 'reconciled');
  assert.equal(whole.oursMinor, 9920);
  assert.equal(whole.openLegsMinor, 7920);
  assert.equal(whole.differenceMinor, 0);
  const closedOnly = check(res, period, { form: 'net_pnl', valueMinor: 2000 });
  assert.equal(closedOnly.state, 'difference_open');
  assert.equal(closedOnly.differenceMinor, -7920);
  assert.deepEqual(closedOnly.explanations.map((e) => [e.cause, e.amountMinor]), [['partial_exit_open', -7920]]);
  const xyz = res.trades.find((t) => t.instrument === 'XYZ');
  assert.deepEqual(closedOnly.explanations[0].tradeIds, [xyz.id], 'names the trade');
  assert.equal(closedOnly.unexplainedMinor, 0);
  assert.equal(tradeMoney(xyz, moneyCtx(account)), null, 'the open trade has no net and enters no statistic');
});

test('A2/A3 closing fill with no opening leg: held out, named with its cause, then released by typing the opening price and date', async () => {
  const res = await run(`${KRK}`
    + '"T1","O1","XXBTZUSD","2026-05-04 12:00:00.0000","sell","limit",65000.00000,6500.00000,6.50000,0.10000000,0.00000,"","L1"\n'
    + '"T2","O2","XXBTZUSD","2026-05-05 09:00:00.0000","buy","limit",60000.00000,3000.00000,3.00000,0.05000000,0.00000,"","L2"\n'
    + '"T3","O3","XXBTZUSD","2026-05-05 10:00:00.0000","sell","limit",61000.00000,3050.00000,3.05000,0.05000000,0.00000,"","L3"\n', 'kraken-trades', 'UTC');
  assert.deepEqual(res.importRecord.anomalies.map((a) => a.kind), ['opened_before_file']);
  const ob = res.importRecord.anomalies[0];
  assert.deepEqual(ob.tradeIds.length, 1);
  const held = res.trades.find((t) => t.id === ob.tradeIds[0]);
  assert.deepEqual(held.holds, ['opened_before_file']);
  // Kraken has no realised P&L, so keep_broker_pnl is not possible for it (architecture 2.3)
  const kept = await answer(res, 'opened_before_file', { optionId: 'keep_broker_pnl' });
  assert.deepEqual(kept.trades.find((t) => t.id === held.id).holds, ['opened_before_file'], 'no realised figure in the file: the trade stays held out');
  // BTC/USD round trip T2-T3: 0.05 x (61000 - 60000) = 50.00, fees 3.00 + 3.05 -> 43.95
  const period = P('2026-05-04', '2026-05-05');
  const before = check(res, period, { form: 'net_pnl', valueMinor: 4395 + 49350 });
  assert.equal(before.oursMinor, 4395, 'the held-out trade is in no figure');
  assert.equal(before.differenceMinor, 49350);
  // the user types the opening: price 60000 on 2026-05-01 -> (65000 - 60000) x 0.1 = 500.00 less fee 6.50 = 493.50
  const done = await answer(res, 'opened_before_file', { optionId: 'enter_open', value: { price: '60000', date: '2026-05-01' } });
  const rel = done.trades.find((t) => t.id === held.id);
  assert.deepEqual(rel.holds, []);
  assert.equal(tradeMoney(rel, moneyCtx(account)).netMinor, 49350);
  const after = check(done, period, { form: 'net_pnl', valueMinor: 4395 + 49350 });
  assert.equal(after.state, 'reconciled');
  assert.equal(after.oursMinor, 53745);
  // exclusion keeps it in the journal, flagged, and out of the figure
  const ex = await answer(res, 'opened_before_file', { optionId: 'exclude' });
  const exTrade = ex.trades.find((t) => t.id === held.id);
  assert.ok(exTrade, 'excluded trade stays in the journal');
  assert.ok(exTrade.excluded, 'and is flagged');
  assert.equal(check(ex, period, { form: 'net_pnl', valueMinor: 4395 }).state, 'reconciled');
});

test('A3.2 no fee is ever fitted to a residual: a blank fee stays "needs input" with no amount until the user types it', async () => {
  const res = await run(`${GEN}`
    + '2026-06-01T10:00:00+00:00,trade,MMM,stock,buy,10,100,,USD,USD,,,,m1,95,,\n'
    + '2026-06-01T11:00:00+00:00,trade,MMM,stock,sell,10,105,1,USD,USD,,,,m2,,,\n', 'generic-csv');
  assert.deepEqual(res.importRecord.anomalies.map((a) => a.kind), ['missing_fee']);
  const period = P('2026-06-01', '2026-06-01');
  // the broker says 47.00: gross 50.00, entry fee 2.00 (unknown to the app), exit fee 1.00. The 2.00 is exactly what could be "fitted".
  const open = check(res, period, { form: 'net_pnl', valueMinor: 4700 });
  assert.equal(open.state, 'difference_open');
  assert.equal(open.oursMinor, 0);
  assert.equal(open.differenceMinor, 4700);
  assert.deepEqual(open.explanations, [], 'nothing is named as the cause');
  assert.equal(open.unexplainedMinor, 4700, 'unexplained difference of 47.00, none of it folded into fees');
  assert.equal(open.needsInput.length, 1);
  assert.equal(open.needsInput[0].cause, 'missing_fee');
  assert.equal('amountMinor' in open.needsInput[0], false);
  // AC-A3.3: after the user types the entry fee the comparison is recomputed
  const typed = await answer(res, 'missing_fee', { optionId: 'enter_fee', value: { 'gen:m1': '2' } });
  const after = check(typed, period, { form: 'net_pnl', valueMinor: 4700 });
  assert.equal(after.state, 'reconciled');
  assert.equal(after.oursMinor, 4700);
  // a wrong typed fee shows the exact difference, not a match
  const wrong = check(await answer(res, 'missing_fee', { optionId: 'enter_fee', value: { 'gen:m1': '1' } }), period, { form: 'net_pnl', valueMinor: 4700 });
  assert.equal(wrong.state, 'difference_open');
  assert.equal(wrong.differenceMinor, -100);
  assert.deepEqual(wrong.explanations, []);
  // fee_zero is the user's answer, also honoured
  const zero = check(await answer(res, 'missing_fee', { optionId: 'fee_zero' }), period, { form: 'net_pnl', valueMinor: 4700 });
  assert.equal(zero.oursMinor, 4900, 'gross 50.00 less the 1.00 exit fee only');
  assert.equal(zero.differenceMinor, -200);
});

test('A1.5 spot quantity check with my own numbers: a fee deducted in the asset explains the gap; an unexplained gap is left unexplained', () => {
  // buy 1.0 BTC at 30,000 (fee 45.00 = 0.0015 BTC), sell 0.4 at 31,000 (fee 18.60)
  const f = (key, side, size, price, fee) => ({ key, instrument: 'BTC/USD', side, size, price, fee, feeCurrency: 'USD' });
  const fills = [f('k1', 'buy', '1.0', '30000', '45'), f('k2', 'sell', '0.4', '31000', '18.6')];
  const r = reconcileQuantity({ fills, asset: 'BTC', brokerQty: '0.5985' });
  assert.equal(r.impliedQty, '0.6');
  assert.equal(r.differenceQty, '-0.0015');
  assert.deepEqual(r.explanations.map((e) => [e.cause, e.fillKeys, e.qty]), [['fee_in_asset', ['k1'], '-0.0015']]);
  assert.equal(r.unexplainedQty, '0');
  const gap = reconcileQuantity({ fills, asset: 'BTC', brokerQty: '0.59' });
  assert.equal(gap.differenceQty, '-0.01');
  assert.deepEqual(gap.explanations, []);
  assert.equal(gap.unexplainedQty, '-0.01');
  assert.equal(reconcileQuantity({ fills, asset: 'BTC', brokerQty: '0.6' }).state, 'reconciled');
});

test('A1.4 balance form: start 10,000, end 10,420, deposit 200, trades 220 gives 0; a 35.00 cash item outside trades is a named category', async () => {
  const res = await run(`${GEN}`
    + '2026-07-01T09:00:00+00:00,deposit,,,,,,,,,200,USD,,d1,,,\n'
    + '2026-07-02T10:00:00+00:00,trade,AAA,stock,buy,10,100,0,USD,USD,,,,x1,95,,\n'
    + '2026-07-02T11:00:00+00:00,trade,AAA,stock,sell,10,122,0,USD,USD,,,,x2,,,\n', 'generic-csv');
  const period = P('2026-07-01', '2026-07-02');
  const bal = (end, other = 0) => ({ form: 'balance', startMinor: 1000000, endMinor: end, depositsMinor: 20000, withdrawalsMinor: 0, otherMinor: other, noOpenPositionsConfirmed: true });
  const ok = check(res, period, bal(1042000));
  assert.equal(ok.state, 'reconciled');
  assert.equal(ok.oursMinor, 22000);
  assert.equal(ok.differenceMinor, 0);
  const off = check(res, period, bal(1042000 - 3500));
  assert.equal(off.state, 'difference_open');
  assert.equal(off.differenceMinor, -3500);
  assert.equal(off.unexplainedMinor, -3500);
  assert.ok(JSON.stringify(off).includes('cash_items'), 'cash items outside trades is named as a category to check, with no amount');
  // the balance form is refused until the user confirms no position was open
  assert.throws(() => check(res, period, { ...bal(1042000), noOpenPositionsConfirmed: false }), /confirmNoOpenPositions/);
});
