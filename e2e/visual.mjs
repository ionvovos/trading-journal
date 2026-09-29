// L4 visual check on the real app (real index.html, IndexedDB), driven through real flows so the screens hold real data.
//   node e2e/visual.mjs [en|el|all] [screen ...]
// Seeds a journal (three broker accounts by importing the fixtures, a paper account with trades, a plan), then visits every screen and state
// that can be reached in a live session, at 390x844 and 360x800, light and dark, every scrolled page, and writes
// e2e/out/L4/<screen>[-el]-<w>x<h>-<theme>-p<n>.png (the naming of design/screens) plus e2e/out/L4/visual.json with the probe results:
// horizontal overflow, clipped text, elements past the viewport, targets under 44 px, native controls, "NaN/undefined/null", text under
// 4.5:1 contrast, console errors, external requests. Run outside the Bash sandbox. Exit 1 on any finding.
import { mkdirSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open, sleep, upload, answerAll, PROBE } from './lib/flow.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'out', 'L4');
mkdirSync(out, { recursive: true });
const FX = join(here, '..', 'tests', 'fixtures', 'import') + '/';
const args = process.argv.slice(2);
const langs = args[0] === 'el' ? ['el'] : args[0] === 'all' ? ['en', 'el'] : ['en'];
const only = args.slice(['en', 'el', 'all'].includes(args[0]) ? 1 : 0);

// text contrast of the visible text leaves against the nearest opaque ancestor background
const CONTRAST = `(() => {
  const parse = (c) => { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(',').map((x) => parseFloat(x)); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const bgOf = (e) => { for (let p = e; p; p = p.parentElement) { const c = parse(getComputedStyle(p).backgroundColor); if (c && c.a > 0.95) return c; } return { r: 255, g: 255, b: 255, a: 1 }; };
  const bad = [];
  for (const e of document.querySelectorAll('#app *, #overlay *')) {
    if (e.children.length || !e.textContent.trim() || e.closest('.sr, svg')) continue;
    const r = e.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const s = getComputedStyle(e); const fg = parse(s.color); if (!fg) continue;
    const bg = bgOf(e); const a = fg.a;
    const mix = { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a) };
    const l1 = lum(mix); const l2 = lum(bg); const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const big = parseFloat(s.fontSize) >= 24 || (parseFloat(s.fontSize) >= 18.66 && parseInt(s.fontWeight, 10) >= 700);
    if (ratio < (big ? 3 : 4.5) && !e.closest('[disabled], .off')) bad.push(e.textContent.trim().slice(0, 24) + ':' + ratio.toFixed(2));
  }
  return bad.slice(0, 8);
})()`;

const report = [];
let shots = 0;
const external = new Set();

async function sweep(f, name, suffix) {
  const key = `${name}${suffix}`;
  for (const theme of ['light', 'dark']) {
    for (const [w, h] of [[390, 844], [360, 800]]) {
      await f.b.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
      await f.b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }, { name: 'prefers-reduced-motion', value: 'reduce' }] });
      await sleep(350);
      const full = await f.b.ev('Math.max(document.scrollingElement.scrollHeight, document.querySelector("#app")?.scrollHeight ?? 0)');
      const step = Math.round(h * 0.72);
      const pages = Math.min(6, full > h + 4 ? 1 + Math.ceil((full - h) / step) : 1);
      let prevData = null;
      for (let p = 0; p < pages; p += 1) {
        await f.b.ev(`document.scrollingElement.scrollTop = ${Math.min(p * step, Math.max(0, full - h))}`);
        await sleep(150);
        if (p === 0 || p === pages - 1) {
          const probe = await f.b.ev(PROBE);
          const contrast = await f.b.ev(CONTRAST);
          report.push({ png: `${key}-${w}x${h}-${theme}-p${p + 1}`, ...probe, contrast, pagesTotal: pages });
        }
        const shot = await f.b.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        if (shot.result.data === prevData) continue; // the page did not scroll: same picture
        prevData = shot.result.data;
        writeFileSync(join(out, `${key}-${w}x${h}-${theme}-p${p + 1}.png`), Buffer.from(shot.result.data, 'base64'));
        shots += 1;
      }
      await f.b.ev('document.scrollingElement.scrollTop = 0');
    }
  }
}

