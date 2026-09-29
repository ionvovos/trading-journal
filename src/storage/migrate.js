// Schema versions and migrations. Pure (no DOM, no IndexedDB): the IDB store calls stores() inside
// onupgradeneeded and record functions on the stored rows; migrateExport applies the same record
// functions to an export file. Architecture section 4.2.
//
// A migration never deletes a field it does not understand. Every migration ships a fixture of the
// previous version and a test that every trade's netMinor, R and S1-S18 figure is unchanged (AC-P8.4).

export const DB_NAME = 'trading-journal';
export const DB_VERSION = 1;
export const EXPORT_FORMAT = 'trading-journal-export';

// Row stores in export order. `settings` is stored as { key, value } rows, exported as an object.
export const ROW_STORES = ['accounts', 'trades', 'cash', 'imports', 'reconciliations', 'plans', 'reviews', 'blobs'];
export const ALL_STORES = [...ROW_STORES, 'settings'];

// Store definitions for version 1: [name, keyPath, [[indexName, keyPath], ...]]
export const V1_STORES = [
  ['accounts', 'id', []],
  ['trades', 'id', [['by_account_close', ['accountId', 'closeTime']], ['by_mode_close', ['mode', 'closeTime']], ['by_import', 'importId']]],
  ['cash', 'id', [['by_account_time', ['accountId', 'time']]]],
  ['imports', 'id', [['by_time', 'createdAt']]],
  ['reconciliations', 'id', []],
  ['plans', 'id', []],
  ['reviews', 'id', [['by_time', 'createdAt']]],
  ['blobs', 'id', []],
  ['settings', 'key', []],
];

const identity = (r) => r;

export const MIGRATIONS = [
  {
    to: 1,
    stores(db) {
      for (const [name, keyPath, indexes] of V1_STORES) {
        if (db.objectStoreNames.contains(name)) continue;
        const store = db.createObjectStore(name, { keyPath });
        for (const [indexName, path] of indexes) store.createIndex(indexName, path);
      }
    },
    record: { accounts: identity, trades: identity, cash: identity, imports: identity, reconciliations: identity, plans: identity, reviews: identity, blobs: identity },
  },
];

// Migrations that apply when going from `from` to `to`, in order.
export function pending(migrations, from, to) {
  return migrations.filter((m) => m.to > from && m.to <= to).sort((a, b) => a.to - b.to);
}

// Apply the record functions of every pending migration to rows: { storeName: [row, ...] } -> same shape.
// Rows are copied first, so a record function may mutate its argument.
export function migrateRows(rowsByStore, from, to, migrations = MIGRATIONS) {
  const out = {};
  for (const [name, rows] of Object.entries(rowsByStore)) out[name] = rows.map((r) => structuredClone(r));
  for (const m of pending(migrations, from, to)) {
    for (const [name, fn] of Object.entries(m.record || {})) {
      if (out[name]) out[name] = out[name].map((r) => fn(r));
    }
  }
  return out;
}

// An export file of an older version brought to `to` (default DB_VERSION). The file's own version is
// rewritten; settings and unknown top-level keys pass through untouched.
export function migrateExport(json, { to = DB_VERSION, migrations = MIGRATIONS } = {}) {
  const from = json.version;
  const rows = {};
  for (const name of ROW_STORES) if (Array.isArray(json[name])) rows[name] = json[name];
  const migrated = migrateRows(rows, from, to, migrations);
  return { ...structuredClone(json), ...migrated, version: Math.max(from, to) };
}
