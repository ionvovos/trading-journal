import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { format, splitPair } from '../../src/import/formats/kraken-trades.js';
import { sum } from '../../src/core/decimal.js';
import { generate } from '../gen/kraken-trades.mjs';

const fx = (name) => readFileSync(new URL(`../fixtures/import/${name}`, import.meta.url), 'utf8');
const expected = JSON.parse(fx('kraken-trades.expected.json'));
const HEADER = fx('kraken-trades.csv').split('\n')[0];

const invariant = (res) => assert.equal(res.rowsInFile, res.fills.length + res.cash.length + res.funding.length + res.skipped.length);

test('format object', () => {
  assert.equal(format.id, expected.format);
  assert.equal(format.market, 'crypto');
  assert.equal(format.labelKey, 'import.format.kraken');
  assert.equal(format.statesZone, expected.statesZone);
});

test('detect', () => {
  for (const f of ['kraken-trades.csv', 'kraken-overlap.csv', 'kraken-month-edge.csv', 'kraken-quantity.csv']) {
    assert.ok(format.detect(fx(f)) >= 0.9, f);
  }
  assert.ok(format.detect('txid,pair,time,type,price,cost,fee,vol\n') < 0.6, 'ordertxid missing');
  assert.ok(format.detect(fx('ibkr-activity.csv')) < 0.6);
  assert.ok(format.detect(fx('generic.csv')) < 0.6);
  assert.ok(format.detect(fx('mt4-statement.htm')) < 0.6);
  assert.equal(format.detect(''), 0);
  // reordered and extra columns, BOM, CRLF
  assert.ok(format.detect('﻿vol,fee,cost,price,type,time,pair,ordertxid,txid,postxid\r\n') >= 0.9);
});

test('kraken-trades.csv: 8 fills, 1 skipped, invariant', () => {
  const res = format.parse(fx('kraken-trades.csv'), { fileZone: 'UTC' });
  assert.equal(res.rowsInFile, expected.rowsInFile);
  assert.equal(res.fills.length, expected.fills);
  assert.equal(res.skipped.length, expected.skipped.length);
  for (const [i, s] of expected.skipped.entries()) {
    assert.equal(res.skipped[i].reasonKey, s.reasonKey);
    assert.ok(res.skipped[i].raw.includes(s.txid));
    assert.equal(res.skipped[i].row, 10);
  }
  assert.deepEqual(res.cash, expected.cash);
  assert.deepEqual(res.funding, []);
  assert.deepEqual(res.openAtEnd, []);
  assert.equal(res.fileSummary, null);
  assert.equal(res.accountCurrency, null);
  invariant(res);
  // default fileZone is UTC
  assert.deepEqual(format.parse(fx('kraken-trades.csv')), res);
});

test('fill fields', () => {
  const [f] = format.parse(fx('kraken-trades.csv')).fills;
  assert.deepEqual(f, {
    key: 'kraken:TA1AAA-00001-000001', time: '2026-03-04T21:30:00.100Z', instrument: 'BTC/USD', market: 'crypto',
    side: 'buy', size: '0.05', price: '60000', fee: '3', feeCurrency: 'USD', quoteCurrency: 'USD', contractSize: '1',
    positionId: null, openClose: null, broker: null, stop: null, stopSource: null, target: null,
    quoteToAccount: null, setup: null, notes: null, row: 2,
  });
  const keys = format.parse(fx('kraken-trades.csv')).fills.map((x) => x.key);
  assert.equal(new Set(keys).size, keys.length);
});

