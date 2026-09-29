// AC-P1.5, AC-P1.6, AC-P7.2: 40+ phrases across the three markets, half of them Greek, plus the ambiguous-dot case. Every expected
// value is what the sentence states, read by hand. No model, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSentence, readNumber, REQUIRED } from '../../src/sentence/parse.js';

const SETUPS = ['breakout', 'pullback', 'range'];
const P = (text, lang = 'en', over = {}) => parseSentence(text, { lang, setups: SETUPS, instruments: [], ...over });
const pick = (r, keys) => Object.fromEntries(keys.map((k) => [k, r.fields[k]]));

// [phrase, lang, expected fields]. Fields not listed must be null.
const CASES = [
  // ---- crypto, English
  ['bought 0.2 ETH at 2410, stop 2350, breakout', 'en', { side: 'long', instrument: 'ETH', market: 'crypto', size: '0.2', entry: '2410', stop: '2350', setup: 'breakout' }],
  ['bought 0.05 BTC @ 60,000 stop 59,000 target 62,000', 'en', { side: 'long', instrument: 'BTC', market: 'crypto', size: '0.05', entry: '60000', stop: '59000', target: '62000' }],
  ['sold 10 SOL at 100 stop 105', 'en', { side: 'short', instrument: 'SOL', market: 'crypto', size: '10', entry: '100', stop: '105' }],
  ['long 1.5 ETH/USD at 2400.5 sl 2350 fee 2.4 pullback', 'en', { side: 'long', instrument: 'ETH/USD', market: 'crypto', size: '1.5', entry: '2400.5', stop: '2350', fee: '2.4', setup: 'pullback' }],
  ['bought 0,2 ETH at 2410', 'en', { side: 'long', instrument: 'ETH', market: 'crypto', size: '0.2', entry: '2410' }],
  ['short 0.1 bitcoin at 61000 target 58000 range', 'en', { side: 'short', instrument: 'BTC', market: 'crypto', size: '0.1', entry: '61000', target: '58000', setup: 'range' }],
  ['bought 500 DOGE at 0.15 stop 0.14', 'en', { side: 'long', instrument: 'DOGE', market: 'crypto', size: '500', entry: '0.15', stop: '0.14' }],
  ['bought 0,2 eth at 2410, stop 2350, breakout', 'en', { side: 'long', instrument: 'ETH', market: 'crypto', size: '0.2', entry: '2410', stop: '2350', setup: 'breakout' }],
  ['sold 0.5 btc at 61000', 'en', { side: 'short', instrument: 'BTC', market: 'crypto', size: '0.5', entry: '61000' }],
  ['bought 0.2 lot eurusd at 1.0850 stop 1.0800', 'en', { side: 'long', instrument: 'EUR/USD', market: 'forex', size: '0.2', entry: '1.0850', stop: '1.0800' }],
  // ---- crypto, Greek
  ['αγόρασα 0,2 ETH στα 2410, στοπ 2350, breakout', 'el', { side: 'long', instrument: 'ETH', market: 'crypto', size: '0.2', entry: '2410', stop: '2350', setup: 'breakout' }],
  ['αγόρασα 0,05 BTC στα 60000 στοπ 59000 στόχος 62000', 'el', { side: 'long', instrument: 'BTC', market: 'crypto', size: '0.05', entry: '60000', stop: '59000', target: '62000' }],
  ['πούλησα 10 SOL στα 100 στοπ 105', 'el', { side: 'short', instrument: 'SOL', market: 'crypto', size: '10', entry: '100', stop: '105' }],
  ['σορτ 0,1 BTC/USD στα 61000 στόχος 58000', 'el', { side: 'short', instrument: 'BTC/USD', market: 'crypto', size: '0.1', entry: '61000', target: '58000' }],
  ['αγόρασα 1,5 ETH στα 2400,5 στοπ 2350 προμήθεια 2,4', 'el', { side: 'long', instrument: 'ETH', market: 'crypto', size: '1.5', entry: '2400.5', stop: '2350', fee: '2.4' }],
  ['αγόρασα 500 DOGE στα 0,15 pullback', 'el', { side: 'long', instrument: 'DOGE', market: 'crypto', size: '500', entry: '0.15', setup: 'pullback' }],
  ['αγορά 0,2 ETH στα 2.410 στοπ 2.350', 'el', 'ambiguous:entry,stop'],
  // ---- stocks, English
  ['bought 50 AAPL at 50 stop 48', 'en', { side: 'long', instrument: 'AAPL', market: 'stock', size: '50', entry: '50', stop: '48' }],
  ['bought 30 MSFT at 200.5 stop 196 breakout', 'en', { side: 'long', instrument: 'MSFT', market: 'stock', size: '30', entry: '200.5', stop: '196', setup: 'breakout' }],
  ['sold 20 TSLA at 300 stop 305 fee 1', 'en', { side: 'short', instrument: 'TSLA', market: 'stock', size: '20', entry: '300', stop: '305', fee: '1' }],
  ['long 100 shares NVDA at 100 target 106', 'en', { side: 'long', instrument: 'NVDA', market: 'stock', size: '100', entry: '100', target: '106' }],
  ['bought 10 KO at 60, sold at 61', 'en', { side: 'long', instrument: 'KO', market: 'stock', size: '10', entry: '60', exit: '61' }],
  ['short 25 AMD at 1,200.5', 'en', { side: 'short', instrument: 'AMD', market: 'stock', size: '25', entry: '1200.5' }],
  ['buy 5 GOOG 150.25 stop 148', 'en', { side: 'long', instrument: 'GOOG', market: 'stock', size: '5', entry: '150.25', stop: '148' }],
  // ---- stocks, Greek
  ['αγόρασα 50 AAPL στα 50 στοπ 48', 'el', { side: 'long', instrument: 'AAPL', market: 'stock', size: '50', entry: '50', stop: '48' }],
  ['αγόρασα 30 MSFT στα 200,5 στοπ 196 breakout', 'el', { side: 'long', instrument: 'MSFT', market: 'stock', size: '30', entry: '200.5', stop: '196', setup: 'breakout' }],
  ['πούλησα 20 TSLA στα 300 στοπ 305 προμήθεια 1', 'el', { side: 'short', instrument: 'TSLA', market: 'stock', size: '20', entry: '300', stop: '305', fee: '1' }],
  ['αγόρασα 100 μετοχές NVDA στα 100 στόχος 106', 'el', { side: 'long', instrument: 'NVDA', market: 'stock', size: '100', entry: '100', target: '106' }],
  ['αγόρασα 10 KO στα 60, πούλησα στα 61', 'el', { side: 'long', instrument: 'KO', market: 'stock', size: '10', entry: '60', exit: '61' }],
  ['σορτ 25 AMD στα 1.200,5', 'el', { side: 'short', instrument: 'AMD', market: 'stock', size: '25', entry: '1200.5' }],
  ['αγόρασα 5 GOOG στα 150,25', 'el', { side: 'long', instrument: 'GOOG', market: 'stock', size: '5', entry: '150.25' }],
  // ---- forex, English
  ['bought 0.2 lot EURUSD at 1.0850 stop 1.0800', 'en', { side: 'long', instrument: 'EUR/USD', market: 'forex', size: '0.2', entry: '1.0850', stop: '1.0800' }],
  ['sold 0.1 lots GBP/USD at 1.2700 stop 1.2750 target 1.2600', 'en', { side: 'short', instrument: 'GBP/USD', market: 'forex', size: '0.1', entry: '1.2700', stop: '1.2750', target: '1.2600' }],
  ['long 0.5 USDJPY at 150.25 stop 149.75 fee 3.5 range', 'en', { side: 'long', instrument: 'USD/JPY', market: 'forex', size: '0.5', entry: '150.25', stop: '149.75', fee: '3.5', setup: 'range' }],
  ['short 0.2 EUR/USD @ 1.0900 sl 1.0950', 'en', { side: 'short', instrument: 'EUR/USD', market: 'forex', size: '0.2', entry: '1.0900', stop: '1.0950' }],
  ['bought 0.2 lot EURUSD at 1.0850 stop 50 pips', 'en', { side: 'long', instrument: 'EUR/USD', market: 'forex', size: '0.2', entry: '1.0850', stop: '1.08', stopPips: '50' }],
  ['bought 0.3 lots AUDUSD at 0.6600, sold at 0.6650', 'en', { side: 'long', instrument: 'AUD/USD', market: 'forex', size: '0.3', entry: '0.6600', exit: '0.6650' }],
  ['bought 0,2 lot EURUSD at 1,0850', 'en', { side: 'long', instrument: 'EUR/USD', market: 'forex', size: '0.2', entry: '1.0850' }],
  // ---- forex, Greek
  ['αγόρασα 0,2 λοτ EURUSD στα 1,0850 στοπ 1,0800', 'el', { side: 'long', instrument: 'EUR/USD', market: 'forex', size: '0.2', entry: '1.0850', stop: '1.0800' }],
  ['πούλησα 0,1 λοτ GBP/USD στα 1,2700 στοπ 1,2750 στόχος 1,2600', 'el', { side: 'short', instrument: 'GBP/USD', market: 'forex', size: '0.1', entry: '1.2700', stop: '1.2750', target: '1.2600' }],
  ['λονγκ 0,5 USDJPY στα 150,25 στοπ 149,75 προμήθεια 3,5 range', 'el', { side: 'long', instrument: 'USD/JPY', market: 'forex', size: '0.5', entry: '150.25', stop: '149.75', fee: '3.5', setup: 'range' }],
  ['σορτ 0,2 EUR/USD στα 1,0900 στοπ 1,0950', 'el', { side: 'short', instrument: 'EUR/USD', market: 'forex', size: '0.2', entry: '1.0900', stop: '1.0950' }],
  ['αγόρασα 0,2 λοτ EURUSD στα 1,0850 στοπ 50 πιπς', 'el', { side: 'long', instrument: 'EUR/USD', market: 'forex', size: '0.2', entry: '1.0850', stop: '1.08', stopPips: '50' }],
  ['αγόρασα 0,3 λοτ AUDUSD στα 0,6600, πούλησα στα 0,6650', 'el', { side: 'long', instrument: 'AUD/USD', market: 'forex', size: '0.3', entry: '0.6600', exit: '0.6650' }],
  ['αγόρασα 0,2 λοτ EURUSD στα 1.085', 'el', 'ambiguous:entry'],
];