async function acct(f, name, ccy, start, kind) {
  await f.go('#/accounts', 500);
  await f.tap('Add an account', { sel: 'button, .btn' }); await sleep(400);
  await f.fill('Name', name); await f.fill('Currency', ccy); await f.fill('Starting balance', String(start));
  if (kind === 'paper') await f.tap('Paper', { sel: '#overlay .seg button, #overlay button' });
  await f.tap('Save', { exact: true, sel: 'button' }); await sleep(600);
}
async function imp(f, account, file, finish = true) {
  await f.go('#/import', 600);
  await f.tap(account, { sel: '.seg button, .segmented button, button' });
  await upload(f, FX + file); await sleep(600);
  await f.tap('Import', { exact: true, sel: '.btn' });
  await f.b.until("location.hash.startsWith('#/import/')", 15000); await sleep(600);
  if (finish) await answerAll(f, { limit: 6, timeout: 8000 });
}
async function trade(f, i) {
  await f.go('#/trade/new', 600);
  if (await f.has('Skip checklist')) await f.tap('Skip checklist');
  await sleep(250);
  await f.fill('Instrument', i.inst); await f.fill('Position size', i.size); await f.fill('Entry', i.entry);
  if (i.stop) await f.fill('Stop', i.stop);
  await f.fill('Exit', i.exit);
  await sleep(200); await f.tap('Save trade'); await sleep(700);
  if ((await f.overlay()).includes('Plan check')) { await f.tap('No mark', { sel: '#overlay button' }); await sleep(400); }
}

async function seed(f) {
  await f.b.load(`${f.b.base}/index.html`, 700);
  await f.tap('Continue', { sel: '.ob-foot .btn' }); await f.waitText('paper', 3000);
  await f.tap('I trade already', { sel: '.choice' }); await f.tapSel('.ob-foot .btn'); await sleep(600);
  await acct(f, 'IBKR', 'USD', 10000); await acct(f, 'Kraken', 'USD', 5000); await acct(f, 'MT4', 'USD', 2000);
  await imp(f, 'IBKR', 'ibkr-activity.csv');
  await imp(f, 'Kraken', 'kraken-trades.csv');
  await imp(f, 'MT4', 'mt4-statement.htm');
  await imp(f, 'MT4', 'generic.csv', false).catch(() => {}); // a second, unanswered import for the question screens
  await acct(f, 'Paper', 'EUR', 10000, 'paper');
  await f.tap('Paper', { sel: '.mode-switch button' }); await sleep(500);
  await f.go('#/plan', 500);
  await f.fill('Write an item', 'The setup is on my list'); await f.tap('Add item');
  await f.fill('Setup name', 'breakout'); await f.tap('Add a setup'); await f.tap('Save plan'); await sleep(600);
  for (const t of [['AAPL', '10', '100', '98', '105'], ['MSFT', '5', '200', '196', '198'], ['TSLA', '2', '50', '48', '52'], ['KO', '20', '60', '58', '57'], ['SPY', '3', '500', '495', '505']]) {
    await trade(f, { inst: t[0], size: t[1], entry: t[2], stop: t[3], exit: t[4] });
  }
  await f.tap('Real', { sel: '.mode-switch button' }); await sleep(500);
}

async function openCheck(f, name) {
  await f.go('#/accounts', 600);
  const ok = await f.b.ev(`(() => { const a = [...document.querySelectorAll('a[href^="#/reconcile/"]')].find((x) => x.innerText.includes(${JSON.stringify(name)})); if (!a) return false; a.click(); return true; })()`);
  if (!ok) throw new Error('no broker check period for ' + name);
  await sleep(800);
}
const clickFirstRow = async (f) => { await f.tapSel('a.row, .list a, a[href^="#/trade/"]'); await sleep(700); };

