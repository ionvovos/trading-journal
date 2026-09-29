import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { format, inferMarket } from '../../src/import/formats/generic-csv.js';
import { parseCsv } from '../../src/import/csv.js';
import { generate } from '../gen/generic-csv.mjs';

const dir = new URL('../fixtures/import/', import.meta.url);
const text = readFileSync(new URL('generic.csv', dir), 'utf8');
const expected = JSON.parse(readFileSync(new URL('generic.expected.json', dir), 'utf8'));
const sameInstant = (actual, exp, msg) => assert.equal(Date.parse(actual), Date.parse(exp), msg);
const sameNumber = (actual, exp, msg) => assert.equal(Number(actual), Number(exp), msg);
const byKey = (list, id) => list.find((x) => x.key === `gen:${id}`);

test('format contract and detect', () => {
  assert.equal(format.id, expected.format);
  assert.equal(format.statesZone, expected.statesZone);
  assert.equal(format.labelKey, 'import.format.generic');
  assert.equal(format.detect(text), 0.95);
  assert.equal(format.detect('﻿price;side;size;instrument;time\n'), 0.95, 'any order, semicolons, BOM');
  assert.equal(format.detect('time,instrument,side,size\n'), 0, 'price missing');
  assert.equal(format.detect('txid,ordertxid,pair,time,type,ordertype,price,cost,fee,vol\n'), 0);
  assert.equal(format.detect(''), 0);
});

test('fixture: 4 fills, 1 cash, 1 funding, 1 skipped and the row invariant', () => {
  const r = format.parse(text, {});
  assert.equal(r.rowsInFile, expected.rowsInFile);
  assert.equal(r.fills.length, expected.fills);
  assert.equal(r.cash.length, expected.cash.length);
  assert.equal(r.funding.length, expected.funding.length);
  assert.equal(r.skipped.length, expected.skipped.length);
  assert.equal(r.rowsInFile, r.fills.length + r.cash.length + r.funding.length + r.skipped.length);
  assert.deepEqual(r.skipped.map((s) => ({ id: s.id, reasonKey: s.reasonKey })), expected.skipped);
  assert.equal(r.skipped[0].row, 8);
  assert.match(r.skipped[0].raw, /g6/);
  assert.deepEqual(r.openAtEnd, []);
  assert.equal(r.fileSummary, null);
  assert.equal(r.sizeStep, '1');
});

test('cash and funding entries match the fixture', () => {
  const r = format.parse(text, {});
  for (const exp of expected.cash) {
    const c = byKey(r.cash, exp.id);
    assert.ok(c, exp.id);
    assert.equal(c.kind, exp.kind);
    sameNumber(c.amount, exp.amount);
    assert.equal(c.currency, exp.currency);
    sameInstant(c.time, exp.time);
    assert.equal(c.row, 2);
  }
  for (const exp of expected.funding) {
    const f = byKey(r.funding, exp.id);
    assert.ok(f, exp.id);
    assert.equal(f.instrument, exp.instrument);
    sameNumber(f.amount, exp.amount);
    assert.equal(f.amount, '-1.5', 'normalised by parseDecimal');
    assert.equal(f.currency, exp.currency);
    sameInstant(f.time, exp.time);
  }
});

test('fill times are UTC from each row offset', () => {
  const r = format.parse(text, {});
  const times = Object.fromEntries(r.fills.map((f) => [f.key, f.time]));
  assert.deepEqual(times, {
    'gen:g1': '2026-03-10T09:00:00.000Z',
    'gen:g2': '2026-03-10T10:00:00.000Z',
    'gen:g3': '2026-03-11T14:40:00.000Z',
    'gen:g4': '2026-03-11T15:00:00.000Z',
  });
  const ko = expected.trades.find((t) => t.instrument === 'KO');
  sameInstant(byKey(r.fills, 'g1').time, ko.entryUtc);
  sameInstant(byKey(r.fills, 'g2').time, ko.exitUtc);
});