test('the phrase list has 40 or more phrases across the three markets, about half Greek', () => {
  assert.ok(CASES.length >= 40, `${CASES.length} phrases`);
  const el = CASES.filter((c) => c[1] === 'el').length;
  assert.ok(el >= CASES.length * 0.4 && el <= CASES.length * 0.6, `${el} Greek of ${CASES.length}`);
  for (const market of ['crypto', 'stock', 'forex']) assert.ok(CASES.filter((c) => c[2].market === market).length >= 10, market);
});

for (const [text, lang, want] of CASES) {
  test(`parses (${lang}): ${text}`, () => {
    const r = P(text, lang);
    if (typeof want === 'string') {
      const fields = want.split(':')[1].split(',');
      assert.deepEqual(r.ambiguous.map((a) => a.field).sort(), fields.sort());
      for (const f of fields) assert.equal(r.fields[f], null, `${f} stays empty until the user picks`);
      assert.ok(r.ambiguous.every((a) => a.readings.length === 2));
      return;
    }
    const expected = { side: null, instrument: null, market: null, size: null, entry: null, exit: null, stop: null, target: null, fee: null, setup: null, stopPips: null, ...want };
    assert.deepEqual(r.fields, expected);
    assert.deepEqual(r.missing, []);
    assert.deepEqual(r.ambiguous, []);
  });
}

