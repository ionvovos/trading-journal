// V2 repair round (GATE-V2 G1, G2, G3): view-level invariants the engine tests did not cover.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ROUTES } from '../../src/ui/routes.js';
import { weekRows } from '../../src/ui/charts/calendarGrid.js';
import { closedSet, calendar } from '../../src/stats/index.js';
import { core } from '../stats/helpers.mjs';

test('G1: a route whose view has a fixed bottom action bar hides the tab bar (chrome none), so Save cannot sit under it', () => {
  const src = (view) => readFileSync(new URL(`../../src/ui/views/${view}.js`, import.meta.url), 'utf8');
  const withBar = ['plan', 'checklist', 'sentence', 'tradeForm'].filter((v) => /actions:|has-actions|class: 'actions'/.test(src(v)));
  assert.ok(withBar.includes('plan') && withBar.includes('sentence'), 'the check sees the views that have a fixed bar');
  for (const route of ROUTES.filter((r) => withBar.includes(r.view))) assert.equal(route.chrome, 'none', `${route.path} has a fixed action bar and a tab bar`);
});

test('G2: week totals are found by the Monday a grid row starts on, not by position in the list of weeks that have trades', () => {
  // September 2026 starts on a Tuesday: rows start 31 Aug, 7, 14, 21, 28 Sep. Only the last two weeks have trades.
  const rows = weekRows(2026, 9, [{ start: '2026-09-21', netMinor: 6200 }, { start: '2026-09-28', netMinor: 3600 }]);
  assert.deepEqual(rows.map((r) => [r.start, r.netMinor]), [['2026-08-31', null], ['2026-09-07', null], ['2026-09-14', null], ['2026-09-21', 6200], ['2026-09-28', 3600]]);
  // a month whose 1st is a Monday, and one with six rows
  assert.equal(weekRows(2026, 6, []).length, 5);
  assert.equal(weekRows(2027, 2, []).length, 4); // 1 Feb 2027 is a Monday
  assert.equal(weekRows(2026, 8, []).length, 6);
  assert.equal(weekRows(2026, 8, [])[0].start, '2026-07-27');
});

test('G2 invariant at the view level: the week cells of a month add up to the month cell, for every month of the fixture and both zones', () => {
  const set = closedSet(core.trades, core.ctx);
  let checked = 0;
  for (const ctx of [core.ctx, { ...core.ctx, tz: 'UTC' }]) {
    for (let month = 1; month <= 12; month += 1) {
      const c = calendar(set, { year: 2026, month }, ctx);
      const rows = weekRows(2026, month, c.weeks);
      const sum = rows.reduce((s, r) => s + (r.netMinor ?? 0), 0);
      assert.equal(sum, c.monthMinor, `2026-${month}`);
      assert.equal(rows.filter((r) => r.netMinor !== null).length, c.weeks.length, `every week with trades has a row in 2026-${month}`);
      if (c.monthMinor !== 0) checked += 1;
    }
  }
  assert.ok(checked >= 2);
});
