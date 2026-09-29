import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roundMinor } from '../../src/core/money.js';
import {
  drawdown, expectancy, winRate, avgWinLoss, tradeMoney, initialRisk, rMultiple, rBreakdown, profitFactor,
} from '../../src/stats/index.js';
import { cases, close, makeTrade } from './helpers.mjs';

const ctx = { mode: 'real', displayCurrency: 'USD', accounts: { acc: { baseCurrency: 'USD', startBalance: null, toDisplayRate: 1 } } };
const day = (i) => new Date(Date.UTC(2026, 2, 2 + i, 10)).toISOString();

// A curve from a start balance and the trade results in close order.
function curveOf(startMinor, nets, times = nets.map((_, i) => day(i)), startBalanceKnown = true) {
  let eq = startMinor;
  const points = [{ t: null, kind: 'start', ref: null, equityMinor: eq }];
  nets.forEach((n, i) => { eq += n; points.push({ t: times[i], kind: 'trade', ref: `T${i + 1}`, equityMinor: eq }); });
  return { points, startBalanceKnown };
}

test('drawdown 12,000 -> 9,600: 20.0 %, recovery gain 25.0 %', () => {
  const c = cases.drawdown;
  const curve = curveOf(c.ctx.startBalanceMinor, c.netMinorInCloseOrder);
  assert.deepEqual(curve.points.map((p) => p.equityMinor), c.expected.curve);
  const d = drawdown(curve);
  assert.equal(d.maxMinor, c.expected.maxMinor);
  close(d.maxPct, c.expected.maxPct, 'maxPct');
  close(d.recoveryGainPct, c.expected.recoveryGainPct, 'recoveryGainPct');
  assert.equal(d.peak.index, c.expected.peakIndex);
  assert.equal(d.trough.index, c.expected.troughIndex);
  assert.equal(d.recovery.index, c.expected.recoveryIndex);
  assert.equal(d.note, null);
});

test('drawdown without a starting balance has no percent', () => {
  const c = cases.drawdown;
  const d = drawdown(curveOf(0, c.netMinorInCloseOrder, undefined, false));
  assert.equal(d.maxPct === null, c.noStartBalance.maxPctIsNull);
  assert.equal(d.maxMinor, c.expected.maxMinor);
});

test('drawdown with the trough at or below zero', () => {
  const c = cases.drawdownTroughAtZero;
  const d = drawdown(curveOf(c.ctx.startBalanceMinor, c.netMinorInCloseOrder));
  assert.equal(d.maxMinor, c.expected.maxMinor);
  assert.equal(d.recoveryGainPct, c.expected.recoveryGainPct);
  assert.equal(d.note, c.expected.note);
});

for (const c of cases.drawdownWithWithdrawal) {
  test(`drawdown with cash: ${c.note}`, () => {
    const trades = c.events.filter((e) => 'trade' in e);
    const curve = curveOf(c.startMinor, trades.map((e) => e.trade), trades.map((e) => e.t));
    assert.deepEqual(curve.points.map((p) => p.equityMinor), c.expected.curve);
    const cash = c.events.filter((e) => 'cash' in e).map((e) => ({ t: e.t, amountMinor: e.cash }));
    const d = drawdown(curve, { cash });
    assert.equal(d.maxMinor, c.expected.maxMinor);
    close(d.maxPct, c.expected.maxPct, 'maxPct');
    close(d.recoveryGainPct, c.expected.recoveryGainPct, 'recoveryGainPct');
    assert.equal(d.note, c.expected.note);
    assert.equal(c.expected.equityAtPeakWithCash, d.peak.equityMinor + cash.filter((m) => m.t <= d.peak.t).reduce((s, m) => s + m.amountMinor, 0));
    assert.equal(c.expected.equityAtTroughWithCash, d.trough.equityMinor + cash.filter((m) => m.t <= d.trough.t).reduce((s, m) => s + m.amountMinor, 0));
    if ('peakIndex' in c.expected) assert.equal(d.peak.index, c.expected.peakIndex);
    if ('troughIndex' in c.expected) assert.equal(d.trough.index, c.expected.troughIndex);
    if ('recoveryIndex' in c.expected) assert.equal(d.recovery.index, c.expected.recoveryIndex);
    if ('recovery' in c.expected) assert.equal(d.recovery, c.expected.recovery);
  });
}

test('expectancy 40 % x 2R - 60 % x 1R = +0.2R, both forms', () => {
  const c = cases.expectancyByParts;
  const set = c.rValues.map((r, i) => makeTrade({ id: `E${i}`, entry: '100', stop: '99', size: '1', exit: String(100 + r), close: day(i) }));
  set.forEach((t, i) => assert.equal(rMultiple(t, ctx), c.rValues[i]));
  assert.equal(winRate(set, ctx).value, c.expected.winRate);
  const a = avgWinLoss(set, ctx);
  close(a.avgWinR, c.expected.avgWinR, 'avgWinR');
  close(a.avgLossR, c.expected.avgLossR, 'avgLossR');
  const e = expectancy(set, ctx);
  close(e.r.value, c.expected.expectancyR, 'mean');
  close(e.r.byParts, c.expected.expectancyR, 'by parts');
});

for (const name of ['stopSlippage', 'stopSlippageWithFees']) {
  test(`${name}: R below -1 and its breakdown`, () => {
    const c = cases[name];
    const t = makeTrade({ id: name, entry: c.entry, stop: c.stop, size: c.size, exit: c.exit, exitFee: c.fees });
    assert.equal(tradeMoney(t, ctx).netMinor, c.expected.netMinor);
    close(initialRisk(t).value, c.expected.initialRisk, 'initialRisk');
    close(rMultiple(t, ctx), c.expected.r, 'r');
    const b = rBreakdown(t, ctx);
    for (const [k, v] of Object.entries(c.expected.breakdown)) close(b[k], v, k);
  });
}

test('profit factor with no losses is undefined, never Infinity', () => {
  const c = cases.noLosses;
  const set = c.netMinor.map((n, i) => makeTrade({ id: `W${i}`, entry: '100', size: '1', exit: String(100 + n / 100), close: day(i) }));
  assert.deepEqual(set.map((t) => tradeMoney(t, ctx).netMinor), c.netMinor);
  const p = profitFactor(set, ctx);
  assert.equal(p.value, c.expected.profitFactor);
  assert.equal(p.reason, c.expected.reason);
});

test('rounding cases (one rounding point per trade)', () => {
  for (const c of cases.rounding) assert.equal(roundMinor(c.x, c.d), c.minor, `${c.x} at ${c.d}`);
});
