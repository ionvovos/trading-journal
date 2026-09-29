import test from 'node:test';
import assert from 'node:assert/strict';
import { entries, entryFor, learnStrings, explain, TERM_IDS, TERM_FOR_FIGURE, EXAMPLE_ONLY_TEXT, slugFor } from '../../src/learn/index.js';
import { check } from '../../src/review/guard.js';

test('AC-P6.1: T1-T35 exist in both languages, in the same order, with the same ids and step counts', () => {
  const ids = Array.from({ length: 35 }, (_, i) => `T${i + 1}`);
  for (const lang of ['en', 'el']) assert.deepEqual(entries(lang).filter((e) => /^T\d+$/.test(e.id)).map((e) => e.id), ids, lang);
  assert.deepEqual(entries('en').map((e) => e.id), entries('el').map((e) => e.id));
  for (const [i, e] of entries('en').entries()) {
    const el = entries('el')[i];
    assert.equal(el.slug, e.slug);
    assert.equal(el.steps?.length ?? 0, e.steps?.length ?? 0, e.id);
    assert.ok(e.plain.length > 30 && el.plain.length > 30 && e.title && el.title);
  }
  assert.equal(TERM_IDS.length, 36, 'T1-T35 and the CFD entry');
});

test('AC-P6.3: no learn text carries a banned pattern; the three terms are allowed here and nowhere else', () => {
  for (const lang of ['en', 'el']) {
    for (const s of learnStrings(lang)) {
      const res = check(s.text, lang, { scope: s.scope, key: s.key });
      assert.deepEqual(res.hits.map((h) => `${h.class}:${h.match}`), [], `${lang} ${s.key}: ${s.text}`);
    }
  }
});

test('AC-P6.4: the CFD text is the legal-review wording, once, with no number, and the paper-trading limits appear once', () => {
  const cfd = entryFor('CFD', 'en');
  assert.equal(cfd.plain, 'Regulators require CFD providers to publish the share of retail accounts that lose money with them; the figures are provider-specific and are usually a majority. Check your provider\'s current figure.');
  assert.equal(/\d/.test(cfd.plain), false);
  assert.equal(/\d/.test(entryFor('CFD', 'el').plain), false);
  assert.equal(entries('en').filter((e) => /CFD/.test(e.plain)).length, 1);
  assert.equal(entries('en').filter((e) => /real fills/.test(e.plain)).length, 1, 'paper limits once');
  assert.equal(entries('el').filter((e) => /πραγματικές εκτελέσεις/.test(e.plain)).length, 1);
  assert.equal(check(cfd.plain, 'en', { scope: 'legal' }).ok, true);
  assert.equal(check(entryFor('CFD', 'el').plain, 'el', { scope: 'legal' }).ok, true);
  assert.equal(check(cfd.plain.replace('majority', 'minority'), 'en', { scope: 'legal' }).ok, false, 'any edit fails until the pinned hash is replaced');
});

test('worked examples say they are example numbers, and state no stop level, risk percent or size as advice (W5)', () => {
  assert.equal(EXAMPLE_ONLY_TEXT.en, 'Example numbers only.');
  for (const lang of ['en', 'el']) {
    for (const e of entries(lang)) {
      const text = `${e.plain} ${(e.steps ?? []).join(' ')}`;
      assert.equal(/\b(should|must|recommend)\b/i.test(text), false, e.id);
    }
  }
});

test('AC-P6.5: every entry names its source tag; T25 is labelled as the app\'s own explanation', () => {
  for (const e of entries('en')) assert.ok(['F', 'S', 'H'].includes(e.source.tag), e.id);
  assert.equal(entryFor('T25', 'en').source.tag, 'H');
  assert.match(entryFor('T25', 'en').plain, /app’s own/);
  assert.match(entryFor('T25', 'el').plain, /της ίδιας της εφαρμογής/);
  for (const e of entries('en').filter((x) => x.source.tag !== 'H')) assert.match(e.source.url, /^https:\/\//, e.id);
});

test('slugs are unique and route-safe; every figure term exists', () => {
  const slugs = entries('en').map((e) => e.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const s of slugs) assert.match(s, /^[a-z0-9-]+$/);
  for (const id of Object.values(TERM_FOR_FIGURE)) assert.ok(TERM_IDS.includes(id), id);
  assert.equal(slugFor('T1'), 'r');
  assert.equal(entryFor('r', 'el').id, 'T1');
  assert.equal(entryFor('nope'), null);
});

test('AC-P6.2: explain puts the user\'s own numbers into the formula, and gives no formula rather than one with holes', () => {
  const r = explain('S8', { formulaKey: 'S8', params: { net: '207.00', risk: '140.00', r: '+1.48R' }, includedIds: ['T1'], excluded: [{ id: 'T8', reason: 'open' }] }, 'en');
  assert.equal(r.formulaWithNumbers, 'R = net result ÷ initial risk = 207.00 ÷ 140.00 = +1.48R');
  assert.equal(r.slug, 'r-multiple');
  assert.deepEqual(r.includedIds, ['T1']);
  assert.deepEqual(r.excluded, [{ id: 'T8', reason: 'open' }]);
  assert.equal(explain('S8', { formulaKey: 'S8', params: { net: '1' } }, 'en').formulaWithNumbers, null);
  assert.equal(explain('S14', {}, 'en').slug, null);
  assert.equal(explain('S9', { formulaKey: 'S9', params: { sumR: '1,4', n: 6, value: '+0,24R' } }, 'el').formulaWithNumbers, 'Expectancy = μέσο R των συναλλαγών με γνωστό R = 1,4 ÷ 6 = +0,24R');
});

test('AC-P6.1 T26 onward: each new term cites the document and section its definition comes from', () => {
  const wanted = { T26: 'requirements.md', T27: 'requirements.md', T28: 'requirements.md', T29: 'requirements.md', T30: 'architecture.md', T31: 'requirements.md', T32: 'domain-pack.md', T33: 'requirements.md', T34: 'requirements.md', T35: 'domain-pack.md' };
  for (const [id, doc] of Object.entries(wanted)) {
    const e = entryFor(id, 'en');
    assert.ok(e.source.section.includes(doc), `${id} cites ${doc}`);
    assert.ok(e.plain.length > 60, id);
  }
  assert.equal(entryFor('T32', 'en').source.tag, 'S', 'stop slippage is sourced');
  assert.ok(entryFor('T32', 'en').steps.join(' ').includes('−1.22R'), 'the worked example matches the requirements fixture');
  assert.ok(entryFor('T34', 'en').steps.join(' ').includes('00:30 on 5 March'), 'the calendar fixture of core.json');
});

test('the terms of a figure open the right entry: rule-following, equity curve, held-out, day cut-off, gross and net', () => {
  assert.deepEqual([TERM_FOR_FIGURE.S16, TERM_FOR_FIGURE.S10, TERM_FOR_FIGURE.S3, TERM_FOR_FIGURE.S13, TERM_FOR_FIGURE.S2], ['T29', 'T28', 'T31', 'T34', 'T27']);
});
