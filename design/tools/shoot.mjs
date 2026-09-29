// Screenshots every mockup, every scrolled page, at true phone viewports (390x844 and 360x800), light and dark.
// Output: design/screens/<name>-<w>x<h>-<light|dark>-p<n>.png. Run outside the Bash sandbox: node design/tools/shoot.mjs [name ...]
// Uses CDP device emulation, not --window-size: headless Chrome keeps a minimum window width of about 500 px.
// A screen whose sheet scrolls inside itself is paged by scrolling the sheet body instead of the document.
import { readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, sleep } from './cdp.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const all = JSON.parse(readFileSync(join(root, 'tools', 'screens.json'), 'utf8')).map((s) => s.name);
const only = process.argv.slice(2);
const names = only.length ? only : all;
if (!only.length) for (const f of readdirSync(join(root, 'screens'))) if (f.endsWith('.png')) unlinkSync(join(root, 'screens', f));

const CHECKS = `(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const leaves = [...document.querySelectorAll('body *')].filter((e) => e.children.length === 0 && e.textContent.trim() && !e.closest('.sr') && !e.closest('.statusbar'));
  const clipped = leaves.filter((e) => { const s = getComputedStyle(e); return e.scrollWidth > e.clientWidth + 1 && s.overflow !== 'visible'; }).map((e) => e.textContent.trim().slice(0, 40));
  const small = leaves.filter((e) => vis(e) && parseFloat(getComputedStyle(e).fontSize) * (e.closest('svg') ? e.closest('svg').getBoundingClientRect().width / e.closest('svg').viewBox.baseVal.width || 1 : 1) < 10.5).map((e) => e.textContent.trim().slice(0, 30));
  const targets = [...document.querySelectorAll('a, button')].filter((e) => vis(e) && !e.closest('[aria-hidden=true]') && !e.closest('.row, .set-row, .step, .choice') && !e.disabled).filter((e) => {
    const r = e.getBoundingClientRect(); const a = getComputedStyle(e, '::after');
    const pad = a.content !== 'none' && a.position === 'absolute' ? Math.max(0, -parseFloat(a.top) || 0) + Math.max(0, -parseFloat(a.bottom) || 0) : 0;
    return r.height + pad < 43.5;
  }).map((e) => (e.textContent.trim() || e.getAttribute('aria-label') || e.className).slice(0, 24) + ':' + Math.round(e.getBoundingClientRect().height));
  const native = [...document.querySelectorAll('select, input, textarea')].length;
  return { overflowX: document.documentElement.scrollWidth - innerWidth, clipped, small, targets, native };
})()`;
const SCROLLER = `(() => { const b = document.querySelector('.sheet-body'); return b && b.scrollHeight > b.clientHeight + 4 ? '.sheet-body' : ''; })()`;

const b = await launch();
const report = [];
let shots = 0;
for (const n of names) {
  for (const theme of ['light', 'dark']) {
    for (const [w, h] of [[390, 844], [360, 800]]) {
      await b.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
      await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }, { name: 'prefers-reduced-motion', value: 'reduce' }] });
      await b.load(`${b.base}/mockups/${n}.html`, 700);
      const sel = await b.ev(SCROLLER);
      const el = sel ? `document.querySelector('${sel}')` : 'document.scrollingElement';
      const [full, view] = await b.ev(`[${el}.scrollHeight, ${el}.clientHeight]`);
      const step = Math.round(view * 0.72);
      const pages = full > view + 4 ? 1 + Math.ceil((full - view) / step) : 1;
      for (let p = 0; p < pages; p += 1) {
        await b.ev(`${el}.scrollTop = ${Math.min(p * step, full - view)}`);
        await sleep(120);
        if (p === 0 || p === pages - 1) report.push({ png: `${n}-${w}x${h}-${theme}-p${p + 1}`, ...(await b.ev(CHECKS)) });
        const shot = await b.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        writeFileSync(join(root, 'screens', `${n}-${w}x${h}-${theme}-p${p + 1}.png`), Buffer.from(shot.result.data, 'base64'));
        shots += 1;
      }
    }
  }
}
await sleep(100);
const external = b.network.filter((u) => !u.startsWith(b.base) && !u.startsWith('data:'));
await b.close();
const bad = (k) => report.filter((r) => (Array.isArray(r[k]) ? r[k].length : r[k] > 0));
console.log(`${shots} screenshots of ${names.length} screens; overflow ${bad('overflowX').length}; clipped ${bad('clipped').length}; under 11px ${bad('small').length}; targets under 44px ${bad('targets').length}; native controls ${bad('native').length}; external requests ${external.length}; console problems ${b.problems.length}`);
for (const k of ['overflowX', 'clipped', 'small', 'targets', 'native']) for (const r of bad(k)) console.log(k.toUpperCase(), r.png, JSON.stringify(r[k]));
for (const p of b.problems) console.log('PROBLEM', p);
for (const u of external) console.log('EXTERNAL', u);
