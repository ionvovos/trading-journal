// S1 screenshot scenes: fixtures built from the L2d sample dataset (design/tools/lib.mjs), so a Home screen here and its mockup
// show the same numbers (V1 carry F26: one dataset state per screen family). Harness only; the app never imports this file.
import { TRADES, S, equityPoints, ddStats, MONTH_TOTAL, N_CLOSED } from '../../design/tools/lib.mjs';

const iso = (day, hhmm = '12:00') => `2026-09-${String(day).padStart(2, '0')}T${hhmm}:00Z`;
const cents = (v) => Math.round(v * 100);

export function realSummary(ctx) {
  const pts = equityPoints();
  const dd = ddStats(pts);
  const f = ctx.fmt;
  const pick = (sym, day) => TRADES.find((t) => t.sym === sym && t.day === day);
  const recentSrc = [pick('AAPL', 29), pick('EUR/USD', 28), pick('BTC/USD', 28)];
  const market = { stock: 'stock', fx: 'forex', crypto: 'crypto' };
  const month = f.date(iso(29), { style: 'monthYear' });
  return {
    currency: 'USD', netMinor: cents(MONTH_TOTAL), closed: N_CLOSED, periodLabel: f.date(iso(29), { style: 'monthLong' }),
    curve: pts.map((p) => ({ t: iso(p.day), v: p.v })),
    expectancy: { r: { value: S.expR, n: S.rk, rMissing: S.n - S.rk } },
    winRate: { value: S.wins / S.n, wins: S.wins, n: S.n },
    drawdown: { maxMinor: Math.round(-dd.dd * 100), maxPct: Math.abs(dd.pct) / 100 },
    counts: { open: 2, heldOut: 1, excluded: 0 },
    reconcileStates: [
      { accountId: 'acc-ibkr', accountName: 'IBKR', period: { label: month, month: f.date(iso(29), { style: 'monthLong' }) }, state: 'difference', differenceMinor: 4030, explainCount: 2 },
      { accountId: 'acc-kraken', accountName: 'Kraken', period: { label: month }, state: 'skipped' },
      { accountId: 'acc-mt4', accountName: 'MT4 forex', period: { label: `${month} · ${ctx.lang === 'el' ? 'εισαγωγή' : 'imported'} ${f.date(iso(29))}` }, state: 'not_asked' },
      { accountId: 'acc-ibkr', accountName: 'IBKR', period: { label: f.date('2026-08-15T12:00:00Z', { style: 'monthYear' }) }, state: 'reconciled', toleranceMinor: 14 },
    ],
    recent: recentSrc.map((t) => ({
      id: `t${t.id}`, market: market[t.m], instrument: t.sym, side: t.side.toLowerCase(),
      sizeText: ctx.lang === 'el' ? t.size.replace('shares', 'μετοχές') : t.size, setup: t.setup, closeTime: iso(t.day, t.exit),
      netMinor: cents(t.net), r: t.r, pips: t.pips,
    })),
  };
}

export function paperSummary(ctx) {
  const pts = [10000, 10016, 10008, 10034, 10046, 10038].map((v, i) => ({ t: iso(21 + i), v }));
  return {
    currency: 'EUR', netMinor: 3820, closed: 6, periodLabel: ctx.fmt.date(iso(28), { style: 'monthLong' }),
    curve: pts, expectancy: { r: { value: 0.18, n: 5, rMissing: 1 } }, smallSample: true,
    winRate: { value: 0.5, wins: 3, n: 6 }, followed: { followed: 6, marked: 6 }, counts: { open: 0, heldOut: 0, excluded: 0 },
    recent: [
      { id: 'p1', market: 'crypto', instrument: 'ETH/USD', side: 'long', sizeText: '0.2 ETH', setup: 'Breakout', closeTime: iso(28), netMinor: -800, r: -0.67 },
      { id: 'p2', market: 'stock', instrument: 'MSFT', side: 'long', sizeText: '5 shares', setup: 'Pullback', closeTime: iso(25), netMinor: 1600, r: 0.8 },
      { id: 'p3', market: 'forex', instrument: 'EUR/USD', side: 'short', sizeText: '0.05 lot', pips: -36.8, closeTime: iso(24), netMinor: -1840, r: null },
    ],
  };
}

export const emptySummary = () => ({ currency: 'EUR', netMinor: 0, closed: 0, counts: { open: 0, heldOut: 0, excluded: 0 } });

export const account = (id, name, mode, ccy, start) => ({ id, name, mode, baseCurrency: ccy, startBalance: start, toDisplayRate: 1, fileZones: {}, dustThresholds: {}, contractValues: {}, createdAt: '2026-09-01T00:00:00Z' });

export const SCREENS = {
  dashboard: { route: '#/home', mode: 'real', summary: realSummary, accounts: 'all' },
  'dashboard-paper': { route: '#/home', mode: 'paper', summary: paperSummary, accounts: 'all' },
  'dashboard-el': { route: '#/home', mode: 'real', lang: 'el', summary: realSummary, accounts: 'all' },
  empty: { route: '#/home', mode: 'paper', summary: emptySummary, accounts: 'paper' },
  'empty-real': { route: '#/home', mode: 'real', summary: emptySummary, accounts: 'none' },
  loading: { route: '#/home', mode: 'real', summary: 'never', accounts: 'all' },
  offline: { route: '#/home', mode: 'real', summary: realSummary, accounts: 'all', offline: true },
  'onboarding-welcome': { route: '#/home', firstRun: true },
  'onboarding-welcome-el': { route: '#/home', firstRun: true, lang: 'el' },
  'onboarding-path': { route: '#/home', firstRun: true, click: '.ob-foot .btn' },
  settings: { route: '#/settings', mode: 'real', summary: realSummary, accounts: 'all', tz: 'Europe/Athens' },
  'settings-el': { route: '#/settings', mode: 'real', lang: 'el', summary: realSummary, accounts: 'all', tz: 'Europe/Athens' },
  'settings-language-sheet': { route: '#/settings', mode: 'real', summary: realSummary, accounts: 'all', tz: 'Europe/Athens', clicks: [{ sel: '.set-row', text: 'Language' }] },
  'settings-timezone-sheet': { route: '#/settings', mode: 'real', summary: realSummary, accounts: 'all', tz: 'Europe/Athens', clicks: [{ sel: '.set-row', text: 'time zone' }] },
  'settings-daystart-sheet': { route: '#/settings', mode: 'real', summary: realSummary, accounts: 'all', tz: 'Europe/Athens', clicks: [{ sel: '.set-row', text: 'A day starts at' }] },
  charts: { charts: true },
  'charts-el': { charts: true, lang: 'el' },
  about: { route: '#/about', mode: 'real' },
  'about-el': { route: '#/about', mode: 'real', lang: 'el' },
};

export function accountsFor(kind) {
  if (kind === 'none') return [];
  const paper = account('acc-paper', 'Paper account', 'paper', 'EUR', '10000');
  if (kind === 'paper') return [paper];
  return [account('acc-ibkr', 'IBKR', 'real', 'USD', '8000'), account('acc-kraken', 'Kraken', 'real', 'USD', '2500'), account('acc-mt4', 'MT4 forex', 'real', 'USD', '2000'), paper];
}
