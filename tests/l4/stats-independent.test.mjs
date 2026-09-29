// L4 independent check of S1-S18 (requirements P3, AC-P3.1). Every expected value below was computed by hand (and re-derived in a
// separate script) from requirements.md, not read from the engine or from tests/fixtures/stats. The zone is New York with a
// 04:00 day cut-off, which no earlier fixture uses, so the cut-off, the daylight-saving rule and the weekday rule are probed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  closedSet, grossPnl, tradeMoney, initialRisk, rMultiple, rBreakdown, winRate, avgWinLoss, profitFactor, expectancy, equityCurve,
  drawdown, buckets, calendar, feeTotals, streaks, ruleFollowing, pips, pipsByPair, holdingTime, positionSize,
} from '../../src/stats/index.js';
import { makeTrade, close } from '../stats/helpers.mjs';

const ctx = {
  mode: 'real', accountIds: 'all', displayCurrency: 'USD', tz: 'America/New_York', dayCutoffHour: 4, smallSampleMin: 30,
  accounts: { acc: { baseCurrency: 'USD', startBalance: '5000', toDisplayRate: 1, mode: 'real' } }, cash: [],
};

// Stock: 50 shares, entry 50, stop 48, exits 55 and 48, 1.00 per side (AC-P3.1).
const A = makeTrade({ id: 'A', entry: '50', exit: '55', size: '50', stop: '48', entryFee: '1', exitFee: '1', open: '2026-03-02T15:00:00Z', close: '2026-03-02T17:00:00Z', setup: 'breakout', followed: true });
const B = makeTrade({ id: 'B', entry: '50', exit: '48', size: '50', stop: '48', entryFee: '1', exitFee: '1', open: '2026-03-02T18:00:00Z', close: '2026-03-02T19:30:00Z', setup: 'breakout', followed: false });
// Crypto: 0.0833 BTC, entry 60,000, stop 58,800, fee 0.1% per side (4.998 and 5.0813).
const C = makeTrade({ id: 'C', market: 'crypto', instrument: 'BTC/USD', entry: '60000', exit: '61000', size: '0.0833', stop: '58800', entryFee: '4.998', exitFee: '5.0813', open: '2026-03-03T08:00:00Z', close: '2026-03-03T09:00:00Z' });
// Forex EUR/USD: 0.2 lot, 50 pips, 10 per pip per standard lot; stop-out slipped 10 pips past the stop, 1.40 commission.
const D = makeTrade({ id: 'D', market: 'forex', instrument: 'EUR/USD', entry: '1.0850', exit: '1.0790', size: '0.2', stop: '1.0800', exitFee: '1.40', contractSize: '100000', open: '2026-03-03T14:00:00Z', close: '2026-03-03T16:00:00Z', setup: 'breakout', followed: true });
// Forex USD/JPY: 0.5 lot, JPY quote converted at 0.00665 USD per JPY.
const E = makeTrade({ id: 'E', market: 'forex', instrument: 'USD/JPY', entry: '150.00', exit: '150.30', size: '0.5', stop: '149.50', contractSize: '100000', quoteCurrency: 'JPY', rate: 0.00665, open: '2026-03-04T02:00:00Z', close: '2026-03-04T05:00:00Z', setup: 'range', followed: true });
// Short with no stop, and a break-even.
const F = makeTrade({ id: 'F', instrument: 'BBB', side: 'short', entry: '10', exit: '9', size: '10', entryFee: '0.5', exitFee: '0.5', open: '2026-03-05T15:00:00Z', close: '2026-03-05T15:20:00Z', followed: false });
const G = makeTrade({ id: 'G', instrument: 'CCC', entry: '20', exit: '20', size: '10', stop: '19', open: '2026-03-06T15:00:00Z', close: '2026-03-06T16:00:00Z' });
const trades = [G, F, E, D, C, B, A]; // deliberately not in close order
const set = closedSet(trades, ctx);

const NET = { A: 24800, B: -10200, C: 7322, D: -12140, E: 9975, F: 900, G: 0 };
const R = { A: 2.48, B: -1.02, C: 73.22 / 99.96, D: -1.214, E: 0.6, F: null, G: 0 };

test('S1, S2, S7, S8 per trade on the AC-P3.1 market fixtures', () => {
  for (const t of trades) {
    assert.equal(tradeMoney(t, ctx).netMinor, NET[t.id], `net ${t.id}`);
    close(rMultiple(t, ctx), R[t.id], `R ${t.id}`);
  }
  close(grossPnl(A), 250, 'stock gross');
  close(initialRisk(A).value, 100, 'stock risk');
  close(initialRisk(C).value, 99.96, 'crypto risk is 99.96, not 100');
  assert.equal(tradeMoney(C, ctx).grossMinor, 8330);
  assert.equal(tradeMoney(C, ctx).feesMinor, 1008, 'fees 10.0793 shown as gross minus rounded net');
  close(initialRisk(D).value, 100, 'EUR/USD 50 pips x 0.2 lot x 10 per pip = 100');
  close(initialRisk(E).value, 166.25, 'USD/JPY 0.5 x 50000 units x 0.00665');
  assert.equal(tradeMoney(E, ctx).grossMinor, 9975, 'float noise in 0.3 x 0.5 x 100000 x 0.00665 must round to 99.75');
  assert.equal(initialRisk(F).value, null);
  assert.equal(initialRisk(F).reason, 'no_stop');
  assert.equal(rMultiple(F, ctx), null, 'a trade with no stop has R null, never 0');
});

