import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { FORMAT_IDS, MIN_CONFIDENCE, formats, loadFormats, getFormat, detectFormat } from '../../src/import/registry.js';

test('registry lists the four named formats', () => {
  assert.deepEqual(FORMAT_IDS, ['ibkr-activity', 'kraken-trades', 'mt4-statement', 'generic-csv']);
  assert.equal(MIN_CONFIDENCE, 0.6);
});

test('loadFormats loads exactly the modules that exist and keeps registry order', async () => {
  const list = await loadFormats();
  assert.equal(list, formats);
  const onDisk = FORMAT_IDS.filter((id) => existsSync(new URL(`../../src/import/formats/${id}.js`, import.meta.url)));
  assert.deepEqual(formats.map((f) => f.id), onDisk);
  for (const f of formats) {
    assert.equal(typeof f.detect, 'function', f.id);
    assert.equal(typeof f.parse, 'function', f.id);
    assert.ok(['stock', 'crypto', 'forex', 'any'].includes(f.market), f.id);
    assert.equal(typeof f.statesZone, 'boolean', f.id);
    assert.equal(typeof f.labelKey, 'string', f.id);
  }
});

test('detectFormat returns no format for text nobody claims', async () => {
  await loadFormats();
  const r = detectFormat('just some words\nno table here\n');
  assert.equal(r.format, null);
  assert.equal(r.score, 0);
  assert.equal(r.scores.length, formats.length);
});

test('detectFormat picks the highest score at or above the threshold (stub formats)', async () => {
  await loadFormats();
  const saved = formats.splice(0, formats.length);
  try {
    const stub = (id, score) => ({ id, market: 'any', labelKey: `import.format.${id}`, statesZone: true, detect: () => score, parse: () => ({}) });
    formats.push(stub('a', 0.59), stub('b', 0.7), stub('c', 0.95), stub('d', 0.95));
    const r = detectFormat('x');
    assert.equal(r.format.id, 'c', 'highest score, first registered wins a tie');
    assert.equal(r.score, 0.95);
    formats.length = 0;
    formats.push(stub('a', 0.59), stub('b', 0));
    assert.equal(detectFormat('x').format, null, 'below 0.6 asks the user');
    assert.equal(getFormat('a').id, 'a');
    assert.equal(getFormat('zzz'), null);
  } finally {
    formats.length = 0;
    formats.push(...saved);
  }
});
