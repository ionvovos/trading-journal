// Phone-size check of the S3 screens in headless Chrome (390x844 and 360x800, light and dark): page errors, horizontal overflow, clipped
// text, touch targets under 44 px, native controls, "null"/"undefined"/"NaN" text. Writes PNGs to the folder in $S3_OUT (default: the OS
// temp dir). Run outside the Bash sandbox (Chrome needs a local port):  node tests/review/shoot.mjs [scene ...]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { launch, sleep } from '../../e2e/lib/cdp.mjs';

const out = process.env.S3_OUT ?? join(tmpdir(), 's3-shots');
mkdirSync(out, { recursive: true });

const RUN = "document.querySelector('.empty button.btn.primary, .card.empty button.btn.primary')?.click()";
const type = (label, value) => `(() => { const l = [...document.querySelectorAll('.field label')].find((x) => x.textContent.trim() === ${JSON.stringify(label)}); const i = l?.parentElement.querySelector('input'); if (!i) return 'no ${label}'; i.value = ${JSON.stringify(value)}; i.dispatchEvent(new Event('input', { bubbles: true })); return 'ok'; })()`;
const click = (text) => `(() => { const b = [...document.querySelectorAll('button, a')].find((x) => x.textContent.trim().startsWith(${JSON.stringify(text)})); b?.click(); return b ? 'ok' : 'no ${text}'; })()`;

// [name, query, [js steps]]
export const SCENES = [
  ['review-empty', 'route=%23/review', []],
  ['review-stocks', 'route=%23/review&week=stocks', [click('All closed trades'), RUN, 'wait']],
  ['review-crypto', 'route=%23/review&week=crypto', [click('All closed trades'), RUN, 'wait']],
  ['review-forex-el', 'route=%23/review&week=forex&lang=el', [click('Όλες οι κλειστές'), RUN, 'wait']],
  ['review-paper-empty', 'route=%23/review&mode=paper', [click('All closed trades'), RUN, 'wait']],
  ['compare', 'route=%23/review/compare&week=stocks&paper=1', [click('All closed trades'), 'wait']],
  ['compare-el', 'route=%23/review/compare&week=stocks&paper=1&lang=el', [click('Όλες οι κλειστές'), 'wait']],
  ['compare-missing', 'route=%23/review/compare&week=stocks', [click('All closed trades'), 'wait']],
  ['plan-filled', 'route=%23/plan&week=stocks', []],
  ['plan-empty', 'route=%23/plan&plan=0', []],
  ['sizing-empty', 'route=%23/sizing', []],
  ['sizing-stock', 'route=%23/sizing', [type('Account equity', '10000'), type('Risk', '1'), type('Entry', '50'), type('Stop', '48'), type('Size step', '1')]],
  ['sizing-forex', 'route=%23/sizing', [click('Forex'), type('Account equity', '10000'), type('Risk', '1'), type('Stop distance', '50'), type('Pip value per lot', '10'), type('Size step', '0.01')]],
  ['sizing-forex-el', 'route=%23/sizing&lang=el', [click('Forex'), type('Κεφάλαιο λογαριασμού', '10000'), type('Ρίσκο', '1'), type('Απόσταση stop', '50'), type('Αξία pip ανά lot', '10'), type('Βήμα μεγέθους', '0,01')]],
  ['learn-r', 'route=%23/learn/r', []],
  ['learn-drawdown-el', 'route=%23/learn/drawdown&lang=el', []],
  ['learn-all', 'route=%23/learn/all', []],
  ['sentence-checklist', 'route=%23/sentence&week=stocks', []],
  ['sentence-read', 'route=%23/sentence&week=crypto&plan=0', [type('One sentence', 'bought 0,2 eth at 2410, stop 2350, breakout'), click('Read sentence')]],
  ['sentence-el-ambiguous', 'route=%23/sentence&week=crypto&plan=0&lang=el', [type('Μία πρόταση', 'πούλησα 1.085 ADA/USD στα 0,6120, στοπ 0,6300'), click('Ανάγνωση πρότασης')]],
  ['ai-settings', 'route=%23/settings/ai', []],
  ['ai-own-key', 'route=%23/settings/ai', [click('Your own key')]],
  ['ai-device', 'route=%23/settings/ai&lang=el', [click('Μοντέλο στη συσκευή')]],
];

