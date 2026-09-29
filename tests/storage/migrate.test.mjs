import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DB_VERSION, MIGRATIONS, ROW_STORES, V1_STORES, pending, migrateRows, migrateExport } from '../../src/storage/migrate.js';

const core = JSON.parse(readFileSync(new URL('../fixtures/stats/core.json', import.meta.url), 'utf8'));

// A synthetic version 2 that renames leverage to leverageUsed (architecture 4.2).
const V2 = [
  ...MIGRATIONS,
  { to: 2, stores() {}, record: { trades: (r) => { if (!('leverage' in r)) return r; const { leverage, ...rest } = r; return { ...rest, leverageUsed: leverage }; } } },
];

function v1Export() {
  const trades = core.trades.map((t) => ({ ...t, accountId: t.accountId || 'acc-x', leverage: t.id === 'T1' ? '5' : null }));
  return { format: 'trading-journal-export', version: 1, exportedAt: '2026-09-29T00:00:00Z', appVersion: '1.0.0', settings: { tz: 'Europe/Athens', 'unknown.future.key': 7 }, accounts: [], trades, cash: [], imports: [], reconciliations: [], plans: [], reviews: [], blobs: [], futureTopLevel: { keep: true } };
}

test('version 1 defines every store and index of the architecture', () => {
  assert.equal(DB_VERSION, 1);
  assert.deepEqual(V1_STORES.map((s) => s[0]), [...ROW_STORES, 'settings']);
  const trades = V1_STORES.find((s) => s[0] === 'trades');
  assert.deepEqual(trades[2].map((i) => i[0]), ['by_account_close', 'by_mode_close', 'by_import']);
  assert.equal(MIGRATIONS.length, 1);
  assert.equal(MIGRATIONS[0].to, 1);
});

test('MIGRATIONS[0].stores creates the v1 stores on an empty database', () => {
  const made = [];
  const db = { objectStoreNames: { contains: () => false }, createObjectStore: (name, opts) => { const s = { name, opts, indexes: [] }; s.createIndex = (n, p) => s.indexes.push([n, p]); made.push(s); return s; } };
  MIGRATIONS[0].stores(db);
  assert.equal(made.length, 9);
  assert.equal(made.find((s) => s.name === 'settings').opts.keyPath, 'key');
  assert.equal(made.find((s) => s.name === 'cash').indexes[0][0], 'by_account_time');
});

test('pending picks the migrations between two versions, in order', () => {
  assert.deepEqual(pending(V2, 0, 1).map((m) => m.to), [1]);
  assert.deepEqual(pending(V2, 1, 2).map((m) => m.to), [2]);
  assert.deepEqual(pending(V2, 0, 2).map((m) => m.to), [1, 2]);
  assert.deepEqual(pending(V2, 2, 2), []);
});

test('the synthetic v2 renames leverage on v1 rows and leaves everything else identical', () => {
  const exp = v1Export();
  const out = migrateRows({ trades: exp.trades }, 1, 2, V2);
  const t1 = out.trades.find((t) => t.id === 'T1');
  assert.equal(t1.leverageUsed, '5');
  assert.ok(!('leverage' in t1));
  for (const [i, t] of out.trades.entries()) {
    const { leverage, ...before } = exp.trades[i];
    const { leverageUsed, ...after } = t;
    assert.deepEqual(after, before, `trade ${t.id} unchanged apart from the renamed field`);
    assert.equal(leverageUsed, leverage === undefined ? undefined : leverage);
  }
});

test('migrateRows does not touch its input', () => {
  const exp = v1Export();
  const snapshot = JSON.stringify(exp.trades);
  migrateRows({ trades: exp.trades }, 1, 2, V2);
  assert.equal(JSON.stringify(exp.trades), snapshot);
});

test('migrateExport carries an old export to the target version and keeps fields it does not know', () => {
  const exp = v1Export();
  const out = migrateExport(exp, { to: 2, migrations: V2 });
  assert.equal(out.version, 2);
  assert.deepEqual(out.futureTopLevel, { keep: true });
  assert.equal(out.settings['unknown.future.key'], 7);
  assert.equal(out.trades.find((t) => t.id === 'T1').leverageUsed, '5');
  assert.equal(out.trades.length, exp.trades.length);
  // same-version export passes through with a copy
  const same = migrateExport(exp, { to: 1 });
  assert.equal(same.version, 1);
  assert.deepEqual(same.trades, exp.trades);
});

test('a migration never drops a field it does not understand', () => {
  const t = { ...core.trades[0], accountId: 'a', someFieldFromTheFuture: { x: 1 } };
  const out = migrateRows({ trades: [t] }, 1, 2, V2).trades[0];
  assert.deepEqual(out.someFieldFromTheFuture, { x: 1 });
});
