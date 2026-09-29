// getSummary(ctx): what the dashboard reads (S1's home.js buildHomeModel documents the fields). Statistics come from src/stats
// through statsModel; the broker-check states come from the periods of the imports and hand-entered trades.
import { loadModel } from './model.js';
import { computeStats, defaultMonth, monthPeriod, pointIndex } from './statsModel.js';
import { periodsFor, byUrgency, periodLabel } from './periods.js';
import { exportDue } from './actions.js';
import { sizeText, closeDay } from './viewkit.js';
import { createFormat } from '../i18n/format.js';

// Pure: the period label ("2026-09" -> a month name in the language of fmt).
export const monthName = (month, fmt) => fmt.date(`${month}-15T12:00:00Z`, { style: 'monthLong', zone: 'UTC' });

export async function getSummary(ctx) {
  const model = await loadModel(ctx.store);
  const fmt = ctx.fmt ?? createFormat({ lang: ctx.lang, tz: ctx.tz });
  const month = defaultMonth(model.trades.filter((tr) => tr.mode === ctx.mode), ctx);
  const period = monthPeriod(month);
  const s = await computeStats(ctx, model, { period });
  const points = (s.curve.points || []).map((p) => ({ t: p.t, equityMinor: p.equityMinor }));
  const dd = s.drawdown;
  const exp = s.expectancy;
  const recent = [...s.included].sort((a, b) => (a.closeTime < b.closeTime ? 1 : -1)).slice(0, 3).map((tr) => {
    const pips = tr.market === 'forex' ? s.stats.pips?.(tr) : null;
    const r = tr.entryUnknown ? null : s.stats.rMultiple(tr, s.sctx);
    return { id: tr.id, market: tr.market, instrument: tr.instrument, side: tr.side, sizeText: sizeText(tr, fmt), setup: tr.setup, closeTime: tr.closeTime, netMinor: s.displayNet(tr) ?? 0, r, pips: pips ? pips.resultPips : null };
  });
  const states = ctx.mode === 'real' ? byUrgency(periodsFor(model, { tz: ctx.tz })).map((p) => ({
    accountId: p.accountId, accountName: p.accountName, state: p.state,
    period: { label: periodLabel(p.period, fmt), month: monthName(p.period.to.slice(0, 7), fmt), query: `from=${p.period.from}&to=${p.period.to}&zone=${encodeURIComponent(p.period.zone)}${p.importId ? `&import=${p.importId}` : ''}` },
    differenceMinor: p.record?.differenceMinor ?? undefined, toleranceMinor: p.record?.toleranceMinor ?? undefined,
    explainCount: p.record?.explanations?.filter((e) => e.tradeIds?.length).length ?? 0,
  })) : [];
  const last = await ctx.store.getSetting('lastExportAt');
  return {
    currency: s.currency, netMinor: s.netMinor, closed: s.included.length, periodLabel: monthName(month, fmt),
    curve: { points }, smallSampleMin: ctx.settings.get('smallSampleMin') ?? 30,
    expectancy: exp ? { r: exp.r ? { value: exp.r.value, n: exp.r.n, rMissing: exp.r.rMissing } : undefined, smallSample: exp.smallSample } : undefined,
    winRate: s.winRate ? { value: s.winRate.value, wins: s.winRate.wins, n: s.winRate.n } : undefined,
    drawdown: dd ? { maxMinor: dd.maxMinor, maxPct: dd.maxPct, peakIndex: pointIndex(s.curve, dd.peak), troughIndex: pointIndex(s.curve, dd.trough), note: dd.note } : undefined,
    followed: s.ruleFollowing && s.ruleFollowing.marked ? { followed: s.ruleFollowing.followed, marked: s.ruleFollowing.marked } : undefined,
    counts: s.counts, reconcileStates: states, recent,
    exportDue: exportDue({ trades: model.trades, lastExportAt: last || null, every: Number(ctx.settings.get('exportReminderEvery') ?? 50) }),
  };
}
