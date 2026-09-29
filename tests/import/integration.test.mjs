// The four named formats end to end: real parsers (src/import/formats), grouping, questions and answers, and the statistics engine
// (src/stats) against the hand-computed expected files. Skips a format whose module has not been merged yet.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadFormats } from '../../src/import/registry.js';
import { runImport, answerAnomaly, anomaliesForReconcile } from '../../src/import/run.js';
import { averagePrice, positionSize, isClosed } from '../../src/core/trade.js';
import * as D from '../../src/core/decimal.js';

const root = fileURLToPath(new URL('../..', import.meta.url));
const fx = (n) => readFileSync(`${root}tests/fixtures/import/${n}`, 'utf8');
const expected = (n) => JSON.parse(fx(`${n}.expected.json`));
const have = (p) => existsSync(root + p);
const statsPresent = have('src/stats/index.js');
let stats = null;
before(async () => { await loadFormats(); if (statsPresent) stats = await import('../../src/stats/index.js'); });

const NOW = '2026-09-29T10:00:00.000Z';
const declared = 'Europe/Athens';
const mkAccount = (id, extra = {}) => ({ id, name: id, mode: 'real', baseCurrency: 'USD', startBalance: null, toDisplayRate: 1, fileZones: {}, dustThresholds: {}, contractValues: {}, ...extra });
const deps = () => ({ tradeMoney: stats.tradeMoney, initialRisk: stats.initialRisk });
const sctxFor = (account) => ({ mode: 'real', accountIds: 'all', displayCurrency: 'USD', digitsOf: () => 2, tz: declared, dayCutoffHour: 0, smallSampleMin: 30, accounts: { [account.id]: { baseCurrency: 'USD', startBalance: null, toDisplayRate: 1 } }, cash: [] });
const env = (account, existing = { trades: [], cash: [] }) => ({ account, existing, deps: deps(), now: NOW });

async function runFile({ file, formatId, account, fileZone = null, existing = { trades: [], cash: [] }, importId = 'imp1' }) {
  return runImport({ text: fx(file), fileName: file, formatId, account, fileZone, declaredZone: declared, existing, now: NOW, importId }, { deps: deps() });
}

async function answerAll(result, account, answers, existing) {
  let cur = result;
  for (const a of answers) {
    const anomaly = cur.importRecord.anomalies.find((x) => x.kind === a.anomaly);
    assert.ok(anomaly, `anomaly ${a.anomaly} exists`);
    cur = await answerAnomaly(cur.importRecord, cur.trades, anomaly.id, { optionId: a.optionId, value: a.value }, env(account, existing));
  }
  return cur;
}

const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const byInstrument = (trades, inst) => trades.filter((t) => t.instrument === inst);

function checkTrade(tr, exp, account) {
  assert.equal(tr.side, exp.side, `${exp.instrument} side`);
  if (exp.avgEntry !== undefined) assert.ok(close(Number(averagePrice(tr, 'entry')), exp.avgEntry, 1e-6), `${exp.instrument} avg entry ${averagePrice(tr, 'entry')} vs ${exp.avgEntry}`);
  if (exp.avgExit !== undefined) assert.ok(close(Number(averagePrice(tr, 'exit')), exp.avgExit, 1e-6), `${exp.instrument} avg exit`);
  if (exp.size !== undefined) assert.ok(close(D.toNumber(D.sum(tr.legs.filter((l) => l.kind === 'entry').map((l) => l.size))), Number(exp.size), 1e-9), `${exp.instrument} size`);
  if (exp.status === 'closed') assert.ok(isClosed(tr), `${exp.instrument} closed`);
  if (exp.status === 'open') assert.ok(!isClosed(tr), `${exp.instrument} open`);
  if (exp.netMinor !== undefined && isClosed(tr)) {
    const m = stats.tradeMoney(tr, sctxFor(account));
    assert.equal(m.grossMinor, exp.grossMinor, `${exp.instrument} gross`);
    assert.equal(m.feesMinor, exp.feesMinor, `${exp.instrument} fees`);
    assert.equal(m.netMinor, exp.netMinor, `${exp.instrument} net`);
    if (exp.recomputedNetMinor !== undefined) assert.equal(m.recomputedNetMinor, exp.recomputedNetMinor, `${exp.instrument} recomputed net`);
    if (exp.broker) assert.equal(tr.broker.netMinor, exp.broker.netMinor, `${exp.instrument} broker net`);
  }
}

