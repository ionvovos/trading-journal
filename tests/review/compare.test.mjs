// Paper-versus-real comparison (AC-P4.5, P4.6, P4.7). The figures are stats.compareModes' (C5); this checks how they are shown.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import en from '../../src/i18n/en/review.js';
import el from '../../src/i18n/el/review.js';
import { formatMessage } from '../../src/i18n/i18n.js';
import { createFormat } from '../../src/i18n/format.js';
import { buildCompare, ROWS } from '../../src/review/compare.js';
import { check } from '../../src/review/guard.js';

const tFor = (lang) => (key, params) => formatMessage((lang === 'el' ? el : en)[key], params ?? {}, lang);

// The compareModes result of tests/stats/compare.test.mjs over 2-11 March (hand-derived there): real 7 trades, 4 of 6 marked followed,
// median risk over 6 trades with a stop, one trade per day over 7 days, none opened after a loss; paper 1 trade.
const RESULT = {
  missing: null,
  real: {
    n: 7, tradeIds: ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'],
    ruleFollowing: { value: 4 / 6, followed: 4, marked: 6, unmarked: 1, tradeIds: ['T1', 'T2', 'T3', 'T4', 'T5', 'T7'] },
    riskPctAtEntry: { value: 1.2, n: 6, tradeIds: ['T1', 'T2', 'T3', 'T4', 'T5', 'T7'] },
    tradesPerDay: { value: 1, n: 7, days: 7, tradeIds: ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'] },
    afterLoss: { value: 0, n: 7, count: 0, lossWindowMin: 30, tradeIds: [] },
  },
  paper: {
    n: 1, tradeIds: ['T10'],
    ruleFollowing: { value: 1, followed: 1, marked: 1, unmarked: 0, tradeIds: ['T10'] },
    riskPctAtEntry: { value: 0.5, n: 1, tradeIds: ['T10'] },
    tradesPerDay: { value: 1, n: 1, days: 1, tradeIds: ['T10'] },
    afterLoss: { value: 0, n: 1, count: 0, lossWindowMin: 30, tradeIds: [] },
  },
};

test('AC-P4.5: four measures side by side, each with its n and the trades behind it', () => {
  const m = buildCompare(RESULT, { t: tFor('en'), fmt: createFormat({ lang: 'en' }), lossWindowMin: 30 });
  assert.equal(m.missing, null);
  assert.deepEqual(m.rows.map((r) => r.key), [...ROWS]);
  const by = Object.fromEntries(m.rows.map((r) => [r.key, r]));
  assert.equal(by.followed.label, 'Followed your plan');
  assert.deepEqual([by.followed.real.value, by.followed.real.sub, by.followed.real.n], ['67%', '4 of 6', 6]);
  assert.deepEqual([by.followed.paper.value, by.followed.paper.sub], ['100%', '1 of 1']);
  assert.deepEqual([by.risk.real.value, by.risk.real.sub, by.risk.paper.value], ['1.2%', 'n 6 with risk known', '0.5%']);
  assert.deepEqual([by.perDay.real.value, by.perDay.real.sub, by.perDay.paper.sub], ['1.0', '7 trades, 7 days', '1 trade, 1 day']);
  assert.equal(by.afterLoss.label, 'Opened within 30 minutes of a losing close');
  assert.deepEqual([by.afterLoss.real.value, by.afterLoss.real.sub], ['0%', '0 of 7']);
  assert.deepEqual(by.risk.paper.tradeIds, ['T10']);
  assert.deepEqual(by.followed.real.tradeIds, RESULT.real.ruleFollowing.tradeIds, 'the ids are the statistics engine\'s, copied');
});

test('Greek: the same rows in Greek with the decimal comma', () => {
  const m = buildCompare(RESULT, { t: tFor('el'), fmt: createFormat({ lang: 'el' }), lossWindowMin: 30 });
  const by = Object.fromEntries(m.rows.map((r) => [r.key, r]));
  assert.equal(by.risk.real.value, '1,2%');
  assert.equal(by.followed.real.sub, '4 από 6');
  assert.equal(by.perDay.real.sub, '7 συναλλαγές, 7 ημέρες');
});

test('AC-P4.6: with a mode lacking closed trades nothing is compared and the message names the mode', () => {
  for (const missing of ['paper', 'real', 'both']) {
    const m = buildCompare({ real: null, paper: null, missing }, { t: tFor('en'), fmt: createFormat({ lang: 'en' }) });
    assert.deepEqual(m.rows, []);
    assert.ok(m.message.includes(missing === 'both' ? 'either mode' : `closed ${missing} trades`), m.message);
  }
});

test('a figure the engine could not compute is a dash with its reason, never a zero', () => {
  const none = { ...RESULT, real: { ...RESULT.real, riskPctAtEntry: { value: null, n: 0, tradeIds: [] }, ruleFollowing: { value: null, followed: 0, marked: 0, unmarked: 7, tradeIds: [] } } };
  const m = buildCompare(none, { t: tFor('en'), fmt: createFormat({ lang: 'en' }) });
  const by = Object.fromEntries(m.rows.map((r) => [r.key, r]));
  assert.deepEqual([by.risk.real.value, by.risk.real.sub, by.risk.real.empty], ['–', 'unknown for these trades', true]);
  assert.deepEqual([by.followed.real.value, by.followed.real.sub], ['–', 'no plan marks']);
});

test('AC-P4.7: no compare text says ready, not ready, start, stop or go live, in either language, and all pass the comparison scan', () => {
  const words = /\b(ready|not ready|start|stop|go live)\b/i;
  const greek = /(ετοιμ|ξεκιν|σταματ)/i;
  for (const [lang, cat] of [['en', en], ['el', el]]) {
    for (const [key, text] of Object.entries(cat)) {
      if (!key.startsWith('compare.')) continue;
      assert.equal((lang === 'en' ? words : greek).test(text), false, `${key}: ${text}`);
      const plain = text.replace(/\{(\w+), plural, one \{([^}]*)\} other \{([^}]*)\}\}/g, (_, n, one, other) => other).replaceAll('#', '3').replace(/\{\w+\}/g, '3');
      assert.deepEqual(check(plain, lang, { scope: 'comparison', key }).hits, [], `${lang} ${key}`);
    }
  }
  for (const lang of ['en', 'el']) {
    const m = buildCompare(RESULT, { t: tFor(lang), fmt: createFormat({ lang }) });
    const all = m.rows.flatMap((r) => [r.label, r.real.sub, r.paper.sub]);
    for (const text of all) assert.deepEqual(check(text, lang, { scope: 'comparison' }).hits, [], `${lang}: ${text}`);
  }
});

