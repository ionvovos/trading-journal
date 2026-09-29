import { test } from 'node:test';
import assert from 'node:assert/strict';
import { positionSize } from '../../src/stats/index.js';
import { cases } from './helpers.mjs';

for (const [i, c] of cases.positionSize.entries()) {
  test(`positionSize case ${i + 1} (${c.input.market} ${c.input.instrument || ''})`, () => {
    const got = positionSize(c.input);
    if ('size' in c.expected) assert.equal(got.size, c.expected.size);
    if ('riskAmount' in c.expected) assert.ok(Math.abs(got.riskAmount - c.expected.riskAmount) <= 1e-9, `${got.riskAmount}`);
    if ('pipSize' in c.expected) assert.equal(got.pipSize, c.expected.pipSize);
  });
}

test('positionSize has no default for any input', () => {
  const full = cases.positionSize[0].input;
  for (const k of Object.keys(full)) {
    const input = { ...full };
    delete input[k];
    const got = positionSize(input);
    assert.equal(got.size, null, `without ${k}`);
    assert.equal(got.riskAmount, null);
    assert.ok(got.missing.includes(k), `names ${k}`);
  }
  assert.equal(positionSize({}).size, null);
});

test('positionSize rounds down to the step and recomputes the risk', () => {
  const got = positionSize({ ...cases.positionSize[0].input, stop: '47' });
  assert.equal(got.size, '33');
  assert.equal(got.riskAmount, 99);
  assert.equal(positionSize({ ...cases.positionSize[0].input, stop: '50' }).reason, 'stop_at_entry');
});
