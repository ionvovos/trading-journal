import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSentence } from '../../src/sentence/parse.js';
import { mergeAssist, assistSentence } from '../../src/sentence/assist.js';

const parsed = parseSentence('bought 0.2 ETH at 2410, stop 2350', { lang: 'en', setups: ['breakout'] });

test('AC-P1.6: the number fields still come from the code parser when a model reads them differently, and the difference is shown', () => {
  const r = mergeAssist(parsed, { setup: 'breakout', notes: 'level held', numbers: { entry: '2401', stop: '2350', size: '0.2' } }, { text: 'bought 0.2 ETH at 2410, stop 2350, the LEVEL   held' });
  assert.equal(r.fields.entry, '2410', 'the code value stays');
  assert.deepEqual(r.conflicts, [{ field: 'entry', code: '2410', model: '2401' }]);
  assert.equal(r.fields.setup, 'breakout');
  assert.equal(r.fields.notes, 'level held');
  assert.equal(r.by, 'model');
});

test('model notes are kept only when they are a piece of the typed sentence (F6); anything else the model wrote is dropped', () => {
  const text = 'bought 0.2 ETH at 2410, stop 2350, level held';
  assert.equal(mergeAssist(parsed, { setup: null, notes: 'level held', numbers: {} }, { text }).fields.notes, 'level held');
  assert.equal(mergeAssist(parsed, { setup: null, notes: 'The record supports a wider stop.', numbers: {} }, { text }).fields.notes, null);
  assert.equal(mergeAssist(parsed, { setup: null, notes: 'level held', numbers: {} }).fields.notes, null, 'without the typed sentence nothing can be confirmed');
  assert.equal(mergeAssist(parsed, { setup: null, notes: 'level held, buy more', numbers: {} }, { text }).fields.notes, null, 'a longer text that only starts like the sentence is not a piece of it');
});

test('a number the code could not read is not filled from the model: it is listed, and the field stays empty', () => {
  const p = parseSentence('bought 0.2 ETH, breakout', { lang: 'en', setups: ['breakout'] });
  const r = mergeAssist(p, { setup: null, notes: null, numbers: { entry: '2410' } });
  assert.equal(r.fields.entry, null);
  assert.deepEqual(r.conflicts, [{ field: 'entry', code: null, model: '2410' }]);
});

test('the model never overrides a setup the code already found, and a note that breaks the boundary is dropped', () => {
  const p = parseSentence('bought 0.2 ETH at 2410 pullback', { lang: 'en', setups: ['breakout', 'pullback'] });
  assert.equal(mergeAssist(p, { setup: 'breakout', notes: null, numbers: {} }).fields.setup, 'pullback');
  assert.equal(mergeAssist(parsed, { setup: null, notes: 'You should buy more.', numbers: {} }).fields.notes, null);
});

test('no model, a failing model and a timeout give the code result with a reason (AC-P9.4)', async () => {
  const none = await assistSentence({ id: 'rules' }, 'x', parsed);
  assert.equal(none.by, 'code');
  assert.equal(none.note, 'no_model');
  const failing = await assistSentence({ id: 'on-device', assist: async () => { throw Object.assign(new Error('x'), { kind: 'timeout' }); } }, 'x', parsed);
  assert.deepEqual([failing.by, failing.note, failing.fields.entry], ['code', 'failed:timeout', '2410']);
  const ok = await assistSentence({ id: 'own-key', assist: async () => ({ setup: 'breakout', notes: null, numbers: {} }) }, 'x', parsed, { setups: ['breakout'] });
  assert.equal(ok.fields.setup, 'breakout');
});
