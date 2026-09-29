// Screenshots every mockup into design/screens/ at true phone viewports, light and dark.
// Run outside the Bash sandbox: node design/tools/shoot.mjs [name ...]
// Uses CDP device emulation, not --window-size: headless Chrome keeps a minimum window width of
// about 500 px, so a 390 px --window-size screenshot is a crop of a wider layout.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, sleep } from './cdp.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const all = JSON.parse(readFileSync(join(root, 'tools', 'screens.json'), 'utf8')).map((s) => s.name);
const only = process.argv.slice(2);
const names = only.length ? only : all;
export const KEY = ['dashboard', 'log-trade', 'reconcile-difference', 'stats', 'dashboard-el'];

const b = await launch();
const report = [];
for (const n of names) {
  for (const theme of ['light', 'dark']) {
    const sizes = [[390, 844]];
    if (KEY.includes(n)) sizes.push([360, 800]);
    for (const [w, h] of sizes) {
      await b.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
      await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }, { name: 'prefers-reduced-motion', value: 'reduce' }] });
      await b.load(`${b.base}/mockups/${n}.html`, 900);
      const overflow = await b.ev('document.documentElement.scrollWidth - innerWidth');
      // text that is clipped by its own box (ellipsis or overflow) is reported so it can be checked by eye
      const clipped = await b.ev(`[...document.querySelectorAll('body *')].filter(e => { const s = getComputedStyle(e); return e.children.length === 0 && !e.closest('.sr') && e.textContent.trim() && e.scrollWidth > e.clientWidth + 1 && s.overflow !== 'visible'; }).map(e => e.textContent.trim().slice(0, 40))`);
      const small = await b.ev(`[...document.querySelectorAll('body *')].filter(e => e.children.length === 0 && e.textContent.trim() && !e.closest('.statusbar') && e.getBoundingClientRect().width > 0 && parseFloat(getComputedStyle(e).fontSize) * (e.closest('svg') ? e.closest('svg').getBoundingClientRect().width / e.closest('svg').viewBox.baseVal.width || 1 : 1) < 10.5).map(e => e.textContent.trim().slice(0, 30))`);
      const smallTargets = await b.ev(`[...document.querySelectorAll('a, button')].filter(e => { if (e.closest('.statusbar') || e.closest('[aria-hidden=true]')) return false; const r = e.getBoundingClientRect(); if (!r.width) return false; const a = getComputedStyle(e, '::after'); const pad = a.content !== 'none' && a.position === 'absolute' ? Math.max(0, -parseFloat(a.top) || 0) + Math.max(0, -parseFloat(a.bottom) || 0) : 0; return Math.max(r.height + pad, 0) < 43.5 && r.height > 0 && !(e.closest('.row, .set-row, .step, .card[href], .banner, .choice')); }).map(e => (e.textContent.trim() || e.getAttribute('aria-label') || e.className).slice(0, 24) + ':' + Math.round(e.getBoundingClientRect().height))`);
      const shot = await b.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      const png = join(root, 'screens', `${n}-${w}x${h}-${theme}.png`);
      writeFileSync(png, Buffer.from(shot.result.data, 'base64'));
      report.push({ png: png.slice(root.length + 1), overflowX: overflow, clipped, small, smallTargets });
    }
  }
}
await sleep(100);
const external = b.network.filter((u) => !u.startsWith(b.base) && !u.startsWith('data:'));
await b.close();
const bad = report.filter((r) => r.overflowX > 0);
console.log(`${report.length} screenshots; horizontal overflow on ${bad.length}; external requests ${external.length}; console problems ${b.problems.length}`);
for (const r of bad) console.log('OVERFLOW', r.png, r.overflowX);
for (const r of report) if (r.clipped.length) console.log('CLIPPED', r.png, JSON.stringify(r.clipped));
for (const r of report) if (r.small.length) console.log('UNDER-11PX', r.png, JSON.stringify(r.small));
for (const r of report) if (r.smallTargets.length && r.png.includes('390x844-light')) console.log('TARGET<44', r.png, JSON.stringify(r.smallTargets));
for (const p of b.problems) console.log('PROBLEM', p);
for (const u of external) console.log('EXTERNAL', u);
