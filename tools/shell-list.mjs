// Rewrites the SHELL list in sw.js from the files on disk: index.html, the manifest, and every file under css/, fonts/,
// icons/ and src/. Run after any shard adds a file the browser loads: node tools/shell-list.mjs
// tests/shell/pwa.test.mjs fails when a file is missing from the list, and `--check` exits 1 instead of writing.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const walk = (dir) => {
  let names;
  try { names = readdirSync(join(root, dir)); } catch { return []; }
  return names.flatMap((n) => {
    const rel = `${dir}/${n}`;
    return statSync(join(root, rel)).isDirectory() ? walk(rel) : [rel];
  });
};

export function shellFiles() {
  return ['index.html', 'manifest.webmanifest', ...['css', 'fonts', 'icons', 'src'].flatMap(walk)]
    .filter((f) => !f.endsWith('.DS_Store') && !f.endsWith('README.md'))
    .sort((a, b) => (a.includes('/') === b.includes('/') ? a.localeCompare(b) : a.includes('/') ? 1 : -1));
}

export const shellList = () => ['./', ...shellFiles().map((f) => `./${f}`)];

export function renderList() {
  return `const SHELL = [\n${shellList().map((f) => `  '${f}',`).join('\n')}\n];`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = join(root, 'sw.js');
  const sw = readFileSync(path, 'utf8');
  const next = sw.replace(/const SHELL = \[[\s\S]*?\n\];/, renderList());
  if (process.argv.includes('--check')) {
    if (next !== sw) { console.error('sw.js SHELL is out of date: run node tools/shell-list.mjs'); process.exit(1); }
    console.log('sw.js SHELL is current');
  } else {
    if (next !== sw) writeFileSync(path, next);
    console.log(`${shellList().length} entries in the precache list${next === sw ? ' (unchanged)' : ''}`);
  }
}
