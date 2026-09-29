import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSentence } from '../../src/sentence/parse.js';
import { mergeAssist, assistSentence } from '../../src/sentence/assist.js';

const parsed = parseSentence('bought 0.2 ETH at 2410, stop 2350', { lang: 'en', setups: ['breakout'] });

test('AC-P1.6: the number fields still come from the code parser when a model reads them differently, and the difference is shown', () => {
  const r = mergeAssist(parsed, { setup: 'breakout', notes: 'level held', numbers: { entry: '2401', stop: '2350', size: '0.2' } });
  assert.equal(r.fields.entry, '2410', 'the code value stays');
  assert.deepEqual(r.conflicts, [{ field: 'entry', code: '2410', model: '2401' }]);
  assert.equal(r.fields.setup, 'breakout');
  assert.equal(r.fields.notes, 'level held');
  assert.equal(r.by, 'model');
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
