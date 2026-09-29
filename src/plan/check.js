// Plan checks the code can decide (requirements AC-P2.3). Pure: no clock, no DOM.
// A plan: { id, name, active, items: [{ id, text }], setups: [string], hours: [{ from, to }], dailyCap: number|null,
//           riskPct: string|null, dailyLossLimitPct: string|null }. Every field is optional; risk per trade and daily loss
// limit have no default (W5). A rule the plan does not have gives no key in `auto`.
import { localParts, inLocalWindow } from '../core/time.js';
import { entryTime, closeTime, initialRisk, tradeMoney } from './derive.js';

export const PLAN_FIELDS = ['items', 'setups', 'hours', 'dailyCap', 'riskPct', 'dailyLossLimitPct'];

export function emptyPlan(id, name = '') {
  return { id, name, active: true, items: [], setups: [], hours: [], dailyCap: null, riskPct: null, dailyLossLimitPct: null };
}

// Cleans a plan typed in the form: trims text, drops empty items, keeps numbers as numbers or decimal strings, never fills a default.
export function normalizePlan(input = {}) {
  const items = (input.items ?? []).map((i, n) => ({ id: i.id ?? `i${n + 1}`, text: String(i.text ?? '').trim() })).filter((i) => i.text);
  const setups = [...new Set((input.setups ?? []).map((s) => String(s).trim()).filter(Boolean))];
  const hours = (input.hours ?? []).filter((h) => h && /^\d{1,2}:\d{2}$/.test(h.from ?? '') && /^\d{1,2}:\d{2}$/.test(h.to ?? ''));
  const cap = input.dailyCap === '' || input.dailyCap === null || input.dailyCap === undefined ? null : Number(input.dailyCap);
  const dec = (v) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) || Number(v) <= 0 ? null : String(v).trim());
  return {
    id: input.id, name: String(input.name ?? '').trim(), active: input.active !== false, items, setups, hours,
    dailyCap: cap !== null && Number.isInteger(cap) && cap > 0 ? cap : null,
    riskPct: dec(input.riskPct), dailyLossLimitPct: dec(input.dailyLossLimitPct),
  };
}

export const hasRules = (plan) => Boolean(plan && (plan.items?.length || plan.setups?.length || plan.hours?.length || plan.dailyCap || plan.riskPct || plan.dailyLossLimitPct));

const dayOf = (iso, tz, cutoff = 0) => localParts(iso, tz, cutoff).date;

// trade: store trade. ctx: { sameDayTrades: [trade] opened earlier the same local day, equityAtEntryMinor: integer|null,
// accounts, tz, digits = 2, dayCutoffHour = 0 }. Values: 'pass' | 'fail' | 'unknown'.
export function evaluatePlan(trade, plan, ctx = {}) {
  const { sameDayTrades = [], equityAtEntryMinor = null, tz = 'UTC', digits = 2, dayCutoffHour = 0, accounts = {} } = ctx;
  const auto = {};
  if (!plan) return { auto, suggestedFollowed: null };
  const at = entryTime(trade);

  if (plan.hours?.length) {
    auto.hours = at ? (plan.hours.some((h) => inLocalWindow(at, tz, h.from, h.to)) ? 'pass' : 'fail') : 'unknown';
  }
  if (plan.dailyCap) {
    auto.dailyCap = sameDayTrades.length + 1 > plan.dailyCap ? 'fail' : 'pass';
  }
  if (plan.riskPct) {
    const risk = initialRisk(trade).value;
    auto.risk = equityAtEntryMinor && equityAtEntryMinor > 0 && risk !== null
      ? (risk / (equityAtEntryMinor / 10 ** digits) * 100 <= Number(plan.riskPct) + 1e-9 ? 'pass' : 'fail')
      : 'unknown';
  }
  if (plan.dailyLossLimitPct) {
    if (!equityAtEntryMinor || equityAtEntryMinor <= 0 || !at) auto.dailyLossLimit = 'unknown';
    else {
      let lost = 0;
      for (const o of sameDayTrades) {
        const c = closeTime(o);
        if (!c || Date.parse(c) >= Date.parse(at)) continue;
        const m = tradeMoney(o, { accounts });
        if (m) lost += m.netMinor;
      }
      auto.dailyLossLimit = lost <= -(Number(plan.dailyLossLimitPct) / 100) * equityAtEntryMinor + 1e-9 ? 'fail' : 'pass';
    }
  }
  auto.stop = trade.initialStop !== null && trade.initialStop !== undefined && trade.initialStop !== '' ? 'pass' : 'fail';
  if (plan.setups?.length) auto.setup = trade.setup && plan.setups.includes(trade.setup) ? 'pass' : 'fail';

  const values = Object.values(auto);
  const suggestedFollowed = values.includes('fail') ? false : values.includes('pass') ? true : null;
  return { auto, suggestedFollowed };
}

// The trades opened earlier the same local day as `trade` (same mode), for evaluatePlan.
export function sameDayBefore(trade, trades, tz, cutoff = 0) {
  const at = entryTime(trade);
  if (!at) return [];
  const day = dayOf(at, tz, cutoff);
  return trades.filter((o) => {
    if (o.id === trade.id || o.mode !== trade.mode) return false;
    const a = entryTime(o);
    return a && Date.parse(a) < Date.parse(at) && dayOf(a, tz, cutoff) === day;
  });
}

// Rule-following rate (AC-P2.4): followed / trades that carry a mark, with the unmarked count beside it.
export function ruleFollowing(trades) {
  const marked = trades.filter((t) => t.plan && typeof t.plan.followed === 'boolean');
  const followed = marked.filter((t) => t.plan.followed);
  return { value: marked.length ? followed.length / marked.length : null, followed: followed.length, marked: marked.length, unmarked: trades.length - marked.length, tradeIds: marked.map((t) => t.id) };
}

// The pre-trade checklist state for one draft: items ticked, left, or the step skipped. Skipping never blocks saving (AC-P2.2).
export function checklistResult(plan, ticks = {}, skipped = false) {
  const items = {};
  for (const item of plan?.items ?? []) items[item.id] = skipped ? null : (ticks[item.id] === true ? true : null);
  return { planId: plan?.id ?? null, skipped, items, ticked: Object.values(items).filter((v) => v === true).length, total: (plan?.items ?? []).length };
}