test('AC-P7.2: in Greek a dot followed by exactly three digits is asked, never guessed, with both readings', () => {
  const r = P('αγόρασα 0,2 λοτ EURUSD στα 1.085', 'el');
  assert.equal(r.fields.entry, null);
  assert.deepEqual(r.ambiguous, [{ field: 'entry', readings: ['1.085', '1085'] }]);
  assert.equal(r.missing.includes('entry'), false, 'ambiguous is asked as a choice, not as a missing field');
  assert.deepEqual(readNumber('60.000', 'el'), { value: null, readings: ['60.000', '60000'] });
  assert.deepEqual(readNumber('1.085', 'en'), { value: '1.085', readings: null });
  assert.deepEqual(readNumber('1.200.500', 'el'), { value: '1200500', readings: null });
  assert.deepEqual(readNumber('2.410,5', 'el'), { value: '2410.5', readings: null });
  assert.deepEqual(readNumber('1.0850', 'el'), { value: '1.0850', readings: null }, 'four decimals is not a thousands group');
});

test('AC-P7.2: decimal comma and decimal point both parse', () => {
  assert.equal(readNumber('0,2', 'en').value, '0.2');
  assert.equal(readNumber('0.2', 'en').value, '0.2');
  assert.equal(readNumber('0,2', 'el').value, '0.2');
  assert.equal(readNumber('0.2', 'el').value, '0.2');
  assert.equal(readNumber('60,000', 'en').value, '60000');
  assert.equal(readNumber('1,234.56', 'en').value, '1234.56');
});

