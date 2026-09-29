import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { format } from '../../src/import/formats/ibkr-activity.js';
import { sum } from '../../src/core/decimal.js';
import { generate } from '../gen/ibkr-activity.mjs';

const fixture = (name) => readFileSync(new URL(`../fixtures/import/${name}`, import.meta.url), 'utf8');
const text = fixture('ibkr-activity.csv');
const expected = JSON.parse(fixture('ibkr-activity.expected.json'));
const ZONE = 'America/New_York';
const parse = (t = text) => format.parse(t, { fileZone: ZONE });

test('format object matches the contract', () => {
  assert.equal(format.id, expected.format);
  assert.equal(format.market, 'stock');
  assert.equal(format.labelKey, 'import.format.ibkr');
  assert.equal(format.statesZone, expected.statesZone);
});

test('detect: true on the fixture, false on a Kraken file', () => {
  assert.ok(format.detect(text) >= 0.9);
  assert.equal(format.detect(fixture('kraken-trades.csv')), 0);
  assert.equal(format.detect(''), 0);
});

test('fill count, rows in file and the invariant', () => {
  const r = parse();
  assert.equal(r.fills.length, expected.fills);
  assert.equal(r.rowsInFile, expected.rowsInFile);
  assert.equal(r.rowsInFile, r.fills.length + r.cash.length + r.funding.length + r.skipped.length);
});

test('UTC times across the 8 Mar 2026 US clock change', () => {
  const r = parse();
  for (const [symbol, times] of Object.entries(expected.fillTimesUtc)) {
    const got = r.fills.filter((f) => f.instrument === symbol).map((f) => Date.parse(f.time));
    assert.deepEqual(got, times.map((t) => Date.parse(t)), symbol);
  }
  const all = Object.values(expected.fillTimesUtc).flat().length;
  assert.equal(all, r.fills.length);
});

test('the two skipped rows and their reasons', () => {
  const r = parse();
  assert.equal(r.skipped.length, expected.skipped.length);
  expected.skipped.forEach((want, i) => {
    const got = r.skipped[i];
    assert.equal(got.reasonKey, want.reasonKey);
    assert.equal(got.raw.split(',')[5], want.symbol, 'Symbol column of the raw row');
    assert.equal(typeof got.row, 'number');
  });
});

test('deposit and base currency', () => {
  const r = parse();
  assert.equal(r.accountCurrency, expected.accountCurrency);
  assert.equal(r.cash.length, expected.cash.length);
  expected.cash.forEach((want, i) => {
    const got = r.cash[i];
    assert.equal(got.kind, want.kind);
    assert.equal(Number(got.amount), Number(want.amount));
    assert.equal(got.currency, want.currency);
    assert.equal(got.time, want.time);
    assert.ok(got.key);
  });
});

test('fill fields: side, size, price, fee, currencies, openClose', () => {
  const r = parse();
  const [a1, , a3] = r.fills;
  assert.equal(a1.side, 'buy');
  assert.equal(a1.size, '30');
  assert.equal(a1.price, '50');
  assert.equal(a1.fee, '1');
  assert.equal(a1.feeCurrency, 'USD');
  assert.equal(a1.quoteCurrency, 'USD');
  assert.equal(a1.contractSize, '1');
  assert.equal(a1.openClose, 'O');
  assert.equal(a1.stop, null);
  assert.deepEqual(a1.broker, { commission: '1' });
  assert.equal(a3.side, 'sell');
  assert.equal(a3.size, '50');
  assert.equal(a3.openClose, 'C');
  const msftClose = r.fills.find((f) => f.instrument === 'MSFT' && f.openClose === 'C');
  assert.equal(msftClose.price, '47.6');
  assert.equal(msftClose.fee, '0');
  assert.equal(r.sizeStep, '1');
  for (const f of r.fills) for (const k of ['size', 'price', 'fee']) assert.equal(typeof f[k], 'string');
});

