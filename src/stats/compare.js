// P4.5 "Your paper and real figures": the only function that takes both modes, and it returns
// them apart. Pure.
import { localParts } from '../core/time.js';
import { minorDigits } from '../core/money.js';
import { closedSet, ruleFollowing, rowOf } from './sets.js';
import { closeDayOf } from './buckets.js';
import { initialRisk, firstEntry, closeTimeOf } from './trade.js';
import { equityAtEntry } from './curve.js';

const MODES = ['real', 'paper'];

function median(xs) {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function figuresFor(trades, mode, { from, to, lossWindowMin }, ctx) {
  const all = closedSet(trades, { mode, accountIds: ctx.accountIds }).included;
  const inPeriod = all.filter((t) => {
    const day = closeDayOf(t, ctx);
    return (!from || day >= from) && (!to || day <= to);
  });
  const ids = inPeriod.map((t) => t.id);

  const eqCtx = { ...ctx, trades };
  const risks = [];
  for (const t of inPeriod) {
    const risk = initialRisk(t).value;
    const eq = equityAtEntry(t, eqCtx);
    if (risk === null || eq === null || !(eq > 0)) continue;
    const d = (ctx.digitsOf || minorDigits)(ctx.accounts[t.accountId].baseCurrency);
    risks.push({ id: t.id, pct: (risk / (eq / 10 ** d)) * 100 });
  }

  const days = new Set(inPeriod.map((t) => localParts(firstEntry(t).time, ctx.tz, ctx.dayCutoffHour || 0).date));

  const lossCloses = all.filter((t) => rowOf(t, ctx).netMinor < 0).map((t) => Date.parse(closeTimeOf(t)));
  const windowMs = lossWindowMin * 60000;
  const afterLoss = inPeriod.filter((t) => {
    const at = Date.parse(firstEntry(t).time);
    return lossCloses.some((c) => c <= at && at - c <= windowMs);
  }).map((t) => t.id);

  return {
    n: inPeriod.length,
    tradeIds: ids,
    ruleFollowing: ruleFollowing(inPeriod),
    riskPctAtEntry: { value: median(risks.map((r) => r.pct)), n: risks.length, tradeIds: risks.map((r) => r.id) },
    tradesPerDay: { value: days.size ? inPeriod.length / days.size : null, n: inPeriod.length, days: days.size, tradeIds: ids },
    afterLoss: {
      value: inPeriod.length ? afterLoss.length / inPeriod.length : null,
      n: inPeriod.length,
      count: afterLoss.length,
      lossWindowMin,
      tradeIds: afterLoss,
    },
  };
}

// { real, paper, missing }: missing names the mode with no closed trade in the period
// ('real', 'paper', 'both'), else null.
export function compareModes(trades, { from, to, lossWindowMin = 30 } = {}, ctxByMode = {}) {
  const out = {};
  for (const mode of MODES) {
    const ctx = ctxByMode[mode];
    out[mode] = ctx ? figuresFor(trades, mode, { from, to, lossWindowMin }, { ...ctx, mode }) : null;
  }
  const lacks = MODES.filter((m) => !out[m] || out[m].n === 0);
  return { real: out.real, paper: out.paper, missing: lacks.length === 2 ? 'both' : lacks[0] || null };
}
