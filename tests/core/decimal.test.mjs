import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dec, toString, add, sub, mul, div, cmp, abs, neg, isZero, sign, toNumber, decimalsOf, stepOf, sum, min, max, SCALE } from '../../src/core/decimal.js';

test('add and sub are exact where binary floats are not', () => {
  assert.equal(add('0.1', '0.2'), '0.3');
  assert.equal(sub('0.3', '0.1'), '0.2');
  assert.equal(add('0.0003', '0.0002'), '0.0005');
  assert.equal(sub('0.5', '0.2'), '0.3');
  assert.equal(sub('0.3', '0.30000000'), '0');
  assert.equal(add('-1.5', '1.5'), '0');
  assert.equal(add('0.00000001', '0.00000002'), '0.00000003');
});

test('8-decimal crypto sizes add up exactly', () => {
  let p = '0';
  for (let i = 0; i < 1000; i++) p = add(p, '0.00000001');
  assert.equal(p, '0.00001');
  assert.equal(sub('0.5', '0.2'), '0.3');
  assert.equal(sub(sub('0.5', '0.2'), '0.3'), '0');
});

test('mul exact when the product fits, rounded half away from zero at 18 places otherwise', () => {
  assert.equal(mul('1.1', '1.1'), '1.21');
  assert.equal(mul('60000', '0.05'), '3000');
  assert.equal(mul('-0.5', '0.5'), '-0.25');
  assert.equal(mul('0.000000000000000001', '0.5'), '0.000000000000000001');
  assert.equal(mul('-0.000000000000000001', '0.5'), '-0.000000000000000001');
  assert.equal(mul('0.000000000000000001', '0.4'), '0');
});

test('div rounds half away from zero and rejects zero', () => {
  assert.equal(div('1', '4'), '0.25');
  assert.equal(div('-1', '4'), '-0.25');
  assert.equal(div('1', '3'), '0.333333333333333333');
  assert.equal(div('2', '3'), '0.666666666666666667');
  assert.throws(() => div('1', '0'), RangeError);
});

test('cmp, abs, neg, sign, isZero, min, max, sum', () => {
  assert.equal(cmp('1.0', '1'), 0);
  assert.equal(cmp('1.10', '1.9'), -1);
  assert.equal(cmp('-1', '-2'), 1);
  assert.equal(abs('-0.30'), '0.3');
  assert.equal(neg('0'), '0');
  assert.equal(neg('2.5'), '-2.5');
  assert.equal(sign('-0.0001'), -1);
  assert.equal(sign('0.000'), 0);
  assert.equal(isZero('0.000000'), true);
  assert.equal(isZero('-0'), true);
  assert.equal(isZero('0.000000000000000001'), false);
  assert.equal(min('2', '10'), '2');
  assert.equal(max('2', '10'), '10');
  assert.equal(sum(['0.1', '0.2', '0.3', '-0.6']), '0');
});

test('toString normalises and never prints -0', () => {
  assert.equal(toString('1.500'), '1.5');
  assert.equal(toString('-0.000'), '0');
  assert.equal(toString('007'), '7');
  assert.equal(toString('.5'), '0.5');
  assert.equal(toString('5.'), '5');
  assert.equal(toString(dec('-12.34')), '-12.34');
});

test('scientific notation and numbers', () => {
  assert.equal(toString('1e-8'), '0.00000001');
  assert.equal(toString('1.5e3'), '1500');
  assert.equal(toString('-2.5E-3'), '-0.0025');
  assert.equal(add(0.1, 0.2), '0.3');
  assert.equal(toString(1e-7), '0.0000001');
});

test('more than 18 fraction digits rounds half away from zero on digit 19', () => {
  assert.equal(toString('0.1234567890123456785'), '0.123456789012345679');
  assert.equal(toString('0.1234567890123456784'), '0.123456789012345678');
  assert.equal(toString('-0.1234567890123456785'), '-0.123456789012345679');
  assert.equal(SCALE, 18);
});

test('toNumber', () => {
  assert.equal(toNumber('0.05'), 0.05);
  assert.equal(toNumber('-1234.5'), -1234.5);
});

test('decimalsOf counts written fraction digits', () => {
  assert.equal(decimalsOf('0.05000000'), 8);
  assert.equal(decimalsOf('60000.00000'), 5);
  assert.equal(decimalsOf('5'), 0);
  assert.equal(decimalsOf('1e-8'), 8);
  assert.equal(decimalsOf('-3.14'), 2);
});

test('stepOf', () => {
  assert.equal(stepOf(8), '0.00000001');
  assert.equal(stepOf(0), '1');
  assert.equal(stepOf(1), '0.1');
  assert.throws(() => stepOf(19), RangeError);
});

test('bad input throws', () => {
  for (const bad of ['', 'abc', '1.2.3', '1,5', NaN, Infinity, null, undefined, {}]) {
    assert.throws(() => dec(bad), TypeError, String(bad));
  }
});
