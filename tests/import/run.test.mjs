import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { formats, loadFormats } from '../../src/import/registry.js';
import { runImport, answerAnomaly, commitImport, anomaliesForReconcile, effectiveFileZone } from '../../src/import/run.js';
import { createMemoryStore } from '../../src/storage/memory.js';
import { createBus } from '../helpers/bus.mjs';

// A stub format that reads JSON, so the flow is tested independently of the four real parsers.
const stub = {
  id: 'stub-json', market: 'stock', labelKey: 'import.format.stub', statesZone: false,
  detect: (text) => (text.startsWith('{"stub"') ? 0.95 : 0),
  parse: (text) => JSON.parse(text).stub,
};
const stateful = { ...stub, id: 'stub-zone', statesZone: true, detect: (text) => (text.startsWith('{"zone"') ? 0.95 : 0), parse: (text) => JSON.parse(text).zone };

before(async () => {
  await loadFormats();
  formats.push(stub, stateful);
});

const account = { id: 'acc', name: 'Test', mode: 'real', baseCurrency: 'USD' };
const NOW = '2026-09-29T10:00:00.000Z';
const fill = (key, side, size, price, time, o = {}) => ({ key, time, instrument: o.instrument ?? 'KO', market: 'stock', side, size, price, fee: o.fee === undefined ? '0' : o.fee, feeCurrency: 'USD', quoteCurrency: 'USD', contractSize: '1', positionId: null, openClose: null, broker: null, stop: o.stop ?? null, stopSource: o.stop ? 'file_initial' : null, target: null, quoteToAccount: null, setup: null, notes: null, row: o.row ?? 1 });
const parsed = (o = {}) => ({
  rowsInFile: 6,
  fills: [fill('s:1', 'buy', '100', '60', '2026-03-10T09:00:00.000Z', { stop: '59', row: 2 }), fill('s:2', 'sell', '100', '61', '2026-03-10T10:00:00.000Z', { row: 3 }),
    fill('s:3', 'buy', '10', '500', '2026-03-11T14:40:00.000Z', { instrument: 'SPY', fee: null, row: 4 }), fill('s:4', 'sell', '10', '505', '2026-03-11T15:00:00.000Z', { instrument: 'SPY', fee: '1', row: 5 })],
  cash: [{ row: 1, kind: 'deposit', amount: '1000', currency: 'USD', time: '2026-03-10T08:00:00.000Z', key: 's:c1' }],
  funding: [], skipped: [{ row: 6, reasonKey: 'import.skip.number', raw: 'x' }], openAtEnd: [], fileSummary: null, accountCurrency: 'USD', sizeStep: '1', ...o,
});
const text = (p = parsed()) => JSON.stringify({ stub: p });
const deps = { initialRisk: (t) => ({ value: t.initialStop ? 100 : null }) };
const input = (o = {}) => ({ text: text(), fileName: 'x.csv', account, fileZone: 'America/New_York', declaredZone: 'Europe/Athens', existing: { trades: [], cash: [] }, now: NOW, importId: 'imp1', ...o });

test('runImport: record, trades, cash, report, questions', async () => {
  const bus = createBus();
  const events = [];
  bus.on('import-progress', (e) => events.push(['progress', e]));
  bus.on('import-done', (e) => events.push(['done', e.importId]));
  const r = await runImport(input(), { bus, deps });
  const rec = r.importRecord;
  assert.equal(rec.id, 'imp1');
  assert.equal(rec.formatId, 'stub-json');
  assert.equal(rec.accountId, 'acc');
  assert.equal(rec.fileZone, 'America/New_York');
  assert.equal(rec.rawText, text());
  assert.equal(rec.status, 'open');
  assert.equal(r.trades.length, 2);
  assert.deepEqual(r.trades.map((t) => t.importId), ['imp1', 'imp1']);
  assert.deepEqual(r.cash, [{ id: 'imp1:cash:1', accountId: 'acc', time: '2026-03-10T08:00:00.000Z', kind: 'deposit', amount: '1000', currency: 'USD', importId: 'imp1', key: 's:c1', note: '' }]);
  assert.deepEqual(rec.anomalies.map((a) => a.kind), ['missing_fee', 'unreadable_rows']);
  const rep = r.report;
  assert.equal(rep.rowsInFile, 6);
  assert.equal(rep.rowsRead, 5, '4 fills + 1 cash row');
  assert.equal(rep.tradesBuilt, 2);
  assert.equal(rep.matched, 0);
  assert.deepEqual(rep.skipped, [{ row: 6, reasonKey: 'import.skip.number' }]);
  assert.deepEqual(rep.rKnownShare, { known: 1, of: 1 }, 'KO closed with a stop; SPY is held out');
  assert.deepEqual(rep.period, { from: '2026-03-10', to: '2026-03-11', zone: 'America/New_York' });
  assert.equal(rep.anomalyCounts.missing_fee, 1);
  assert.equal(rep.currencyMismatch, false);
  assert.deepEqual(r.accountUpdates.fileZone, { formatId: 'stub-json', zone: 'America/New_York' });
  assert.ok(events.some((e) => e[0] === 'progress'));
  assert.deepEqual(events.at(-1), ['done', 'imp1']);
  assert.equal(rep.rowsInFile, rep.rowsRead + rep.skipped.length, 'rows read + skipped = rows in file');
});

