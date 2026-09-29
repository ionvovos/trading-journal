// "Your paper and real figures" (requirements AC-P4.5, P4.6, P4.7; PICK K2). The figures come from stats.compareModes (src/stats/compare.js):
//   { real, paper, missing } where each mode is null or
//   { n, tradeIds, ruleFollowing: { value, followed, marked, unmarked, tradeIds },
//     riskPctAtEntry: { value, n, tradeIds }, tradesPerDay: { value, n, days, tradeIds },
//     afterLoss: { value, n, count, lossWindowMin, tradeIds } }
// and `missing` is 'real' | 'paper' | 'both' | null. This file turns that into display rows in the active language. It computes no
// figure: every value is copied from the statistics result. Every text is under the `compare.*` keys (guard scope `comparison`,
// which also rejects ready, not ready, start, stop and go live, AC-P4.7). Pure: `t` and `fmt` are passed in.
export const ROWS = Object.freeze(['followed', 'risk', 'perDay', 'afterLoss']);

const DASH = '–';

// One cell: { value, sub, n, tradeIds, empty }. `empty` is true when the mode has no figure for this row.
function cell(key, m, { t, fmt }) {
  if (!m) return { value: DASH, sub: '', n: 0, tradeIds: [], empty: true };
  if (key === 'followed') {
    const r = m.ruleFollowing;
    if (!r || r.value === null || r.value === undefined) return { value: DASH, sub: t('compare.followed.none'), n: 0, tradeIds: [], empty: true };
    return { value: fmt.pct(r.value * 100, 0), sub: t('compare.followed.sub', { a: r.followed, b: r.marked }), n: r.marked, tradeIds: r.tradeIds ?? [], empty: false };
  }
  if (key === 'risk') {
    const r = m.riskPctAtEntry;
    if (!r || r.value === null || r.value === undefined) return { value: DASH, sub: t('compare.risk.none'), n: 0, tradeIds: [], empty: true };
    return { value: fmt.pct(r.value, 1), sub: t('compare.risk.sub', { n: r.n }), n: r.n, tradeIds: r.tradeIds ?? [], empty: false };
  }
  if (key === 'perDay') {
    const r = m.tradesPerDay;
    if (!r || r.value === null || r.value === undefined) return { value: DASH, sub: '', n: 0, tradeIds: [], empty: true };
    return { value: fmt.num(r.value, 1), sub: t('compare.perDay.sub', { n: r.n, d: r.days }), n: r.n, tradeIds: r.tradeIds ?? [], empty: false };
  }
  const r = m.afterLoss;
  if (!r || r.value === null || r.value === undefined) return { value: DASH, sub: '', n: 0, tradeIds: [], empty: true };
  return { value: fmt.pct(r.value * 100, 0), sub: t('compare.afterLoss.sub', { a: r.count, b: r.n }), n: r.n, tradeIds: r.tradeIds ?? [], empty: false };
}

// result: the compareModes result. opts: { t, fmt, lossWindowMin }. Returns { missing, message, rows, lossWindowMin }. With a mode lacking
// closed trades the rows are empty and `message` names the mode (AC-P4.6); the comparison is not shown.
export function buildCompare(result, { t, fmt, lossWindowMin = 30 } = {}) {
  const missing = result?.missing ?? null;
  if (missing) return { missing, message: t(`compare.missing.${missing}`), rows: [], lossWindowMin };
  const rows = ROWS.map((key) => ({
    key,
    label: key === 'afterLoss' ? t('compare.k.afterLoss', { min: lossWindowMin }) : t(`compare.k.${key}`),
    real: cell(key, result.real, { t, fmt }),
    paper: cell(key, result.paper, { t, fmt }),
  }));
  return { missing: null, message: null, rows, lossWindowMin };
}
