import test from 'node:test';
import assert from 'node:assert/strict';
import { weeks, calm, inputOf } from './helpers.mjs';
import { buildRows } from '../../src/review/rows.js';
import { findPatterns, processOutcome, optionalSections, PATTERNS, median } from '../../src/review/patterns.js';

const analyse = (week) => {
  const input = inputOf(week);
  const { rows, left } = buildRows({ trades: input.trades, accounts: input.accounts, plans: input.plans, mode: input.mode, period: input.period, tz: input.tz });
  const res = findPatterns(rows, { plan: week.plan, settings: input.settings });
  return { rows, left, ...res, byName: Object.fromEntries(res.findings.map((f) => [f.pattern, f])) };
};

for (const name of ['stocks', 'crypto', 'forex']) {
  test(`AC-P5.1 ${name} week: each expected pattern is found with its trades, and no other`, () => {
    const week = weeks[name];
    const a = analyse(week);
    assert.equal(a.rows.length, week.expected.counted);
    if (week.expected.left) assert.deepEqual(a.left, week.expected.left);
    assert.deepEqual(Object.keys(a.byName).sort(), Object.keys(week.expected.findings).sort(), 'the set of patterns found');
    for (const [pattern, want] of Object.entries(week.expected.findings)) {
      const got = a.byName[pattern];
      assert.equal(got.n, want.n, `${pattern} n`);
      if (want.tradeIds) assert.deepEqual([...got.tradeIds].sort(), [...want.tradeIds].sort(), `${pattern} trades`);
      if (want.basis) assert.equal(got.basis, want.basis);
      for (const [k, v] of Object.entries(want.facts ?? {})) assert.deepEqual(got.facts[k], v, `${pattern}.${k}`);
    }
    for (const p of week.expected.absent) assert.equal(a.byName[p], undefined, `${p} must not fire`);
  });
}

test('AC-P5.2: every finding links at least one trade, and every linked id is a counted trade', () => {
  for (const name of ['stocks', 'crypto', 'forex']) {
    const a = analyse(weeks[name]);
    const ids = new Set(a.rows.map((r) => r.id));
    for (const f of a.findings) {
      assert.ok(f.tradeIds.length >= 1, `${name}/${f.pattern}`);
      for (const id of f.tradeIds) assert.ok(ids.has(id), `${f.pattern} links ${id}`);
    }
  }
});

test('AC-P5.3: a calm week finds no pattern, and the review can say what it checked', () => {
  const a = analyse(calm);
  assert.equal(a.rows.length, 6);
  assert.deepEqual(a.findings, []);
  assert.ok(a.checked.length >= 8 && a.checked.every((p) => PATTERNS.includes(p)));
});

test('AC-P5.8: open, held-out, user-excluded and paper trades are not analysed; the counts are kept', () => {
  const a = analyse(weeks.stocks);
  assert.equal(a.rows.some((r) => ['o1', 'h1', 'e1', 'p1'].includes(r.id)), false);
  assert.deepEqual(a.left, { open: 1, heldOut: 1, userExcluded: 1 });
});

test('a period limits the trades by close date in the declared zone', () => {
  const week = weeks.stocks;
  const { rows } = buildRows({ trades: week.trades, accounts: week.accounts, plans: [week.plan], mode: 'real', period: { from: '2026-09-09', to: '2026-09-10' }, tz: week.tz });
  assert.deepEqual(rows.map((r) => r.id), ['t6', 't7', 't8', 't9']);
});

test('the pattern that needs a plan rule is not "checked" when the user has not written the rule', () => {
  const a = analyse(weeks.crypto);
  assert.equal(a.checked.includes('outside_set_hours'), false, 'the crypto plan has no hours');
  assert.equal(a.checked.includes('after_daily_loss_limit'), false);
  assert.equal(a.checked.includes('days_over_cap'), true);
  const s = analyse(weeks.stocks);
  assert.equal(s.checked.includes('outside_set_hours'), true);
});

