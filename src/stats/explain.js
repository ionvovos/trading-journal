// A5: every figure opens to its trades. The listed values are the same integers that make the
// headline, so each money list sums exactly to it (AC-A5.2). Pure.
import {
  rowsOf, winRate, avgWinLoss, profitFactor, expectancy, feeTotals, streaks, ruleFollowing,
  pipsByPair, pips, holdingTime,
} from './sets.js';
import { equityCurve, drawdown } from './curve.js';
import { buckets, calendar, closeDayOf } from './buckets.js';

const REASONS = {
  open: 'open', heldOut: 'held_out', userExcluded: 'user_excluded', otherMode: 'other_mode', otherAccount: 'other_account',
};

function excludedOf(set) {
  if (Array.isArray(set) || !set?.excluded) return [];
  const out = [];
  for (const [k, reason] of Object.entries(REASONS)) for (const t of set.excluded[k] || []) out.push({ id: t.id, reason });
  return out;
}

const money = (name, rows, value = (r) => r.netMinor) => {
  const items = rows.map((r) => ({ id: r.id, valueMinor: value(r) }));
  return { name, totalMinor: items.reduce((s, i) => s + i.valueMinor, 0), items };
};

// explain(figureId, set, ctx, opts): opts carries the drill target where a figure has one:
// S12 { by, key }, S13 { year, month, date? }.
export function explain(figureId, set, ctx, opts = {}) {
  const rows = rowsOf(set, ctx);
  const excluded = excludedOf(set);
  const rMissing = rows.filter((r) => r.r === null).map((r) => ({ id: r.id, reason: 'r_missing' }));
  const rKnown = rows.filter((r) => r.r !== null);
  const wins = rows.filter((r) => r.netMinor > 0);
  const losses = rows.filter((r) => r.netMinor < 0);
  let params;
  let included = rows;
  let extra = [];

  switch (figureId) {
    case 'S2':
      params = { money: [money('net', rows)] };
      break;
    case 'S4':
      params = { ...winRate(set, ctx), money: [money('net', rows)] };
      break;
    case 'S5':
      params = { ...avgWinLoss(set, ctx), money: [money('wins', wins), money('losses', losses)] };
      break;
    case 'S6':
      params = { ...profitFactor(set, ctx), money: [money('wins', wins), money('losses', losses)] };
      break;
    case 'S8':
      included = rKnown;
      extra = rMissing;
      params = { rValues: rKnown.map((r) => ({ id: r.id, r: r.r })) };
      break;
    case 'S9':
      extra = rMissing;
      params = { ...expectancy(set, ctx), rValues: rKnown.map((r) => ({ id: r.id, r: r.r })), money: [money('net', rows)] };
      break;
    case 'S10': {
      const curve = equityCurve(set, ctx);
      params = { startMinor: curve.points[0].equityMinor, points: curve.points, money: [money('net', rows)] };
      break;
    }
    case 'S11': {
      const curve = equityCurve(set, ctx);
      const dd = drawdown(curve, { cash: opts.cash || ctx?.cash || [], ctx });
      const span = dd.peak ? curve.points.slice(dd.peak.index + 1, dd.trough.index + 1).map((p) => p.ref) : [];
      const byId = new Map(rows.map((r) => [r.id, r]));
      included = span.map((id) => byId.get(id));
      params = { ...dd, money: [money('drawdown', included, (r) => -r.netMinor)] };
      break;
    }
    case 'S12': {
      const row = buckets(set, opts.by, ctx).find((b) => b.key === opts.key);
      const ids = new Set(row ? row.tradeIds : []);
      included = rows.filter((r) => ids.has(r.id));
      params = { by: opts.by, key: opts.key, bucket: row || null, money: [money('net', included)] };
      break;
    }
    case 'S13': {
      const prefix = opts.date || `${opts.year}-${String(opts.month).padStart(2, '0')}-`;
      included = rows.filter((r) => closeDayOf(r.trade, ctx).startsWith(prefix));
      params = { ...opts, calendar: calendar(set, { year: opts.year, month: opts.month }, ctx), money: [money('net', included)] };
      break;
    }
    case 'S14':
      params = {
        ...feeTotals(set, ctx),
        money: [money('fees', rows, (r) => r.feesMinor), money('funding', rows, (r) => r.fundingMinor)],
      };
      break;
    case 'S15':
      params = streaks(set, ctx);
      break;
    case 'S16': {
      params = ruleFollowing(set);
      const ids = new Set(params.tradeIds);
      included = rows.filter((r) => ids.has(r.id));
      extra = rows.filter((r) => !ids.has(r.id)).map((r) => ({ id: r.id, reason: 'unmarked' }));
      break;
    }
    case 'S17':
      included = rows.filter((r) => pips(r.trade));
      params = { byPair: pipsByPair(set), perTrade: included.map((r) => ({ id: r.id, ...pips(r.trade) })) };
      break;
    case 'S18':
      params = holdingTime(set, ctx);
      break;
    default:
      throw new RangeError(`unknown figure: ${figureId}`);
  }
  return {
    formulaKey: `stats.formula.${figureId}`,
    params,
    includedIds: included.map((r) => r.id),
    excluded: [...excluded, ...extra],
  };
}

