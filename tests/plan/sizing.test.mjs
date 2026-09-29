import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { positionSize, pipSizeOf, floorToStep } from '../../src/plan/sizing.js';

const cases = JSON.parse(readFileSync(new URL('../fixtures/stats/requirements-cases.json', import.meta.url), 'utf8')).positionSize;

test('AC-P2.6: the three hand-computed cases (50 shares, 0.0833 coin, 0.2 lot)', () => {
  for (const c of cases.slice(0, 3)) {
    const r = positionSize(c.input);
    assert.equal(r.size, c.expected.size);
    assert.equal(r.riskAmount, c.expected.riskAmount);
    assert.deepEqual(r.missing, []);
    if (c.expected.pipSize) assert.equal(r.pipSize, c.expected.pipSize);
  }
});

test('pip size 0.0001, 0.01 for a JPY quote', () => {
  assert.equal(pipSizeOf('EUR/USD'), '0.0001');
  assert.equal(pipSizeOf('USDJPY'), '0.01');
  assert.equal(pipSizeOf('USD/JPY'), '0.01');
  assert.equal(positionSize({ market: 'forex', instrument: 'USD/JPY' }).pipSize, '0.01');
  assert.equal(pipSizeOf('BTC'), null);
});

test('every input is typed by the user: nothing is defaulted, a missing input is named and no size is returned', () => {
  const full = cases[0].input;
  for (const key of ['equity', 'riskPct', 'entry', 'stop', 'contractSize', 'quoteToAccount', 'sizeStep']) {
    const input = { ...full };
    delete input[key];
    const r = positionSize(input);
    assert.equal(r.size, null, key);
    assert.deepEqual(r.missing, [key]);
  }
  assert.deepEqual(positionSize({}).missing.slice(0, 3), ['equity', 'riskPct', 'sizeStep']);
  const fx = cases[2].input;
  for (const key of ['stopPips', 'pipValuePerLot']) {
    const input = { ...fx };
    delete input[key];
    assert.deepEqual(positionSize(input).missing, [key]);
  }
});

test('an empty string, zero or a stop at the entry is not an input', () => {
  const full = cases[0].input;
  assert.deepEqual(positionSize({ ...full, riskPct: '' }).missing, ['riskPct']);
  assert.deepEqual(positionSize({ ...full, riskPct: '0' }).missing, ['riskPct']);
  assert.deepEqual(positionSize({ ...full, stop: '50' }).missing, ['stopDistance']);
});

test('size rounds down to the step and the risk is recomputed at that size, never above the chosen amount', () => {
  const r = positionSize({ market: 'stock', equity: '10000', riskPct: '1', entry: '50', stop: '47', contractSize: '1', quoteToAccount: 1, sizeStep: '1' });
  assert.equal(r.size, '33');
  assert.equal(r.riskAmount, 99);
  assert.equal(floorToStep('0.08333333', '0.0001'), '0.0833');
  assert.equal(floorToStep('0.00019', '0.0001'), '0.0001');
});
