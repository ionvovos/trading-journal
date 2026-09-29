// AC-P5.4, AC-P5.5, AC-P5.6, AC-B1.1: three seeded losing weeks, one per market. With rules alone and with a stub model that emits every
// banned class, a wrong number and an invented ticker, no sentence shown carries an instruction, a prediction or a label on the person.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { weeks, inputOf } from './helpers.mjs';
import { runReview } from '../../src/review/run.js';
import { check, stripQuotedSpans } from '../../src/review/guard.js';

const table = JSON.parse(readFileSync(new URL('../fixtures/review/legal-table.json', import.meta.url), 'utf8'));
const shownText = (review) => review.findings.flatMap((f) => [f.text, f.question]).filter(Boolean);
const clean = (text, lang) => check(stripQuotedSpans(text), lang, { scope: 'review' });

// A model reply as the review sees it after the provider has parsed it: the ids, in the model's order. Whatever else the reply held is gone.
const stub = (order) => ({ id: 'on-device', arrange: async (items) => order(items) });
const badSentences = (lang) => table.banned.filter((r) => r.lang === lang && r.scope === 'review').map((r) => r.text);
const idsOf = (review) => review.findings.map((f) => f.id);

for (const lang of ['en', 'el']) {
  for (const name of ['stocks', 'crypto', 'forex']) {
    test(`rules only, ${name} week, ${lang}: every sentence and question passes the guard`, async () => {
      const review = await runReview(inputOf(weeks[name], { lang }));
      assert.equal(review.engine, 'rules');
      assert.ok(review.findings.length >= 3);
      for (const s of shownText(review)) assert.deepEqual(clean(s, lang).hits, [], `${name}/${lang}: ${s}`);
    });

    test(`model replies that carry banned text as ids, ${name} week, ${lang}: nothing banned is ever shown, findings unchanged`, async () => {
      const base = await runReview(inputOf(weeks[name], { lang }));
      const attacks = [...badSentences(lang), 'Across 999 trades the average was −9.9R.', 'TSLA trades ran long.', 'x'.repeat(400), '', 'Trades: 1 2 3'];
      for (const attack of attacks) {
        const review = await runReview(inputOf(weeks[name], { lang }), { engine: stub((items) => [attack, ...items.map((i) => i.id).reverse(), attack]) });
        for (const s of shownText(review)) assert.deepEqual(clean(s, lang).hits, [], `${name}/${lang} attack "${attack.slice(0, 40)}": ${s}`);
        assert.deepEqual(review.findings.map((f) => [f.pattern, f.n, f.tradeIds, f.facts, f.text, f.question]).sort(), base.findings.map((f) => [f.pattern, f.n, f.tradeIds, f.facts, f.text, f.question]).sort(), 'figures and sentences unchanged; only the order may differ');
        assert.ok(review.findings.every((f) => f.textBy === 'rules'));
        if (attack.trim()) assert.equal(JSON.stringify(review).includes(attack), false, 'the attack text is nowhere in the review');
      }
    });
  }
}

test('positive control: an order the model returns is applied; every sentence is still the template sentence and is marked as rules text', async () => {
  const base = await runReview(inputOf(weeks.stocks));
  const engine = { id: 'own-key', arrange: async (items) => items.map((i) => i.id).reverse() };
  const review = await runReview(inputOf(weeks.stocks), { engine });
  assert.equal(review.engine, 'own-key');
  assert.equal(review.engineNote, '');
  const movable = base.findings.filter((f) => f.pattern !== 'plan_not_followed').map((f) => f.id);
  assert.deepEqual(review.findings.filter((f) => f.pattern !== 'plan_not_followed').map((f) => f.id), [...movable].reverse());
  assert.equal(review.findings.findIndex((f) => f.pattern === 'plan_not_followed'), base.findings.findIndex((f) => f.pattern === 'plan_not_followed'), 'a finding that quotes the user\'s rule keeps its place');
  for (const f of review.findings) assert.equal(f.text, base.findings.find((x) => x.id === f.id).text);
  for (const s of shownText(review)) assert.deepEqual(clean(s, 'en').hits, [], s);
});

test('ids the code did not send, repeated ids and non-strings are ignored; findings the model leaves out are still shown, after the ones it ordered', async () => {
  const base = await runReview(inputOf(weeks.crypto));
  const ids = base.findings.map((f) => f.id);
  const engine = { id: 'on-device', arrange: async () => ['f99', ids[2], ids[2], 7, null, { id: ids[0] }, ids[1]] };
  const review = await runReview(inputOf(weeks.crypto), { engine });
  assert.equal(review.findings.length, base.findings.length, 'nothing is hidden by the model');
  const movable = base.findings.filter((f) => !f.text.includes('“'));
  assert.deepEqual(new Set(idsOf(review)), new Set(ids));
  assert.deepEqual(review.findings.filter((f) => movable.some((m) => m.id === f.id)).slice(0, 2).map((f) => f.id), [ids[2], ids[1]].filter((id) => movable.some((m) => m.id === id)).slice(0, 2));
});

test('the legal table itself: every banned review row is rejected, so a model that copies a banned row changes nothing', () => {
  for (const r of table.banned.filter((x) => x.scope === 'review')) assert.equal(check(r.text, r.lang, { scope: 'review' }).ok, false, r.text);
});

test('what a model receives: the pattern and figures only, never a sentence, a checklist item, an instrument name or a note (AC-P9.2)', async () => {
  let received = null;
  const engine = { id: 'own-key', arrange: async (items) => { received = items; return []; } };
  await runReview(inputOf(weeks.stocks), { engine });
  const sent = JSON.stringify(received);
  assert.ok(received.length >= 3);
  for (const secret of ['Wait for the first 15 minutes', 'Stop set before entry', 'AAPL', 'TSLA', 'META', 'GOOG', 't1', 'acc-s']) assert.equal(sent.includes(secret), false, `sent ${secret}`);
  assert.ok(received.every((i) => i.facts && i.id && i.pattern && !('ruleText' in i)));
  assert.equal(received.some((i) => i.pattern === 'plan_not_followed'), false, 'the finding that quotes the plan is not sent');
});

test('with one finding that can move there is nothing to order: the model is not asked', async () => {
  let asked = 0;
  const engine = { id: 'own-key', arrange: async () => { asked += 1; return []; } };
  const review = await runReview(inputOf(weeks.stocks, { plans: [] }), { engine });
  const movable = review.findings.filter((f) => !f.text.includes('“'));
  assert.equal(asked, movable.length > 1 ? 1 : 0);
});
