// Format noise: a BOM, CRLF line ends, blank lines, a semicolon delimiter, extra columns and quoted commas must not change what a
// parser reads. Each variant is built here by a named transformation of a fixture (no model involved) and compared with the plain file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCsv } from '../../src/import/csv.js';
import { format as ibkr } from '../../src/import/formats/ibkr-activity.js';
import { format as kraken } from '../../src/import/formats/kraken-trades.js';
import { format as generic } from '../../src/import/formats/generic-csv.js';

const fx = (n) => readFileSync(new URL(`../fixtures/import/${n}`, import.meta.url), 'utf8');
const quote = (c, d) => (/["\r\n]/.test(c) || c.includes(d) ? `"${c.replace(/"/g, '""')}"` : c);
const write = (rows, d = ',', eol = '\n') => rows.map((r) => r.map((c) => quote(c, d)).join(d)).join(eol) + eol;

const TRANSFORMS = {
  bom: (text) => `﻿${text}`,
  crlf: (text) => text.replace(/\r?\n/g, '\r\n'),
  blankLines: (text) => text.split('\n').flatMap((l, i) => (i % 2 ? [l, ''] : [l])).join('\n') + '\n\n',
  bomCrlfBlank: (text) => `﻿${text.replace(/\r?\n/g, '\r\n\r\n')}`,
  semicolons: (text) => { const { rows } = parseCsv(text); return write(rows, ';'); },
  extraColumn: (text) => { const { rows } = parseCsv(text); return write(rows.map((r, i) => [...r, i === 0 ? 'extra_column' : `x${i}`])); },
  reorderedColumns: (text) => { const { rows } = parseCsv(text); return write(rows.map((r) => [...r].reverse())); },
  allQuoted: (text) => { const { rows } = parseCsv(text); return rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n') + '\n'; },
};

const strip = (result) => JSON.parse(JSON.stringify(result, (k, v) => (k === 'row' || k === 'raw' ? undefined : v)));

const cases = [
  ['kraken-trades.csv', kraken, {}, ['bom', 'crlf', 'blankLines', 'bomCrlfBlank', 'semicolons', 'extraColumn', 'reorderedColumns', 'allQuoted']],
  ['generic.csv', generic, {}, ['bom', 'crlf', 'blankLines', 'bomCrlfBlank', 'semicolons', 'extraColumn', 'reorderedColumns', 'allQuoted']],
  ['ibkr-activity.csv', ibkr, { fileZone: 'America/New_York' }, ['bom', 'crlf', 'blankLines', 'bomCrlfBlank', 'allQuoted']],
];

for (const [file, format, opts, names] of cases) {
  const plain = fx(file);
  const want = strip(format.parse(plain, opts));
  for (const name of names) {
    test(`${format.id}: ${name} reads the same as the plain file`, () => {
      const noisy = TRANSFORMS[name](plain);
      assert.ok(format.detect(noisy) >= 0.6 || name === 'reorderedColumns' || name === 'semicolons' && format.id === 'ibkr-activity', 'still detected');
      const got = strip(format.parse(noisy, opts));
      assert.equal(got.rowsInFile, want.rowsInFile);
      assert.deepEqual(got.fills, want.fills);
      assert.deepEqual(got.cash, want.cash);
      assert.deepEqual(got.funding, want.funding);
      assert.deepEqual(got.skipped.map((s) => s.reasonKey), want.skipped.map((s) => s.reasonKey));
      assert.equal(got.sizeStep, want.sizeStep);
    });
  }
}

test('generic template with decimal commas and semicolons reads the same numbers', () => {
  const plain = fx('generic.csv');
  const { rows } = parseCsv(plain);
  const commaRows = rows.map((r, i) => (i === 0 ? r : r.map((c) => (/^-?\d+\.\d+$/.test(c) ? c.replace('.', ',') : c))));
  const got = strip(generic.parse(write(commaRows, ';')));
  const want = strip(generic.parse(plain));
  assert.deepEqual(got.fills, want.fills);
  assert.deepEqual(got.funding, want.funding);
});
