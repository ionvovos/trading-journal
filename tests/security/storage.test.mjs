// L4b probe 4: storage, import and export hostility (requirements AC-P8.3, AC-P8.8, AC-P8.9, AC-B1.2). Node-side; the CSP, the real
// IndexedDB and the delete-all flow in a browser are in tests/security/browser-probe.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { createMemoryStore } from '../../src/storage/memory.js';
import { buildExport, parseExport, mergeImport } from '../../src/storage/exportImport.js';
import { deleteAllData } from '../../src/storage/actions.js';
import { ROW_STORES, ALL_STORES } from '../../src/storage/migrate.js';
import { reportHtml, esc } from '../../src/import/reportHtml.js';
import { parseCsv } from '../../src/import/csv.js';
import { decodeBytes } from '../../src/import/decode.js';
import { detectFormat } from '../../src/import/registry.js';
import { createFormat } from '../../src/i18n/format.js';
import { weeks } from './helpers.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const walk = (dir) => readdirSync(join(root, dir)).flatMap((n) => { const rel = `${dir}/${n}`; return statSync(join(root, rel)).isDirectory() ? walk(rel) : [rel]; });
const code = (f) => readFileSync(join(root, f), 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
const SRC = walk('src').filter((f) => f.endsWith('.js'));

const validFile = (over = {}) => ({ format: 'trading-journal-export', version: 1, exportedAt: '2026-09-29T00:00:00Z', settings: {}, ...over });

// ---------------------------------------------------------------- 4a. import rejects hostile files, all or nothing
test('import: malformed and wrong-shape files are rejected with an error and nothing is written', async () => {
  const bad = ['', '{', 'null', '[]', '"x"', '123', '{"format":"other"}', '{"format":"trading-journal-export","version":"1"}', '{"format":"trading-journal-export","version":0}',
    '{"format":"trading-journal-export","version":999}', JSON.stringify(validFile({ trades: 'x' })), JSON.stringify(validFile({ trades: [null] })), JSON.stringify(validFile({ trades: [{ id: 't' }] })),
    JSON.stringify(validFile({ settings: [] })), JSON.stringify(validFile({ blobs: [{ id: 'b', dataUrl: 'javascript:alert(1)' }] })), '\u0000\u0001binary', '[' .repeat(100000)];
  for (const text of bad) {
    const r = parseExport(text);
    assert.equal(r.ok, false, text.slice(0, 40));
    assert.ok(r.errorKey, 'a message key is returned');
  }
});

test('import: one invalid row anywhere refuses the whole file (merge never runs on a partial file)', () => {
  const good = weeks.stocks.trades[0];
  const r = parseExport(JSON.stringify(validFile({ trades: [good, { ...good, id: 't2', side: 'sideways' }] })));
  assert.equal(r.ok, false);
  assert.match(r.detail, /trades\[1\]\.side/);
});

test('import: prototype pollution keys in a file do not change Object.prototype or the store shape', async () => {
  const text = '{"format":"trading-journal-export","version":1,"exportedAt":"x","settings":{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}},"__proto__":{"polluted":true}}';
  const r = parseExport(text);
  if (r.ok) await mergeImport(createMemoryStore(), r.data);
  assert.equal({}.polluted, undefined);
  assert.equal(Object.prototype.polluted, undefined);
  const store = createMemoryStore();
  if (r.ok) await mergeImport(store, r.data);
  const out = await buildExport(store, { now: 'x' });
  assert.equal({}.polluted, undefined);
  assert.equal(out.polluted, undefined);
});

test('import: a large file (200,000 valid rows, about 60 MB) is validated in bounded time and memory', { timeout: 60000 }, () => {
  const t = weeks.stocks.trades[0];
  const rows = Array.from({ length: 200000 }, (_, i) => ({ ...t, id: `x${i}` }));
  const text = JSON.stringify(validFile({ trades: rows }));
  const t0 = Date.now();
  const r = parseExport(text);
  const ms = Date.now() - t0;
  assert.equal(r.ok, true);
  assert.ok(ms < 20000, `took ${ms} ms`);
  assert.ok(text.length > 40e6);
});

test('import: a file over a stated size limit is refused before it is read', { todo: 'F8: restoreFile reads the whole chosen file with file.text() and there is no size limit anywhere (an accidental or hostile multi-hundred-MB file stalls or crashes the tab; the risk stays on the person\'s own device)' }, () => {
  const src = code('src/ui/views/dataSettings.js');
  assert.match(src, /file\.size\s*[>]|\.size\s*>\s*MAX|MAX_IMPORT/i);
});

test('import: rows already stored are kept, never overwritten by the file', async () => {
  const store = createMemoryStore();
  const t = weeks.stocks.trades[0];
  await store.trades.put({ ...t, notes: 'mine' });
  await mergeImport(store, { trades: [{ ...t, notes: 'from the file' }], settings: {} });
  assert.equal((await store.trades.get(t.id)).notes, 'mine');
});

test('import: the own key and secret-named settings in a file are dropped on import and on export', async () => {
  const store = createMemoryStore();
  await mergeImport(store, { settings: { 'ai.key': 'sk-1', apiKey: 'sk-2', 'x.token': 'sk-3', 'x.secret': 'sk-4', lang: 'en' } });
  const s = await store.allSettings();
  assert.deepEqual(Object.keys(s), ['lang']);
  await store.setSetting('ai.key', 'sk-5');
  assert.equal(JSON.stringify(await buildExport(store, { now: 'x' })).includes('sk-5'), false);
});

test('import: interface text from a hostile row is never used as markup (user text reaches the page as text nodes only)', () => {
  const bad = [];
  for (const f of SRC) {
    if (f === 'src/ui/dom.js') continue;
    if (/\.innerHTML\s*=|outerHTML|insertAdjacentHTML|document\.write|\.srcdoc\s*=|setAttribute\(\s*['"]on/.test(code(f))) bad.push(f);
  }
  assert.deepEqual(bad, []);
  const dom = code('src/ui/dom.js');
  assert.equal((dom.match(/innerHTML/g) ?? []).length, 1, 'only staticSvg builds markup');
});

test('import: a stored screenshot is only ever an image data URL shown as an image (no rendering of an HTML or SVG data URL as a document)', () => {
  const users = SRC.filter((f) => /dataUrl|screenshotId|\.blobs\b/.test(code(f)));
  for (const f of users) assert.equal(/<iframe|<embed|<object|window\.open|location\.(href|assign|replace)\s*=/.test(code(f)), false, f);
});

// ---------------------------------------------------------------- 4b. export and report files
test('there is no CSV export: downloads are JSON or the escaped HTML report only, so no spreadsheet formula can be injected', () => {
  const types = new Set();
  for (const f of SRC) for (const m of code(f).matchAll(/downloadText\([^)]*\)/g)) types.add(`${f}: ${m[0].match(/'(application|text)\/[a-z]+'/)?.[0] ?? 'application/json (default)'}`);
  for (const line of types) assert.doesNotMatch(line, /csv/i, line);
  // a file picker may list text/csv as an accepted input type; a download or a Blob of that type would be an export
  assert.equal(SRC.some((f) => /new Blob\([^)]*text\/csv|downloadText\([^)]*csv/.test(code(f))), false);
});

test('if a CSV export is ever added, fields starting with = + - @ tab or CR must be neutralised: the import template is a static file with no user data', () => {
  const template = readFileSync(join(root, 'docs/generic-template.csv'), 'utf8');
  const { rows } = parseCsv(template);
  for (const row of rows.slice(1)) for (const cell of row) assert.doesNotMatch(cell, /^[=+@\t\r]/, 'the shipped template carries a formula-like cell');
});

test('the import report page escapes every value: a hostile file name, account name and format id cannot inject markup or script', () => {
  const make = (v) => {
    const record = { id: 'i', fileName: `${v}.csv`, formatId: v, createdAt: v, report: { rowsInFile: 1, rowsRead: 1, tradesBuilt: 1, matched: 0, skipped: [{ row: v, reasonKey: 'x' }], rKnownShare: { known: 1, of: 1 }, period: { from: v, to: v, zone: v } }, anomalies: [{ kind: v, answer: null }] };
    return reportHtml(record, { t: (k, p) => (p ? `${k}${JSON.stringify(p)}` : k), fmt: createFormat({ lang: 'en', tz: 'UTC' }), accountName: v, reconciliation: { from: v, to: v, zone: v, state: 'difference', broker: { valueMinor: 1 }, oursMinor: 1, differenceMinor: 0 } });
  };
  // the markup skeleton (every unescaped < > " ') is identical for a harmless value and for a hostile one
  const skeleton = (h) => h.replace(/[^<>"']/g, '');
  for (const evil of ['"><img src=x onerror=alert(1)><script>alert(2)</script>', "' onmouseover='alert(1)", '</td></tr><svg onload=alert(1)>', '<style>*{display:none}</style>']) {
    assert.equal(skeleton(make(evil)), skeleton(make('harmless')), evil);
  }
  assert.equal(esc('<>&"\'').includes('<'), false);
});

test('the export contains what AC-P8.3 lists and nothing from outside the stores: no clock, no location, no device id', async () => {
  const store = createMemoryStore();
  for (const t of weeks.stocks.trades) await store.trades.put(t);
  const out = await buildExport(store, { now: '2026-09-29T00:00:00Z' });
  assert.deepEqual(Object.keys(out).sort(), ['appVersion', 'exportedAt', 'format', 'settings', 'version', ...ROW_STORES].sort());
  assert.equal(/userAgent|deviceId|geolocation|ip":|hostname|email/i.test(JSON.stringify(out)), false);
});

// ---------------------------------------------------------------- 4c. hostile CSV / statement content
test('CSV import: hostile bytes (NUL, huge line, unbalanced quotes, formula cells, mixed encodings) neither throw nor hang', () => {
  const inputs = [new Uint8Array([0, 1, 2, 255, 254, 0, 0]), new TextEncoder().encode(`a,b\n"${'x'.repeat(5_000_000)}`), new TextEncoder().encode('date,symbol,qty\n=HYPERLINK("http://x","y"),+1,@SUM(1)\n'), new TextEncoder().encode('"""""\n,,,,\n'.repeat(20000))];
  for (const bytes of inputs) {
    const t0 = Date.now();
    const { text } = decodeBytes(bytes);
    assert.doesNotThrow(() => { parseCsv(text); detectFormat(text); });
    assert.ok(Date.now() - t0 < 10000, 'bounded time');
  }
});

// ---------------------------------------------------------------- 4d. delete all
test('delete-all leaves every store, every setting and every trading-journal localStorage entry empty (the data layer)', async () => {
  const store = createMemoryStore();
  for (const t of weeks.stocks.trades) await store.trades.put(t);
  await store.accounts.put({ id: 'a', name: 'Main', mode: 'real', baseCurrency: 'USD' });
  await store.cash.put({ id: 'c', accountId: 'a', kind: 'deposit', amount: '1', time: '2026-09-01T00:00:00Z' });
  await store.plans.put(weeks.stocks.plan);
  await store.reviews.put({ id: 'r', createdAt: '2026-09-01T00:00:00Z', mode: 'real', findings: [] });
  await store.imports.put({ id: 'i', accountId: 'a', formatId: 'generic-csv' });
  await store.reconciliations.put({ id: 'rc', accountId: 'a' });
  await store.blobs.put({ id: 'b', type: 'image/png', dataUrl: 'data:image/png;base64,AA==' });
  await store.setSetting('lang', 'en');
  await store.setSetting('ai.provider', 'anthropic');
  await deleteAllData({ store, storage: undefined, caches: undefined });
  for (const name of ALL_STORES) assert.equal((await (name === 'settings' ? store.settings : store[name]).getAll()).length, 0, name);
  assert.deepEqual(await store.allSettings(), {});
});