test('a format that does not state its zone needs one; unknown and undetected formats error with a code', async () => {
  await assert.rejects(() => runImport(input({ fileZone: null }), { deps }), (e) => e.code === 'import.error.needZone');
  await assert.rejects(() => runImport(input({ formatId: 'nope' }), { deps }), (e) => e.code === 'import.error.unknownFormat');
  await assert.rejects(() => runImport(input({ text: 'garbage' }), { deps }), (e) => e.code === 'import.error.formatNotDetected');
});

test('a format that states its zone asks for none', async () => {
  const p = { ...parsed(), skipped: [] };
  const r = await runImport(input({ text: JSON.stringify({ zone: p }), fileZone: null }), { deps });
  assert.equal(r.importRecord.formatId, 'stub-zone');
  assert.equal(r.accountUpdates.fileZone, undefined);
  assert.equal(effectiveFileZone({ statesZone: true, id: 'kraken-trades' }, null, 'Europe/Athens'), 'UTC');
  assert.equal(effectiveFileZone({ statesZone: true, id: 'generic-csv' }, null, 'Europe/Athens'), null);
  assert.equal(effectiveFileZone({ statesZone: true, id: 'x', zone: 'Europe/Paris' }, null, 'Europe/Athens'), 'Europe/Paris');
  assert.equal(effectiveFileZone({ statesZone: false }, 'ny+7', 'Europe/Athens'), 'ny+7');
});

test('importing the same file again creates nothing and counts the matches (AC-P1.10)', async () => {
  const first = await runImport(input(), { deps });
  const again = await runImport(input({ importId: 'imp2', existing: { trades: first.trades, cash: first.cash } }), { deps });
  assert.equal(again.trades.length, 0);
  assert.equal(again.cash.length, 0);
  assert.equal(again.report.matched, 4);
  assert.deepEqual(again.importRecord.anomalies.map((a) => a.kind), ['unreadable_rows']);
});

test('answerAnomaly rebuilds with the answer, keeps what was typed on the trades, and records the answer', async () => {
  const bus = createBus();
  const seen = [];
  bus.on('anomaly-answered', (e) => seen.push(e.optionId));
  const first = await runImport(input(), { deps });
  const spy = first.trades.find((t) => t.instrument === 'SPY');
  assert.deepEqual(spy.holds, ['missing_fee']);
  const edited = first.trades.map((t) => (t.id === spy.id ? { ...t, initialStop: '495', stopSource: 'user', notes: 'after the open', setup: 'breakout', updatedAt: 'later' } : t));
  const fee = first.importRecord.anomalies.find((a) => a.kind === 'missing_fee');
  const out = await answerAnomaly(first.importRecord, edited, fee.id, { optionId: 'fee_zero' }, { account, existing: { trades: [], cash: [] }, deps, bus, now: NOW });
  const t = out.trades.find((x) => x.instrument === 'SPY');
  assert.deepEqual(t.holds, []);
  assert.equal(t.legs[0].fee, '0');
  assert.equal(t.initialStop, '495');
  assert.equal(t.stopSource, 'user');
  assert.equal(t.notes, 'after the open');
  assert.equal(t.setup, 'breakout');
  assert.equal(t.id, spy.id, 'ids are stable across rebuilds');
  const recorded = out.importRecord.anomalies.find((a) => a.kind === 'missing_fee');
  assert.equal(recorded.answer.optionId, 'fee_zero');
  assert.equal(recorded.answer.at, NOW);
  assert.deepEqual(out.report.rKnownShare, { known: 2, of: 2 });
  assert.deepEqual(seen, ['fee_zero']);
  assert.equal(out.importRecord.createdAt, first.importRecord.createdAt);
});

test('a per-trade override beats the answer for all', async () => {
  const p = parsed({ fills: [
    fill('s:1', 'buy', '1', '10', '2026-03-10T09:00:00.000Z', { instrument: 'A', fee: null }), fill('s:2', 'sell', '1', '11', '2026-03-10T10:00:00.000Z', { instrument: 'A' }),
    fill('s:3', 'buy', '1', '10', '2026-03-10T09:00:00.000Z', { instrument: 'B', fee: null }), fill('s:4', 'sell', '1', '11', '2026-03-10T10:00:00.000Z', { instrument: 'B' })], skipped: [] });
  const first = await runImport(input({ text: text(p) }), { deps });
  const anomaly = first.importRecord.anomalies[0];
  assert.equal(anomaly.tradeIds.length, 2, 'one question for both trades');
  const env = { account, existing: { trades: [], cash: [] }, deps, now: NOW };
  const all = await answerAnomaly(first.importRecord, first.trades, anomaly.id, { optionId: 'fee_zero' }, env);
  const over = await answerAnomaly(all.importRecord, all.trades, anomaly.id, { optionId: 'exclude', tradeId: first.trades[1].id }, env);
  assert.equal(over.trades[0].excluded, null);
  assert.equal(over.trades[1].excluded.by, 'import');
  assert.deepEqual(over.importRecord.anomalies[0].overrides, { [first.trades[1].id]: { optionId: 'exclude', value: undefined } });
});