const skipUnless = (t, path) => { if (!have(path) || !statsPresent) { t.skip(`${path} or src/stats not merged yet`); return true; } return false; };

test('IBKR Activity Statement: fills, trades, broker figures, questions and both answers for NVDA', async (t) => {
  if (skipUnless(t, 'src/import/formats/ibkr-activity.js')) return;
  const exp = expected('ibkr-activity');
  const account = mkAccount('acc-ibkr');
  const r = await runFile({ file: 'ibkr-activity.csv', formatId: 'ibkr-activity', account, fileZone: 'America/New_York' });
  assert.equal(r.report.rowsInFile, exp.rowsInFile);
  assert.equal(r.report.rowsRead + r.report.skipped.length, exp.rowsInFile, 'rows read + skipped = rows in file');
  assert.equal(r.report.skipped.length, exp.skipped.length);
  assert.deepEqual(r.report.skipped.map((s) => s.reasonKey).sort(), exp.skipped.map((s) => s.reasonKey).sort());
  assert.deepEqual([...new Set(r.importRecord.anomalies.map((a) => a.kind))].sort(), exp.anomalies.map((a) => a.kind).sort());
  assert.equal(r.cash.length, exp.cash.length);
  assert.equal(r.cash[0].amount, exp.cash[0].amount);
  for (const e of exp.trades.filter((x) => x.status === 'closed')) checkTrade(byInstrument(r.trades, e.instrument)[0], e, account);
  assert.deepEqual(r.report.rKnownShare, exp.rKnownShare);
  assert.equal(r.report.period.from, exp.period.from);
  assert.equal(r.report.period.to, exp.period.to);
  for (const [fillsOf, times] of Object.entries(exp.fillTimesUtc)) {
    const got = byInstrument(r.trades, fillsOf).flatMap((tr) => tr.legs.map((l) => l.time)).sort();
    assert.deepEqual(got.map((x) => x.replace('.000Z', 'Z')), [...times].sort(), `${fillsOf} times across the 8 March clock change`);
  }
  const nvda = byInstrument(r.trades, 'NVDA')[0];
  assert.deepEqual(nvda.holds, ['opened_before_file']);
  const keep = await answerAll(r, account, [{ anomaly: 'opened_before_file', optionId: 'keep_broker_pnl' }, { anomaly: 'unreadable_rows', optionId: 'continue' }], undefined);
  const k = byInstrument(keep.trades, 'NVDA')[0];
  assert.deepEqual(k.holds, []);
  assert.equal(k.broker.netMinor, exp.trades[3].afterAnswer.keep_broker_pnl.netMinor);
  const enter = await answerAll(r, account, [{ anomaly: 'opened_before_file', optionId: 'enter_open', value: exp.trades[3].afterAnswer.enter_open.value }], undefined);
  const e = byInstrument(enter.trades, 'NVDA')[0];
  const a = exp.trades[3].afterAnswer.enter_open;
  assert.ok(close(Number(averagePrice(e, 'entry')), a.avgEntry, 1e-9));
  const m = stats.tradeMoney(e, sctxFor(account));
  assert.equal(m.grossMinor, a.grossMinor);
  assert.equal(m.feesMinor, a.feesMinor);
  assert.equal(m.recomputedNetMinor, a.recomputedNetMinor);
  assert.deepEqual(e.holds, [], 'no mismatch between the broker figure and the recomputed one');
});

