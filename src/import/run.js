// Import flow: file text -> parse -> group -> import record, report and anomaly questions.
// Architecture sections 2 and 5.1. No DOM. The clock, the event bus and the statistics are passed in.
//
// runImport(input, env) -> Promise<{ importRecord, trades, cash, report, accountUpdates }>
//   input: { text, fileName, formatId?, account, fileZone?, declaredZone, existing: { trades, cash }, now, importId? }
//   env:   { bus?, deps: { tradeMoney, initialRisk } }
// answerAnomaly(importRecord, trades, anomalyId, answer, env2) -> Promise<{ importRecord, trades, cash, report, accountUpdates }>
//   answer: { optionId, value?, tradeId? }  (tradeId = a per-trade override)
//   env2 adds { account, existing } to env: the file is read again with every answer applied (deterministic ids),
//   then what the user typed on the trades meanwhile (stops, notes, plan mark ...) is carried over.
import { loadFormats, getFormat, detectFormat, formats as registryFormats } from './registry.js';
import { groupFills, legsAsFills, collectExistingKeys } from './group.js';
import { answersOf, KINDS, anomalyId } from './anomalies.js';
import { isClosed } from '../core/trade.js';
import { localParts } from '../core/time.js';
import * as D from '../core/decimal.js';

const err = (code, extra) => Object.assign(new Error(code), { code, ...extra });
const yieldToUi = () => new Promise((r) => setTimeout(r, 0));

// Fields the person edits on a trade after import; a rebuild keeps them.
const USER_FIELDS = ['setup', 'notes', 'plan', 'moodBefore', 'moodAfter', 'screenshotId', 'leverage', 'stopMoves', 'target'];

function pickFormat(text, formatId, list) {
  if (formatId) {
    const f = list.find((x) => x.id === formatId);
    if (!f) throw err('import.error.unknownFormat', { formatId });
    return { format: f, score: 1 };
  }
  const found = detectFormat(text);
  if (!found.format) throw err('import.error.formatNotDetected');
  return { format: found.format, score: found.score };
}

export function effectiveFileZone(format, fileZone, declaredZone) {
  if (format.statesZone) return format.zone || (format.id === 'kraken-trades' ? 'UTC' : null);
  return fileZone || null;
}

function cashRecords(parsed, account, importId, existingKeys, effectiveZone) {
  const out = [];
  let n = 0;
  for (const c of parsed.cash || []) {
    if (c.key && existingKeys.has(c.key)) continue;
    n++;
    const amount = c.kind === 'other' ? D.toString(c.amount) : D.abs(c.amount);
    out.push({ id: `${importId}:cash:${n}`, accountId: account.id, time: c.time, kind: c.kind, amount, currency: c.currency || account.baseCurrency, importId, key: c.key || null, note: '' });
  }
  return out;
}

function periodOf(trades, fills, zone) {
  const times = [];
  for (const t of trades) for (const l of t.legs) if (l.kind === 'exit') times.push(l.time);
  if (!times.length) for (const f of fills) times.push(f.time);
  if (!times.length) return null;
  const dates = times.map((x) => localParts(x, zone).date).sort();
  return { from: dates[0], to: dates[dates.length - 1], zone };
}

function rKnownShare(trades, deps) {
  const set = trades.filter((t) => isClosed(t) && !t.holds.length && !t.excluded);
  const known = set.filter((t) => {
    if (deps?.initialRisk) return deps.initialRisk(t)?.value != null;
    return !!t.initialStop;
  }).length;
  return { known, of: set.length };
}

function buildReport({ parsed, format, fileName, trades, matched, cash, anomalies, period, effectiveZone, deps, account }) {
  const skipped = (parsed.skipped || []).map((s) => ({ row: s.row, reasonKey: s.reasonKey }));
  const counts = {};
  for (const a of anomalies) counts[a.kind] = a.tradeIds.length || (a.detail?.entries?.length ?? a.detail?.skipped?.length ?? 0);
  return {
    formatId: format.id, fileName: fileName || null, rowsInFile: parsed.rowsInFile,
    rowsRead: (parsed.fills || []).length + (parsed.cash || []).length + (parsed.funding || []).length,
    tradesBuilt: trades.length, matched, skipped, cashRows: cash.length, fundingRows: (parsed.funding || []).length,
    openAtEnd: (parsed.openAtEnd || []).length, anomalyCounts: counts,
    rKnownShare: rKnownShare(trades, deps), period, periodZone: effectiveZone, fileSummary: parsed.fileSummary || null,
    fileCurrency: parsed.accountCurrency || null, currencyMismatch: !!(parsed.accountCurrency && parsed.accountCurrency !== account.baseCurrency),
  };
}

