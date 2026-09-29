import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMemoryStore } from '../../src/storage/memory.js';
import { buildExport, parseExport, mergeImport, exportFileName } from '../../src/storage/exportImport.js';

const core = JSON.parse(readFileSync(new URL('../fixtures/stats/core.json', import.meta.url), 'utf8'));
const acc = (id, mode = 'real') => ({ id, name: id, mode, baseCurrency: 'USD', startBalance: '1000' });

async function filledStore() {
  const s = createMemoryStore();
  for (const id of new Set(core.trades.map((t) => t.accountId))) await s.accounts.put(acc(id, id === 'acc-paper' ? 'paper' : 'real'));
  await s.trades.putMany(core.trades);
  await s.cash.put({ id: 'c1', accountId: 'acc-ibkr', kind: 'deposit', amount: '1000', currency: 'USD', time: '2026-03-02', importId: null, key: null, note: '' });
  await s.imports.put({ id: 'i1', accountId: 'acc-ibkr', formatId: 'ibkr-activity', rawText: 'a,b', report: { rowsInFile: 11 }, anomalies: [] });
  await s.reconciliations.put({ id: 'acc-ibkr:2026-03-02:2026-03-09', accountId: 'acc-ibkr', state: 'reconciled' });
  await s.plans.put({ id: 'P1', name: 'My plan', active: true });
  await s.reviews.put({ id: 'R1', mode: 'real', createdAt: '2026-03-09T00:00:00Z' });
  await s.blobs.put({ id: 'b1', type: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,/9j/AA==' });
  await s.setSetting('tz', 'Europe/Athens');
  await s.setSetting('lang', 'el');
  return s;
}

test('core.json trades have the accountId the export needs', () => {
  assert.ok(core.trades.every((t) => typeof t.accountId === 'string' && t.accountId), 'every trade has an accountId');
});

test('export then import into an empty store restores everything (AC-P8.3, AC-P3.5 storage half)', async () => {
  const s = await filledStore();
  const file = await buildExport(s, { now: '2026-09-29T10:00:00Z' });
  assert.equal(file.format, 'trading-journal-export');
  assert.equal(file.version, 1);
  const parsed = parseExport(JSON.stringify(file));
  assert.equal(parsed.ok, true);
  const empty = createMemoryStore();
  const r = await mergeImport(empty, parsed.data);
  assert.equal(r.kept, 0);
  assert.equal(r.byStore.trades.added, core.trades.length);
  assert.deepEqual((await empty.trades.getAll()).sort((a, b) => a.id.localeCompare(b.id)), (await s.trades.getAll()).sort((a, b) => a.id.localeCompare(b.id)));
  for (const name of ['accounts', 'cash', 'imports', 'reconciliations', 'plans', 'reviews', 'blobs']) {
    assert.deepEqual(await empty[name].getAll(), await s[name].getAll(), name);
  }
  assert.equal(await empty.getSetting('lang'), 'el');
});

test('merge by id: added N, kept M, and a second import adds nothing', async () => {
  const s = await filledStore();
  const file = JSON.parse(JSON.stringify(await buildExport(s)));
  const again = await mergeImport(s, file);
  assert.equal(again.added, 0);
  const rowCount = ['accounts', 'trades', 'cash', 'imports', 'reconciliations', 'plans', 'reviews', 'blobs'].reduce((n, k) => n + file[k].length, 0);
  assert.equal(again.kept, rowCount);
  const half = createMemoryStore();
  await half.trades.put(core.trades[0]);
  const r = await mergeImport(half, file);
  assert.equal(r.byStore.trades.kept, 1);
  assert.equal(r.byStore.trades.added, core.trades.length - 1);
});

test('a stored row wins over the file row with the same id', async () => {
  const s = createMemoryStore();
  await s.plans.put({ id: 'P1', name: 'mine' });
  const r = await mergeImport(s, { plans: [{ id: 'P1', name: 'from file' }, { id: 'P2', name: 'new' }], settings: {} });
  assert.deepEqual([r.added, r.kept], [1, 1]);
  assert.equal((await s.plans.get('P1')).name, 'mine');
});

test('no export contains the own key (canary)', async () => {
  const s = await filledStore();
  const KEY = 'sk-ant-CANARY-0123456789';
  globalThis.localStorage = { getItem: () => KEY, setItem() {}, removeItem() {} }; // the key lives here only
  await s.setSetting('ai.provider', 'anthropic');
  await s.setSetting('ai.host', 'api.anthropic.com');
  await s.setSetting('ai.key', KEY); // a mistake: a key stored as a setting is still dropped
  const text = JSON.stringify(await buildExport(s));
  delete globalThis.localStorage;
  assert.ok(!text.includes(KEY), 'canary key absent');
  assert.ok(!text.includes('"ai.key"'), 'key-named setting absent');
  assert.ok(text.includes('"ai.provider"'), 'other ai settings stay');
});

test('parseExport is all or nothing', () => {
  const good = { format: 'trading-journal-export', version: 1, exportedAt: 'x', appVersion: '1', settings: {}, accounts: [acc('a1')], trades: [], cash: [], imports: [], reconciliations: [], plans: [], reviews: [], blobs: [] };
  assert.equal(parseExport(JSON.stringify(good)).ok, true);
  assert.deepEqual(parseExport('not json'), { ok: false, errorKey: 'export.error.notJson' });
  assert.deepEqual(parseExport('[]'), { ok: false, errorKey: 'export.error.wrongFormat' });
  assert.deepEqual(parseExport(JSON.stringify({ ...good, format: 'other' })), { ok: false, errorKey: 'export.error.wrongFormat' });
  assert.deepEqual(parseExport(JSON.stringify({ ...good, version: 2 })), { ok: false, errorKey: 'export.error.newerVersion', detail: '2' });
  const bad = parseExport(JSON.stringify({ ...good, trades: [{ id: 't1', accountId: 'a1', mode: 'real', side: 'long', instrument: 'X', legs: [] }, { id: 't2' }] }));
  assert.equal(bad.ok, false);
  assert.equal(bad.errorKey, 'export.error.badRow');
  assert.equal(bad.detail, 'trades[1].accountId');
  assert.equal(parseExport(JSON.stringify({ ...good, blobs: [{ id: 'b', dataUrl: 'http://x' }] })).detail, 'blobs[0].dataUrl');
  assert.equal(parseExport(JSON.stringify({ ...good, cash: 'x' })).detail, 'cash');
});

test('a trade leg with a bad shape is refused', () => {
  const t = { id: 't1', accountId: 'a1', mode: 'real', side: 'long', instrument: 'X', legs: [{ id: 'l1', kind: 'entry', time: '2026-03-02T10:00:00Z', price: 50, size: '1' }] };
  const r = parseExport(JSON.stringify({ format: 'trading-journal-export', version: 1, trades: [t] }));
  assert.equal(r.ok, false);
  assert.equal(r.detail, 'trades[0].legs');
});

test('file name', () => {
  assert.equal(exportFileName('2026-09-29T10:00:00Z'), 'trading-journal-2026-09-29.json');
});
