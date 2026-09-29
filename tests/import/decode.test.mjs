import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeBytes } from '../../src/import/decode.js';

const utf16le = (s, bom = true) => { const out = []; if (bom) out.push(0xff, 0xfe); for (const ch of s) { const c = ch.charCodeAt(0); out.push(c & 255, c >> 8); } return new Uint8Array(out); };

test('UTF-8 with and without a BOM', () => {
  assert.deepEqual(decodeBytes(new TextEncoder().encode('a,b\n€,ü')), { text: 'a,b\n€,ü', encoding: 'utf-8' });
  const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('x')]);
  assert.deepEqual(decodeBytes(withBom), { text: 'x', encoding: 'utf-8' });
});

test('UTF-16 with a BOM and without (MetaTrader reports)', () => {
  const html = '<html><td>Ticket</td><td>1 000.00</td></html>';
  assert.deepEqual(decodeBytes(utf16le(html)), { text: html, encoding: 'utf-16le' });
  assert.deepEqual(decodeBytes(utf16le(html, false)), { text: html, encoding: 'utf-16le' });
  const be = new Uint8Array([0xfe, 0xff, 0x00, 0x41, 0x00, 0x42]);
  assert.deepEqual(decodeBytes(be), { text: 'AB', encoding: 'utf-16be' });
});

test('Windows-1252 when the bytes are not UTF-8', () => {
  const bytes = new Uint8Array([0x63, 0x61, 0x66, 0xe9, 0x2c, 0x80]); // "café,€"
  assert.deepEqual(decodeBytes(bytes), { text: 'café,€', encoding: 'windows-1252' });
});

test('empty and tiny inputs', () => {
  assert.deepEqual(decodeBytes(new Uint8Array()), { text: '', encoding: 'utf-8' });
  assert.deepEqual(decodeBytes(new TextEncoder().encode('a')), { text: 'a', encoding: 'utf-8' });
});
