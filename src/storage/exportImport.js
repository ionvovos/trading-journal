// Export and import file (architecture section 4.3). Pure over a store; no DOM, no clock (now is passed).
// The own AI key lives only in localStorage and is never in a store, so no export can contain it;
// settings whose name looks like a key or secret are dropped anyway as a second guard.
import { DB_VERSION, EXPORT_FORMAT, ROW_STORES, migrateExport } from './migrate.js';
import { NEVER_EXPORT, isImportableSetting } from './settings.js';
import { isWindow } from '../plan/check.js';

export const APP_VERSION = '1.0.0';

export async function buildExport(store, { now, appVersion = APP_VERSION } = {}) {
  const out = { format: EXPORT_FORMAT, version: DB_VERSION, exportedAt: now || new Date().toISOString(), appVersion, settings: {} };
  const settings = await store.allSettings();
  for (const [k, v] of Object.entries(settings)) if (!NEVER_EXPORT.test(k)) out.settings[k] = v;
  for (const name of ROW_STORES) {
    const rows = await store[name].getAll();
    out[name] = name === 'blobs' ? rows.map(({ id, type, dataUrl }) => ({ id, type, dataUrl })) : rows;
  }
  return out;
}

export function exportFileName(exportedAt) {
  return `trading-journal-${String(exportedAt).slice(0, 10)}.json`;
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => typeof v === 'string' && v !== '';

// A plan row: every field the plan check reads has to be well formed, so that a file cannot leave a plan that breaks trade entry or the
// review (L4b F7). Absent fields are fine; hours windows must be real times of day.
const decimalOrNull = (v) => v === undefined || v === null || v === '' || ((typeof v === 'number' || typeof v === 'string') && Number.isFinite(Number(v)) && Number(v) > 0);
const planError = (r) => {
  if (!str(r.id)) return 'id';
  if (r.hours !== undefined && (!Array.isArray(r.hours) || !r.hours.every(isWindow))) return 'hours';
  if (r.dailyCap !== undefined && r.dailyCap !== null && !(Number.isInteger(r.dailyCap) && r.dailyCap > 0)) return 'dailyCap';
  if (!decimalOrNull(r.riskPct)) return 'riskPct';
  if (!decimalOrNull(r.dailyLossLimitPct)) return 'dailyLossLimitPct';
  if (r.items !== undefined && (!Array.isArray(r.items) || !r.items.every((i) => isObj(i) && typeof i.text === 'string'))) return 'items';
  if (r.setups !== undefined && (!Array.isArray(r.setups) || !r.setups.every((s) => typeof s === 'string'))) return 'setups';
  return null;
};

// Row validators: return an error detail string or null.
const CHECKS = {
  accounts: (r) => (!str(r.id) ? 'id' : !str(r.name) ? 'name' : !['real', 'paper'].includes(r.mode) ? 'mode' : !str(r.baseCurrency) ? 'baseCurrency' : null),
  trades: (r) => (!str(r.id) ? 'id' : !str(r.accountId) ? 'accountId' : !['real', 'paper'].includes(r.mode) ? 'mode' : !['long', 'short'].includes(r.side) ? 'side' : !str(r.instrument) ? 'instrument' : !Array.isArray(r.legs) ? 'legs' : r.legs.some((l) => !isObj(l) || !str(l.id) || !['entry', 'exit'].includes(l.kind) || !str(l.time) || !str(l.price) || !str(l.size)) ? 'legs' : null),
  cash: (r) => (!str(r.id) ? 'id' : !str(r.accountId) ? 'accountId' : !['deposit', 'withdrawal', 'other'].includes(r.kind) ? 'kind' : !str(r.amount) ? 'amount' : !str(r.time) ? 'time' : null),
  imports: (r) => (!str(r.id) ? 'id' : !str(r.accountId) ? 'accountId' : !str(r.formatId) ? 'formatId' : null),
  reconciliations: (r) => (!str(r.id) ? 'id' : !str(r.accountId) ? 'accountId' : null),
  plans: (r) => planError(r),
  reviews: (r) => (!str(r.id) ? 'id' : null),
  blobs: (r) => (!str(r.id) ? 'id' : !str(r.dataUrl) || !r.dataUrl.startsWith('data:') ? 'dataUrl' : null),
};

// parseExport(text) -> { ok: true, data } | { ok: false, errorKey, detail }
// All or nothing: not JSON, wrong format, a version above the current one, or any invalid row
// returns an error and the caller writes nothing. Older versions go through migrateExport.
export function parseExport(text) {
  let json;
  try { json = JSON.parse(text); } catch { return { ok: false, errorKey: 'export.error.notJson' }; }
  if (!isObj(json) || json.format !== EXPORT_FORMAT) return { ok: false, errorKey: 'export.error.wrongFormat' };
  if (!Number.isInteger(json.version) || json.version < 1) return { ok: false, errorKey: 'export.error.wrongFormat' };
  if (json.version > DB_VERSION) return { ok: false, errorKey: 'export.error.newerVersion', detail: String(json.version) };
  let data = json;
  if (json.version < DB_VERSION) data = migrateExport(json);
  if (!isObj(data.settings ?? {})) return { ok: false, errorKey: 'export.error.badRow', detail: 'settings' };
  for (const name of ROW_STORES) {
    const rows = data[name];
    if (rows === undefined) continue;
    if (!Array.isArray(rows)) return { ok: false, errorKey: 'export.error.badRow', detail: name };
    for (let i = 0; i < rows.length; i++) {
      const bad = isObj(rows[i]) ? CHECKS[name](rows[i]) : 'row';
      if (bad) return { ok: false, errorKey: 'export.error.badRow', detail: `${name}[${i}].${bad}` };
    }
  }
  return { ok: true, data };
}

// Merge by id: rows already in the store are kept, others are added. One transaction.
// -> { added, kept, byStore: { trades: { added, kept }, ... }, settingsAdded }
export async function mergeImport(store, data) {
  const byStore = {};
  let added = 0;
  let kept = 0;
  const plan = [];
  for (const name of ROW_STORES) {
    const rows = data[name] || [];
    const existing = new Set((await store[name].getAll()).map((r) => r.id));
    const fresh = rows.filter((r) => !existing.has(r.id));
    byStore[name] = { added: fresh.length, kept: rows.length - fresh.length };
    added += fresh.length;
    kept += rows.length - fresh.length;
    plan.push([name, fresh]);
  }
  const currentSettings = await store.allSettings();
  // only data settings, only ones not set yet; `ai.*`, keys and any name outside the allow-list never come from a file
  const settingsToAdd = Object.entries(data.settings || {}).filter(([k, v]) => isImportableSetting(k, v) && !NEVER_EXPORT.test(k) && !Object.hasOwn(currentSettings, k));
  await store.transaction((tx) => {
    for (const [name, rows] of plan) tx.putMany(name, rows);
    for (const [k, v] of settingsToAdd) tx.put('settings', { key: k, value: v });
  });
  return { added, kept, byStore, settingsAdded: settingsToAdd.length };
}
