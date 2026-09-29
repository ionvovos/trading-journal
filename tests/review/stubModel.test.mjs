// AC-P9.4: a stub model that returns garbage, times out or throws leaves every figure and every review finding unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import { weeks, inputOf } from './helpers.mjs';
import { runReview } from '../../src/review/run.js';
import { RULES_ENGINE } from '../../src/ai/engine.js';

const figures = (r) => JSON.stringify({ findings: r.findings.map((f) => [f.pattern, f.n, f.tradeIds, f.facts, f.text, f.textBy, f.question]), p: r.processOutcome, o: r.optional, l: r.left, c: r.checked });

test('no model: the review is produced by rules and says so (AC-P5.7)', async () => {
  const review = await runReview(inputOf(weeks.stocks), { engine: RULES_ENGINE });
  assert.equal(review.engine, 'rules');
  assert.equal(review.engineNote, 'no_model');
  assert.ok(review.findings.every((f) => f.textBy === 'rules'));
});

const base = await runReview(inputOf(weeks.stocks));
const cases = {
  'garbage text': async () => 'this is not json',
  'a number': async () => 42,
  'null': async () => null,
  'object with no items': async () => ({}),
  'items with bad ids': async () => [{ id: 'zzz', text: 'Hello' }, { id: 5, text: 'x' }, null, { id: 'f1' }],
  'a timeout': () => new Promise(() => {}),
  'a thrown provider error': async () => { throw Object.assign(new Error('boom'), { kind: 'network' }); },
};

for (const [name, reword] of Object.entries(cases)) {
  test(`stub model returning ${name}: figures, findings and text are unchanged`, async () => {
    const events = [];
    const review = await runReview(inputOf(weeks.stocks), { engine: { id: 'on-device', reword }, timeoutMs: 30, bus: { emit: (n, d) => events.push([n, d]) } });
    assert.equal(figures(review), figures(base));
    assert.equal(review.engine, 'rules');
    assert.match(review.engineNote, /^(failed:|model_)/);
    if (name === 'a timeout') { assert.equal(review.engineNote, 'failed:timeout'); assert.equal(events[0][0], 'ai-state'); assert.equal(events[0][1].state, 'failed'); }
  });
}

test('the review carries the engine and its state on every result (AC-P9.3)', async () => {
  const review = await runReview(inputOf(weeks.crypto), { engine: { id: 'on-device', reword: async () => { throw new Error('x'); } } });
  assert.ok(['rules', 'on-device', 'own-key'].includes(review.engine));
  assert.ok(typeof review.engineNote === 'string');
});
