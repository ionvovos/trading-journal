// i18n core and parity: a key or placeholder present in one language only fails (architecture section 6, AC-P7.1).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { formatMessage, placeholders, registerCatalogue, t, setLang, getLang, onLang, has, untranslated, SHARDS, LANGS } from '../../src/i18n/i18n.js';

const src = (l, s) => fileURLToPath(new URL(`../../src/i18n/${l}/${s}.js`, import.meta.url));
const load = async (l, s) => (await import(src(l, s))).default;

test('every shard that exists in one language exists in the other', () => {
  for (const s of SHARDS) assert.equal(existsSync(src('en', s)), existsSync(src('el', s)), `${s}: en and el files must both exist or both be absent`);
});

for (const shard of SHARDS) {
  test(`${shard}: same keys and same placeholders in en and el`, async (tt) => {
    if (!existsSync(src('en', shard))) return tt.skip(`${shard} catalogue has not landed`);
    const en = await load('en', shard); const el = await load('el', shard);
    const onlyEn = Object.keys(en).filter((k) => !(k in el)); const onlyEl = Object.keys(el).filter((k) => !(k in en));
    assert.deepEqual(onlyEn, [], `keys only in en: ${onlyEn.slice(0, 5)}`);
    assert.deepEqual(onlyEl, [], `keys only in el: ${onlyEl.slice(0, 5)}`);
    for (const k of Object.keys(en)) {
      assert.equal(typeof en[k], 'string'); assert.equal(typeof el[k], 'string');
      assert.ok(en[k].trim() && el[k].trim(), `${k} is empty`);
      assert.deepEqual(placeholders(el[k]), placeholders(en[k]), `${k}: placeholders differ`);
    }
  });
}

test('shard catalogues do not share keys (each key has one owner)', async () => {
  const seen = new Map();
  for (const s of SHARDS) {
    if (!existsSync(src('en', s))) continue;
    for (const k of Object.keys(await load('en', s))) { assert.ok(!seen.has(k), `${k} is in both ${seen.get(k)} and ${s}`); seen.set(k, s); }
  }
});

test('the Greek shell catalogue is Greek: every string has a Greek letter unless it is a Latin-term or symbol string', async () => {
  const el = await load('el', 'shell');
  const allowedLatin = new Set(['figure.n', 'home.pips', 'about.name', 'market.crypto', 'market.forex', 'label.side.long', 'label.side.short', 'settings.ai']);
  for (const [k, v] of Object.entries(el)) if (!allowedLatin.has(k)) assert.match(v, /[Ͱ-Ͽ]/, `${k} has no Greek: ${v}`);
});

test('messages: placeholders, plurals in English and Greek', () => {
  assert.equal(formatMessage('Hello {name}', { name: 'Ana' }, 'en'), 'Hello Ana');
  assert.equal(formatMessage('{n, plural, one {# trade} other {# trades}}', { n: 1 }, 'en'), '1 trade');
  assert.equal(formatMessage('{n, plural, one {# trade} other {# trades}}', { n: 5 }, 'en'), '5 trades');
  assert.equal(formatMessage('{n, plural, one {# κλειστή} other {# κλειστές}}', { n: 1 }, 'el'), '1 κλειστή');
  assert.equal(formatMessage('{n, plural, =0 {none} one {one} other {many}}', { n: 0 }, 'en'), 'none');
  assert.equal(formatMessage('a {x} b', {}, 'en'), 'a {x} b', 'an unsupplied placeholder is left visible, not printed as "undefined"');
  assert.deepEqual(placeholders('{a} and {n, plural, one {{b}} other {#}}'), ['a', 'b', 'n']);
});

test('t(): language switch, fallback to English, unknown key', () => {
  registerCatalogue('en', { 'x.only': 'English only', 'x.both': 'both en' });
  registerCatalogue('el', { 'x.both': 'both el' });
  const seen = [];
  const off = onLang((l) => seen.push(l));
  setLang('el');
  assert.equal(getLang(), 'el');
  assert.equal(t('x.both'), 'both el');
  assert.equal(t('x.only'), 'English only', 'falls back to English, never shows the key');
  assert.ok(untranslated().includes('el:x.only'), 'the fallback is recorded for the visual check');
  assert.equal(t('x.nowhere'), 'x.nowhere');
  setLang('en'); assert.equal(t('x.both'), 'both en');
  assert.deepEqual(seen, ['el', 'en']);
  assert.equal(setLang('fr'), 'en', 'an unknown language is ignored');
  assert.ok(has('x.both', 'el') && !has('x.only', 'el'));
  off();
  assert.deepEqual(LANGS, ['en', 'el']);
});
