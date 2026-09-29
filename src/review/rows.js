// Turns stored trades into the plain rows the review patterns read (architecture 5.2). Pure.
// Only closed trades of the chosen mode inside the period count; held-out, open and user-excluded trades are left out and counted
// (AC-P5.8, requirements S3). Every number comes from src/plan/derive.js, which is checked against the statistics fixture.
import { localParts } from '../core/time.js';
import { evaluatePlan, sameDayBefore } from '../plan/check.js';
import {
  entryLegs, entryTime, closeTime, isClosed, initialRisk, tradeMoney, rMultiple, holdSeconds, positionValue, equityAtEntry, digitsFor,
  averageEntry,
} from '../plan/derive.js';

const minutesOfDay = (iso, tz) => { const p = localParts(iso, tz); return p.hour * 60 + p.minute; };

// Stop moves: [{ time, price }] (or { to }). A move away from the entry: lower for a long, higher for a short.
function stopMovedAway(trade) {
  const moves = trade.stopMoves ?? [];
  if (!moves.length || trade.initialStop === null || trade.initialStop === undefined) return false;
  let prev = Number(trade.initialStop);
  for (const m of [...moves].sort((a, b) => Date.parse(a.time ?? 0) - Date.parse(b.time ?? 0))) {
    const to = Number(m.price ?? m.to);
    if (!Number.isFinite(to)) continue;
    if (trade.side === 'short' ? to > prev : to < prev) return true;
    prev = to;
  }
  return false;
}

// An entry leg after the first, priced at a loss against the size-weighted average of the legs before it.
function addedWhileLosing(trade) {
  const legs = [...entryLegs(trade)].sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  let size = 0;
  let cost = 0;
  for (const [i, leg] of legs.entries()) {
    if (i > 0 && size > 0) {
      const avg = cost / size;
      if (trade.side === 'short' ? Number(leg.price) > avg : Number(leg.price) < avg) return true;
    }
    size += Number(leg.size);
    cost += Number(leg.price) * Number(leg.size);
  }
  return false;
}

function plannedR(trade) {
  if (trade.target === null || trade.target === undefined || trade.target === '' || trade.initialStop === null || trade.initialStop === undefined) return null;
  const avg = averageEntry(trade);
  if (avg === null) return null;
  const dist = Math.abs(avg - Number(trade.initialStop));
  return dist > 0 ? Math.abs(Number(trade.target) - avg) / dist : null;
}

const inPeriod = (iso, period, tz) => {
  if (!period) return true;
  const zone = period.zone ?? tz;
  const d = localParts(iso, zone).date;
  return (!period.from || d >= period.from) && (!period.to || d <= period.to);
};

// input: { trades, cash, accounts (array or map), plans, mode, period: { from, to, zone? }, tz, dayCutoffHour }
export function buildRows({ trades = [], cash = [], accounts = {}, plans = [], mode = 'real', period = null, tz = 'UTC', dayCutoffHour = 0 }) {
  const accountMap = Array.isArray(accounts) ? Object.fromEntries(accounts.map((a) => [a.id, a])) : accounts;
  const inMode = trades.filter((t) => t.mode === mode);
  const left = { open: 0, heldOut: 0, userExcluded: 0 };
  const counted = [];
  for (const t of inMode) {
    if (t.holds?.length) { left.heldOut += 1; continue; }
    if (t.excluded) { left.userExcluded += 1; continue; }
    if (!isClosed(t)) { left.open += 1; continue; }
    counted.push(t);
  }
  const planOf = (t) => plans.find((p) => p.id === t.plan?.planId) ?? plans.find((p) => p.active) ?? null;
  const rows = [];
  for (const t of counted) {
    const at = entryTime(t);
    const closeAt = closeTime(t);
    if (!at || !closeAt || !inPeriod(closeAt, period, tz)) continue;
    const digits = digitsFor(t, accountMap);
    const money = tradeMoney(t, { accounts: accountMap });
    const risk = initialRisk(t);
    const equity = equityAtEntry(t, { account: accountMap[t.accountId], trades: counted, cash });
    const posValue = positionValue(t);
    const plan = planOf(t);
    const same = sameDayBefore(t, counted, tz, dayCutoffHour);
    const equityMinor = equity === null ? null : Math.round(equity * 10 ** digits);
    const evalResult = plan ? evaluatePlan(t, plan, { sameDayTrades: same, equityAtEntryMinor: equityMinor, tz, digits, dayCutoffHour, accounts: accountMap }) : { auto: {}, suggestedFollowed: null };
    rows.push({
      id: t.id,
      instrument: t.instrument,
      market: t.market,
      side: t.side,
      setup: t.setup ?? null,
      entryAt: at,
      closeAt,
      entryMs: Date.parse(at),
      closeMs: Date.parse(closeAt),
      day: localParts(at, tz, dayCutoffHour).date,
      closeMonth: localParts(closeAt, tz, dayCutoffHour).date.slice(0, 7),
      minuteOfDay: minutesOfDay(at, tz),
      holdSeconds: holdSeconds(t),
      netMinor: money.netMinor,
      digits,
      r: rMultiple(t, { accounts: accountMap }),
      riskPct: equity && equity > 0 && risk.value !== null ? (risk.value / equity) * 100 : null,
      positionValuePct: equity && equity > 0 && posValue !== null ? (posValue / equity) * 100 : null,
      initialStop: t.initialStop ?? null,
      stopMissing: !t.entryUnknown && (t.initialStop === null || t.initialStop === undefined || t.initialStop === ''), // a position opened before the file has no entry to hold a stop for
      stopMovedAway: stopMovedAway(t),
      addedWhileLosing: addedWhileLosing(t),
      plannedR: plannedR(t),
      planFollowed: typeof t.plan?.followed === 'boolean' ? t.plan.followed : null,
      planItems: t.plan?.items ?? {},
      planAuto: evalResult.auto,
    });
  }
  rows.sort((a, b) => a.entryMs - b.entryMs || (a.id < b.id ? -1 : 1));
  return { rows, left };
}
