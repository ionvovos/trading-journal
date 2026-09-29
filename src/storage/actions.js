// Writes the views make: accounts, manual trades, edits, stops, cash, broker-check records, delete all.
// The builders are pure (clock and ids are passed in) and return { value, errors, warnings }; errors are
// { field, code } with `code` a suffix of the catalogue key `form.error.<code>`.
import * as D from '../core/decimal.js';
import { parseUserDecimal, minorDigits } from '../core/money.js';
import { zonedToUtc } from '../core/time.js';
import { isClosed, closeTimeOf, positionSize } from '../core/trade.js';
import { newId, reconId } from './model.js';

export const MARKETS = ['stock', 'crypto', 'forex'];

export function normalizeInstrument(text, market) {
  const s = String(text || '').trim().toUpperCase().replace(/\s+/g, '');
  if (market === 'forex' && /^[A-Z]{6}$/.test(s)) return `${s.slice(0, 3)}/${s.slice(3)}`;
  return s;
}

// Quote currency of a pair ('EUR/USD' -> 'USD'); the account currency for a plain ticker.
export function quoteCurrencyOf(instrument, fallback) {
  const m = /^[A-Z0-9]+[/-]([A-Z]{3,5})$/.exec(instrument);
  return m ? m[1] : fallback;
}

export const defaultContractSize = (market, instrument) => (market === 'forex' && /^[A-Z]{3}\/[A-Z]{3}$/.test(instrument) ? '100000' : '1');

export const createAccount = (o, { now, id = newId('acc-') } = {}) => ({
  id, name: String(o.name || '').trim(), mode: o.mode === 'paper' ? 'paper' : 'real', baseCurrency: String(o.baseCurrency || 'USD').trim().toUpperCase(),
  startBalance: o.startBalance ? parseUserDecimal(o.startBalance) : null, toDisplayRate: o.toDisplayRate ? Number(parseUserDecimal(o.toDisplayRate)) : 1,
  fileZones: {}, dustThresholds: {}, contractValues: {}, createdAt: now,
});

export function validateAccount(a, existing = []) {
  const errors = [];
  if (!a.name) errors.push({ field: 'name', code: 'required' });
  else if (existing.some((x) => x.id !== a.id && x.name.toLowerCase() === a.name.toLowerCase())) errors.push({ field: 'name', code: 'duplicate' });
  if (!/^[A-Z]{3,5}$/.test(a.baseCurrency)) errors.push({ field: 'baseCurrency', code: 'currency' });
  if (a.startBalance !== null && (a.startBalance === undefined || D.cmp(a.startBalance, '0') < 0)) errors.push({ field: 'startBalance', code: 'number' });
  if (!(a.toDisplayRate > 0)) errors.push({ field: 'toDisplayRate', code: 'positive' });
  return errors;
}

const num = (text) => (text === null || text === undefined || String(text).trim() === '' ? undefined : parseUserDecimal(String(text)));

function readLeg(l, i, { zone, base, quoteToAccount }) {
  const errors = [];
  const price = num(l.price);
  const size = num(l.size);
  const fee = l.fee === undefined || l.fee === '' || l.fee === null ? '0' : parseUserDecimal(String(l.fee));
  let time = l.time || '';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(time)) time = zonedToUtc(time.length === 16 ? `${time}:00` : time, zone);
  else if (!/Z$|[+-]\d{2}:\d{2}$/.test(time) || Number.isNaN(Date.parse(time))) time = null;
  else time = new Date(time).toISOString();
  const tag = l.kind === 'exit' ? 'exit' : 'entry';
  if (price === undefined || price === null) errors.push({ field: `${tag}Price`, code: price === undefined ? 'required' : 'number', leg: i });
  else if (D.cmp(price, '0') <= 0) errors.push({ field: `${tag}Price`, code: 'positive', leg: i });
  if (size === undefined || size === null) errors.push({ field: `${tag}Size`, code: size === undefined ? 'required' : 'number', leg: i });
  else if (D.cmp(size, '0') <= 0) errors.push({ field: `${tag}Size`, code: 'positive', leg: i });
  if (!time) errors.push({ field: `${tag}Time`, code: 'time', leg: i });
  if (fee === null || (fee !== undefined && D.cmp(fee, '0') < 0)) errors.push({ field: `${tag}Fee`, code: 'number', leg: i });
  return { leg: { kind: tag, time, zone, price, size, fee, feeCurrency: base, feeToAccount: 1, quoteToAccount }, errors };
}