test('blank fee is null, 0 is "0"; blank type is a trade', () => {
  const r = format.parse(text, {});
  assert.equal(byKey(r.fills, 'g1').fee, '0');
  assert.equal(byKey(r.fills, 'g2').fee, '0');
  assert.equal(byKey(r.fills, 'g3').fee, null, 'missing fee, the grouping step raises missing_fee');
  assert.ok(expected.anomalies.some((a) => a.kind === 'missing_fee' && a.instruments.includes('SPY')));
  const g4 = byKey(r.fills, 'g4');
  assert.ok(g4, 'blank type row became a fill');
  assert.equal(g4.fee, '1');
  assert.equal(g4.side, 'sell');
});

test('fill fields: strings as normalised, stop, setup and notes kept', () => {
  const r = format.parse(text, {});
  const g1 = byKey(r.fills, 'g1');
  assert.deepEqual(g1, {
    key: 'gen:g1', time: '2026-03-10T09:00:00.000Z', instrument: 'KO', market: 'stock', side: 'buy',
    size: '100', price: '60', fee: '0', feeCurrency: 'USD', quoteCurrency: 'USD', contractSize: '1',
    contractValue: null, positionId: null, openClose: null, broker: null,
    stop: '59', stopSource: 'file_initial', target: null, quoteToAccount: null, setup: null, notes: null, row: 3,
  });
  const ko = expected.trades.find((t) => t.instrument === 'KO');
  sameNumber(g1.stop, ko.initialStop);
  assert.equal(g1.stopSource, ko.stopSource);
  const spy = expected.trades.find((t) => t.instrument === 'SPY');
  const g3 = byKey(r.fills, 'g3');
  sameNumber(g3.stop, spy.initialStop);
  assert.equal(g3.stopSource, spy.stopSource);
  assert.equal(g3.setup, spy.setup);
  assert.equal(g3.notes, spy.notes, 'quoted notes with a comma');
  const g2 = byKey(r.fills, 'g2');
  assert.equal(g2.stop, null);
  assert.equal(g2.stopSource, null);
});

// The fixture rewritten with `;` and a decimal comma, notes quoted.
function semicolonCopy(src) {
  const { rows } = parseCsv(src);
  const numeric = new Set(['size', 'price', 'fee', 'amount', 'contract_value', 'stop']);
  const header = rows[0];
  const quote = (s) => (/[;"\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return rows.map((row, i) => row.map((cell, c) => {
    const v = i > 0 && numeric.has(header[c]) ? cell.replace('.', ',') : cell;
    return quote(v);
  }).join(';')).join('\r\n');
}

test('a semicolon, decimal-comma copy gives the same result', () => {
  const copy = semicolonCopy(text);
  assert.match(copy, /-1,50/);
  assert.equal(format.detect(copy), 0.95);
  const a = format.parse(text, {});
  const b = format.parse(copy, {});
  const strip = (r) => ({ ...r, skipped: r.skipped.map(({ raw, ...s }) => s) });
  assert.deepEqual(strip(b), strip(a));
  // A decimal-comma price with fraction digits too.
  const one = 'time;instrument;side;size;price;fee\n2026-03-10T11:00:00Z;EURUSD;buy;0,50;1,08525;2,5\n';
  const f = format.parse(one, {}).fills[0];
  assert.deepEqual([f.size, f.price, f.fee], ['0.5', '1.08525', '2.5']);
  assert.equal(format.parse(one, {}).sizeStep, '0.01');
});

test('market inference and contract size', () => {
  assert.equal(inferMarket('EURUSD'), 'forex');
  assert.equal(inferMarket('EUR/USD'), 'forex');
  assert.equal(inferMarket('BTC/USDT'), 'crypto');
  assert.equal(inferMarket('BTC-PERP'), 'crypto');
  assert.equal(inferMarket('AAPL'), 'stock');
  const rows = ['EURUSD', 'EUR/USD', 'BTC/USDT', 'BTC-PERP', 'AAPL']
    .map((ins, i) => `2026-03-10T1${i}:00:00Z,${ins},buy,1,10,${ins === 'BTC-PERP' ? '0.001' : ''},q${i}`);
  const r = format.parse(`time,instrument,side,size,price,contract_value,id\n${rows.join('\n')}\n`, {});
  assert.deepEqual(r.fills.map((f) => [f.market, f.contractSize, f.quoteCurrency, f.contractValue]), [
    ['forex', '100000', 'USD', null],
    ['forex', '100000', 'USD', null],
    ['crypto', '1', 'USDT', null],
    ['crypto', '1', null, '0.001'],
    ['stock', '1', null, null],
  ]);
  assert.ok(r.fills.every((f) => f.fee === null), 'no fee column → null');
});

