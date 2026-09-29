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

const stub = (text) => ({ id: 'on-device', reword: async (items) => items.map((i) => ({ id: i.id, text })) });
const badSentences = (lang) => table.banned.filter((r) => r.lang === lang && r.scope === 'review').map((r) => r.text);

for (const lang of ['en', 'el']) {
  for (const name of ['stocks', 'crypto', 'forex']) {
    test(`rules only, ${name} week, ${lang}: every sentence and question passes the guard`, async () => {
      const review = await runReview(inputOf(weeks[name], { lang }));
      assert.equal(review.engine, 'rules');
      assert.ok(review.findings.length >= 3);
      for (const s of shownText(review)) assert.deepEqual(clean(s, lang).hits, [], `${name}/${lang}: ${s}`);
    });

    test(`stub model that emits banned text, ${name} week, ${lang}: nothing banned is ever shown, findings unchanged`, async () => {
      const base = await runReview(inputOf(weeks[name], { lang }));
      const attacks = [...badSentences(lang), 'Across 999 trades the average was −9.9R.', 'TSLA trades ran long.', 'x'.repeat(400), '', 'Trades: 1 2 3'];
      for (const attack of attacks) {
        const review = await runReview(inputOf(weeks[name], { lang }), { engine: stub(attack) });
        for (const s of shownText(review)) assert.deepEqual(clean(s, lang).hits, [], `${name}/${lang} attack "${attack.slice(0, 40)}": ${s}`);
        assert.deepEqual(review.findings.map((f) => [f.pattern, f.n, f.tradeIds, f.facts]), base.findings.map((f) => [f.pattern, f.n, f.tradeIds, f.facts]));
        assert.ok(review.findings.every((f) => f.textBy === 'rules'), `attack "${attack.slice(0, 40)}" was accepted`);
        assert.equal(review.engine, 'rules');
        assert.equal(review.engineNote, 'model_rejected');
      }
    });
  }
}

test('positive control: a clean reworded sentence with the same figures is accepted and marked as model text', async () => {
  const engine = { id: 'own-key', reword: async (items) => items.map((i) => ({ id: i.id, text: i.ruleText.replace(/^Your plan says:.*$/, i.ruleText).replace(/^(\d+ trades? )/, 'Across the week, $1') })) };
  const review = await runReview(inputOf(weeks.stocks), { engine });
  const by = Object.fromEntries(review.findings.map((f) => [f.pattern, f]));
  assert.equal(by.outside_set_hours.textBy, 'model');
  assert.equal(by.outside_set_hours.text, by.outside_set_hours.text);
  assert.equal(by.plan_not_followed.textBy, 'rules', 'a finding that quotes the user\'s rule keeps its template');
  assert.equal(review.engine, 'own-key');
  for (const s of shownText(review)) assert.deepEqual(clean(s, 'en').hits, [], s);
});

test('a model sentence that changes one number is dropped, the same sentence with the right number is kept (AC-P5.6)', async () => {
  const wrong = { id: 'on-device', reword: async (items) => items.map((i) => ({ id: i.id, text: i.ruleText.replace(/\d+/, (m) => String(Number(m) + 1)) })) };
  const right = { id: 'on-device', reword: async (items) => items.map((i) => ({ id: i.id, text: `In this period: ${i.ruleText}` })) };
  const a = await runReview(inputOf(weeks.crypto), { engine: wrong });
  assert.ok(a.findings.filter((f) => !f.text.includes('“')).every((f) => f.textBy === 'rules'));
  const b = await runReview(inputOf(weeks.crypto), { engine: right });
  assert.ok(b.findings.some((f) => f.textBy === 'model'));
});

test('a model sentence that names an instrument the finding does not contain is dropped (entities)', async () => {
  const engine = { id: 'on-device', reword: async (items) => items.map((i) => ({ id: i.id, text: `${i.ruleText} See AAPL.` })) };
  const review = await runReview(inputOf(weeks.forex), { engine });
  assert.ok(review.findings.every((f) => f.textBy === 'rules'));
});

test('the legal table itself: every banned review row is rejected, so a model that copies a banned row changes nothing', () => {
  for (const r of table.banned.filter((x) => x.scope === 'review')) assert.equal(check(r.text, r.lang, { scope: 'review' }).ok, false, r.text);
});

test('what a model receives: figures and fixed sentences only, never a checklist item, an instrument name or a note (AC-P9.2)', async () => {
  let received = null;
  const engine = { id: 'own-key', reword: async (items) => { received = items; return []; } };
  await runReview(inputOf(weeks.stocks), { engine });
  const sent = JSON.stringify(received);
  assert.ok(received.length >= 3);
  for (const secret of ['Wait for the first 15 minutes', 'Stop set before entry', 'AAPL', 'TSLA', 'META', 'GOOG', 't1', 'acc-s']) assert.equal(sent.includes(secret), false, `sent ${secret}`);
  assert.ok(received.every((i) => i.ruleText && i.facts && i.id && i.pattern));
  assert.equal(received.some((i) => i.pattern === 'plan_not_followed'), false, 'the finding that quotes the plan is not sent');
});
