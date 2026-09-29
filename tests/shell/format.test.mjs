import test from 'node:test';
import assert from 'node:assert/strict';
import { createFormat, minorDigits, localeFor, MINUS } from '../../src/i18n/format.js';

const en = createFormat({ lang: 'en', tz: 'Europe/Athens', navLang: 'en-GB' });
const el = createFormat({ lang: 'el', tz: 'Europe/Athens' });

test('money: sign, grouping, decimals per language, U+2212 for loss', () => {
  assert.equal(en.money(128460, 'USD'), '+1,284.60');
  assert.equal(el.money(128460, 'USD'), '+1.284,60');
  assert.equal(en.money(-84230, 'USD'), `${MINUS}842.30`);
  assert.equal(el.money(-84230, 'USD'), `${MINUS}842,30`);
  assert.equal(en.money(0, 'USD'), '0.00', 'zero has no sign');
  assert.equal(en.money(100, 'JPY'), '+100', 'yen has no minor digits');
  assert.equal(en.moneyPlain(1000000, 'USD'), '10,000.00');
  assert.equal(en.money(5, 'USDT'), '+0.05', 'a code Intl rejects gets 2 digits');
});

test('minorDigits', () => { assert.equal(minorDigits('EUR'), 2); assert.equal(minorDigits('JPY'), 0); assert.equal(minorDigits('KWD'), 3); });

test('pct, R, pips', () => {
  assert.equal(en.pct(-6.1), `${MINUS}6.1%`);
  assert.equal(el.pct(47.4), '47,4%');
  assert.equal(en.r(0.16), '+0.16R');
  assert.equal(el.r(-0.94), `${MINUS}0,94R`);
  assert.equal(en.pips(33), '+33.0');
  assert.equal(en.pctSigned(2.5), '+2.5%');
});

test('dates and times use the declared zone', () => {
  assert.equal(en.date('2026-09-29T12:00:00Z'), '29 Sep');
  assert.equal(el.date('2026-09-29T12:00:00Z'), '29 Σεπ');
  assert.equal(en.date('2026-09-29T12:00:00Z', { style: 'monthYear' }), 'Sep 2026');
  assert.equal(el.date('2026-09-29T12:00:00Z', { style: 'monthLong' }), 'Σεπτέμβριος', 'nominative month name');
  assert.equal(en.date('2026-09-29T12:00:00Z', { style: 'long' }), '29 Sep 2026');
  assert.equal(en.time('2026-09-29T13:41:00Z'), '16:41', 'Athens is UTC+3 in September');
  assert.equal(createFormat({ lang: 'en', tz: 'America/New_York' }).time('2026-09-29T13:41:00Z'), '09:41');
  assert.equal(en.date('2026-09-29T22:30:00Z'), '30 Sep', 'a late-evening UTC time is already the next day in Athens');
});

test('duration and locale', () => {
  assert.equal(en.duration(5040), '1h 24m'); assert.equal(en.duration(2700), '45m'); assert.equal(el.duration(5040), '1ω 24λ');
  assert.equal(localeFor('el'), 'el-GR'); assert.equal(localeFor('en', 'en-US'), 'en-US'); assert.equal(localeFor('en', 'de-DE'), 'en-GB');
});
