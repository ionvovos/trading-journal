// Static rules that the CSP and the boundary need (AC-P8.2, AC-P8.8, AC-B1.2): scanned over the shell's own files.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const walk = (dir) => readdirSync(join(root, dir)).flatMap((n) => { const rel = `${dir}/${n}`; return statSync(join(root, rel)).isDirectory() ? walk(rel) : [rel]; });
const S1_JS = ['src/app.js', 'src/i18n/i18n.js', 'src/i18n/format.js', 'src/about/text.js', ...walk('src/ui').filter((f) => /^src\/ui\/(router|routes|dom|bus|ctx)\.js$|^src\/ui\/(components|charts)\//.test(f) || /^src\/ui\/views\/(home|settings|about|firstRun)\.js$/.test(f))];
const S1_CSS = walk('css').filter((f) => f.endsWith('.css') && !f.startsWith('css/views/'));
const code = (f) => readFileSync(join(root, f), 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

test('no inline styles: no style attribute in markup strings, no setAttribute("style")', () => {
  for (const f of S1_JS) {
    const c = code(f);
    assert.ok(!/setAttribute\(\s*['"]style['"]/.test(c), `${f}: setAttribute('style')`);
    assert.ok(!/['"`]\s*<[a-z][^>]*\sstyle=/.test(c), `${f}: style attribute in markup`);
    assert.ok(!/\bstyle:\s*['"`][^'"`]*:/.test(c), `${f}: a CSS string (use an object of CSS properties or a class)`); // date options also have a `style` key, hence the colon
  }
});

test('markup is never built from strings except static icons: innerHTML appears only in dom.js staticSvg', () => {
  for (const f of S1_JS) {
    const c = code(f);
    if (f === 'src/ui/dom.js') { assert.equal((c.match(/innerHTML/g) ?? []).length, 1); continue; }
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(c), `${f} builds markup from a string`);
  }
});

test('no eval, no dialogs, no cookies, no analytics', () => {
  for (const f of S1_JS) {
    const c = code(f);
    assert.ok(!/\beval\(|new Function\(|\balert\(|\bconfirm\(|\bprompt\(/.test(c), `${f}: eval or a browser dialog`);
    assert.ok(!/document\.cookie|sessionStorage|indexedDB\.open|gtag|analytics|fbq\(/.test(c.replace(/no analytics/gi, '')), `${f}: tracking or storage outside the store`);
  }
});

test('the shell touches localStorage only to read whether the own key is set and to pass it to delete-all (AC-P8.8); it never writes it', () => {
  for (const f of S1_JS) {
    const c = code(f);
    if (!/localStorage/.test(c)) continue;
    assert.ok(['src/ui/views/settings.js', 'src/app.js'].includes(f), f);
    assert.ok(!/localStorage[^;]*\.(setItem|removeItem|clear)/.test(c));
  }
});

test('no third-party URL in the shell: no font CDN, no remote stylesheet, no remote script', () => {
  for (const f of S1_CSS) { const c = readFileSync(join(root, f), 'utf8'); assert.ok(!/https?:\/\//.test(c), `${f} references a remote URL`); assert.ok(!/@import/.test(c), `${f} imports`); }
  for (const f of S1_JS) {
    const urls = [...code(f).matchAll(/https?:\/\/[^\s'"`)]+/g)].map((m) => m[0]);
    for (const u of urls) assert.ok(/^https:\/\/(github\.com\/ionvovos\/trading-journal|\$\{REPO\})/.test(u) || u.startsWith('http://www.w3.org/2000/svg'), `${f}: ${u}`);
  }
});

test('no credentials: no field asks for a broker login, password or exchange secret (AC-B1.2)', () => {
  for (const f of S1_JS) assert.ok(!/type:\s*['"]password['"]|autocomplete:\s*['"](current|new)-password/.test(code(f)), f);
});

test('CSS: only tokens for colour (no hard-coded hex outside the two documented SVG marks), reduced motion honoured, 11 px floor', () => {
  const charts = readFileSync(join(root, 'css/charts.css'), 'utf8');
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(charts), 'charts.css uses a raw colour');
  for (const f of S1_CSS.filter((x) => !x.endsWith('tokens.css'))) {
    const c = readFileSync(join(root, f), 'utf8');
    for (const m of c.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) assert.ok(Number(m[1]) >= 11, `${f}: font-size ${m[1]}px is under the 11 px floor`);
  }
  assert.match(readFileSync(join(root, 'css/app.css'), 'utf8'), /prefers-reduced-motion: reduce/);
  assert.match(readFileSync(join(root, 'css/tokens.css'), 'utf8'), /--dur-1: 0\.01ms/);
});

test('the shell has no build step and no dependency (D1): package.json lists none', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.ok(!pkg.dependencies && !pkg.devDependencies);
});
