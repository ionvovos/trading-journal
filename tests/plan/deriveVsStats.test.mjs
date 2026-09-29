// Drift guard: src/plan/derive.js (used by the plan checks and the review) against the statistics engine (src/stats, cloud session C5)
// on the same hand-computed fixture. Runs once src/stats exists; until then it skips and says so.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { tradeMoney, rMultiple, initialRisk } from '../../src/plan/derive.js';

const statsPath = new URL('../../src/stats/index.js', import.meta.url);
const core = JSON.parse(readFileSync(new URL('../fixtures/stats/core.json', import.meta.url), 'utf8'));

test('derive agrees with the statistics engine on every closed trade of core.json', { skip: existsSync(statsPath) ? false : 'src/stats has not landed (C5)' }, async () => {
  const stats = await import(statsPath.href);
  for (const trade of core.trades.filter((t) => !t.holds?.length && t.closeTime && t.mode === 'real')) {
    const ctx = { ...core.ctx, accounts: core.ctx.accounts };
    const theirs = stats.tradeMoney(trade, ctx);
    const mine = tradeMoney(trade, { digits: 2 });
    assert.equal(mine.netMinor, theirs.netMinor, `${trade.id} net`);
    const r = stats.rMultiple(trade);
    const m = rMultiple(trade, { digits: 2 });
    if (r === null) assert.equal(m, null, `${trade.id} R`);
    else assert.ok(Math.abs(m - r) < 1e-9, `${trade.id} R ${m} vs ${r}`);
    const risk = stats.initialRisk(trade);
    assert.equal(initialRisk(trade).reason, risk.reason ?? null, `${trade.id} risk reason`);
  }
});
