// Renders the S1 screens headless at 390x844 and 360x800, light and dark, every scrolled page, into e2e/out/S1/, with probes for
// horizontal overflow, clipped text, text under 10.5 px, touch targets under 44 px, native controls, "null"/"undefined"/"NaN" text
// and elements past the viewport. Run outside the Bash sandbox (Chrome needs a local port):
//   node e2e/lib/shoot-s1.mjs [screen ...]
import { mkdirSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, sleep } from './cdp.mjs';
import { SCREENS } from './scenes-s1.js';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'out', 'S1');
mkdirSync(out, { recursive: true });
const only = process.argv.slice(2);
const names = only.length ? only : Object.keys(SCREENS);
if (!only.length) for (const f of readdirSync(out)) if (f.endsWith('.png')) unlinkSync(join(out, f));

const CHECKS = `(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const leaves = [...document.querySelectorAll('#app *, #overlay *')].filter((e) => e.children.length === 0 && e.textContent.trim() && !e.closest('.sr'));
  const clipped = leaves.filter((e) => { const s = getComputedStyle(e); return e.scrollWidth > e.clientWidth + 1 && s.overflow !== 'visible' && !e.closest('.chips'); }).map((e) => e.textContent.trim().slice(0, 40));
  const small = leaves.filter((e) => vis(e) && parseFloat(getComputedStyle(e).fontSize) * (e.closest('svg') ? e.closest('svg').getBoundingClientRect().width / e.closest('svg').viewBox.baseVal.width || 1 : 1) < 10.5).map((e) => e.textContent.trim().slice(0, 30));
  const targets = [...document.querySelectorAll('#app a, #app button, #overlay a, #overlay button')].filter((e) => vis(e) && !e.disabled && !e.closest('.row, .set-row, .step, .choice')).filter((e) => {
    const r = e.getBoundingClientRect(); const a = getComputedStyle(e, '::after');
    const pad = a.content !== 'none' && a.position === 'absolute' ? Math.max(0, -parseFloat(a.top) || 0) + Math.max(0, -parseFloat(a.bottom) || 0) : 0;
    return r.height + pad < 43.5;
  }).map((e) => (e.textContent.trim() || e.getAttribute('aria-label') || e.className).slice(0, 24) + ':' + Math.round(e.getBoundingClientRect().height));
  const native = [...document.querySelectorAll('select, input[type=date], input[type=checkbox], input[type=radio]')].length;
  const bad = leaves.filter((e) => /\\b(null|undefined|NaN)\\b/.test(e.textContent)).map((e) => e.textContent.trim().slice(0, 40));
  const clippedByAncestor = (e) => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o !== 'visible') return true; } return false; };
  const offscreen = [...document.querySelectorAll('#app *, #overlay *')].filter((e) => vis(e) && !e.closest('.sr')).filter((e) => { const r = e.getBoundingClientRect(); return (r.right > innerWidth + 1 || r.left < -1) && !clippedByAncestor(e); }).map((e) => (e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className || e.tagName).toString().slice(0, 30));
  return { overflowX: document.documentElement.scrollWidth - innerWidth, clipped, small, targets, native, bad, offscreen };
})()`;

const KNOWN_ABSENT = /(en|el)\/(data|review)\.js|css\/views\/(data|review)\.css|storage\/(idb|index|summary)|stats\/summary|import\/summary|404/;

const b = await launch();
const report = [];
let shots = 0;
for (const n of names) {
  for (const theme of ['light', 'dark']) {
    for (const [w, h] of [[390, 844], [360, 800]]) {
      await b.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
      await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }, { name: 'prefers-reduced-motion', value: 'reduce' }] });
      b.problems.length = 0;
      await b.load(`${b.base}/e2e/lib/harness.html?screen=${n}`, 300);
      const ready = await b.until('window.__ready === true', 8000);
      const full = await b.ev('document.scrollingElement.scrollHeight');
      const step = Math.round(h * 0.72);
      const pages = full > h + 4 ? 1 + Math.ceil((full - h) / step) : 1;
      for (let p = 0; p < pages; p += 1) {
        await b.ev(`document.scrollingElement.scrollTop = ${Math.min(p * step, full - h)}`);
        await sleep(150);
        if (p === 0 || p === pages - 1) report.push({ png: `${n}-${w}x${h}-${theme}-p${p + 1}`, ready, problems: b.problems.filter((x) => !KNOWN_ABSENT.test(x)), ...(await b.ev(CHECKS)) });
        const shot = await b.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        writeFileSync(join(out, `${n}-${w}x${h}-${theme}-p${p + 1}.png`), Buffer.from(shot.result.data, 'base64'));
        shots += 1;
      }
    }
  }
}
await sleep(100);
const external = b.network.filter((u) => !u.startsWith(b.base) && !u.startsWith('data:') && !u.startsWith('about:'));
await b.close();
writeFileSync(join(out, 'checks.json'), `${JSON.stringify({ shots, external, report }, null, 1)}\n`);
const flagged = report.filter((r) => !r.ready || r.overflowX > 0 || r.clipped.length || r.small.length || r.targets.length || r.native || r.bad.length || r.offscreen.length || r.problems.length);
console.log(`${shots} screenshots in ${out}; ${report.length} probed pages; external requests: ${external.length}; pages with findings: ${flagged.length}`);
for (const r of flagged) console.log(JSON.stringify(r));
process.exit(flagged.length || external.length ? 1 : 0);
