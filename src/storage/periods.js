// Broker-check periods per real account (PICK K3): every period an import covers, plus the recent months of
// hand-entered trades, with the state the person left it in until it is reconciled or skipped.
// Pure. State names are the ones S1's statusChip knows: reconciled | difference | skipped | not_asked.
import { localParts, addDays } from '../core/time.js';
import { isClosed } from '../core/trade.js';
import { reconId } from './model.js';

const monthOf = (date) => date.slice(0, 7);

export function monthRange(month) {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

// periodsFor(model, { tz, months = 2 }) -> [{ key, accountId, accountName, period: { from, to, zone }, importId, state, record }]
// newest period end first, then account name.
export function periodsFor(model, { tz = 'UTC', months = 2 } = {}) {
  const out = [];
  const records = new Map(model.reconciliations.map((r) => [r.id, r]));
  const real = model.accounts.filter((a) => a.mode === 'real');
  const seen = new Set();
  const push = (account, period, importId) => {
    const id = reconId(account.id, period.from, period.to);
    if (seen.has(id)) return;
    seen.add(id);
    const record = records.get(id) || null;
    out.push({ key: id, accountId: account.id, accountName: account.name, period, importId: importId ?? null, state: record?.state ?? 'not_asked', record });
  };
  for (const account of real) {
    for (const imp of model.imports.filter((i) => i.accountId === account.id && i.status !== 'cancelled')) {
      const p = imp.report?.period;
      if (p) push(account, { from: p.from, to: p.to, zone: p.zone || imp.effectiveZone || tz }, imp.id);
    }
    // hand-entered trades: the latest months that hold a closed trade
    const manualMonths = new Set();
    for (const t of model.trades) {
      if (t.accountId !== account.id || t.entry !== 'manual' || !t.closeTime || !isClosed(t) || (t.holds && t.holds.length)) continue;
      manualMonths.add(monthOf(localParts(t.closeTime, tz).date));
    }
    for (const m of [...manualMonths].sort().reverse().slice(0, months)) push(account, { ...monthRange(m), zone: tz }, null);
    // a record whose period no import or month produced (typed by hand on the dashboard) stays listed
    for (const r of model.reconciliations) {
      if (r.accountId !== account.id || r.form === 'quantity' || String(r.id).includes(':qty:')) continue;
      push(account, { from: r.from, to: r.to, zone: r.zone || tz }, null);
    }
  }
  return out.sort((a, b) => (a.period.to < b.period.to ? 1 : a.period.to > b.period.to ? -1 : a.accountName.localeCompare(b.accountName)));
}

// The unresolved periods first (difference, then not asked, then skipped), for the dashboard list.
const RANK = { difference: 0, not_asked: 1, skipped: 2, reconciled: 3 };
export const byUrgency = (list) => [...list].sort((a, b) => RANK[a.state] - RANK[b.state] || (a.period.to < b.period.to ? 1 : -1));

// Label for a period: "Sep 2026" when it is one calendar month, else "2 Mar - 9 Mar".
export function periodLabel(period, fmt) {
  const a = `${period.from}T12:00:00Z`;
  const b = `${period.to}T12:00:00Z`;
  const full = period.from === monthRange(monthOf(period.from)).from && period.to === monthRange(monthOf(period.from)).to;
  if (full) return fmt.date(a, { style: 'monthYear', zone: 'UTC' });
  return `${fmt.date(a, { zone: 'UTC' })} – ${fmt.date(b, { style: 'long', zone: 'UTC' })}`;
}

// The days of a period as { from, to } shifted by n days (used by the period editor).
export const shiftPeriod = (period, days) => ({ ...period, from: addDays(period.from, days), to: addDays(period.to, days) });