test('cancel_import on unreadable rows drops the trades and cash and marks the record', async () => {
  const first = await runImport(input(), { deps });
  const unreadable = first.importRecord.anomalies.find((a) => a.kind === 'unreadable_rows');
  const out = await answerAnomaly(first.importRecord, first.trades, unreadable.id, { optionId: 'cancel_import' }, { account, existing: { trades: [], cash: [] }, deps, now: NOW });
  assert.equal(out.importRecord.status, 'cancelled');
  assert.deepEqual(out.trades, []);
  assert.deepEqual(out.cash, []);
  const cont = await answerAnomaly(first.importRecord, first.trades, unreadable.id, { optionId: 'continue' }, { account, existing: { trades: [], cash: [] }, deps, now: NOW });
  assert.equal(cont.importRecord.status, 'open');
  assert.equal(cont.trades.length, 2);
});

test('an answered anomaly that is no longer raised stays on the record (merged duplicates)', async () => {
  const stored = await runImport(input(), { deps });
  const p = { ...parsed(), fills: [fill('s:9', 'buy', '100', '60', '2026-03-10T09:00:00.500Z', { row: 2 }), fill('s:10', 'sell', '100', '61', '2026-03-10T10:00:00.000Z', { row: 3 })], cash: [], skipped: [] };
  const second = await runImport(input({ importId: 'imp2', text: text(p), existing: { trades: stored.trades, cash: stored.cash } }), { deps });
  const dup = second.importRecord.anomalies.find((a) => a.kind === 'near_duplicate');
  assert.equal(dup.tradeIds.length, 1);
  const merged = await answerAnomaly(second.importRecord, second.trades, dup.id, { optionId: 'merge' }, { account, existing: { trades: stored.trades, cash: stored.cash }, deps, now: NOW });
  const kept = merged.importRecord.anomalies.find((a) => a.kind === 'near_duplicate');
  assert.equal(kept.answer.optionId, 'merge');
  assert.equal(kept.resolved, true);
  assert.deepEqual(kept.tradeIds, []);
  assert.equal(merged.report.matched, 2, 'both new fills repeat a stored one and are dropped');
});

test('a file in another account currency is reported', async () => {
  const r = await runImport(input({ text: text(parsed({ accountCurrency: 'EUR' })) }), { deps });
  assert.equal(r.report.currencyMismatch, true);
  assert.equal(r.report.fileCurrency, 'EUR');
});

test('commitImport writes the import row, trades and cash in one transaction and replaces an earlier build', async () => {
  const store = createMemoryStore();
  const first = await runImport(input(), { deps });
  await commitImport(store, first);
  assert.equal((await store.imports.getAll()).length, 1);
  assert.equal((await store.trades.getAll()).length, 2);
  assert.equal((await store.cash.getAll()).length, 1);
  const fee = first.importRecord.anomalies.find((a) => a.kind === 'missing_fee');
  const second = await answerAnomaly(first.importRecord, first.trades, fee.id, { optionId: 'exclude' }, { account, existing: { trades: [], cash: [] }, deps, now: NOW });
  await commitImport(store, second, { replaceTradeIds: first.trades.map((t) => t.id), replaceCashIds: first.cash.map((c) => c.id) });
  assert.equal((await store.trades.getAll()).length, 2);
  assert.equal((await store.imports.get('imp1')).anomalies.find((a) => a.kind === 'missing_fee').answer.optionId, 'exclude');
});

test('anomaliesForReconcile attaches the file zone of each import', async () => {
  const r = await runImport(input(), { deps });
  const list = anomaliesForReconcile([r.importRecord]);
  assert.ok(list.length > 0);
  assert.ok(list.every((a) => a.fileZone === 'America/New_York'));
});

test('unknown anomaly and option are refused', async () => {
  const r = await runImport(input(), { deps });
  await assert.rejects(() => answerAnomaly(r.importRecord, r.trades, 'nope', { optionId: 'fee_zero' }, { account }), (e) => e.code === 'import.error.unknownAnomaly');
  const fee = r.importRecord.anomalies[0];
  await assert.rejects(() => answerAnomaly(r.importRecord, r.trades, fee.id, { optionId: 'split' }, { account }), (e) => e.code === 'import.error.unknownOption');
});