const CHECKS = `(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const leaves = [...document.querySelectorAll('#app *, #overlay *')].filter((e) => e.children.length === 0 && e.textContent.trim() && !e.closest('.sr'));
  const clipped = leaves.filter((e) => { const s = getComputedStyle(e); return e.scrollWidth > e.clientWidth + 1 && s.overflow !== 'visible' && !e.closest('.chips'); }).map((e) => e.textContent.trim().slice(0, 40));
  const targets = [...document.querySelectorAll('#app a, #app button, #overlay a, #overlay button')].filter((e) => vis(e) && !e.disabled && !e.closest('.row, .set-row, .step, .choice')).filter((e) => {
    const r = e.getBoundingClientRect(); const a = getComputedStyle(e, '::after');
    const pad = a.content !== 'none' && a.position === 'absolute' ? Math.max(0, -parseFloat(a.top) || 0) + Math.max(0, -parseFloat(a.bottom) || 0) : 0;
    return r.height + pad < 43.5;
  }).map((e) => (e.textContent.trim() || e.getAttribute('aria-label') || e.className).slice(0, 24) + ':' + Math.round(e.getBoundingClientRect().height));
  const bad = leaves.filter((e) => /\\b(null|undefined|NaN)\\b/.test(e.textContent)).map((e) => e.textContent.trim().slice(0, 40));
  const native = document.querySelectorAll('select, input[type=date], input[type=checkbox], input[type=radio]').length;
  return { overflowX: document.documentElement.scrollWidth - innerWidth, clipped, targets, bad, native, errors: window.__errors ?? [] };
})()`;

const only = process.argv.slice(2);
const scenes = SCENES.filter(([n]) => !only.length || only.includes(n));
const b = await launch();
const report = [];
for (const [name, query, steps] of scenes) {
  for (const theme of ['light', 'dark']) {
    for (const [w, h] of [[390, 844], [360, 800]]) {
      if (theme === 'dark' && w === 360 && !only.length && !/review-stocks|ai-own-key|sizing-forex/.test(name)) continue; // one dark 360 per family keeps the run short
      await b.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
      await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }, { name: 'prefers-reduced-motion', value: 'reduce' }] });
      b.problems.length = 0;
      await b.load(`${b.base}/tests/review/harness/harness.html?${query}`, 300);
      const ready = await b.until('window.__ready === true', 8000);
      const stepResults = [];
      for (const s of steps) {
        if (s === 'wait') { await sleep(700); continue; }
        try { stepResults.push(await b.ev(s)); } catch (e) { stepResults.push(String(e.message).slice(0, 80)); }
        await sleep(350);
      }
      await sleep(250);
      const full = await b.ev('document.scrollingElement.scrollHeight');
      const shot = await b.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      writeFileSync(join(out, `${name}-${w}x${h}-${theme}.png`), Buffer.from(shot.result.data, 'base64'));
      if (full > h + 4) {
        await b.ev(`document.scrollingElement.scrollTop = ${Math.round((full - h) * 0.5)}`);
        await sleep(150);
        const s2 = await b.send('Page.captureScreenshot', { format: 'png' });
        writeFileSync(join(out, `${name}-${w}x${h}-${theme}-p2.png`), Buffer.from(s2.result.data, 'base64'));
      }
      report.push({ scene: `${name} ${w}x${h} ${theme}`, ready, steps: stepResults.filter((x) => x !== 'ok' && x !== undefined && x !== null && typeof x === 'string'), problems: b.problems.filter((p) => !/404|favicon|WebGPU/.test(p)), ...(await b.ev(CHECKS)) });
    }
  }
}
const external = b.network.filter((u) => !u.startsWith(b.base) && !u.startsWith('data:') && !u.startsWith('about:'));
await b.close();
writeFileSync(join(out, 'checks.json'), `${JSON.stringify({ external, report }, null, 1)}\n`);
const flagged = report.filter((r) => !r.ready || r.overflowX > 0 || r.clipped.length || r.targets.length || r.bad.length || r.native || r.errors.length || r.problems.length || r.steps.length);
console.log(`${report.length} pages probed, screenshots in ${out}; external requests ${external.length}; pages with findings ${flagged.length}`);
for (const r of flagged) console.log(JSON.stringify(r));
process.exit(flagged.length || external.length ? 1 : 0);