test('pair map: the four fixture pairs plus XDGUSD and ETHUSDT', () => {
  const res = format.parse(fx('kraken-trades.csv'));
  const seen = {};
  for (const f of res.fills) {
    const row = fx('kraken-trades.csv').split('\n')[f.row - 1];
    const pair = row.split(',')[2].replace(/"/g, '');
    seen[pair] = f.instrument;
  }
  assert.deepEqual(seen, expected.pairs);
  for (const [pair, inst] of Object.entries(expected.pairs)) {
    const { base, quote } = splitPair(pair);
    assert.equal(`${base}/${quote}`, inst);
  }

  const built = [
    HEADER,
    '"TZ1","OZ1","XDGUSD","2026-03-09 10:00:00.0000","buy","market",0.15000,15.00000,0.03900,100.00000000,0.00000,"",""',
    '"TZ2","OZ2","ETHUSDT","2026-03-09 11:00:00.0000","sell","limit",2450.00000,245.00000,0.63700,0.10000000,0.00000,"",""',
    '"TZ3","OZ3","XETHXXBT","2026-03-09 12:00:00.0000","buy","limit",0.04000,0.04000,0.00010,1.00000000,0.00000,"",""',
    '"TZ4","OZ4","FOOBAR","2026-03-09 13:00:00.0000","buy","limit",1.00000,1.00000,0.00100,1.00000000,0.00000,"",""',
  ].join('\n');
  const r = format.parse(built);
  assert.deepEqual(r.fills.map((f) => f.instrument), ['DOGE/USD', 'ETH/USDT', 'ETH/BTC']);
  assert.deepEqual(r.fills.map((f) => f.quoteCurrency), ['USD', 'USDT', 'BTC']);
  assert.deepEqual(r.fills.map((f) => f.feeCurrency), ['USD', 'USDT', 'BTC']);
  assert.deepEqual(r.skipped.map((s) => s.reasonKey), ['import.skip.pair']);
  assert.equal(splitPair('XXDGZUSD').base, 'DOGE');
  assert.equal(splitPair('USD'), null);
  invariant(r);
});

test('fees kept as decimal strings in the quote currency', () => {
  const res = format.parse(fx('kraken-trades.csv'));
  assert.deepEqual(res.fills.map((f) => [f.fee, f.feeCurrency]), [
    ['3', 'USD'], ['1.998', 'USD'], ['5.19792', 'USD'], ['2.4', 'USD'], ['2.49875', 'USD'],
    ['0.55', 'EUR'], ['0.56', 'EUR'], ['0.3', 'USD'],
  ]);
  for (const f of res.fills) for (const k of ['fee', 'size', 'price']) assert.equal(typeof f[k], 'string');
  // BTC/USD trade fees: 3 + 1.998 + 5.19792 = 10.19592 -> feesMinor 1020
  const btc = expected.trades.find((t) => t.instrument === 'BTC/USD');
  assert.equal(Math.round(Number(sum(res.fills.slice(0, 3).map((f) => f.fee))) * 100), btc.feesMinor);
});

test('UTC times keep milliseconds; month edge stays in UTC', () => {
  const res = format.parse(fx('kraken-trades.csv'));
  assert.deepEqual(res.fills.slice(0, 3).map((f) => f.time), [
    '2026-03-04T21:30:00.100Z', '2026-03-04T21:30:01.200Z', '2026-03-04T22:30:00.000Z',
  ]);
  const edge = format.parse(fx('kraken-month-edge.csv'));
  assert.deepEqual(edge.fills.map((f) => f.time), ['2026-03-31T20:00:00.000Z', '2026-03-31T22:30:00.000Z']);
  invariant(edge);
});

test('sizeStep from the most decimals in vol', () => {
  assert.equal(format.parse(fx('kraken-trades.csv')).sizeStep, expected.sizeStep);
  assert.equal(format.parse(fx('kraken-quantity.csv')).sizeStep, '0.00000001');
  const built = `${HEADER}\n"T1","O1","SOLUSD","2026-03-09 10:00:00","buy","market",150,300,0.3,2.5,0,"",""\n`;
  assert.equal(format.parse(built).sizeStep, '0.1');
  assert.equal(format.parse(`${HEADER}\n`).sizeStep, null);
});

test('kraken-overlap.csv: same fields as TA1-TA3, different keys', () => {
  const a = format.parse(fx('kraken-trades.csv')).fills.slice(0, 3);
  const b = format.parse(fx('kraken-overlap.csv')).fills;
  assert.equal(b.length, 3);
  const strip = ({ key, ...rest }) => rest;
  assert.deepEqual(b.map(strip), a.map(strip));
  for (let i = 0; i < 3; i++) assert.notEqual(b[i].key, a[i].key);
  assert.deepEqual(b.map((f) => f.key), ['kraken:TX1XXX-00007-000001', 'kraken:TX2XXX-00007-000002', 'kraken:TX3XXX-00007-000003']);
});

test('kraken-quantity.csv: 3 fills with exact sizes', () => {
  const res = format.parse(fx('kraken-quantity.csv'));
  assert.deepEqual(res.fills.map((f) => f.size), ['0.3', '0.2', '0.2']);
  assert.deepEqual(res.fills.map((f) => f.side), ['buy', 'buy', 'sell']);
  const q = expected.quantityCase;
  assert.equal(q.file, 'kraken-quantity.csv');
  for (const k of q.expected.explanations[0].fillKeys) assert.ok(res.fills.some((f) => f.key === k), k);
  assert.ok(res.fills.every((f) => f.instrument.split('/')[0] === q.asset && f.feeCurrency === 'USD'));
  invariant(res);
});

test('skips: unreadable number and time, margin note, blank fee, reordered columns', () => {
  const built = [
    'pair,vol,txid,type,time,price,fee,cost,ordertxid,margin,extra',
    'XXBTZUSD,0.01,T1,buy,2026-03-09 10:00:00.5000,60000,0.6,600,O1,100,x',
    'XXBTZUSD,0.01,T2,sell,2026-13-09 10:00:00,60000,0.6,600,O2,0,x',
    'XXBTZUSD,abc,T3,buy,2026-03-09 10:00:00,60000,0.6,600,O3,0,x',
    'XXBTZUSD,0.01,T4,buy,2026-03-09 10:00:00,60000,,600,O4,0,x',
    'XXBTZUSD,0.01,T5,buy,2026-03-09 10:00:00,60000,zz,600,O5,0,x',
    '',
  ].join('\r\n');
  const r = format.parse(built);
  assert.equal(r.rowsInFile, 5);
  assert.deepEqual(r.fills.map((f) => [f.key, f.notes, f.fee, f.time]), [
    ['kraken:T1', 'margin', '0.6', '2026-03-09T10:00:00.500Z'],
    ['kraken:T4', null, null, '2026-03-09T10:00:00.000Z'],
  ]);
  assert.deepEqual(r.skipped.map((s) => [s.row, s.reasonKey]), [
    [3, 'import.skip.date'], [4, 'import.skip.number'], [6, 'import.skip.number'],
  ]);
  invariant(r);
});

test('generator: 2,000 rows parsed under 2 s with its own expected fee total', () => {
  const g = generate({ rows: 2000 });
  try {
    const text = readFileSync(g.path, 'utf8');
    const t0 = performance.now();
    const res = format.parse(text);
    const ms = performance.now() - t0;
    assert.ok(ms < 2000, `${ms} ms`);
    assert.equal(res.rowsInFile, 2000);
    assert.equal(res.fills.length, g.fills);
    assert.equal(res.skipped.length, g.skipped);
    assert.ok(g.skipped > 0 && res.skipped.every((s) => s.reasonKey === 'import.skip.number'));
    assert.equal(sum(res.fills.map((f) => f.fee)), g.feeSum);
    assert.equal(res.sizeStep, '0.00000001');
    const counts = {};
    for (const f of res.fills) counts[f.instrument] = (counts[f.instrument] || 0) + 1;
    assert.deepEqual(counts, g.instruments);
    invariant(res);
  } finally {
    rmSync(dirname(g.path), { recursive: true, force: true });
  }
});
