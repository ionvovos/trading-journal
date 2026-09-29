// Every translation key the shell's own files use exists in the English shell catalogue (a missing key would show as the key itself).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import en from '../../src/i18n/en/shell.js';
import el from '../../src/i18n/el/shell.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const walk = (dir) => readdirSync(join(root, dir)).flatMap((n) => { const rel = `${dir}/${n}`; return statSync(join(root, rel)).isDirectory() ? walk(rel) : [rel]; });
const files = ['src/app.js', ...walk('src/ui').filter((f) => /components\/|charts\/|views\/(home|settings|about|firstRun)\.js|routes\.js/.test(f))];

test('static keys used by t() and labelKey exist in en and el', () => {
  const missing = [];
  for (const f of files) {
    const c = readFileSync(join(root, f), 'utf8');
    for (const m of c.matchAll(/\bt\('([a-zA-Z0-9_.-]+)'/g)) if (!(m[1] in en) || !(m[1] in el)) missing.push(`${f}: ${m[1]}`);
    for (const m of c.matchAll(/(?:labelKey|labelKey:)\s*[:=]?\s*'([a-zA-Z0-9_.]+)'/g)) if (!(m[1] in en)) missing.push(`${f}: ${m[1]}`);
  }
  assert.deepEqual(missing, []);
});

test('keys built from a variable have every variant in both languages', () => {
  const families = { 'mode.': ['real', 'paper'], 'label.side.': ['long', 'short', 'buy', 'sell'], 'market.': ['stock', 'crypto', 'forex'], 'first.go.': ['paper', 'import', 'hand'], 'settings.ai.engine.': ['auto', 'rules', 'on-device', 'own-key'], 'status.': ['reconciled', 'difference', 'skipped', 'notAsked'] };
  for (const [prefix, names] of Object.entries(families)) for (const n of names) { assert.ok(`${prefix}${n}` in en, `en ${prefix}${n}`); assert.ok(`${prefix}${n}` in el, `el ${prefix}${n}`); }
  for (const id of ['paper', 'import', 'hand']) { assert.ok(`first.path.${id}` in en && `first.path.${id}Sub` in en); assert.ok(`first.path.${id}` in el && `first.path.${id}Sub` in el); }
});