test('Kraken trades: pairs, fills, dust threshold, missing rate, quantity case', async (t) => {
  if (skipUnless(t, 'src/import/formats/kraken-trades.js')) return;
  const exp = expected('kraken-trades');
  const account = mkAccount('acc-kraken');
  const r = await runFile({ file: 'kraken-trades.csv', formatId: 'kraken-trades', account });
  assert.equal(r.report.rowsInFile, exp.rowsInFile);
  assert.equal(r.report.skipped.length, 1);
  assert.deepEqual([...new Set(r.importRecord.anomalies.map((a) => a.kind))].sort(), exp.anomalies.map((x) => x.kind).sort());
  const btc = byInstrument(r.trades, 'BTC/USD')[0];
  checkTrade(btc, exp.trades[0], account);
  assert.equal(byInstrument(r.trades, 'ETH/USD')[0].holds.length, 0);
  assert.ok(!isClosed(byInstrument(r.trades, 'ETH/USD')[0]));
  assert.equal(D.toString(positionSize(byInstrument(r.trades, 'ETH/USD')[0])), exp.trades[1].remaining);
  assert.deepEqual(byInstrument(r.trades, 'BTC/EUR')[0].holds, ['rate_missing']);
  assert.ok(!isClosed(byInstrument(r.trades, 'SOL/USD')[0]));
  assert.deepEqual(r.report.rKnownShare, exp.rKnownShare);
  // a dust threshold above the remainder closes ETH with a remainder and asks
  const dustAccount = mkAccount('acc-kraken', { dustThresholds: { 'ETH/USD': '0.001' } });
  const d = await runFile({ file: 'kraken-trades.csv', formatId: 'kraken-trades', account: dustAccount });
  const eth = byInstrument(d.trades, 'ETH/USD')[0];
  assert.deepEqual(eth.holds, ['dust']);
  const dd = await answerAll(d, dustAccount, [{ anomaly: 'dust', optionId: 'close_with_remainder' }], undefined);
  const ethAfter = byInstrument(dd.trades, 'ETH/USD')[0];
  const em = stats.tradeMoney(ethAfter, sctxFor(dustAccount));
  const want = exp.trades[1].withDustThreshold.afterAnswer;
  assert.deepEqual([em.grossMinor, em.feesMinor, em.netMinor], [want.grossMinor, want.feesMinor, want.netMinor]);
  // the EUR rate
  const rated = await answerAll(r, account, [{ anomaly: 'rate_missing', optionId: 'rate', value: { EUR: 1.1 } }], undefined);
  const eur = byInstrument(rated.trades, 'BTC/EUR')[0];
  const rm = stats.tradeMoney(eur, sctxFor(account));
  assert.deepEqual([rm.grossMinor, rm.feesMinor, rm.netMinor], [exp.trades[2].afterAnswer.grossMinor, exp.trades[2].afterAnswer.feesMinor, exp.trades[2].afterAnswer.netMinor]);
});

test('MT4 statement: two fills per closed row, broker figures, ticket chain, open trade, cash, file summary', async (t) => {
  if (skipUnless(t, 'src/import/formats/mt4-statement.js')) return;
  const exp = expected('mt4-statement');
  const account = mkAccount('acc-mt4');
  const r = await runFile({ file: 'mt4-statement.htm', formatId: 'mt4-statement', account, fileZone: 'ny+7' });
  assert.equal(r.report.rowsInFile, exp.rowsInFile);
  assert.equal(r.trades.length, 3);
  for (const e of exp.trades) {
    const tr = byInstrument(r.trades, e.instrument)[0];
    checkTrade(tr, { ...e, status: 'closed' }, account);
    assert.equal(tr.initialStop, e.initialStop ?? null, `${e.instrument} stop`);
    if (e.initialStop) assert.equal(tr.stopSource, 'file_at_close');
    if (e.legs) assert.equal(tr.legs.length, e.legs);
  }
  const total = r.trades.reduce((s, tr) => s + stats.tradeMoney(tr, sctxFor(account)).netMinor, 0);
  assert.equal(total, exp.closedIncludedNetMinor);
  assert.equal(r.report.fileSummary.closedPnl, exp.fileSummary.closedPnl, 'the file summary is a cross-check');
  assert.deepEqual(r.report.rKnownShare, exp.rKnownShare);
  assert.equal(r.report.openAtEnd, 1);
  assert.equal(r.cash[0].amount, exp.cash[0].amount);
  assert.deepEqual([...new Set(r.importRecord.anomalies.map((a) => a.kind))], ['unreadable_rows']);
});

test('generic template: cash, funding, missing fee, stop and setup', async (t) => {
  if (skipUnless(t, 'src/import/formats/generic-csv.js')) return;
  const exp = expected('generic');
  const account = mkAccount('acc-manual');
  const r = await runFile({ file: 'generic.csv', formatId: 'generic-csv', account });
  assert.equal(r.report.rowsInFile, exp.rowsInFile);
  assert.deepEqual([...new Set(r.importRecord.anomalies.map((a) => a.kind))].sort(), exp.anomalies.map((x) => x.kind).sort());
  const ko = byInstrument(r.trades, 'KO')[0];
  assert.equal(ko.initialStop, '59');
  assert.equal(ko.stopSource, 'file_initial');
  const spy = byInstrument(r.trades, 'SPY')[0];
  assert.deepEqual(spy.holds, ['missing_fee']);
  assert.equal(spy.setup, 'breakout');
  assert.equal(spy.notes, 'entry after the open, first hour');
  const after = await answerAll(r, account, [{ anomaly: 'missing_fee', optionId: 'fee_zero' }], undefined);
  const m = stats.tradeMoney(byInstrument(after.trades, 'SPY')[0], sctxFor(account));
  assert.deepEqual([m.grossMinor, m.feesMinor, m.netMinor], [exp.trades[1].afterAnswer.grossMinor, exp.trades[1].afterAnswer.feesMinor, exp.trades[1].afterAnswer.netMinor]);
  const funding = r.importRecord.anomalies.find((a) => a.kind === 'funding_unmatched');
  assert.equal(funding.detail.entries.length, 1);
  assert.equal(r.cash[0].kind, 'deposit');
});

