// V2 repair G8: system Back leaves the checklist (an overlay above the trade form) and the plan-check sheet; neither stays on the next screen.
//   node e2e/back-nav.mjs        (run outside the Bash sandbox; exit 1 on a failed check)
import { launch, sleep } from './lib/cdp.mjs';

const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: Boolean(cond), detail: cond ? '' : String(detail).slice(0, 300) });
const b = await launch({});
await b.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await b.load(`${b.base}/tests/review/harness/harness.html?route=%23/settings&week=stocks&lang=en`, 600);
ok('shell mounted', await b.until('window.__ready === true', 15000));
await b.ev("location.hash = '#/trade/new'");
ok('the checklist overlay opens on the trade form', await b.until("!!document.querySelector('.screen-overlay')", 6000));
await b.ev('history.back()');
await sleep(600);
ok('after system Back the URL is Settings and no overlay is left on screen', (await b.ev('location.hash')) === '#/settings' && (await b.ev("document.querySelectorAll('.screen-overlay').length")) === 0, await b.ev('location.hash'));
ok('the Settings screen is what shows', await b.until("!!document.querySelector('main .set-row, .content')", 3000));

// the plan-check sheet after a save: it follows the save to the journal, then closes on Back
await b.ev("location.hash = '#/home'");
await sleep(300);
await b.ev(`(async () => {
  const { afterSave } = await import('/src/ui/views/checklist.js');
  const s = window.__store; const plan = (await s.plans.getAll())[0]; const tr = (await s.trades.getAll())[0];
  const ctx = window.__app.ctx ?? null;
  window.__afterSave = { plan: !!plan, trade: !!tr, ctx: !!ctx };
})()`);
const info = await b.ev('window.__afterSave');
if (info?.ctx) {
  await b.ev(`(async () => { const { afterSave } = await import('/src/ui/views/checklist.js'); const tr = (await window.__store.trades.getAll())[0]; location.hash = '#/journal'; await afterSave(window.__app.ctx, tr); })()`);
  ok('the plan-check sheet opens', await b.until("!!document.querySelector('.sheet')", 4000));
  await sleep(700);
  await b.ev('history.back()');
  await sleep(600);
  ok('system Back closes the plan-check sheet', (await b.ev("document.querySelectorAll('.sheet').length")) === 0);
} else console.log('NOTE the harness does not expose ctx; the sheet check was skipped');
await b.close();
for (const x of checks) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.name}${x.detail ? `  [${x.detail}]` : ''}`);
process.exit(checks.every((x) => x.ok) ? 0 : 1);
