// The review patterns (requirements AC-P5.1, architecture 5.2). Pure: rows in, findings out. Code decides what is found and which
// trades sit behind it; wording is added later by templates.js. A finding with no trade ids is dropped (AC-P5.2).
// Behavioural thresholds are defaults the user can change and are labelled "placeholder you set, not a recommendation" (W5).
import { validHours } from '../plan/check.js';

export const PATTERNS = Object.freeze([
  'plan_not_followed', 'entry_after_loss', 'busy_days', 'days_over_cap', 'no_setup_share', 'size_rising',
  'added_while_losing', 'stop_moved_or_missing', 'holding_and_target', 'outside_set_hours', 'after_daily_loss_limit',
]);

export const DEFAULT_THRESHOLDS = Object.freeze({ lossWindowMin: 30, sizeRiseRatio: 1.5, noSetupShare: 0.2, minSizeTrades: 6, minActiveDays: 3, minHoldingEach: 2 });

export const median = (values) => {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
const ids = (rows) => rows.map((r) => r.id);
const placeholder = (value) => ({ value, from: 'placeholder' });

export function thresholdsFrom(settings = {}) {
  return {
    ...DEFAULT_THRESHOLDS,
    ...(Number.isFinite(Number(settings.lossWindowMin)) && Number(settings.lossWindowMin) > 0 ? { lossWindowMin: Number(settings.lossWindowMin) } : {}),
    ...(Number.isFinite(Number(settings['thresholds.sizeRiseRatio'])) ? { sizeRiseRatio: Number(settings['thresholds.sizeRiseRatio']) } : {}),
    ...(Number.isFinite(Number(settings['thresholds.noSetupShare'])) ? { noSetupShare: Number(settings['thresholds.noSetupShare']) } : {}),
  };
}

function planNotFollowed(rows, { plan }) {
  const marked = rows.filter((r) => r.planFollowed !== null);
  const off = marked.filter((r) => r.planFollowed === false);
  if (!off.length) return null;
  const facts = { off: off.length, marked: marked.length };
  // the user's own rule with the lowest share followed, quoted in the sentence
  let quote = null;
  for (const item of plan?.items ?? []) {
    const results = rows.map((r) => r.planItems?.[item.id]).filter((v) => typeof v === 'boolean');
    const kept = results.filter(Boolean).length;
    if (results.length >= 2 && kept < results.length && (!quote || kept / results.length < quote.kept / quote.total)) quote = { text: item.text, kept, total: results.length };
  }
  if (quote) facts.quote = quote;
  return { pattern: 'plan_not_followed', n: off.length, tradeIds: ids(off), facts, threshold: null };
}

// Rows that closed before `row` opened, latest first.
function closedBefore(rows, row) {
  return rows.filter((o) => o.id !== row.id && o.closeMs <= row.entryMs).sort((a, b) => b.closeMs - a.closeMs);
}

function entryAfterLoss(rows, { t }) {
  const windowMs = t.lossWindowMin * 60000;
  const riskMedian = median(rows.map((r) => r.riskPct).filter((v) => v !== null));
  const a = [];
  const b = [];
  for (const row of rows) {
    const prior = closedBefore(rows, row);
    if (!prior.length || prior[0].netMinor >= 0) continue;
    if (prior.length >= 2 && prior[1].netMinor < 0 && row.entryMs - prior[0].closeMs <= windowMs) a.push(row);
    if (riskMedian !== null && row.riskPct !== null && row.riskPct > riskMedian && row.planFollowed === false) b.push(row);
  }
  const union = rows.filter((r) => a.includes(r) || b.includes(r));
  if (!union.length) return null;
  return { pattern: 'entry_after_loss', n: union.length, tradeIds: ids(union), facts: { a: a.length, b: b.length, window: t.lossWindowMin, total: rows.length }, threshold: placeholder(t.lossWindowMin) };
}

function dayCounts(rows) {
  const byDay = new Map();
  for (const r of rows) byDay.set(r.day, [...(byDay.get(r.day) ?? []), r]);
  return byDay;
}

function busyDays(rows, { t }) {
  const byDay = dayCounts(rows);
  if (byDay.size < t.minActiveDays) return null;
  const med = median([...byDay.values()].map((d) => d.length));
  const busy = [...byDay.entries()].filter(([, d]) => d.length > med);
  if (!busy.length) return null;
  const linked = busy.flatMap(([, d]) => d);
  return { pattern: 'busy_days', n: linked.length, tradeIds: ids(linked), facts: { days: busy.length, median: med, activeDays: byDay.size }, threshold: { value: med, from: 'median' } };
}

function daysOverCap(rows, { plan }) {
  const cap = plan?.dailyCap;
  if (!cap) return null;
  const over = [...dayCounts(rows).entries()].filter(([, d]) => d.length > cap);
  if (!over.length) return null;
  const linked = over.flatMap(([, d]) => d);
  return { pattern: 'days_over_cap', n: linked.length, tradeIds: ids(linked), facts: { days: over.length, cap }, threshold: { value: cap, from: 'plan' } };
}

function noSetupShare(rows, { t }) {
  const none = rows.filter((r) => !r.setup);
  if (none.length < 2 || none.length / rows.length < t.noSetupShare) return null;
  return { pattern: 'no_setup_share', n: none.length, tradeIds: ids(none), facts: { share: (none.length / rows.length) * 100, n: none.length, total: rows.length }, threshold: placeholder(t.noSetupShare * 100) };
}

function sizeRising(rows, { t }) {
  const withRisk = rows.filter((r) => r.riskPct !== null);
  const useRisk = withRisk.length >= Math.max(t.minSizeTrades, Math.ceil(rows.length * 0.6));
  const basis = useRisk ? 'r' : 'position_value_pct';
  const series = rows.filter((r) => (useRisk ? r.riskPct : r.positionValuePct) !== null);
  if (series.length < t.minSizeTrades) return null;
  const value = (r) => (useRisk ? r.riskPct : r.positionValuePct);
  const half = Math.floor(series.length / 2);
  const first = median(series.slice(0, half).map(value));
  const last = median(series.slice(series.length - half).map(value));
  if (!(first > 0) || last < first * t.sizeRiseRatio) return null;
  const linked = series.slice(series.length - half);
  return {
    pattern: 'size_rising', n: linked.length, tradeIds: ids(linked), basis,
    facts: { from: first, to: last, n: series.length, unknown: useRisk ? 0 : rows.filter((r) => r.riskPct === null).length },
    threshold: placeholder(t.sizeRiseRatio),
  };
}

function addedWhileLosing(rows) {
  const hit = rows.filter((r) => r.addedWhileLosing);
  return hit.length ? { pattern: 'added_while_losing', n: hit.length, tradeIds: ids(hit), facts: { n: hit.length, total: rows.length }, threshold: null } : null;
}

function stopMovedOrMissing(rows) {
  const moved = rows.filter((r) => r.stopMovedAway);
  const missing = rows.filter((r) => r.stopMissing);
  const union = rows.filter((r) => r.stopMovedAway || r.stopMissing);
  if (!union.length) return null;
  const movedR = moved.map((r) => r.r).filter((v) => v !== null);
  return {
    pattern: 'stop_moved_or_missing', n: union.length, tradeIds: ids(union), threshold: null,
    facts: { moved: moved.length, missing: missing.length, avgMovedR: movedR.length ? mean(movedR) : null, rKnownMoved: movedR.length },
  };
}

function holdingAndTarget(rows, { t }) {
  const winners = rows.filter((r) => r.netMinor > 0 && r.holdSeconds !== null);
  const losers = rows.filter((r) => r.netMinor < 0 && r.holdSeconds !== null);
  const facts = {};
  let fires = false;
  let linked = [];
  if (winners.length >= t.minHoldingEach && losers.length >= t.minHoldingEach) {
    const w = mean(winners.map((r) => r.holdSeconds));
    const l = mean(losers.map((r) => r.holdSeconds));
    Object.assign(facts, { winnersSeconds: w, losersSeconds: l, nWinners: winners.length, nLosers: losers.length });
    if (l > w) { fires = true; linked = [...winners, ...losers]; }
  }
  const withTarget = rows.filter((r) => r.plannedR !== null && r.netMinor > 0 && r.r !== null);
  if (withTarget.length >= t.minHoldingEach) {
    const target = mean(withTarget.map((r) => r.plannedR));
    const got = mean(withTarget.map((r) => r.r));
    if (got < target / 2) {
      fires = true;
      Object.assign(facts, { targetR: target, winnersR: got, nTarget: withTarget.length });
      linked = [...new Set([...linked, ...withTarget])];
    }
  }
  if (!fires) return null;
  return { pattern: 'holding_and_target', n: linked.length, tradeIds: ids(rows.filter((r) => linked.includes(r))), facts, threshold: null };
}

function outsideSetHours(rows, { plan }) {
  const hit = rows.filter((r) => r.planAuto.hours === 'fail');
  if (!hit.length) return null;
  const hours = validHours(plan?.hours).map((h) => `${h.from}-${h.to}`).join(', ');
  return { pattern: 'outside_set_hours', n: hit.length, tradeIds: ids(hit), facts: { n: hit.length, total: rows.length, hours }, threshold: { value: hours, from: 'plan' } };
}

function afterDailyLossLimit(rows, { plan }) {
  const hit = rows.filter((r) => r.planAuto.dailyLossLimit === 'fail');
  if (!hit.length) return null;
  return { pattern: 'after_daily_loss_limit', n: hit.length, tradeIds: ids(hit), facts: { n: hit.length, limit: Number(plan?.dailyLossLimitPct) }, threshold: { value: plan?.dailyLossLimitPct ?? null, from: 'plan' } };
}

const RUN = { plan_not_followed: planNotFollowed, entry_after_loss: entryAfterLoss, busy_days: busyDays, days_over_cap: daysOverCap, no_setup_share: noSetupShare, size_rising: sizeRising, added_while_losing: addedWhileLosing, stop_moved_or_missing: stopMovedOrMissing, holding_and_target: holdingAndTarget, outside_set_hours: outsideSetHours, after_daily_loss_limit: afterDailyLossLimit };

// Which patterns can run at all on this data: a pattern that needs a plan rule the user has not written is not "checked".
function checkable(rows, plan) {
  const has = (k) => Boolean(plan && (Array.isArray(plan[k]) ? plan[k].length : plan[k]));
  return PATTERNS.filter((p) => {
    if (p === 'days_over_cap') return has('dailyCap');
    if (p === 'outside_set_hours') return has('hours');
    if (p === 'after_daily_loss_limit') return has('dailyLossLimitPct');
    if (p === 'plan_not_followed') return rows.some((r) => r.planFollowed !== null);
    return true;
  });
}

export function findPatterns(rows, { plan = null, settings = {} } = {}) {
  const t = thresholdsFrom(settings);
  const findings = [];
  for (const p of PATTERNS) {
    const f = RUN[p](rows, { plan, t });
    if (f && f.tradeIds.length) findings.push(f);
  }
  return { findings, checked: checkable(rows, plan), thresholds: t };
}

// Process versus outcome (AC-P5.9): two groups side by side, each with n and average R. No link between them.
export function processOutcome(rows) {
  const group = (list) => {
    const rs = list.map((r) => r.r).filter((v) => v !== null);
    return { n: list.length, avgR: rs.length ? mean(rs) : null, rKnown: rs.length, tradeIds: ids(list) };
  };
  return {
    followed: group(rows.filter((r) => r.planFollowed === true)),
    offPlan: group(rows.filter((r) => r.planFollowed === false)),
    unmarked: { n: rows.filter((r) => r.planFollowed === null).length, tradeIds: ids(rows.filter((r) => r.planFollowed === null)) },
  };
}

// Optional sections (AC-P5.10).
export function optionalSections(rows, { plan = null, settings = {} } = {}) {
  const t = thresholdsFrom(settings);
  const tie = (a, b) => (a.id < b.id ? -1 : 1);
  const pick = (list) => list.slice(0, 3).map((r) => ({ id: r.id, netMinor: r.netMinor, r: r.r, planFollowed: r.planFollowed, instrument: r.instrument }));
  const largest = {
    wins: pick(rows.filter((r) => r.netMinor > 0).sort((a, b) => b.netMinor - a.netMinor || tie(a, b))),
    losses: pick(rows.filter((r) => r.netMinor < 0).sort((a, b) => a.netMinor - b.netMinor || tie(a, b))),
  };
  const months = new Map();
  for (const r of rows) {
    const m = months.get(r.closeMonth) ?? { month: r.closeMonth, n: 0, netR: 0, rKnown: 0, tradeIds: [] };
    m.n += 1;
    m.tradeIds.push(r.id);
    if (r.r !== null) { m.netR += r.r; m.rKnown += 1; }
    months.set(r.closeMonth, m);
  }
  const monthsByCount = [...months.values()].sort((a, b) => (a.month < b.month ? -1 : 1));
  const byDay = dayCounts(rows);
  const med = byDay.size ? median([...byDay.values()].map((d) => d.length)) : null;
  const windowMs = t.lossWindowMin * 60000;
  const seq = rows.filter((row) => {
    const prior = closedBefore(rows, row);
    return prior.length && prior[0].netMinor < 0 && row.entryMs - prior[0].closeMs <= windowMs && med !== null && (byDay.get(row.day)?.length ?? 0) > med;
  });
  return { largest, monthsByCount, lossSequence: { n: seq.length, tradeIds: ids(seq), windowMin: t.lossWindowMin } };
}
