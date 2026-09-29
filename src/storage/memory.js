// In-memory store with the same interface as the IndexedDB store (architecture section 4.1).
// Rows are copied on the way in and out, as IndexedDB does. Everything returns a Promise.
import { ROW_STORES, ALL_STORES } from './migrate.js';
import { settingDefault } from './settings.js';

const copy = (v) => (v === undefined ? v : structuredClone(v));

function checkRow(name, row) {
  if (!row || typeof row !== 'object') throw new TypeError(`${name}: row must be an object`);
  const key = name === 'settings' ? row.key : row.id;
  if (typeof key !== 'string' || key === '') throw new TypeError(`${name}: row needs a string ${name === 'settings' ? 'key' : 'id'}`);
}

export function createMemoryStore(seed = {}) {
  let data = {};
  for (const name of ALL_STORES) data[name] = new Map();
  const listeners = new Set();
  const emit = (kind, store, ids) => { for (const fn of [...listeners]) { try { fn({ kind, store, ids }); } catch { /* a listener never breaks a write */ } } };

  const idOf = (name, row) => (name === 'settings' ? row.key : row.id);

  function table(name) {
    return {
      async getAll() { return [...data[name].values()].map(copy); },
      async get(id) { return copy(data[name].get(id)); },
      async put(row) { checkRow(name, row); data[name].set(idOf(name, row), copy(row)); emit('put', name, [idOf(name, row)]); },
      async putMany(rows) {
        rows.forEach((r) => checkRow(name, r));
        for (const r of rows) data[name].set(idOf(name, r), copy(r));
        if (rows.length) emit('put', name, rows.map((r) => idOf(name, r)));
      },
      async delete(id) { data[name].delete(id); emit('delete', name, [id]); },
    };
  }

  const store = {
    kind: 'memory',
    migration: { state: 'none', readOnly: false },
    async getSetting(key) {
      const row = data.settings.get(key);
      return row ? copy(row.value) : settingDefault(key);
    },
    async setSetting(key, value) {
      checkRow('settings', { key });
      data.settings.set(key, { key, value: copy(value) });
      emit('put', 'settings', [key]);
    },
    async allSettings() {
      const out = {};
      for (const [k, row] of data.settings) out[k] = copy(row.value);
      return out;
    },
    // fn(tx) queues writes synchronously: tx.put(store, row), tx.putMany(store, rows), tx.delete(store, id).
    // All apply, or none when fn throws (an import writes trades, cash and the import row together).
    async transaction(fn) {
      const ops = [];
      const tx = {
        put(name, row) { checkRow(name, row); ops.push(() => data[name].set(idOf(name, row), copy(row))); },
        putMany(name, rows) { rows.forEach((r) => tx.put(name, r)); },
        delete(name, id) { ops.push(() => data[name].delete(id)); },
      };
      await fn(tx);
      for (const op of ops) op();
      emit('transaction', null, []);
    },
    async clearAll() {
      for (const name of ALL_STORES) data[name].clear();
      emit('clear', null, []);
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
  for (const name of ROW_STORES) store[name] = table(name);
  store.settings = table('settings');

  // seed: { trades: [...], settings: { tz: 'Europe/Athens' } } for tests and scenes
  for (const [name, rows] of Object.entries(seed)) {
    if (name === 'settings') for (const [k, v] of Object.entries(rows)) data.settings.set(k, { key: k, value: copy(v) });
    else if (data[name]) for (const r of rows) { checkRow(name, r); data[name].set(idOf(name, r), copy(r)); }
  }
  return store;
}