test('the guard rejects a comparison sentence that tells the user to start or that they are ready (the scan in the requirements)', () => {
  for (const s of ['Your paper figures say you can start real trading.', 'You are ready for real money.', 'Stop paper trading now.']) assert.equal(check(s, 'en', { scope: 'comparison' }).ok, false, s);
});

// Once src/stats exists (C5), the page reads the engine's result; this asserts the shapes agree with what buildCompare reads.
const statsPath = new URL('../../src/stats/index.js', import.meta.url);
test('against the real statistics engine: core.json over 2-11 March and 2-10 March', { skip: existsSync(statsPath) ? false : 'src/stats has not landed (C5)' }, async () => {
  const stats = await import(statsPath.href);
  const core = JSON.parse(readFileSync(new URL('../fixtures/stats/core.json', import.meta.url), 'utf8'));
  const byMode = { real: { ...core.ctx, mode: 'real' }, paper: { ...core.ctx, mode: 'paper' } };
  const both = buildCompare(stats.compareModes(core.trades, { from: '2026-03-02', to: '2026-03-11' }, byMode), { t: tFor('en'), fmt: createFormat({ lang: 'en' }) });
  assert.equal(both.missing, null);
  assert.equal(both.rows.find((r) => r.key === 'followed').real.sub, '4 of 6');
  const noPaper = buildCompare(stats.compareModes(core.trades, { from: '2026-03-02', to: '2026-03-10' }, byMode), { t: tFor('en'), fmt: createFormat({ lang: 'en' }) });
  assert.equal(noPaper.missing, 'paper');
});