// name -> async (f) that leaves the app in that state; `mode` picks the mode first
const SCREENS = [
  { name: 'dashboard', run: (f) => f.go('#/home') },
  { name: 'dashboard-paper', mode: 'paper', run: (f) => f.go('#/home') },
  { name: 'journal', run: (f) => f.go('#/journal') },
  { name: 'trade-detail', run: async (f) => { await f.go('#/journal'); await clickFirstRow(f); } },
  { name: 'stops', run: (f) => f.go('#/stops') },
  { name: 'cash', run: (f) => f.go('#/cash') },
  { name: 'periods', run: (f) => f.go('#/accounts') },
  { name: 'import-mapping', run: async (f) => { await f.go('#/import'); await upload(f, FX + 'ibkr-activity.csv'); await sleep(600); } },
  { name: 'import-mt4', run: async (f) => { await f.go('#/import'); await upload(f, FX + 'mt4-statement.htm'); await sleep(600); } },
  { name: 'import-error', run: async (f) => { await f.go('#/import'); await upload(f, FX + '../reconcile/cases.json'); await sleep(600); } },
  { name: 'import-questions', run: async (f) => { await f.go('#/journal'); await f.b.ev("location.hash = '#/accounts'"); await sleep(300); const id = await f.b.ev(`(async () => { const { createIdbStore } = await import('/src/storage/idb.js'); const s = await createIdbStore(indexedDB); const i = (await s.imports.getAll()).filter((x) => x.anomalies.some((a) => !a.answer)).pop(); return i?.id ?? null; })()`); await f.go(id ? `#/import/${id}` : '#/import'); } },
  { name: 'reconcile-total', run: (f) => openCheck(f, 'IBKR') },
  { name: 'reconcile-match', run: async (f) => { await openCheck(f, 'IBKR'); await f.fill('Broker’s net realised', '234'); await f.tap('Compare', { sel: '.btn' }); await sleep(900); } },
  { name: 'reconcile-difference', run: async (f) => { await openCheck(f, 'MT4'); await f.fill('Broker’s net realised', '120'); await f.tap('Compare', { sel: '.btn' }); await sleep(900); } },
  { name: 'reconcile-balance', run: async (f) => { await openCheck(f, 'MT4'); await f.tap('Balance', { sel: '.seg button' }); await sleep(300); await f.tap('no position', { sel: '.opt' }); await sleep(300); await f.fill('Start', '10000'); await f.fill('End', '10074.18'); await f.tap('Compare', { sel: '.btn' }); await sleep(900); } },
  { name: 'reconcile-quantity', run: async (f) => { await openCheck(f, 'Kraken'); await f.tap('quantity', { sel: '.seg button' }); await sleep(300); await f.fill('Ending quantity', '0.0833'); await f.tap('Compare', { sel: '.btn' }); await sleep(900); } },
  { name: 'stats', run: (f) => f.go('#/stats/overview') },
  { name: 'stats-buckets', run: (f) => f.go('#/stats/buckets') },
  { name: 'calendar', run: (f) => f.go('#/calendar') },
  { name: 'stats-drilldown', run: (f) => f.go('#/drill/expectancy') },
  { name: 'learn', run: (f) => f.go('#/learn/expectancy') },
  { name: 'learn-r', run: (f) => f.go('#/learn/r') },
  { name: 'learn-drawdown', run: (f) => f.go('#/learn/drawdown') },
  { name: 'compare', run: (f) => f.go('#/review/compare') },
  { name: 'review', run: async (f) => { await f.go('#/review'); await f.tap('Run the review'); await sleep(1500); } },
  { name: 'plan', run: (f) => f.go('#/plan') },
  { name: 'sizing', run: (f) => f.go('#/sizing') },
  { name: 'checklist', mode: 'paper', run: async (f) => { await f.go('#/trade/new'); await sleep(600); } },
  { name: 'log-trade', mode: 'paper', run: async (f) => { await f.go('#/trade/new'); if (await f.has('Skip checklist')) await f.tap('Skip checklist'); await sleep(300); } },
  { name: 'log-error', mode: 'paper', run: async (f) => { await f.go('#/trade/new'); if (await f.has('Skip checklist')) await f.tap('Skip checklist'); await sleep(300); await f.fill('Instrument', 'AAPL'); await f.fill('Position size', 'abc'); await f.tap('Save trade'); await sleep(500); } },
  { name: 'log-sentence', mode: 'paper', run: async (f) => { await f.go('#/sentence'); if (await f.has('Skip checklist')) await f.tap('Skip checklist'); await sleep(300); await f.fill('sentence', 'bought 3 SPY'); await f.tap('Read sentence'); await sleep(700); } },
  { name: 'settings', run: (f) => f.go('#/settings') },
  { name: 'settings-ai', run: (f) => f.go('#/settings/ai') },
  { name: 'data', run: async (f) => { await f.go('#/settings'); await f.tap('Your data', { sel: '.set-row, a, button' }); await sleep(600); } },
  { name: 'data-delete', run: async (f) => { await f.go('#/settings'); await f.tap('Your data', { sel: '.set-row, a, button' }); await sleep(500); await f.tap('Delete all data', { sel: 'button, .btn' }); await sleep(600); } },
  { name: 'about', run: (f) => f.go('#/about') },
  { name: 'offline', run: async (f) => { await f.go('#/home'); await f.b.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 }); await f.b.ev("window.dispatchEvent(new Event('offline'))"); await sleep(600); }, after: async (f) => { await f.b.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }); await f.b.ev("window.dispatchEvent(new Event('online'))"); } },
];

