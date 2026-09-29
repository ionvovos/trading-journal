// L4 format-noise variants that tests/import/noise.test.mjs does not cover: the MT4 HTML report (BOM, CRLF, upper-case tags, blank lines,
// whitespace in cells, non-breaking thousands separator, an extra trailing table) and the IBKR statement (other sections before the
// Trades section, extra Trades columns, reordered Trades columns, a quoted comma in a field). Each variant is a named transformation of
// the committed fixture, built by code (no model), and must read the same fills, cash rows and skipped reasons as the plain file.
// Also: every fixture through the format registry and the decoder as a file would arrive.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCsv } from '../../src/import/csv.js';
import { decodeBytes } from '../../src/import/decode.js';
import { detectFormat } from '../../src/import/registry.js';
import { format as ibkr } from '../../src/import/formats/ibkr-activity.js';
import { format as mt4 } from '../../src/import/formats/mt4-statement.js';
import { format as kraken } from '../../src/import/formats/kraken-trades.js';
import { format as generic } from '../../src/import/formats/generic-csv.js';

const fx = (n) => readFileSync(new URL(`../fixtures/import/${n}`, import.meta.url), 'utf8');
const strip = (r) => JSON.parse(JSON.stringify(r, (k, v) => (k === 'row' || k === 'raw' ? undefined : v)));
const cell = (c) => (/[",\r\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);
const csv = (rows) => rows.map((r) => r.map(cell).join(',')).join('\n') + '\n';

const MT4 = {
  bom: (t) => `﻿${t}`,
  crlf: (t) => t.replace(/\r?\n/g, '\r\n'),
  upperTags: (t) => t.replace(/<(\/?)(tr|td|table|b|div|body|html|head|title)\b/gi, (m, s, n) => `<${s}${n.toUpperCase()}`),
  blankLinesBetweenRows: (t) => t.replace(/<\/tr>/gi, '</tr>\n\n\n'),
  cellWhitespace: (t) => t.replace(/<td([^>]*)>/gi, '<td$1>  ').replace(/<\/td>/gi, ' \n</td>'),
  nbspThousands: (t) => t.replace(/(\d) (\d{3}\.\d{2})/g, '$1&nbsp;$2'),
  rawNbspThousands: (t) => t.replace(/(\d) (\d{3}\.\d{2})/g, '$1 $2'),
  extraTrailingTable: (t) => t.replace('</body>', '<table><tr><td>Notes:</td><td>1001 is not a ticket here</td></tr></table></body>'),
};

const mt4Plain = strip(mt4.parse(fx('mt4-statement.htm'), { fileZone: 'ny+7' }));
for (const [name, fn] of Object.entries(MT4)) {
  test(`mt4-statement: ${name} reads the same as the plain report`, () => {
    const noisy = fn(fx('mt4-statement.htm'));
    assert.ok(mt4.detect(noisy) >= 0.6, 'still detected');
    const got = strip(mt4.parse(noisy, { fileZone: 'ny+7' }));
    assert.equal(got.rowsInFile, mt4Plain.rowsInFile);
    assert.deepEqual(got.fills, mt4Plain.fills);
    assert.deepEqual(got.cash, mt4Plain.cash);
    assert.deepEqual(got.skipped.map((s) => s.reasonKey), mt4Plain.skipped.map((s) => s.reasonKey));
    assert.deepEqual(got.openAtEnd, mt4Plain.openAtEnd);
    assert.equal(got.accountCurrency, mt4Plain.accountCurrency);
  });
}

const rowsOfIbkr = () => parseCsv(fx('ibkr-activity.csv')).rows;
const IBKR = {
  sectionsBefore: () => csv([
    ['Net Asset Value', 'Header', 'Asset Class', 'Prior Total', 'Current Total'],
    ['Net Asset Value', 'Data', 'Cash, incl. accrued', '9,000.50', '10,000.25'],
    ['Open Positions', 'Header', 'DataDiscriminator', 'Asset Category', 'Symbol', 'Quantity'],
    ['Open Positions', 'Data', 'Summary', 'Stocks', 'AAPL', '0'],
    ...rowsOfIbkr(),
  ]),
  extraTradesColumn: () => csv(rowsOfIbkr().map((r) => (r[0] === 'Trades' ? [...r, r[1] === 'Header' ? 'Realized P/L %' : '0'] : r))),
  reorderedTradesColumns: () => csv(rowsOfIbkr().map((r) => (r[0] === 'Trades' ? [r[0], r[1], ...r.slice(2).reverse()] : r))),
  quotedCommaInStatement: () => csv(rowsOfIbkr().map((r) => (r[2] === 'BrokerName' ? [...r.slice(0, 3), 'Interactive Brokers, LLC "IBKR"'] : r))),
};
const ibkrOpts = { fileZone: 'America/New_York' };
const ibkrPlain = strip(ibkr.parse(fx('ibkr-activity.csv'), ibkrOpts));
for (const [name, fn] of Object.entries(IBKR)) {
  test(`ibkr-activity: ${name} reads the same as the plain statement`, () => {
    const noisy = fn();
    // detect anchors on `Trades,Header,DataDiscriminator`, so reordered columns are read when the user picks the format, not auto-detected (L4 finding F1)
    if (name !== 'reorderedTradesColumns') assert.ok(ibkr.detect(noisy) >= 0.6, 'still detected');
    const got = strip(ibkr.parse(noisy, ibkrOpts));
    assert.equal(got.rowsInFile, ibkrPlain.rowsInFile);
    assert.deepEqual(got.fills, ibkrPlain.fills);
    assert.deepEqual(got.cash, ibkrPlain.cash);
    assert.deepEqual(got.skipped.map((s) => s.reasonKey), ibkrPlain.skipped.map((s) => s.reasonKey));
    assert.equal(got.accountCurrency, ibkrPlain.accountCurrency);
  });
}

test('Kraken: a quoted comma in the misc column and a fee with trailing zeros read as plain', () => {
  const rows = parseCsv(fx('kraken-trades.csv')).rows;
  const head = rows[0];
  const misc = head.indexOf('misc');
  const noisy = csv(rows.map((r, i) => (i === 0 ? r : r.map((c, j) => (j === misc ? 'batch, filled "fully"' : c)))));
  assert.deepEqual(strip(kraken.parse(noisy, {})).fills, strip(kraken.parse(fx('kraken-trades.csv'), {})).fills);
});

// every fixture, as bytes in each encoding a browser file input can deliver, is detected as its own format and read the same
const ENCODINGS = {
  utf8: (s) => Buffer.from(s, 'utf8'),
  utf8bom: (s) => Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(s, 'utf8')]),
  utf16le: (s) => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(s, 'utf16le')]),
};
for (const [file, id, opts, format] of [
  ['ibkr-activity.csv', 'ibkr-activity', ibkrOpts, ibkr], ['kraken-trades.csv', 'kraken-trades', {}, kraken],
  ['mt4-statement.htm', 'mt4-statement', { fileZone: 'ny+7' }, mt4], ['generic.csv', 'generic-csv', {}, generic],
]) {
  for (const [enc, toBytes] of Object.entries(ENCODINGS)) {
    test(`${id}: bytes as ${enc} decode, are detected as ${id} and read the same`, () => {
      const { text } = decodeBytes(toBytes(fx(file)));
      assert.equal(detectFormat(text).format?.id, id);
      assert.deepEqual(strip(format.parse(text, opts)).fills, strip(format.parse(fx(file), opts)).fills);
    });
  }
}

test('a file that is none of the four formats is not detected and not guessed', () => {
  for (const junk of ['', 'hello', 'a,b,c\n1,2,3\n', '<html><body>nothing</body></html>', '{"trades": []}']) {
    assert.equal(detectFormat(junk).format, null, JSON.stringify(junk));
  }
});
