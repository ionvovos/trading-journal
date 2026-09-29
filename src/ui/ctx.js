// ctx: what every view receives (architecture section 10).
// { store, bus, t, fmt, lang, mode, setMode, accountFilter, setAccountFilter, settings: { get, set }, navigate(hash, state?), ui }
// `lang`, `mode`, `fmt` and `accountFilter` are live getters, so a view that keeps ctx sees the current value after a switch.
import { t, getLang, setLang } from '../i18n/i18n.js';
import { createFormat } from '../i18n/format.js';
import { ui } from './components/index.js';

// Setting defaults. Anything else the data and review shards store is theirs; unknown keys read as `undefined`.
export const SETTING_DEFAULTS = {
  lang: null, // null until the first run, then 'en' or 'el'
  mode: 'real',
  theme: 'system', // system | light | dark
  tz: null, // null = the device zone
  dayCutoffHour: 0,
  'displayCurrency.real': 'USD',
  'displayCurrency.paper': 'EUR',
  smallSampleMin: 30,
  openReminderDays: 7,
  exportReminderEvery: 50,
  reconcileCap: '1.00',
  firstRunDone: false,
};

export const deviceZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } };

// Settings live in the store (getSetting/setSetting) and are mirrored in a cache so views read them synchronously.
// The AI keys (S3, src/ai/settings.js AI_KEYS) are preloaded too, so ctx.settings.get('ai.engine') survives a reload.
async function aiKeys() {
  try { return [...(await import('../ai/settings.js')).AI_KEYS]; } catch { return []; }
}

export async function createSettings(store, extraKeys) {
  const keys = [...Object.keys(SETTING_DEFAULTS), ...(extraKeys ?? await aiKeys()), 'lossWindowMin'];
  const cache = { ...SETTING_DEFAULTS };
  await Promise.all(keys.map(async (k) => {
    try { const v = await store.getSetting(k); if (v !== undefined && v !== null) cache[k] = v; } catch { /* keep the default */ }
  }));
  return {
    get: (k) => cache[k],
    set: async (k, v) => { cache[k] = v; try { await store.setSetting(k, v); } catch { /* memory store: the cache still holds it */ } },
    all: () => ({ ...cache }),
  };
}

export function createCtx({ store, bus, router, settings, data = {}, storage = { kind: 'idb', refused: false } }) {
  let accountFilter = 'all';
  const ctx = {
    store, bus, ui, t, settings, storage,
    // The data layer (S2) and review layer (S3) hang their functions here at boot: getSummary, stats, latestReview, etc.
    data,
    get lang() { return getLang(); },
    get mode() { return settings.get('mode') === 'paper' ? 'paper' : 'real'; },
    get tz() { return settings.get('tz') || deviceZone(); },
    get fmt() { return createFormat({ lang: getLang(), tz: ctx.tz }); },
    get accountFilter() { return accountFilter; },
    setAccountFilter(next) {
      if (next === accountFilter) return;
      accountFilter = next;
      bus.emit('account-filter-changed', next);
    },
    async setMode(next) {
      const m = next === 'paper' ? 'paper' : 'real';
      if (m === ctx.mode) return;
      await settings.set('mode', m);
      bus.emit('mode-changed', m);
    },
    async setLang(next) {
      if (next === getLang()) return;
      setLang(next);
      await settings.set('lang', next);
      bus.emit('lang-changed', next);
    },
    navigate: (hash, state) => router.navigate(hash, state),
    displayCurrency: () => settings.get(`displayCurrency.${ctx.mode}`) || (ctx.mode === 'paper' ? 'EUR' : 'USD'),
  };
  return ctx;
}

// The store the shell runs on until the data layer (S2, src/storage) is present, and when IndexedDB is refused. It holds settings and
// empty collections in memory, so first run, settings and the empty states work with nothing else built. It implements the
// architecture section 4 interface: each collection has { getAll, get, put, putMany, delete }.
function collection() {
  const rows = new Map();
  return {
    async getAll() { return [...rows.values()]; },
    async get(id) { return rows.get(id); },
    async put(row) { rows.set(row.id, row); return row; },
    async putMany(list) { for (const r of list) rows.set(r.id, r); return list; },
    async delete(id) { rows.delete(id); },
    async clear() { rows.clear(); },
  };
}

export function createFallbackStore() {
  const names = ['accounts', 'trades', 'cash', 'imports', 'reconciliations', 'plans', 'reviews', 'blobs'];
  const store = Object.fromEntries(names.map((n) => [n, collection()]));
  const settings = new Map();
  return {
    ...store,
    kind: 'fallback',
    async getSetting(k) { return settings.get(k); },
    async setSetting(k, v) { settings.set(k, v); },
    async transaction(fn) { return fn(store); },
    async clearAll() { for (const c of Object.values(store)) await c.clear(); settings.clear(); },
  };
}