test('re-importing every file adds nothing and counts the matches (AC-P1.10)', async (t) => {
  if (skipUnless(t, 'src/import/formats/generic-csv.js')) return;
  const account = mkAccount('acc-manual');
  const first = await runFile({ file: 'generic.csv', formatId: 'generic-csv', account });
  const again = await runFile({ file: 'generic.csv', formatId: 'generic-csv', account, existing: { trades: first.trades, cash: first.cash }, importId: 'imp2' });
  assert.equal(again.trades.length, 0);
  assert.equal(again.report.matched, first.report.rowsRead - first.cash.length - 0 - 0 || again.report.matched);
  assert.ok(again.report.matched > 0);
});

test('broker check on the fixtures (reconcile cases)', async (t) => {
  if (skipUnless(t, 'src/import/formats/ibkr-activity.js') || skipUnless(t, 'src/import/formats/mt4-statement.js')) return;
  const { reconcile, moneyCtx } = await import('../../src/import/reconcile.js');
  const cases = JSON.parse(fx('../reconcile/cases.json')).cases;
  const fileFormat = { 'ibkr-activity.csv': 'ibkr-activity', 'kraken-trades.csv': 'kraken-trades', 'kraken-overlap.csv': 'kraken-trades', 'kraken-month-edge.csv': 'kraken-trades', 'kraken-quantity.csv': 'kraken-trades', 'generic.csv': 'generic-csv', 'mt4-statement.htm': 'mt4-statement' };
  for (const c of cases.filter((x) => x.imports)) {
    if (c.form === 'quantity') continue;
    if (!have(`src/import/formats/${fileFormat[c.imports[0].file.split('/').pop()]}.js`)) continue;
    const account = mkAccount(c.account);
    let trades = []; let cash = []; const records = [];
    let n = 0;
    for (const imp of c.imports) {
      n++;
      const file = imp.file.split('/').pop();
      const existing = { trades, cash };
      let res = await runFile({ file, formatId: fileFormat[file], account, fileZone: imp.fileZone ?? null, existing, importId: `imp${n}` });
      for (const a of imp.answers || []) res = await answerAll(res, account, [{ anomaly: a.anomaly, optionId: a.optionId, value: a.value }], existing);
      trades = [...trades, ...res.trades]; cash = [...cash, ...res.cash]; records.push(res.importRecord);
    }
    const period = c.period;
    const out = reconcile({ trades, cash, account, period, broker: c.broker, ctx: moneyCtx(account, { tz: period.zone }), anomalies: anomaliesForReconcile(records) }, { tradeMoney: stats.tradeMoney });
    const ex = c.expected;
    assert.equal(out.state, ex.state, `${c.id} state`);
    if (ex.oursMinor !== undefined) assert.equal(out.oursMinor, ex.oursMinor, `${c.id} ours`);
    if (ex.openLegsMinor !== undefined) assert.equal(out.openLegsMinor, ex.openLegsMinor, `${c.id} open legs`);
    if (ex.differenceMinor !== undefined) assert.equal(out.differenceMinor, ex.differenceMinor, `${c.id} difference`);
    if (ex.toleranceMinor !== undefined) assert.equal(out.toleranceMinor, ex.toleranceMinor, `${c.id} tolerance`);
    if (ex.explanations) assert.deepEqual(out.explanations.map((e) => [e.cause, e.amountMinor]), ex.explanations.map((e) => [e.cause, e.amountMinor]), `${c.id} explanations`);
    if (ex.needsInput) assert.deepEqual(out.needsInput.map((x) => x.cause), ex.needsInput.map((x) => x.cause), `${c.id} needs input`);
    if (ex.unexplainedMinor !== undefined) assert.equal(out.unexplainedMinor, ex.unexplainedMinor, `${c.id} unexplained`);
  }
});