// buildManualTrade(form, env) -> { trade, errors, warnings }
//   form: { instrument, market, side, legs: [{ kind, time, price, size, fee }], stop, target, setup, notes, funding,
//           quoteCurrency?, quoteToAccount?, contractSize?, leverage?, moodBefore?, moodAfter?, screenshotId? }
//   time: 'YYYY-MM-DDTHH:MM' in the declared zone, or an ISO instant.
//   env: { account, declaredZone, now, id?, existing? }   existing: the stored trade being edited (kept fields survive)
export function buildManualTrade(form, { account, declaredZone, now, id, existing = null }) {
  const errors = [];
  const warnings = [];
  const market = MARKETS.includes(form.market) ? form.market : 'stock';
  const instrument = normalizeInstrument(form.instrument, market);
  if (!instrument) errors.push({ field: 'instrument', code: 'required' });
  if (form.side !== 'long' && form.side !== 'short') errors.push({ field: 'side', code: 'required' });
  const base = account.baseCurrency;
  const quoteCurrency = String(form.quoteCurrency || quoteCurrencyOf(instrument, base)).toUpperCase();
  let quoteToAccount = quoteCurrency === base ? 1 : null;
  if (quoteToAccount === null) {
    const r = num(form.quoteToAccount);
    if (r === undefined) errors.push({ field: 'quoteToAccount', code: 'rate_required' });
    else if (r === null || D.cmp(r, '0') <= 0) errors.push({ field: 'quoteToAccount', code: 'positive' });
    else quoteToAccount = Number(r);
  }
  const tradeId = id || existing?.id || newId('t-');
  const legs = [];
  (form.legs || []).forEach((l, i) => {
    const r = readLeg(l, i, { zone: declaredZone, base, quoteToAccount });
    errors.push(...r.errors);
    legs.push({ ...r.leg, id: `${tradeId}:${i + 1}`, broker: null, source: { importId: null, row: null, key: null } });
  });
  if (!legs.some((l) => l.kind === 'entry')) errors.push({ field: 'entryPrice', code: 'required' });
  const stop = num(form.stop);
  if (stop === null) errors.push({ field: 'stop', code: 'number' });
  else if (stop !== undefined && D.cmp(stop, '0') <= 0) errors.push({ field: 'stop', code: 'positive' });
  const target = num(form.target);
  if (target === null) errors.push({ field: 'target', code: 'number' });
  const funding = num(form.funding);
  if (funding === null) errors.push({ field: 'funding', code: 'number' });
  const contractSize = form.contractSize ? parseUserDecimal(String(form.contractSize)) : defaultContractSize(market, instrument);
  if (contractSize === null || D.cmp(contractSize, '0') <= 0) errors.push({ field: 'contractSize', code: 'positive' });
  if (errors.length) return { trade: null, errors, warnings };

  legs.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : a.kind === b.kind ? 0 : a.kind === 'entry' ? -1 : 1));
  legs.forEach((l, i) => { l.id = `${tradeId}:${i + 1}`; l.price = D.toString(l.price); l.size = D.toString(l.size); l.fee = D.toString(l.fee); });
  const entrySize = D.sum(legs.filter((l) => l.kind === 'entry').map((l) => l.size));
  const exitSize = D.sum(legs.filter((l) => l.kind === 'exit').map((l) => l.size));
  if (D.cmp(exitSize, entrySize) > 0) return { trade: null, errors: [{ field: 'exitSize', code: 'oversize_exit' }], warnings };

  const trade = {
    id: tradeId, accountId: account.id, mode: account.mode, market, instrument, side: form.side,
    contractSize, contractValue: existing?.contractValue ?? null, quoteCurrency, legs,
    initialStop: stop === undefined ? null : D.toString(stop), stopSource: stop === undefined ? null : 'user',
    stopMoves: existing?.stopMoves ?? [], target: target === undefined ? null : D.toString(target),
    funding: funding === undefined ? (existing?.funding ?? 0) : D.toNumber(funding), fundingEntries: existing?.fundingEntries ?? [],
    broker: existing?.broker ?? null, setup: form.setup || null, plan: existing?.plan ?? null, notes: form.notes || '',
    moodBefore: form.moodBefore ?? existing?.moodBefore ?? null, moodAfter: form.moodAfter ?? existing?.moodAfter ?? null,
    screenshotId: form.screenshotId ?? existing?.screenshotId ?? null, leverage: form.leverage ?? existing?.leverage ?? null,
    importId: existing?.importId ?? null, holds: existing?.holds ?? [], excluded: existing?.excluded ?? null, dustRemainder: '0',
    closeDayOverride: existing?.closeDayOverride ?? null, closeTime: null, createdAt: existing?.createdAt ?? now, updatedAt: now,
    entry: existing?.entry ?? 'manual', entryUnknown: false,
  };
  trade.closeTime = closeTimeOf(trade);
  if (!isClosed(trade)) trade.closeTime = null;

  // warnings: the trade is saved, R shows as unknown (AC-P1.3)
  const avgEntry = D.div(D.sum(legs.filter((l) => l.kind === 'entry').map((l) => D.mul(l.price, l.size))), entrySize);
  if (trade.initialStop) {
    const cmpStop = D.cmp(trade.initialStop, avgEntry);
    if (cmpStop === 0) warnings.push({ field: 'stop', code: 'stop_at_entry' });
    else if ((trade.side === 'long') === (cmpStop > 0)) warnings.push({ field: 'stop', code: 'stop_profit_side' });
  } else warnings.push({ field: 'stop', code: 'no_stop' });
  if (D.cmp(positionSize(trade), '0') !== 0 && trade.legs.some((l) => l.kind === 'exit')) warnings.push({ field: 'exitSize', code: 'partial_exit' });
  return { trade, errors, warnings };
}