test('behavioural thresholds are placeholders the user can change', () => {
  const a = analyse(weeks.crypto);
  assert.deepEqual(a.byName.entry_after_loss.threshold, { value: 30, from: 'placeholder' });
  assert.deepEqual(a.byName.size_rising.threshold, { value: 1.5, from: 'placeholder' });
  const week = weeks.crypto;
  // a window of 5 minutes: c3 opened 10 minutes after a loss, so the window pattern no longer counts it
  const tight = findPatterns(buildRows({ trades: week.trades, accounts: week.accounts, plans: [week.plan], mode: 'real', period: week.period, tz: week.tz }).rows, { plan: week.plan, settings: { lossWindowMin: 5 } });
  assert.equal(tight.findings.find((f) => f.pattern === 'entry_after_loss').facts.a, 0);
});

test('size rising names its basis: risk, or position value for trades whose risk is unknown (AC-P5.1)', () => {
  const week = structuredClone(weeks.crypto);
  for (const t of week.trades) t.initialStop = null; // R unknown everywhere
  const a = analyse(week);
  assert.equal(a.byName.size_rising.basis, 'position_value_pct');
  assert.equal(a.byName.size_rising.facts.unknown, 8);
});

test('a starting balance is needed for any percent of equity: without it size rising is not computed', () => {
  const week = structuredClone(weeks.crypto);
  week.accounts[0].startBalance = null;
  const a = analyse(week);
  assert.equal(a.byName.size_rising, undefined);
  assert.equal(a.byName.entry_after_loss.facts.b, 0);
});

test('process versus outcome: two groups with n and average R, no link between them (AC-P5.9)', () => {
  const a = analyse(weeks.stocks);
  const p = processOutcome(a.rows);
  assert.deepEqual([p.followed.n, p.offPlan.n, p.unmarked.n], [6, 4, 0]);
  // followed: t1 -1.02, t2 -1.02, t4 1.48, t5 0.776, t8 -1.02, t10 -0.82 ; off plan: t3 -1.02, t6 -2.02, t7 null, t9 -1.0125
  assert.ok(Math.abs(p.followed.avgR - (-1.02 - 1.02 + 1.48 + 0.776 - 1.02 - 0.82) / 6) < 1e-9);
  assert.equal(p.offPlan.rKnown, 3);
  assert.ok(Math.abs(p.offPlan.avgR - (-1.02 - 2.02 - 1.0125) / 3) < 1e-9);
});

test('a stop-out that followed the plan is a followed-plan trade, not an off-plan one (AC-P5.9)', () => {
  const a = analyse(weeks.stocks);
  const p = processOutcome(a.rows);
  assert.ok(p.followed.tradeIds.includes('t1') && p.followed.avgR < 0);
});

test('optional sections: largest wins and losses with the plan mark, months by count with net R, the loss sequence (AC-P5.10)', () => {
  const a = analyse(weeks.stocks);
  const o = optionalSections(a.rows, { plan: weeks.stocks.plan, settings: {} });
  assert.deepEqual(o.largest.wins.map((w) => w.id), ['t4', 't5', 't7']);
  assert.deepEqual(o.largest.losses.map((w) => w.id), ['t6', 't9', 't1']);
  assert.equal(o.largest.losses[0].id, 't6');
  assert.equal(o.largest.losses[0].planFollowed, false);
  assert.equal(o.monthsByCount.length, 1);
  assert.equal(o.monthsByCount[0].month, '2026-09');
  assert.equal(o.monthsByCount[0].n, 10);
  assert.equal(o.monthsByCount[0].rKnown, 9);
  assert.deepEqual(o.lossSequence.tradeIds, ['t2', 't3'], 'Monday has 3 trades against a median of 2; t2 opened 20 minutes and t3 15 minutes after a losing close');
});

test('median', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), null);
});