function withUnreadable(anomalies, parsed, importId, account, prev) {
  if (!(parsed.skipped || []).length) return anomalies;
  const p = prev?.find((a) => a.kind === 'unreadable_rows');
  return [...anomalies, {
    id: anomalyId(importId, 'unreadable_rows'), kind: 'unreadable_rows', importId, accountId: account.id, tradeIds: [],
    detail: { skipped: parsed.skipped.map((s) => ({ row: s.row, reasonKey: s.reasonKey })) }, answer: p?.answer ?? null, overrides: p?.overrides ?? {},
  }];
}

// Records answered before but no longer raised (merged duplicates, released trades) stay with their answers.
function mergeAnomalyRecords(previous, derived) {
  const kinds = new Set(derived.map((a) => a.kind));
  // groupFills sees answers without their timestamp; the stored record keeps the answer as the person gave it
  for (const a of derived) {
    const p = (previous || []).find((x) => x.kind === a.kind);
    if (p?.answer) a.answer = p.answer;
  }
  const kept = (previous || []).filter((a) => a.answer && !kinds.has(a.kind)).map((a) => ({ ...a, tradeIds: [], resolved: true }));
  return [...derived, ...kept].sort((a, b) => Object.keys(KINDS).indexOf(a.kind) - Object.keys(KINDS).indexOf(b.kind));
}

async function buildImport(input, env, prev) {
  const { text, fileName, account, declaredZone, existing = { trades: [], cash: [] }, now, importId } = input;
  const { deps = {}, bus } = env;
  await loadFormats();
  const { format } = pickFormat(text, input.formatId, registryFormats);
  if (!format.statesZone && !input.fileZone) throw err('import.error.needZone', { formatId: format.id });
  const effectiveZone = effectiveFileZone(format, input.fileZone, declaredZone);
  bus?.emit('import-progress', { done: 0, total: 1 });
  await yieldToUi();
  const parsed = format.parse(text, { fileZone: input.fileZone, accountCurrency: account.baseCurrency });
  const total = parsed.rowsInFile || (parsed.fills || []).length;
  bus?.emit('import-progress', { done: Math.min(total, 200), total });
  await yieldToUi();

  const existingKeys = collectExistingKeys(existing.trades, existing.cash);
  const { answers, overrides } = answersOf(prev?.anomalies);
  const grouped = groupFills({
    fills: parsed.fills || [], funding: parsed.funding || [], account, mode: account.mode || 'real', importId,
    existingKeys, existingLegs: legsAsFills(existing.trades.filter((t) => t.accountId === account.id)),
    dustThreshold: parsed.sizeStep || '0', declaredZone, fileZone: effectiveZone, answers, overrides, now,
  }, deps);
  bus?.emit('import-progress', { done: total, total });

  let trades = grouped.trades;
  let cash = cashRecords(parsed, account, importId, existingKeys, effectiveZone);
  let anomalies = withUnreadable(grouped.anomalies, parsed, importId, account, prev?.anomalies);
  anomalies = mergeAnomalyRecords(prev?.anomalies, anomalies);
  const cancelled = anomalies.find((a) => a.kind === 'unreadable_rows')?.answer?.optionId === 'cancel_import';
  if (cancelled) { trades = []; cash = []; }
  const period = periodOf(trades.length ? trades : [], parsed.fills || [], effectiveZone || declaredZone);
  const report = buildReport({ parsed, format, fileName, trades, matched: grouped.matched, cash, anomalies, period, effectiveZone, deps, account });
  const importRecord = {
    id: importId, accountId: account.id, createdAt: prev?.createdAt ?? now, fileName: fileName || null, formatId: format.id,
    fileZone: input.fileZone || null, effectiveZone, declaredZone, rawText: text, report, anomalies, matched: grouped.matched,
    status: cancelled ? 'cancelled' : 'open',
  };
  const accountUpdates = { ...grouped.accountUpdates };
  if (!format.statesZone && input.fileZone) accountUpdates.fileZone = { formatId: format.id, zone: input.fileZone };
  return { importRecord, trades, cash, report, accountUpdates, parsed };
}

