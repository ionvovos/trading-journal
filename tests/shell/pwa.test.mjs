// Installable and offline (architecture section 6, AC-P8.6): manifest, icons, service worker version and precache list, CSP.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { shellList, shellFiles } from '../../tools/shell-list.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const manifest = JSON.parse(read('manifest.webmanifest'));
const html = read('index.html');
const sw = read('sw.js');

const pngSize = (p) => { const b = readFileSync(join(root, p)); assert.equal(b.subarray(1, 4).toString(), 'PNG', `${p} is not a PNG`); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

test('manifest: name, id, scope, start URL, display, colours', () => {
  assert.equal(manifest.name, 'Trading Journal'); assert.equal(manifest.short_name, 'Journal');
  assert.equal(manifest.id, './'); assert.equal(manifest.scope, './'); assert.equal(manifest.start_url, './#/home');
  assert.equal(manifest.display, 'standalone');
  for (const k of ['background_color', 'theme_color']) assert.match(manifest[k], /^#[0-9a-f]{6}$/i);
});

test('manifest icons exist at their declared sizes, one maskable, and every path is relative', () => {
  const sizes = manifest.icons.map((i) => i.sizes).sort();
  assert.deepEqual(sizes, ['192x192', '512x512', '512x512']);
  assert.ok(manifest.icons.some((i) => i.purpose === 'maskable'));
  for (const i of manifest.icons) { assert.ok(!i.src.startsWith('/') && !i.src.includes('://'), i.src); const [w, h] = pngSize(i.src); assert.equal(`${w}x${h}`, i.sizes); }
  assert.deepEqual(pngSize('icons/apple-touch-icon-180.png'), [180, 180]);
});

test('manifest shortcut "Log a trade" opens the trade form', () => {
  assert.deepEqual(manifest.shortcuts.map((s) => [s.name, s.url]), [['Log a trade', './#/trade/new']]);
});

test('index.html: manifest, icons, viewport-fit, theme colours, module entry, no inline script or style', () => {
  assert.match(html, /<link rel="manifest" href="\.\/manifest\.webmanifest">/);
  assert.match(html, /rel="apple-touch-icon" href="\.\/icons\/apple-touch-icon-180\.png"/);
  assert.match(html, /viewport-fit=cover/); assert.match(html, /name="theme-color" media="\(prefers-color-scheme: dark\)"/);
  assert.match(html, /<script type="module" src="\.\/src\/app\.js"><\/script>/);
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/.test(html), 'inline script');
  assert.ok(!/\sstyle=/.test(html), 'inline style attribute');
  assert.ok(!/<style[\s>]/.test(html), '<style> block');
});

test('index.html carries the CSP of architecture section 6, verbatim', () => {
  const want = "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net 'wasm-unsafe-eval'; worker-src 'self' blob: https://cdn.jsdelivr.net; connect-src 'self' https: http://localhost:* http://127.0.0.1:*; img-src 'self' data: blob:; style-src 'self'; font-src 'self'; base-uri 'self'; object-src 'none'; form-action 'self'";
  assert.ok(html.includes(`http-equiv="Content-Security-Policy" content="${want}"`));
});

test('every stylesheet index.html links is a file, and every CSS file of the shell is linked', () => {
  const linked = [...html.matchAll(/<link rel="stylesheet" href="\.\/([^"]+)"/g)].map((m) => m[1]);
  for (const f of linked) if (!f.startsWith('css/views/')) assert.ok(existsSync(join(root, f)), `${f} is linked but missing`);
  for (const f of shellFiles().filter((x) => x.startsWith('css/'))) assert.ok(linked.includes(f), `${f} exists but index.html does not link it`);
});

test('tokens.css is design/tokens.css, unchanged', () => {
  if (!existsSync(join(root, 'design/tokens.css'))) return;
  assert.equal(read('css/tokens.css'), read('design/tokens.css'));
});

test('sw.js: version tj-v1, own cache names, the precache list is complete and lists no missing file', () => {
  assert.match(sw, /const VERSION = 'tj-v\d+';/); assert.match(sw, /const CDN_CACHE = 'tj-cdn';/);
  const m = sw.match(/const SHELL = \[([\s\S]*?)\n\];/);
  const listed = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  const disk = shellList();
  const missing = disk.filter((f) => !listed.includes(f)); const stale = listed.filter((f) => !disk.includes(f));
  assert.deepEqual(missing, [], `files the browser loads but the precache list lacks: run node tools/shell-list.mjs`);
  assert.deepEqual(stale, [], 'precache entries with no file');
  assert.equal(listed[0], './');
});

test('sw.js: only same-origin GET is cached, the CDN cache survives releases, provider requests and non-GET are never intercepted', () => {
  assert.match(sw, /if \(req\.method !== 'GET'\) return;/);
  assert.match(sw, /url\.hostname === 'cdn\.jsdelivr\.net'/);
  assert.match(sw, /name\.startsWith\('tj-v'\) && name !== VERSION/, 'activate deletes only old shell caches');
  assert.ok(!/tj-cdn/.test(sw.slice(sw.indexOf("addEventListener('activate'"), sw.indexOf("addEventListener('fetch'"))), 'activate must not touch tj-cdn');
  assert.match(sw, /Everything else, including every AI provider request, is not intercepted/);
});

test('tools/make-icons.mjs copies the design icons into icons/ byte for byte', () => {
  for (const f of ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon-180.png']) {
    if (!existsSync(join(root, 'design/icons', f))) continue;
    assert.ok(readFileSync(join(root, 'design/icons', f)).equals(readFileSync(join(root, 'icons', f))), `${f} differs from design/icons`);
  }
});
