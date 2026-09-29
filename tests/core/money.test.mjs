import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDecimal, roundMinor, minorDigits, minorToDecimal } from '../../src/core/money.js';

test('parseDecimal reads plain and signed numbers and normalises them', () => {
  assert.equal(parseDecimal('1.5'), '1.5');
  assert.equal(parseDecimal('-1.5'), '-1.5');
  assert.equal(parseDecimal('+1.5'), '1.5');
  assert.equal(parseDecimal('  60000.00000 '), '60000');
  assert.equal(parseDecimal('0.05000000'), '0.05');
  assert.equal(parseDecimal('007'), '7');
  assert.equal(parseDecimal('.5'), '0.5');
  assert.equal(parseDecimal('5.'), '5');
  assert.equal(parseDecimal('-0.00'), '0');
  assert.equal(parseDecimal('−1.25'), '-1.25');
  assert.equal(parseDecimal(12.5), '12.5');
});

test('thousands separators only in groups of three', () => {
  assert.equal(parseDecimal('10 000.00'), '10000');
  assert.equal(parseDecimal('10 000.00'), '10000');
  assert.equal(parseDecimal('1,234.50'), '1234.5');
  assert.equal(parseDecimal('1,234,567'), '1234567');
  assert.equal(parseDecimal('-2 500.10'), '-2500.1');
  assert.equal(parseDecimal('1.234,50', ','), '1234.5');
  assert.equal(parseDecimal('1 234,50', ','), '1234.5');
});

test('decimal comma', () => {
  assert.equal(parseDecimal('1,5', ','), '1.5');
  assert.equal(parseDecimal('-0,00000001', ','), '-0.00000001');
  assert.equal(parseDecimal('60000,00', ','), '60000');
});

test('a comma that is not a thousands group is null, never a silent 15', () => {
  assert.equal(parseDecimal('1,5'), null);
  assert.equal(parseDecimal('1,23'), null);
  assert.equal(parseDecimal('1234,567'), null);
  assert.equal(parseDecimal('1.234,5'), null);
  assert.equal(parseDecimal('1 5'), null);
});

test('exponent', () => {
  assert.equal(parseDecimal('1e-8'), '0.00000001');
  assert.equal(parseDecimal('1.5E3'), '1500');
  assert.equal(parseDecimal(1e-7), '0.0000001');
});

test('not a number is null', () => {
  for (const bad of ['', '  ', '-', '+', '.', 'abc', '12abc', '1.2.3', '--1', '1e', null, undefined, NaN, {}, '1 000 00']) {
    assert.equal(parseDecimal(bad), null, String(bad));
  }
});

test('roundMinor: half away from zero with a relative epsilon', () => {
  assert.equal(roundMinor(1.005, 2), 101);
  assert.equal(roundMinor(-2.675, 2), -268);
  assert.equal(roundMinor(0.5, 0), 1);
  assert.equal(roundMinor(-0.5, 0), -1);
  assert.equal(roundMinor(2.5, 0), 3);
  assert.equal(roundMinor(1.004, 2), 100);
  assert.equal(roundMinor(-0.0004, 2), 0);
  assert.ok(Object.is(roundMinor(-0.0004, 2), 0), 'no negative zero');
  assert.equal(roundMinor(1234.5678, 0), 1235);
  assert.equal(roundMinor(207, 2), 20700);
  assert.equal(roundMinor(100, 0), 100);
  assert.throws(() => roundMinor(NaN, 2), TypeError);
  assert.throws(() => roundMinor('1', 2), TypeError);
});

test('minorDigits', () => {
  assert.equal(minorDigits('USD'), 2);
  assert.equal(minorDigits('eur'), 2);
  assert.equal(minorDigits('JPY'), 0);
  assert.equal(minorDigits('USDT'), 2);
  assert.equal(minorDigits(''), 2);
});

test('minorToDecimal', () => {
  assert.equal(minorToDecimal(12345, 2), '123.45');
  assert.equal(minorToDecimal(-5, 2), '-0.05');
  assert.equal(minorToDecimal(7, 0), '7');
  assert.equal(minorToDecimal(0, 2), '0.00');
  assert.throws(() => minorToDecimal(1.5, 2), TypeError);
});