export async function runImport(input, env = {}) {
  const importId = input.importId || `imp-${(input.now || new Date().toISOString()).replace(/\D/g, '').slice(0, 17)}-${Math.random().toString(36).slice(2, 8)}`;
  const out = await buildImport({ ...input, importId }, env, null);
  env.bus?.emit('import-done', { importId, report: out.report });
  const { parsed, ...rest } = out;
  return rest;
}

function carryUserEdits(fresh, old) {
  const byId = new Map(old.map((t) => [t.id, t]));
  return fresh.map((t) => {
    const o = byId.get(t.id);
    if (!o) return t;
    const kept = { ...t };
    for (const f of USER_FIELDS) if (o[f] !== undefined && JSON.stringify(o[f]) !== JSON.stringify(t[f]) && (Array.isArray(o[f]) ? o[f].length : o[f] !== null && o[f] !== '')) kept[f] = o[f];
    if (o.stopSource === 'user') { kept.initialStop = o.initialStop; kept.stopSource = 'user'; }
    if (o.excluded && o.excluded.by === 'user') kept.excluded = o.excluded;
    kept.updatedAt = o.updatedAt;
    return kept;
  });
}

export async function answerAnomaly(importRecord, trades, id, answer, env = {}) {
  const a = importRecord.anomalies.find((x) => x.id === id);
  if (!a) throw err('import.error.unknownAnomaly', { id });
  if (!KINDS[a.kind].options.includes(answer.optionId)) throw err('import.error.unknownOption', { optionId: answer.optionId });
  const at = env.now || new Date().toISOString();
  const anomalies = importRecord.anomalies.map((x) => {
    if (x.id !== id) return x;
    if (answer.tradeId) return { ...x, overrides: { ...x.overrides, [answer.tradeId]: { optionId: answer.optionId, value: answer.value } } };
    return { ...x, answer: { optionId: answer.optionId, value: answer.value, at }, overrides: {} };
  });
  const prev = { ...importRecord, anomalies };
  const out = await buildImport({
    text: importRecord.rawText, fileName: importRecord.fileName, formatId: importRecord.formatId, account: env.account, fileZone: importRecord.fileZone,
    declaredZone: importRecord.declaredZone, existing: env.existing || { trades: [], cash: [] }, now: env.now || importRecord.createdAt, importId: importRecord.id,
  }, env, prev);
  const { parsed, ...rest } = out;
  rest.trades = carryUserEdits(rest.trades, trades);
  rest.report = { ...rest.report, rKnownShare: rKnownShare(rest.trades, env.deps) };
  rest.importRecord = { ...rest.importRecord, report: rest.report };
  env.bus?.emit('anomaly-answered', { importId: importRecord.id, anomalyId: id, optionId: answer.optionId });
  return rest;
}

// Import records and their trades as the reconcile step needs them: anomalies with the file zone attached.
export function anomaliesForReconcile(imports) {
  return imports.flatMap((imp) => imp.anomalies.map((a) => ({ ...a, fileZone: imp.effectiveZone || imp.fileZone || null })));
}

// One transaction: the import row, its trades and cash, replacing what an earlier build of the same import wrote.
export async function commitImport(store, result, { replaceTradeIds = [], replaceCashIds = [] } = {}) {
  await store.transaction((tx) => {
    for (const id of replaceTradeIds) tx.delete('trades', id);
    for (const id of replaceCashIds) tx.delete('cash', id);
    tx.put('imports', result.importRecord);
    tx.putMany('trades', result.trades.map((t) => ({ ...t, importId: result.importRecord.id })));
    tx.putMany('cash', result.cash);
  });
}
