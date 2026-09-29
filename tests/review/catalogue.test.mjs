// The S3 catalogues (src/i18n/{en,el}/review.js): same keys and placeholders in both languages, every string passes the boundary scan
// with the scope of its key (guard.scopeForKey), and every key the S3 views ask for exists.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import en from '../../src/i18n/en/review.js';
import el from '../../src/i18n/el/review.js';
import { placeholders } from '../../src/i18n/i18n.js';
import { check, scopeForKey } from '../../src/review/guard.js';
import { TITLES } from '../../src/review/templates.js';

test('English and Greek have the same keys and the same placeholders', () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(el).sort());
  for (const k of Object.keys(en)) assert.deepEqual(placeholders(el[k]), placeholders(en[k]), k);
});

for (const [lang, cat] of [['en', en], ['el', el]]) {
  test(`${lang}: every string passes the boundary scan with the scope of its key`, () => {
    for (const [key, text] of Object.entries(cat)) {
      const scope = scopeForKey(key);
      assert.notEqual(scope, 'legal', `${key} is not a legal text`);
      // placeholders are replaced by a neutral number so the sentence shape is checked, not the braces
      const plain = text.replace(/\{(\w+), plural, one \{([^}]*)\} other \{([^}]*)\}\}/g, (_, n, one, other) => other).replaceAll('#', '3').replace(/\{\w+\}/g, '3');
      const res = check(plain, lang, { scope, key });
      assert.deepEqual(res.hits.map((h) => `${h.class}:${h.match}`), [], `${lang} ${key}: ${text}`);
    }
  });
}

test('no string uses a word the requirements ban for interface text', () => {
  const banned = /\b(advisor|adviser|coach|assistant|signal|insight|outlook|ready|best|worst)\b/i;
  for (const [k, v] of Object.entries(en)) assert.equal(banned.test(v), false, `${k}: ${v}`);
});

test('the keys the S3 views ask for exist in both catalogues', () => {
  const dir = new URL('../../src/ui/views/', import.meta.url);
  const files = readdirSync(dir).filter((f) => ['plan', 'checklist', 'sizing', 'review', 'learn', 'sentence', 'aiSettings'].includes(f.replace('.js', '')));
  assert.ok(files.length >= 7, `views present: ${files.join(', ')}`);
  const wanted = new Set();
  const dynamic = new Set();
  for (const f of files) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    for (const m of src.matchAll(/\bt\('([\w.-]+)'/g)) wanted.add(m[1]);
    for (const m of src.matchAll(/\bt\(`([\w.-]*)\$\{/g)) dynamic.add(m[1]);
  }
  for (const k of wanted) {
    if (k.startsWith('nav.') || k.startsWith('mode.') || k.startsWith('market.') || k.startsWith('label.') || k.startsWith('sheet.') || k.startsWith('form.') || k.startsWith('figure.') || k.startsWith('settings.')) continue; // S1 and S2 catalogues
    assert.ok(k in en, `missing en key ${k}`);
    assert.ok(k in el, `missing el key ${k}`);
  }
  for (const prefix of dynamic) {
    if (/^(market|label|mode|form|settings)\./.test(prefix)) continue;
    assert.ok(Object.keys(en).some((k) => k.startsWith(prefix)), `no en key with prefix ${prefix}`);
  }
});

test('the pattern titles of the templates equal the catalogue titles, in both languages', () => {
  for (const [lang, cat] of [['en', en], ['el', el]]) {
    for (const [pattern, title] of Object.entries(TITLES[lang])) assert.equal(cat[`review.ui.title.${pattern}`], title, `${lang} ${pattern}`);
    assert.equal(Object.keys(TITLES[lang]).length, Object.keys(cat).filter((k) => k.startsWith('review.ui.title.')).length);
  }
});