test('keys without id, types, and skip reasons are catalogue keys', () => {
  const src = [
    'type,time,instrument,side,size,price,amount,currency',
    'trade,2026-03-10T11:00:00Z,KO,buy,1,60,,',
    'trade,2026-03-10T11:00:00Z,KO,buy,1,60,,',
    'withdrawal,2026-03-10T12:00:00Z,,,,,-200,USD',
    'cash,2026-03-10T12:00:00Z,,,,,5,USD',
    'trade,2026-03-10T11:00:00Z,KO,hold,1,60,,',
    'trade,2026-03-10T11:00:00Z,KO,buy,abc,60,,',
    'trade,2026-03-10T11:00:00Z,,buy,1,60,,',
    'bonus,2026-03-10T11:00:00Z,KO,buy,1,60,,',
    'trade,10/03/2026 11:00,KO,buy,1,60,,',
    '',
  ].join('\n');
  const r = format.parse(src, {});
  assert.equal(r.rowsInFile, 9);
  assert.equal(r.rowsInFile, r.fills.length + r.cash.length + r.funding.length + r.skipped.length);
  assert.deepEqual(r.fills.map((f) => f.key), [
    'gen:2026-03-10T11:00:00Z|trade|KO|buy|1|60#1',
    'gen:2026-03-10T11:00:00Z|trade|KO|buy|1|60#2',
  ]);
  assert.deepEqual(r.cash.map((c) => [c.kind, c.amount]), [['withdrawal', '-200'], ['other', '5']]);
  assert.deepEqual(r.skipped.map((s) => s.reasonKey), [
    'import.skip.side', 'import.skip.number', 'import.skip.missing', 'import.skip.type', 'import.skip.date',
  ]);
  for (const s of r.skipped) assert.match(s.reasonKey, /^import\.skip\.[a-zA-Z]+$/);
});

test('generator: 2,000 rows parsed under 2 s with its own totals', () => {
  const { text: big, expected: e } = generate(2000, 7);
  const t0 = performance.now();
  const r = format.parse(big, {});
  const ms = performance.now() - t0;
  assert.ok(ms < 2000, `${ms} ms`);
  assert.equal(r.rowsInFile, 2000);
  assert.equal(r.fills.length, e.fills);
  assert.equal(r.cash.length, e.cash);
  assert.equal(r.funding.length, e.funding);
  assert.equal(r.skipped.length, e.skipped);
  assert.ok(r.skipped.every((s) => s.reasonKey === 'import.skip.timeOffset'));
  assert.equal(r.fills.filter((f) => f.fee === null).length, e.missingFees);
  assert.equal(r.fills.filter((f) => f.stop !== null).length, e.withStop);
  const feeCents = r.fills.reduce((s, f) => s + (f.fee === null ? 0 : Math.round(Number(f.fee) * 100)), 0);
  assert.equal(feeCents, e.feeCents);
  assert.equal(new Set(r.fills.map((f) => f.key)).size, r.fills.length);
});

test('docs/generic-template.csv is the fixture header, deposit and KO rows', () => {
  const tpl = readFileSync(new URL('../../docs/generic-template.csv', import.meta.url), 'utf8');
  assert.equal(tpl.trimEnd(), text.split('\n').slice(0, 4).join('\n'));
  const r = format.parse(tpl, {});
  assert.equal(r.cash.length, 1);
  assert.equal(r.fills.length, 2);
  assert.equal(r.skipped.length, 0);
});
