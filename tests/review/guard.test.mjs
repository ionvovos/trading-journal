import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { check, splitSentences, isLegalText, scopeForKey, numbersMatch, entitiesMatch, screenModelText, normalize, numbersPreserved } from '../../src/review/guard.js';
import { sha256Hex } from '../../src/review/sha256.js';

const table = JSON.parse(readFileSync(new URL('../fixtures/review/legal-table.json', import.meta.url), 'utf8'));
const textOf = (row) => (row.segments ? row.segments.map((s) => s.text).join('') : row.text);
const opts = (row) => ({ scope: row.scope, key: row.key ?? null, segments: row.segments ?? null });

test('sha256 matches the reference vectors', () => {
  assert.equal(sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(sha256Hex('a'.repeat(200)), 'c2a908d98f5df987ade41b5fce213067efbcc21ef2240212a41e54b5e7c28ae5');
});

test('the legal table is well formed', () => {
  assert.ok(table.banned.length >= 30 && table.safe.length >= 20);
  for (const row of [...table.banned, ...table.safe]) assert.ok(['en', 'el'].includes(row.lang) && row.scope && textOf(row));
});

for (const row of table.banned) {
  test(`banned (${row.lang}, ${row.scope}, ${row.class}): ${textOf(row).slice(0, 60)}`, () => {
    const res = check(textOf(row), row.lang, opts(row));
    assert.equal(res.ok, false, 'must fail');
    assert.ok(res.hits.some((h) => h.class === row.class), `expected class ${row.class}, got ${res.hits.map((h) => h.class)}`);
  });
}

for (const row of table.safe) {
  test(`safe (${row.lang}, ${row.scope}): ${textOf(row).slice(0, 60)}`, () => {
    const res = check(textOf(row), row.lang, opts(row));
    assert.deepEqual(res.hits, [], 'must pass');
  });
}

test('legal scope accepts only the pinned texts, and any edit fails', () => {
  const legalRows = table.safe.filter((r) => r.scope === 'legal');
  assert.ok(legalRows.length >= 4, 'first-run and About, English and Greek');
  for (const r of legalRows) {
    assert.equal(isLegalText(r.text), true);
    assert.equal(check(`${r.text} `, r.lang, { scope: 'legal' }).ok, true, 'a trailing space is trimmed');
    assert.equal(check(`${r.text}.`, r.lang, { scope: 'legal' }).ok, false, 'an added character fails');
    assert.equal(check(r.text.replace(/\b(\p{L}+)\b/u, 'X'), r.lang, { scope: 'legal' }).ok, false, 'a changed word fails');
  }
});

test('quoted plan rule is not scanned, the same words unquoted are', () => {
  const rule = 'Move your stop only toward profit.';
  const quoted = [{ text: 'Your plan says: ' }, { text: rule, quoted: true }, { text: ' 5 of 6 trades followed it.' }];
  assert.equal(check('x', 'en', { scope: 'review', segments: quoted }).ok, true);
  assert.equal(check(`Your plan says: ${rule} 5 of 6 trades followed it.`, 'en', { scope: 'review' }).ok, false);
  const quotedEl = [{ text: 'Ο κανόνας σας: ' }, { text: 'Αγοράστε μόνο με στοπ.', quoted: true }, { text: ' 5 από 6 συναλλαγές τον ακολούθησαν.' }];
  assert.equal(check('x', 'el', { scope: 'review', segments: quotedEl }).ok, true);
});

test('a sentence that begins with the quote keeps its structure', () => {
  const segs = [{ text: 'Close only after the second target.', quoted: true }, { text: ' was followed in 5 of 6 trades.' }];
  assert.equal(check('x', 'en', { scope: 'review', segments: segs }).ok, true);
});

test('sentence splitting keeps decimals, splits Greek question marks', () => {
  assert.deepEqual(splitSentences('Averaged +0.2R (n=41). What was going on?'), ['Averaged +0.2R (n=41).', 'What was going on?']);
  assert.deepEqual(splitSentences('Τι συνέβη πριν; Ήταν εκτός σχεδίου.', 'el'), ['Τι συνέβη πριν;', 'Ήταν εκτός σχεδίου.']);
  assert.deepEqual(splitSentences('Trades per day: median 3; on 6 days you took 7 or more.'), ['Trades per day: median 3; on 6 days you took 7 or more.']);
});

test('Greek: accents, final sigma and case do not hide a banned word', () => {
  assert.equal(normalize('ΚΑΛΎΤΕΡΟΣ'), 'καλυτεροσ');
  assert.ok(check('Ο καλύτερος χρόνος είναι το πρωί.', 'el').hits.some((h) => h.class === 'ranking'));
  assert.ok(check('Θα ανακτήσετε την πτώση.', 'el').hits.some((h) => h.class === 'future'));
  assert.ok(check('Είσαι εκδικητικός.', 'el').hits.some((h) => h.class === 'label'));
  assert.ok(check('Είναι έτοιμο για πραγματικά χρήματα.', 'el').hits.some((h) => h.class === 'readiness'));
});

test('an English banned word inside Greek text is still caught', () => {
  assert.ok(check('Τα trades σας should κλείσουν νωρίτερα.', 'el').hits.some((h) => h.class === 'modal'));
});

test('the V1 gate G22 interface strings pass in ui scope (A2)', () => {
  for (const s of ['Size', 'Size from risk', 'Size is required to save.', 'Size and side', 'Pause download', 'Trade fills', 'Short 20 shares', 'Long 0.2 lot', 'Close', 'Move']) {
    assert.deepEqual(check(s, 'en', { scope: 'ui' }).hits, [], s);
  }
  assert.deepEqual(check('Μέγεθος', 'el', { scope: 'ui' }).hits, []);
});

test('the same words as an instruction in a review sentence fail', () => {
  for (const s of ['Size up after a loss.', 'Trade fills only at the open.', 'Short EURUSD now.', 'Pause trading today.']) {
    assert.equal(check(s, 'en', { scope: 'review' }).ok, false, s);
  }
  assert.equal(check('Size your next trade smaller.', 'en', { scope: 'ui' }).ok, false, 'a ui sentence addressed to the user is checked');
});

test('leading and open questions', () => {
  assert.equal(check('What was going on before this trade?', 'en').ok, true);
  assert.equal(check('Τι συνέβαινε πριν από αυτή τη συναλλαγή;', 'el').ok, true);
  assert.ok(check('Did you follow your plan?', 'en').hits.some((h) => h.class === 'leading_question'));
  assert.ok(check('Γιατί αγνοήσατε το στοπ;', 'el').hits.some((h) => h.class === 'leading_question'));
  assert.ok(check('Why did you ignore your stop?', 'en').hits.some((h) => h.class === 'leading_question'));
});

test('platform: recommend or suggest near a broker, exchange or platform name', () => {
  assert.ok(check('We recommend Kraken for these trades.', 'en').hits.some((h) => h.class === 'platform'));
  assert.ok(check('Προτείνουμε άλλον broker γι αυτές τις συναλλαγές.', 'el').hits.some((h) => h.class === 'platform'));
  assert.equal(check('The report was recommended by nobody and it was long, then a broker came.', 'en').hits.some((h) => h.class === 'platform'), false, 'six words apart');
});

test('learn scope allows the three terms and still rejects a label on the person', () => {
  assert.equal(check('Revenge trading means trading fast and large to win back a loss. Example numbers only.', 'en', { scope: 'learn' }).ok, true);
  assert.equal(check('The disposition effect is selling winners early and holding losers.', 'en', { scope: 'learn' }).ok, true);
  assert.equal(check('You are a revenge trader.', 'en', { scope: 'learn' }).ok, false);
  assert.equal(check('Revenge trading is common.', 'en', { scope: 'review' }).ok, false);
});

test('comparison scope rejects readiness words and start/stop', () => {
  for (const s of ['You can go live.', 'Start real trading.', 'Stop paper trading.', 'Your paper figures are ready.']) assert.equal(check(s, 'en', { scope: 'comparison' }).ok, false, s);
  assert.equal(check('Your paper and real figures', 'en', { scope: 'comparison' }).ok, true);
});

test('scopeForKey follows architecture section 9', () => {
  assert.equal(scopeForKey('legal.firstRun'), 'legal');
  assert.equal(scopeForKey('review.ui.title'), 'ui');
  assert.equal(scopeForKey('review.tpl.plan_not_followed'), 'review');
  assert.equal(scopeForKey('compare.title'), 'comparison');
  assert.equal(scopeForKey('learn.T1.plain'), 'learn');
  assert.equal(scopeForKey('learn.T8.title'), 'ui');
  assert.equal(scopeForKey('learn.T1.steps.2'), 'learn');
  assert.equal(scopeForKey('nav.home'), 'ui');
});

test('numbersMatch: figures in model text equal a fact after the same formatting', () => {
  const facts = { n: 7, avgRText: '−0.4R', share: '58%', window: '09:30-11:30', instruments: ['EUR/USD'] };
  assert.equal(numbersMatch('7 trades averaged −0.4R.', facts, 'en').ok, true);
  assert.equal(numbersMatch('58% of them opened at 09:30.', facts, 'en').ok, true);
  assert.equal(numbersMatch('8 trades averaged −0.4R.', facts, 'en').ok, false);
  assert.equal(numbersMatch('Οι 7 συναλλαγές είχαν μέσο −0,4R.', { n: 7, avgRText: '−0,4R' }, 'el').ok, true);
  assert.deepEqual(numbersMatch('Οι 9 συναλλαγές.', { n: 7 }, 'el').bad, ['9']);
});

test('entitiesMatch: a ticker or pair that is not in the facts fails', () => {
  assert.equal(entitiesMatch('EUR/USD trades ran long.', { instruments: ['EUR/USD'] }).ok, true);
  assert.equal(entitiesMatch('TSLA trades ran long.', { instruments: ['EUR/USD'] }).ok, false);
  assert.equal(entitiesMatch('Average was -0.4R in USD.', { instruments: [] }).ok, true);
});

test('numbersPreserved: rewording may not drop or swap a figure', () => {
  assert.equal(numbersPreserved('In this period 4 of 8 trades were off plan.', '4 of 8 trades were marked not followed.').ok, true);
  assert.deepEqual(numbersPreserved('Several trades were off plan.', '4 of 8 trades were marked not followed.').missing, ['4', '8']);
  assert.equal(numbersPreserved('5 of 8 trades were off plan.', '4 of 8 trades were marked not followed.').ok, false);
});

test('screenModelText: a clean sentence passes, banned, long and wrong-number ones do not', () => {
  const facts = { n: 7, avgRText: '−0.4R', instruments: [] };
  assert.equal(screenModelText('Across 7 closed trades the average was −0.4R.', facts, 'en').ok, true);
  assert.equal(screenModelText('You should stop after 7 trades.', facts, 'en').ok, false);
  assert.ok(screenModelText('Across 8 closed trades the average was −0.4R.', facts, 'en').reasons.includes('numbers'));
  assert.ok(screenModelText('a'.repeat(300), facts, 'en').reasons.includes('too_long'));
  assert.ok(screenModelText('', facts, 'en').reasons.includes('empty'));
});
