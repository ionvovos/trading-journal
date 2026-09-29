import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCsv, detectDelimiter } from '../../src/import/csv.js';

const fx = (name) => readFileSync(new URL(`../fixtures/import/${name}`, import.meta.url), 'utf8');

test('plain rows', () => {
  const r = parseCsv('a,b,c\n1,2,3\n');
  assert.deepEqual(r.rows, [['a', 'b', 'c'], ['1', '2', '3']]);
  assert.equal(r.delimiter, ',');
  assert.deepEqual(r.lines, [1, 2]);
});

test('BOM, CRLF and CR line ends read the same as LF', () => {
  const base = parseCsv('a,b\n1,2\n3,4').rows;
  assert.deepEqual(parseCsv('﻿a,b\r\n1,2\r\n3,4\r\n').rows, base);
  assert.deepEqual(parseCsv('a,b\r1,2\r3,4').rows, base);
});

test('quoted fields: commas, doubled quotes, line breaks', () => {
  const r = parseCsv('id,note\n1,"entry after the open, first hour"\n2,"say ""hi"""\n3,"two\nlines"\n4,x');
  assert.deepEqual(r.rows[1], ['1', 'entry after the open, first hour']);
  assert.deepEqual(r.rows[2], ['2', 'say "hi"']);
  assert.deepEqual(r.rows[3], ['3', 'two\nlines']);
  assert.deepEqual(r.rows[4], ['4', 'x']);
  assert.deepEqual(r.lines, [1, 2, 3, 4, 6]);
});

test('blank lines are dropped but an empty quoted field row is kept', () => {
  assert.deepEqual(parseCsv('a,b\n\n1,2\n   \n\n3,4\n\n').rows, [['a', 'b'], ['1', '2'], ['3', '4']]);
  assert.deepEqual(parseCsv('a\n""\nb').rows, [['a'], [''], ['b']]);
});

test('empty fields and trailing delimiters', () => {
  assert.deepEqual(parseCsv('a,,c,\n,,,').rows, [['a', '', 'c', ''], ['', '', '', '']]);
});

test('semicolon detected, decimal commas kept', () => {
  const r = parseCsv('time;price;fee\n2026-03-10;60,5;1,25\n2026-03-11;61;0');
  assert.equal(r.delimiter, ';');
  assert.deepEqual(r.rows[1], ['2026-03-10', '60,5', '1,25']);
});

test('comma delimiter wins when the semicolon only appears inside quotes', () => {
  assert.equal(detectDelimiter('a,b,c\n1,"x;y;z",3\n'), ',');
});

test('delimiter can be forced', () => {
  const r = parseCsv('a;b,c\n1;2,3', { delimiter: ',' });
  assert.deepEqual(r.rows, [['a;b', 'c'], ['1;2', '3']]);
});

test('empty input', () => {
  assert.deepEqual(parseCsv('').rows, []);
  assert.deepEqual(parseCsv('\n\n').rows, []);
  assert.deepEqual(parseCsv('﻿').rows, []);
});

test('unterminated quote keeps the rest as one field', () => {
  const r = parseCsv('a,"b\nc');
  assert.deepEqual(r.rows, [['a', 'b\nc']]);
});

test('ragged rows are returned as they are', () => {
  assert.deepEqual(parseCsv('a,b,c\n1,2\n1,2,3,4').rows, [['a', 'b', 'c'], ['1', '2'], ['1', '2', '3', '4']]);
});

test('IBKR fixture: quoted date with a comma stays one cell, sections keep 16 columns on Trades rows', () => {
  const r = parseCsv(fx('ibkr-activity.csv'));
  assert.equal(r.delimiter, ',');
  const trades = r.rows.filter((c) => c[0] === 'Trades' && c[1] === 'Data');
  assert.ok(trades.length >= 8);
  assert.equal(trades[0][6], '2026-03-02, 09:40:00');
  assert.equal(trades[0].length, 16);
});

test('Kraken fixture: fully quoted header and mixed quoting', () => {
  const r = parseCsv(fx('kraken-trades.csv'));
  assert.deepEqual(r.rows[0].slice(0, 4), ['txid', 'ordertxid', 'pair', 'time']);
  assert.equal(r.rows[1][9], '0.05000000');
  assert.equal(r.rows[1].length, 13);
});

test('generic fixture, a semicolon copy with decimal commas and CRLF reads the same cells', () => {
  const a = parseCsv(fx('generic.csv'));
  assert.equal(a.rows[0].length, 17);
  assert.equal(a.rows[4][16], 'entry after the open, first hour');
  const semi = fx('generic.csv').split('\n').map((line) => {
    const cells = parseCsv(line).rows[0];
    if (!cells) return '';
    return cells.map((c) => (/[;"\n]/.test(c) ? `"${c}"` : c.replace(/^(-?\d+)\.(\d+)$/, '$1,$2'))).join(';');
  }).join('\r\n');
  const b = parseCsv(semi);
  assert.equal(b.delimiter, ';');
  assert.equal(b.rows.length, a.rows.length);
  assert.equal(b.rows[6][10], '-1,50');
  assert.equal(b.rows[4][16], 'entry after the open, first hour');
});

test('2,000 rows parse fast', () => {
  const lines = ['time,type,instrument,side,size,price'];
  for (let i = 0; i < 2000; i++) lines.push(`2026-03-10T10:00:00Z,trade,SPY,buy,${i},500.${i % 100}`);
  const t0 = Date.now();
  const r = parseCsv(lines.join('\r\n'));
  assert.equal(r.rows.length, 2001);
  assert.ok(Date.now() - t0 < 500);
});
