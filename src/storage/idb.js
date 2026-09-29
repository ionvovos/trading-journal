// IndexedDB store `trading-journal`: same interface as memory.js (architecture section 4.1). Browser only.
// Schema upgrades run MIGRATIONS inside the single versionchange transaction: stores() for every
// `to` in (oldVersion, DB_VERSION], then each record function over the stored rows. If the upgrade
// aborts, IndexedDB keeps the old version untouched and the store opens it as it is, read-only, so
// the person can still export (the migration state says so).
import { DB_NAME, DB_VERSION, MIGRATIONS, ROW_STORES, ALL_STORES, pending } from './migrate.js';
import { settingDefault } from './settings.js';

const UNAVAILABLE = 'Storage is not available in this browser mode.';

function openDb(idbFactory, migrations, version) {
  return new Promise((resolve, reject) => {
    if (!idbFactory) { reject(new Error(UNAVAILABLE)); return; }
    let req;
    try { req = idbFactory.open(DB_NAME, version); } catch { reject(new Error(UNAVAILABLE)); return; }
    const migration = { state: 'none', from: 0, to: version, readOnly: false };
    let upgradeError = null;
    req.onupgradeneeded = (ev) => {
      const db = req.result;
      const tx = req.transaction;
      const old = ev.oldVersion;
      migration.from = old;
      try {
        const steps = pending(migrations, old, version);
        for (const m of steps) m.stores(db, tx);
        if (old > 0) {
          for (const m of steps) {
            for (const [name, fn] of Object.entries(m.record || {})) {
              if (!db.objectStoreNames.contains(name)) continue;
              const cursorReq = tx.objectStore(name).openCursor();
              cursorReq.onsuccess = () => {
                const cursor = cursorReq.result;
                if (!cursor) return;
                try { cursor.update(fn(cursor.value)); } catch (err) { upgradeError = err; try { tx.abort(); } catch { /* already aborting */ } return; }
                cursor.continue();
              };
            }
          }
        }
        migration.state = old > 0 && steps.length ? 'migrated' : 'none';
      } catch (err) {
        upgradeError = err;
        try { tx.abort(); } catch { /* already aborting */ }
      }
    };
    req.onsuccess = () => resolve({ db: req.result, migration });
    req.onerror = () => reject(upgradeError ?? req.error ?? new Error(UNAVAILABLE));
  });
}

function openAsIs(idbFactory) {
  return new Promise((resolve, reject) => {
    let req;
    try { req = idbFactory.open(DB_NAME); } catch { reject(new Error(UNAVAILABLE)); return; }
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new Error(UNAVAILABLE));
  });
}

// opts: { migrations, version } let a test open a synthetic newer schema.
export async function createIdbStore(idbFactory, { migrations = MIGRATIONS, version = DB_VERSION } = {}) {
  let db;
  let migration;
  try {
    ({ db, migration } = await openDb(idbFactory, migrations, version));
  } catch (err) {
    if (err?.message === UNAVAILABLE) throw err;
    db = await openAsIs(idbFactory);
    migration = { state: 'failed', readOnly: true, error: String(err?.message ?? err) };
  }
  db.onversionchange = () => db.close();
  const readOnly = migration.readOnly;
  const listeners = new Set();
  const emit = (kind, store, ids) => { for (const fn of [...listeners]) { try { fn({ kind, store, ids }); } catch { /* a listener never breaks a write */ } } };
  const has = (name) => db.objectStoreNames.contains(name);
  const idOf = (name, row) => (name === 'settings' ? row.key : row.id);
  const check = (name, row) => {
    const key = row && typeof row === 'object' ? idOf(name, row) : undefined;
    if (typeof key !== 'string' || key === '') throw new TypeError(`${name}: row needs a string ${name === 'settings' ? 'key' : 'id'}`);
  };

  const write = (names, fn) => new Promise((resolve, reject) => {
    if (readOnly) { reject(new Error('read-only')); return; }
    let tx;
    try { tx = db.transaction(names, 'readwrite'); } catch (err) { reject(err); return; }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Storage write failed.'));
    tx.onabort = () => reject(tx.error ?? new Error('Storage write aborted.'));
    try { fn(...names.map((n) => tx.objectStore(n)), tx); } catch (err) { try { tx.abort(); } catch { /* done */ } reject(err); }
  });
  const read = (name, fn) => new Promise((resolve, reject) => {
    if (!has(name)) { resolve(undefined); return; }
    const req = fn(db.transaction(name, 'readonly').objectStore(name));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Storage read failed.'));
  });

  function table(name) {
    return {
      getAll: async () => (await read(name, (s) => s.getAll())) ?? [],
      get: (id) => read(name, (s) => s.get(id)),
      async put(row) { check(name, row); await write([name], (s) => { s.put(row); }); emit('put', name, [idOf(name, row)]); },
      async putMany(rows) {
        rows.forEach((r) => check(name, r));
        if (!rows.length) return;
        await write([name], (s) => { for (const r of rows) s.put(r); });
        emit('put', name, rows.map((r) => idOf(name, r)));
      },
      async delete(id) { await write([name], (s) => { s.delete(id); }); emit('delete', name, [id]); },
    };
  }

  const store = {
    kind: 'idb',
    get migration() { return { ...migration }; },
    async getSetting(key) {
      const row = await read('settings', (s) => s.get(key));
      return row ? row.value : settingDefault(key);
    },
    async setSetting(key, value) {
      check('settings', { key });
      await write(['settings'], (s) => { s.put({ key, value }); });
      emit('put', 'settings', [key]);
    },
    async allSettings() {
      const rows = (await read('settings', (s) => s.getAll())) ?? [];
      return Object.fromEntries(rows.map((r) => [r.key, r.value]));
    },
    // fn(tx) queues writes synchronously (IndexedDB commits when no request is pending): tx.put, tx.putMany, tx.delete.
    async transaction(fn) {
      const names = ALL_STORES.filter(has);
      await write(names, (...args) => {
        const tx = args.pop();
        const stores = Object.fromEntries(names.map((n, i) => [n, args[i]]));
        const facade = {
          put(name, row) { check(name, row); stores[name].put(row); },
          putMany(name, rows) { rows.forEach((r) => facade.put(name, r)); },
          delete(name, id) { stores[name].delete(id); },
        };
        const out = fn(facade);
        if (out && typeof out.then === 'function') { try { tx.abort(); } catch { /* done */ } throw new TypeError('transaction(fn): fn must queue its writes synchronously'); }
      });
      emit('transaction', null, []);
    },
    async clearAll() {
      await write(ALL_STORES.filter(has), (...args) => { args.pop(); for (const s of args) s.clear(); });
      emit('clear', null, []);
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    close() { db.close(); },
  };
  for (const name of ROW_STORES) store[name] = table(name);
  store.settings = table('settings');
  return store;
}
