// Every interface string in both languages passes the boundary guard with its scope (architecture section 5.2, AC-B1.1, AC-B1.6):
// keys under legal.* are checked by exact hash, review.* as review text, compare.* as comparison, learn.* as learn, the rest as ui.
// Runs over every shard catalogue that has landed (shell, data, review).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { check, scopeForKey } from '../../src/review/guard.js';
import { SHARDS } from '../../src/i18n/i18n.js';

const file = (l, s) => fileURLToPath(new URL(`../../src/i18n/${l}/${s}.js`, import.meta.url));

for (const shard of SHARDS) {
  for (const lang of ['en', 'el']) {
    test(`${shard} (${lang}): no string breaks the boundary`, async (tt) => {
      if (!existsSync(file(lang, shard))) return tt.skip(`${shard} catalogue has not landed`);
      const catalogue = (await import(file(lang, shard))).default;
      const failures = [];
      for (const [key, text] of Object.entries(catalogue)) {
        const scope = scopeForKey(key);
        const r = check(text, lang, { scope, key });
        if (!r.ok) failures.push(`${key} [${scope}]: ${r.hits.map((h) => `${h.class}:${h.match}`).join(', ')}`);
      }
      assert.deepEqual(failures, []);
    });
  }
}

test('nothing in the shell calls itself an advisor, coach, assistant, signal, insight, analysis, research or outlook (AC-B1.6)', async () => {
  const words = /\b(advis[eo]r|coach|assistant|signals?|insights?|analysis|research|outlook)\b/i;
  for (const lang of ['en']) {
    const c = (await import(file(lang, 'shell'))).default;
    for (const [k, v] of Object.entries(c)) if (!k.startsWith('legal.')) assert.ok(!words.test(v), `${k}: ${v}`);
  }
});

test('interface text does not use "ready" (AC-B1.1): the first review "is here"', async () => {
  const c = (await import(file('en', 'shell'))).default;
  for (const [k, v] of Object.entries(c)) if (!k.startsWith('legal.')) assert.ok(!/\bready\b/i.test(v), `${k}: ${v}`);
  assert.equal(c['home.review.here'], 'Your first review is here');
});
