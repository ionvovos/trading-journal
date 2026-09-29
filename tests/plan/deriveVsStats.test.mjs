// Drift guard: src/plan/derive.js now delegates money, risk, R and equity to the statistics engine (src/stats, C5); this checks the
// adapter (accounts map to a stats ctx, minor to major units) against the engine called directly, on the hand-computed fixture.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as stats from '../../src/stats/index.js';
import { tradeMoney, rMultiple, initialRisk, equityAtEntry } from '../../src/plan/derive.js';

const core = JSON.parse(readFileSync(new URL('../fixtures/stats/core.json', import.meta.url), 'utf8'));
const closed = core.trades.filter((t) => !t.holds?.length && t.closeTime && t.mode === 'real');

test('derive agrees with the statistics engine on every closed trade of core.json', () => {
  for (const trade of closed) {
    const theirs = stats.tradeMoney(trade, core.ctx);
    assert.deepEqual(tradeMoney(trade, { accounts: core.ctx.accounts }), theirs, `${trade.id} money`);
    const r = stats.rMultiple(trade, core.ctx);
    const m = rMultiple(trade, { accounts: core.ctx.accounts });
    if (r === null) assert.equal(m, null, `${trade.id} R`); else assert.equal(m, r, `${trade.id} R`);
    assert.equal(initialRisk(trade).reason, stats.initialRisk(trade).reason, `${trade.id} risk reason`);
  }
});

test('equity at entry: the engine\'s minor units as major units', () => {
  const t = core.trades.find((x) => x.id === 'T2');
  const minor = stats.equityAtEntry(t, { ...core.ctx, trades: core.trades, cash: [] });
  assert.equal(equityAtEntry(t, { account: core.ctx.accounts['acc-ibkr'], trades: core.trades, cash: [] }), minor / 100);
});

test('positionSize: the S3 helper (src/plan/sizing.js) and the engine\'s (src/stats/sizing.js) agree on the three worked cases', async () => {
  const { positionSize } = await import('../../src/plan/sizing.js');
  const cases = JSON.parse(readFileSync(new URL('../fixtures/stats/requirements-cases.json', import.meta.url), 'utf8')).positionSize.slice(0, 3);
  for (const c of cases) {
    const a = positionSize(c.input);
    const b = stats.positionSize(c.input);
    assert.equal(a.size, b.size);
    assert.equal(a.riskAmount, b.riskAmount);
    assert.equal(a.pipSize, b.pipSize);
  }
});
