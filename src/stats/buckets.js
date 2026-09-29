// S12 buckets and sessions, S13 calendar. Pure. Local times through src/core/time.js.
import { localParts, inLocalWindow, addDays } from '../core/time.js';
import { tradesOf, rowOf } from './sets.js';
import { firstEntry, closeTimeOf } from './trade.js';

export const SESSIONS = [
  'london_ny_overlap', 'london', 'new_york', 'tokyo', 'sydney', 'us_regular', 'us_extended', 'outside', 'none',
];

const LONDON = 'Europe/London';
const NEW_YORK = 'America/New_York';

// Session of an entry instant for a market (architecture 3.2 "Sessions"): first match wins.
export function sessionOf(isoUtc, market, quoteCurrency) {
  if (market === 'forex') {
    const london = inLocalWindow(isoUtc, LONDON, '08:00', '17:00');
    const newYork = inLocalWindow(isoUtc, NEW_YORK, '08:00', '17:00');
    if (london && newYork) return 'london_ny_overlap';
    if (london) return 'london';
    if (newYork) return 'new_york';
    if (inLocalWindow(isoUtc, 'UTC', '00:00', '09:00')) return 'tokyo';
    if (inLocalWindow(isoUtc, 'UTC', '22:00', '07:00')) return 'sydney';
    return 'outside';
  }
  if (market === 'stock' && (quoteCurrency || 'USD').toUpperCase() === 'USD') {
    if (inLocalWindow(isoUtc, NEW_YORK, '09:30', '16:00')) return 'us_regular';
    if (inLocalWindow(isoUtc, NEW_YORK, '04:00', '09:30') || inLocalWindow(isoUtc, NEW_YORK, '16:00', '20:00')) return 'us_extended';
    return 'outside';
  }
  return 'none';
}

const KEYS = {
  setup: (t) => t.setup ?? null,
  market: (t) => t.market,
  instrument: (t) => t.instrument,
  account: (t) => t.accountId,
  hour: (t, ctx) => localParts(firstEntry(t).time, ctx.tz, ctx.dayCutoffHour || 0).hour,
  weekday: (t, ctx) => localParts(firstEntry(t).time, ctx.tz, ctx.dayCutoffHour || 0).weekday,
  session: (t) => sessionOf(firstEntry(t).time, t.market, t.quoteCurrency),
};

// Fixed neutral order (AC-B1.4): alphabetical with "No setup" (null) last; numbers ascending;
// sessions in the listed order.
function order(by) {
  if (by === 'hour' || by === 'weekday') return (a, b) => a - b;
  if (by === 'session') return (a, b) => SESSIONS.indexOf(a) - SESSIONS.indexOf(b);
  return (a, b) => {
    if (a === null) return b === null ? 0 : 1;
    if (b === null) return -1;
    return a < b ? -1 : a > b ? 1 : 0;
  };
}

// S12. One row per non-empty bucket; no rank and no "best" field.
export function buckets(set, by, ctx) {
  const keyOf = KEYS[by];
  if (!keyOf) throw new RangeError(`unknown bucket: ${by}`);
  const groups = new Map();
  for (const t of tradesOf(set)) {
    const key = keyOf(t, ctx);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(rowOf(t, ctx));
  }
  return [...groups.keys()].sort(order(by)).map((key) => {
    const rows = groups.get(key);
    const rs = rows.filter((r) => r.r !== null).map((r) => r.r);
    return {
      key,
      n: rows.length,
      netMinor: rows.reduce((s, r) => s + r.netMinor, 0),
      winRate: rows.filter((r) => r.netMinor > 0).length / rows.length,
      expectancyR: rs.length ? rs.reduce((s, r) => s + r, 0) / rs.length : null,
      rKnown: rs.length,
      tradeIds: rows.map((r) => r.id),
    };
  });
}

// Close day in ctx.tz with the day cut-off; closeDayOverride wins.
export function closeDayOf(trade, ctx) {
  if (trade.closeDayOverride) return String(trade.closeDayOverride).slice(0, 10);
  return localParts(closeTimeOf(trade), ctx.tz, ctx.dayCutoffHour || 0).date;
}

// Monday of the ISO week of a date.
function mondayOf(date) {
  const wd = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((wd + 6) % 7));
}

// S13. Days with trades in the month, week rows (Monday start, only their days in the month), month.
export function calendar(set, { year, month }, ctx) {
  const prefix = `${year}-${String(month).padStart(2, '0')}-`;
  const days = new Map();
  for (const t of tradesOf(set)) {
    const date = closeDayOf(t, ctx);
    if (!date.startsWith(prefix)) continue;
    const cell = days.get(date) || { date, netMinor: 0, n: 0, tradeIds: [] };
    cell.netMinor += rowOf(t, ctx).netMinor;
    cell.n += 1;
    cell.tradeIds.push(t.id);
    days.set(date, cell);
  }
  const dayList = [...days.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  const weeks = new Map();
  for (const d of dayList) {
    const start = mondayOf(d.date);
    weeks.set(start, (weeks.get(start) || 0) + d.netMinor);
  }
  return {
    days: dayList,
    weeks: [...weeks.entries()].map(([start, netMinor]) => ({ start, netMinor })),
    monthMinor: dayList.reduce((s, d) => s + d.netMinor, 0),
  };
}