async function firstRunShots(lang) {
  const f = await open();
  await f.b.load(`${f.b.base}/index.html`, 800);
  if (lang === 'el') { await f.tap('Ελληνικά', { sel: '.seg button' }); await sleep(500); }
  const sfx = lang === 'el' ? '-el' : '';
  await sweep(f, 'onboarding-welcome', sfx);
  await f.tapSel('.ob-foot .btn'); await sleep(500);
  await sweep(f, 'onboarding-path', sfx);
  for (const u of f.b.network.filter((x) => !x.startsWith(f.b.base) && !x.startsWith('data:') && !x.startsWith('about:'))) external.add(u);
  report.push({ png: `first-run${sfx}-console`, problems: f.b.problems.filter((p) => !/summary\.js/.test(p)) });
  await f.close();
}

async function main(lang) {
  const f = await open();
  await seed(f);
  if (lang === 'el') { await f.go('#/settings'); await f.tap('Language', { sel: '.set-row' }); await sleep(400); await f.tap('Ελληνικά', { sel: '.opt' }); await sleep(600); }
  const sfx = lang === 'el' ? '-el' : '';
  const modeNow = { v: 'real' };
  for (const s of SCREENS) {
    if (only.length && !only.includes(s.name)) continue;
    const want = s.mode || 'real';
    if (want !== modeNow.v) { await f.tap(want === 'paper' ? (lang === 'el' ? 'Χαρτί' : 'Paper') : (lang === 'el' ? 'Πραγματικ' : 'Real'), { sel: '.mode-switch button' }); await sleep(500); modeNow.v = want; }
    f.b.problems.length = 0;
    try { await s.run(f); } catch (e) { report.push({ png: `${s.name}${sfx}`, setupError: e.message }); continue; }
    await sleep(500);
    const problems = f.b.problems.filter((p) => !/summary\.js/.test(p));
    report.push({ png: `${s.name}${sfx}-state`, hash: await f.hash(), problems });
    await sweep(f, s.name, sfx);
    if (s.after) await s.after(f);
  }
  for (const u of f.b.network.filter((x) => !x.startsWith(f.b.base) && !x.startsWith('data:') && !x.startsWith('about:'))) external.add(u);
  await f.close();
}

if (!only.length) for (const fl of readdirSync(out)) if (/^[a-z-]+-\d+x\d+-(light|dark)-p\d+\.png$/.test(fl)) unlinkSync(join(out, fl));
for (const lang of langs) {
  console.log(`== ${lang}`);
  if (!only.length) await firstRunShots(lang);
  await main(lang);
}
writeFileSync(join(out, 'visual.json'), `${JSON.stringify({ at: new Date().toISOString(), shots, external: [...external], report }, null, 1)}\n`);
const flagged = report.filter((r) => r.setupError || r.overflowX > 0 || r.clipped?.length || r.small?.length || r.targets?.length || r.native?.length || r.bad?.length || r.offscreen?.length || r.contrast?.length || r.problems?.length);
console.log(`${shots} screenshots; ${report.length} probed; external requests: ${external.size}; pages with findings: ${flagged.length}`);
for (const r of flagged) console.log(JSON.stringify(r));
process.exit(flagged.length || external.size ? 1 : 0);