// Fields a person may change on any trade, imported ones included.
const PATCHABLE = ['initialStop', 'stopSource', 'target', 'setup', 'notes', 'moodBefore', 'moodAfter', 'leverage', 'screenshotId', 'plan', 'excluded', 'closeDayOverride', 'stopMoves'];
export function patchTrade(trade, patch, now) {
  const out = { ...trade, updatedAt: now };
  for (const k of Object.keys(patch)) if (PATCHABLE.includes(k)) out[k] = patch[k];
  return out;
}

// Bulk initial stops (AC-P1.11): entries [{ tradeId, stop }] -> { trades: updated trades, errors: [{ tradeId, code }], set }.
export function applyStops(trades, entries, now) {
  const byId = new Map(trades.map((t) => [t.id, t]));
  const errors = [];
  const out = [];
  for (const e of entries) {
    const t = byId.get(e.tradeId);
    if (!t) { errors.push({ tradeId: e.tradeId, code: 'unknown_trade' }); continue; }
    const raw = e.stop === null || e.stop === undefined ? '' : String(e.stop).trim();
    if (raw === '') continue;
    const stop = parseUserDecimal(raw);
    if (stop === null || D.cmp(stop, '0') <= 0) { errors.push({ tradeId: e.tradeId, code: stop === null ? 'number' : 'positive' }); continue; }
    out.push(patchTrade(t, { initialStop: stop, stopSource: 'user' }, now));
  }
  return { trades: out, errors, set: out.length };
}

export function buildCash(o, { account, now, id = newId('cash-') }) {
  const errors = [];
  const amount = num(o.amount);
  if (amount === undefined) errors.push({ field: 'amount', code: 'required' });
  else if (amount === null) errors.push({ field: 'amount', code: 'number' });
  else if (o.kind !== 'other' && D.cmp(amount, '0') <= 0) errors.push({ field: 'amount', code: 'positive' });
  if (!['deposit', 'withdrawal', 'other'].includes(o.kind)) errors.push({ field: 'kind', code: 'required' });
  let time = o.time || '';
  if (!/^\d{4}-\d{2}-\d{2}/.test(time) || Number.isNaN(Date.parse(time.length === 10 ? `${time}T00:00:00Z` : time))) errors.push({ field: 'time', code: 'time' });
  if (errors.length) return { cash: null, errors };
  return { cash: { id, accountId: account.id, time, kind: o.kind, amount: o.kind === 'other' ? D.toString(amount) : D.abs(amount), currency: account.baseCurrency, importId: null, key: null, note: o.note || '' }, errors };
}

// A broker-check record (architecture 4.1 `reconciliations`): what was asked, what the app found, the state.
// state: 'reconciled' | 'difference' | 'skipped' | 'not_asked'
export function makeReconRecord({ account, period, form = 'net_pnl', state, broker = null, result = null, now, asset = null }) {
  return {
    id: asset ? `${account.id}:qty:${asset}` : reconId(account.id, period.from, period.to),
    accountId: account.id, from: period.from, to: period.to, zone: period.zone, form, state, broker,
    oursMinor: result?.oursMinor ?? null, openLegsMinor: result?.openLegsMinor ?? null, differenceMinor: result?.differenceMinor ?? null,
    toleranceMinor: result?.toleranceMinor ?? null, explanations: result?.explanations ?? [], updatedAt: now,
  };
}

export const stateOfResult = (result) => (result.state === 'reconciled' ? 'reconciled' : 'difference');

// Delete all data on this device (AC-P8.9, legal-review section 5 item 6).
// Empties every store, removes the own key and the settings mirror from localStorage, and deletes the model caches when asked.
export async function deleteAllData({ store, storage, caches, alsoModel = false }) {
  await store.clearAll();
  const removed = { localStorage: [], caches: [] };
  try {
    const keys = [];
    for (let i = 0; i < (storage?.length ?? 0); i++) keys.push(storage.key(i));
    for (const k of keys) if (k && k.startsWith('trading-journal.')) { storage.removeItem(k); removed.localStorage.push(k); }
  } catch { /* storage refused */ }
  if (caches) {
    try {
      for (const name of await caches.keys()) {
        const modelCache = /webllm|mlc|tj-cdn|huggingface/i.test(name);
        const shell = /^tj-v\d+/.test(name);
        if (shell) continue;
        if (modelCache && !alsoModel) continue;
        await caches.delete(name);
        removed.caches.push(name);
      }
    } catch { /* caches unavailable */ }
  }
  return removed;
}

export const digitsFor = minorDigits;
