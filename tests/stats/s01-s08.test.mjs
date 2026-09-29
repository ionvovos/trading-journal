import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  grossPnl, tradeMoney, closedSet, openRisk, winRate, avgWinLoss, profitFactor, initialRisk, rMultiple, rBreakdown,
  averages,
} from '../../src/stats/index.js';
import { core, close, ids } from './helpers.mjs';

const { ctx, trades, expected } = core;
const byId = Object.fromEntries(trades.map((t) => [t.id, t]));
const set = closedSet(trades, ctx);

for (const [id, e] of Object.entries(expected.perTrade)) {
  test(`S1, S2, S7, S8 per trade: ${id}`, () => {
    const t = byId[id];
    const avg = averages(t);
    close(avg.avgEntry, e.avgEntry, `${id} avgEntry`);
    close(avg.avgExit, e.avgExit, `${id} avgExit`);
    close(grossPnl(t), e.gross, `${id} gross`);
    const m = tradeMoney(t, ctx);
    assert.equal(m.grossMinor, e.grossMinor, `${id} grossMinor`);
    assert.equal(m.feesMinor, e.feesMinor, `${id} feesMinor`);
    assert.equal(m.fundingMinor, e.fundingMinor, `${id} fundingMinor`);
    assert.equal(m.netMinor, e.netMinor, `${id} netMinor`);
    assert.equal(m.source, e.source, `${id} source`);
    const risk = initialRisk(t);
    close(risk.value, e.initialRisk, `${id} initialRisk`);
    assert.equal(risk.reason, e.riskReason, `${id} riskReason`);
    close(rMultiple(t, ctx), e.r, `${id} r`);
  });
}

test('S2: broker netMinor wins and recomputed net stays beside it', () => {
  const t = { ...byId.T1, broker: { netMinor: 20650, source: 'ibkr' } };
  const m = tradeMoney(t, ctx);
  assert.equal(m.netMinor, 20650);
  assert.equal(m.recomputedNetMinor, 20700);
  assert.equal(m.source, 'broker');
  assert.equal(m.feesMinor, 300);
});

test('S2: a null leg fee counts 0; a null rate gives null', () => {
  const legs = byId.T3.legs.map((l, i) => (i === 0 ? { ...l, fee: null } : l));
  assert.equal(tradeMoney({ ...byId.T3, legs }, ctx).feesMinor, 1020 - 300);
  const noRate = byId.T3.legs.map((l) => (l.kind === 'exit' ? { ...l, quoteToAccount: null } : l));
  assert.equal(tradeMoney({ ...byId.T3, legs: noRate }, ctx), null);
});

test('S1: open and held-out trades have no gross', () => {
  assert.equal(grossPnl(byId.T8), null);
  assert.equal(grossPnl(byId.T9), null);
  assert.equal(tradeMoney(byId.T8, ctx), null);
});

test('S3 closed set and its exclusions', () => {
  assert.deepEqual(ids(set.included), expected.S3.included);
  for (const [k, v] of Object.entries(expected.S3.excluded)) assert.deepEqual(ids(set.excluded[k]), v, k);
  assert.deepEqual(ids(set.excluded.otherAccount), []);
});

test('S3: held out is checked before the closed rule; mode and account filters come first', () => {
  const s = closedSet(trades, { mode: 'real', accountIds: ['acc-ibkr'] });
  assert.deepEqual(ids(s.included), ['T1', 'T2', 'T6']);
  assert.deepEqual(ids(s.excluded.otherMode), ['T10']);
  assert.deepEqual(ids(s.excluded.otherAccount), ['T3', 'T4', 'T5', 'T7', 'T8']);
  assert.deepEqual(ids(s.excluded.heldOut), ['T9']);
  const excl = closedSet([{ ...byId.T1, excluded: { by: 'user' } }], { mode: 'real' });
  assert.deepEqual(ids(excl.excluded.userExcluded), ['T1']);
  const dust = { ...byId.T3, dustRemainder: '0.0001', legs: byId.T3.legs.map((l) => (l.kind === 'exit' ? { ...l, size: '0.0832' } : l)) };
  assert.deepEqual(ids(closedSet([dust], { mode: 'real' }).included), ['T3']);
  const short = { ...dust, dustRemainder: '0' };
  assert.deepEqual(ids(closedSet([short], { mode: 'real' }).excluded.open), ['T3']);
});

test('open risk: only open trades with a stop', () => {
  assert.equal(openRisk(byId.T8, ctx), null);
  assert.equal(openRisk(byId.T1, ctx), null);
  const withStop = { ...byId.T8, initialStop: '140' };
  assert.deepEqual(openRisk(withStop, ctx), { amountMinor: 2000, r: 1 });
});

test('S4 win rate', () => {
  assert.deepEqual(winRate(set, ctx), expected.S4);
  assert.equal(winRate([], ctx).value, null);
});

test('S5 average win and loss', () => {
  const a = avgWinLoss(set, ctx);
  for (const [k, v] of Object.entries(expected.S5)) close(a[k], v, k);
});

test('S6 profit factor', () => {
  const p = profitFactor(set, ctx);
  close(p.value, expected.S6.value, 'value');
  assert.equal(p.reason, expected.S6.reason);
  assert.deepEqual(profitFactor([], ctx), { value: null, reason: 'no_trades' });
});

test('S7 initial risk per leg and reasons', () => {
  const r = initialRisk(byId.T1);
  assert.deepEqual(r.perLeg.map((p) => p.legId), ['T1-L1', 'T1-L2']);
  close(r.perLeg[0].value, 60, 'leg 1');
  close(r.perLeg[1].value, 80, 'leg 2');
  assert.equal(initialRisk({ ...byId.T1, initialStop: '50.8' }).reason, 'stop_at_entry');
  assert.equal(initialRisk({ ...byId.T1, initialStop: '56' }).reason, 'stop_profit_side');
  assert.equal(initialRisk({ ...byId.T6, initialStop: '190' }).reason, 'stop_profit_side');
  assert.equal(initialRisk(byId.T6).reason, 'no_stop');
});

test('S8 breakdown below -1R', () => {
  for (const [id, e] of Object.entries(expected.S8_breakdown)) {
    const b = rBreakdown(byId[id], ctx);
    for (const [k, v] of Object.entries(e)) close(b[k], v, `${id} ${k}`);
  }
  assert.equal(rBreakdown(byId.T1, ctx), null);
  assert.equal(rBreakdown(byId.T6, ctx), null);
});