test('AC-P1.5: a field that cannot be read stays empty and is named, the app never guesses a number', () => {
  const r = P('bought 0.2 ETH, breakout');
  assert.deepEqual(r.missing, ['entry']);
  assert.equal(r.fields.entry, null);
  const empty = P('');
  assert.deepEqual(empty.missing, ['instrument', 'side', 'size', 'entry']);
  const noSide = P('0.2 ETH at 2410');
  assert.deepEqual(noSide.missing, ['side']);
  assert.deepEqual(REQUIRED, ['instrument', 'side', 'size', 'entry']);
  const noSize = P('bought ETH at 2410');
  assert.deepEqual(noSize.missing, ['size']);
});

test('the user\'s own instruments are recognised, in any case', () => {
  const r = parseSentence('bought 3 aapl at 190', { lang: 'en', instruments: ['AAPL'], setups: [] });
  assert.equal(r.fields.instrument, 'AAPL');
  assert.equal(r.fields.market, 'stock');
});

test('setups are matched only to the names the user has, and never invented', () => {
  assert.equal(P('bought 50 AAPL at 50 stop 48 fade').fields.setup, null);
  assert.equal(P('bought 50 AAPL at 50 stop 48 Pullback').fields.setup, 'pullback');
  assert.equal(parseSentence('bought 50 AAPL at 50', { lang: 'en', setups: [] }).fields.setup, null);
});

test('a stop stated in pips becomes a price by exact arithmetic and is listed as derived', () => {
  const r = P('sold 0.2 lot EURUSD at 1.0900 stop 50 pips');
  assert.equal(r.fields.stop, '1.095');
  assert.deepEqual(r.derived, ['stop']);
  const jpy = P('bought 0.2 lot USDJPY at 150.00 stop 30 pips');
  assert.equal(jpy.fields.stop, '149.7');
});

test('lower-case symbols: the major coins and currency pairs are read, an English word that is also a symbol is not', () => {
  assert.equal(P('bought 2 link at 15').fields.instrument, null, 'link in lower case is a word');
  assert.equal(P('bought 2 LINK at 15').fields.instrument, 'LINK');
  assert.equal(P('bought 3 near 2350').fields.instrument, null);
});

test('side words: long and short as well as bought and sold; the first side word opens the trade', () => {
  assert.equal(P('short 10 KO at 60').fields.side, 'short');
  assert.equal(P('sold 10 KO at 60').fields.side, 'short');
  assert.equal(P('bought 10 KO at 60').fields.side, 'long');
});