test('broker figures on the closing rows (207, -120, 49, 98)', () => {
  const r = parse();
  const closes = r.fills.filter((f) => f.openClose === 'C');
  assert.deepEqual(closes.map((f) => f.instrument), ['AAPL', 'MSFT', 'NVDA', 'TSLA']);
  assert.deepEqual(closes.map((f) => Number(f.broker.realizedPnl)), [207, -120, 49, 98]);
  assert.deepEqual(closes.map((f) => Number(f.broker.basis)), [2542, 2500, 550, 1999]);
  assert.deepEqual(closes.map((f) => Number(f.broker.commission)), [1, 0, 1, 1]);
  // Fixture trades: broker net per closed trade is the sum of its closing rows' Realized P/L.
  for (const t of expected.trades.filter((x) => x.broker)) {
    const got = closes.filter((f) => f.instrument === t.instrument).map((f) => f.broker.realizedPnl);
    assert.equal(Math.round(Number(sum(got)) * 100), t.broker.netMinor, t.instrument);
  }
  const nvda = expected.trades.find((t) => t.instrument === 'NVDA');
  assert.equal(Math.round(Number(closes[2].broker.realizedPnl) * 100), nvda.afterAnswer.keep_broker_pnl.netMinor);
  for (const f of r.fills.filter((x) => x.openClose === 'O')) assert.equal(f.broker.realizedPnl, undefined);
});

test('keys unique and stable over two parses', () => {
  const a = parse();
  const b = parse();
  const keys = [...a.fills, ...a.cash].map((x) => x.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.deepEqual(keys, [...b.fills, ...b.cash].map((x) => x.key));
  assert.equal(a.fills[0].key, 'ibkr:AAPL|2026-03-02, 09:40:00|30|50|-1#1');
});

test('a repeated row gets occurrence #2', () => {
  const line = 'Trades,Data,Order,Stocks,USD,AAPL,"2026-03-02, 09:40:00",30,50,50,-1500,-1,1501,0,0,O';
  const r = parse(text.replace(line, `${line}\n${line}`));
  const keys = r.fills.filter((f) => f.key.startsWith('ibkr:AAPL|2026-03-02, 09:40:00|')).map((f) => f.key);
  assert.deepEqual(keys, ['ibkr:AAPL|2026-03-02, 09:40:00|30|50|-1#1', 'ibkr:AAPL|2026-03-02, 09:40:00|30|50|-1#2']);
});

test('a CRLF and BOM copy parses the same', () => {
  const copy = '﻿' + text.replace(/\r?\n/g, '\r\n');
  assert.ok(format.detect(copy) >= 0.9);
  assert.deepEqual(parse(copy), parse());
});

test('an unreadable date is skipped with import.skip.date', () => {
  const r = parse(text.replace('"2026-03-06, 10:00:00"', '"yesterday"'));
  assert.equal(r.fills.length, expected.fills - 1);
  assert.ok(r.skipped.some((s) => s.reasonKey === 'import.skip.date' && s.raw.includes('NVDA')));
  assert.equal(r.rowsInFile, r.fills.length + r.cash.length + r.skipped.length);
});

test('a negative D&W amount is a withdrawal; the Total row is not counted', () => {
  const r = parse(text.replace('Electronic Fund Transfer,1000', 'Disbursement,-250'));
  assert.equal(r.cash[0].kind, 'withdrawal');
  assert.equal(Number(r.cash[0].amount), 250);
  assert.equal(r.rowsInFile, expected.rowsInFile);
});

test('generated 2,000-row file parses under 2 s with its own totals', () => {
  const g = generate();
  try {
    assert.equal(g.rows, 2000);
    assert.ok(g.closesWithoutOpen > 0);
    const big = readFileSync(g.path, 'utf8');
    const t0 = performance.now();
    const r = parse(big);
    const ms = performance.now() - t0;
    assert.ok(ms < 2000, `took ${ms} ms`);
    assert.equal(r.fills.length, g.fills);
    assert.equal(r.skipped.length, g.skipped);
    assert.equal(r.cash.length, g.cash);
    assert.equal(r.rowsInFile, g.rows + g.cash);
    assert.equal(r.rowsInFile, r.fills.length + r.cash.length + r.skipped.length);
    assert.equal(Number(sum(r.fills.map((f) => f.broker.commission))), -Number(g.commFeeSum));
    assert.equal(new Set(r.fills.map((f) => f.key)).size, r.fills.length);
    assert.ok(r.fills.filter((f) => f.openClose === 'C').length >= g.closesWithoutOpen);
  } finally {
    rmSync(g.dir, { recursive: true, force: true });
  }
});