test('S8 the slipped stop-out: -1.214R = -1 - 0.20 slippage - 0.014 costs', () => {
  const b = rBreakdown(D, ctx);
  close(b.r, -1.214, 'r');
  close(b.slippageR, -0.20, 'slippage');
  close(b.costsR, -0.014, 'costs');
  assert.equal(b.otherR, 0);
  // B fills exactly at its stop: -1.02R is below -1 only through fees, so the breakdown shows no slippage
  close(rBreakdown(B, ctx).slippageR, 0, 'B slippage');
  close(rBreakdown(B, ctx).costsR, -0.02, 'B costs');
});

test('S3 closed set: order by close time, ties by id', () => {
  assert.deepEqual(set.included.map((t) => t.id), ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
});

test('S4-S6 win rate, averages, profit factor', () => {
  const w = winRate(set, ctx);
  assert.deepEqual([w.wins, w.losses, w.breakEven, w.n], [4, 2, 1, 7]);
  close(w.value, 4 / 7, 'win rate');
  const a = avgWinLoss(set, ctx);
  close(a.avgWin, 107.4925, 'avg win');
  close(a.avgLoss, 111.70, 'avg loss is a positive magnitude');
  close(a.avgWinR, 1.2708309990662932, 'avg win R over R-known winners (F has no R)');
  close(a.avgLossR, 1.117, 'avg loss R');
  assert.deepEqual([a.nWin, a.nLoss, a.nWinR, a.nLossR], [4, 2, 3, 2]);
  close(profitFactor(set, ctx).value, 429.97 / 223.40, 'profit factor');
});

test('S9 expectancy: both forms agree; F counted as R missing; money expectancy over all 7', () => {
  const e = expectancy(set, ctx);
  close(e.r.value, 0.2630821661998132, 'mean R over 6 known');
  close(e.r.byParts, 0.2630821661998133, 'win rate x avg win R - loss rate x avg loss R');
  assert.equal(e.r.n, 6);
  assert.equal(e.r.rMissing, 1);
  assert.equal(e.money.valueMinor, 2951);
  assert.equal(e.smallSample, true);
});

test('S10-S11 equity curve and drawdown (peak after A, trough after D, never recovered)', () => {
  const c = equityCurve(set, ctx);
  assert.deepEqual(c.points.map((p) => p.equityMinor), [500000, 524800, 514600, 521922, 509782, 519757, 520657, 520657]);
  assert.deepEqual(c.points.slice(1).map((p) => p.ref), ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
  const d = drawdown(c, { cash: [] });
  assert.equal(d.maxMinor, 15018);
  close(d.maxPct, 15018 / 524800, 'maxPct 2.8617 %');
  close(d.recoveryGainPct, 15018 / 509782, 'recovery gain 2.9460 %');
  assert.equal(d.peak.tradeId, 'A');
  assert.equal(d.trough.tradeId, 'D');
  assert.equal(d.recovery, null, 'not recovered');
  assert.equal(d.currentMinor, 4143);
  close(d.currentPct, 4143 / 524800, 'current drawdown');
});

test('S12 weekday uses the 04:00 day cut-off; hour is plain wall time', () => {
  const wd = buckets(set, 'weekday', ctx);
  assert.deepEqual(wd.map((r) => [r.key, r.n, r.netMinor]), [[1, 3, 24800 - 10200 + 7322], [2, 2, -12140 + 9975], [4, 1, 900], [5, 1, 0]],
    'C enters at 03:00 New York on Tuesday: before the cut-off, so it belongs to Monday');
  assert.deepEqual(buckets(set, 'hour', ctx).map((r) => [r.key, r.n]), [[3, 1], [9, 1], [10, 3], [13, 1], [21, 1]]);
});

test('S12 sessions: EUR/USD 14:00Z is the London-New York overlap in March; USD/JPY 02:00Z is Tokyo; stock 10:00 New York is regular hours', () => {
  const s = Object.fromEntries(buckets(set, 'session', ctx).map((r) => [r.key, r.tradeIds]));
  assert.deepEqual(s.london_ny_overlap, ['D']);
  assert.deepEqual(s.tokyo, ['E']);
  assert.deepEqual(s.us_regular, ['A', 'B', 'F', 'G']);
  assert.deepEqual(s.none, ['C'], 'crypto has no session');
});

test('S12 other dimensions sum to the total and carry no rank', () => {
  for (const by of ['setup', 'market', 'instrument', 'account', 'hour', 'weekday', 'session']) {
    const rows = buckets(set, by, ctx);
    assert.equal(rows.reduce((s, r) => s + r.netMinor, 0), 20657, by);
    assert.equal(rows.reduce((s, r) => s + r.n, 0), 7, by);
  }
  const setup = buckets(set, 'setup', ctx);
  assert.deepEqual(setup.map((r) => r.key), ['breakout', 'range', null]);
});

test('S13 calendar: cut-off 04:00 puts the 04:00 close on its own day and the 00:00 close on the day before', () => {
  const cal = calendar(set, { year: 2026, month: 3 }, ctx);
  assert.deepEqual(cal.days.map((d) => [d.date, d.netMinor, d.n]), [['2026-03-02', 14600, 2], ['2026-03-03', 5157, 3], ['2026-03-05', 900, 1], ['2026-03-06', 0, 1]]);
  assert.deepEqual(cal.weeks, [{ start: '2026-03-02', netMinor: 20657 }]);
  assert.equal(cal.monthMinor, 20657);
  assert.equal(calendar(set, { year: 2026, month: 4 }, ctx).monthMinor, 0);
});

test('S14 fees; S15 streaks; S16 rule following; S17 pips; S18 holding time', () => {
  const f = feeTotals(set, ctx);
  assert.equal(f.feesMinor, 1648);
  assert.equal(f.fundingMinor, 0);
  close(f.feesR, 0.1548403361344538, 'fees in R over the 6 R-known trades');
  assert.equal(f.nR, 6);
  assert.deepEqual(streaks(set, ctx), { longestWin: 2, longestLoss: 1, current: { kind: null, length: 0 } });
  const r = ruleFollowing(set);
  assert.deepEqual([r.followed, r.marked, r.unmarked], [3, 5, 2]);
  close(r.value, 0.6, 'rule-following rate');
  close(pips(D).resultPips, -60, 'EUR/USD result');
  close(pips(D).stopPips, 50, 'EUR/USD stop distance');
  assert.equal(pips(D).pipSize, 0.0001);
  close(pips(E).resultPips, 30, 'USD/JPY result');
  close(pips(E).stopPips, 50, 'USD/JPY stop distance');
  assert.equal(pips(E).pipSize, 0.01);
  assert.equal(pips(A), null, 'pips are a forex figure only');
  assert.deepEqual(pipsByPair(set).map((p) => [p.instrument, Math.round(p.pips), p.n]), [['EUR/USD', -60, 1], ['USD/JPY', 30, 1]], 'never summed across pairs');
  const h = holdingTime(set, ctx);
  assert.deepEqual(h.winners, { avgSeconds: 5700, n: 4 });
  assert.deepEqual(h.losers, { avgSeconds: 6300, n: 2 });
});

test('AC-P2.6 position size on the three worked cases and pip sizes', () => {
  const base = { equity: '10000', riskPct: '1', contractSize: '1', quoteToAccount: 1 };
  assert.equal(positionSize({ ...base, market: 'stock', entry: '50', stop: '48', sizeStep: '1' }).size, '50');
  assert.equal(positionSize({ ...base, market: 'crypto', entry: '60000', stop: '58800', sizeStep: '0.0001' }).size, '0.0833');
  const fx = positionSize({ ...base, market: 'forex', instrument: 'EUR/USD', stopPips: '50', pipValuePerLot: '10', sizeStep: '0.01' });
  assert.equal(fx.size, '0.2');
  assert.equal(fx.pipSize, '0.0001');
  assert.equal(positionSize({ ...base, market: 'forex', instrument: 'USD/JPY', stopPips: '50', pipValuePerLot: '6.67', sizeStep: '0.01' }).pipSize, '0.01');
});

test('a closed set excludes held-out, open, user-excluded and other-mode trades before any arithmetic', () => {
  const held = { ...A, id: 'H', holds: ['missing_fee'], legs: A.legs.slice(0, 1) };
  const open = { ...A, id: 'O', legs: A.legs.slice(0, 1), closeTime: null };
  const ex = { ...A, id: 'X', excluded: { by: 'user' } };
  const paper = { ...A, id: 'P', mode: 'paper' };
  const s = closedSet([...trades, held, open, ex, paper], ctx);
  assert.deepEqual(s.included.map((t) => t.id), ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
  assert.deepEqual([s.excluded.heldOut, s.excluded.open, s.excluded.userExcluded, s.excluded.otherMode].map((l) => l.map((t) => t.id)), [['H'], ['O'], ['X'], ['P']]);
  assert.equal(expectancy(s, ctx).money.n, 7);
});
