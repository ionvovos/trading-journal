// Headless flows for the S1 shell on the real index.html (real CSP, real service worker): first run, language switch without reload,
// paper and real empty states, mode switch, Settings sheets, About text, installability data and offline reload.
// Run outside the Bash sandbox: node e2e/lib/s1-flows.mjs   (exit 1 on any failed check)
import { launch, sleep } from './cdp.mjs';
import { FIRST_RUN, ABOUT } from '../../src/about/text.js';

const checks = [];
const ok = (name, cond, detail = '') => { checks.push({ name, ok: Boolean(cond), detail: cond ? '' : String(detail) }); };
const KNOWN_ABSENT = /(en|el)\/(data|review)\.js|css\/views\/(data|review)\.css|stats\/summary|import\/summary|storage\/summary|views\/\w+\.js|404 \(Not Found\)/;

const b = await launch();
await b.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await b.send('Page.addScriptToEvaluateOnNewDocument', { source: "window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + (e.blockedURI || '')));" });
const text = (sel) => b.ev(`document.querySelector(${JSON.stringify(sel)})?.textContent ?? null`);
const click = (sel) => b.ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`);
const clickText = (sel, label) => b.ev(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(sel)})].find((x) => x.textContent.includes(${JSON.stringify(label)})); if (!e) return false; e.click(); return true; })()`);
const wait = (expr, ms = 4000) => b.until(expr, ms);

// 1. First run
await b.load(`${b.base}/index.html`, 400);
ok('first run opens on a fresh profile', await wait("!!document.querySelector('.ob h1')"));
ok('first-run sentence is the lawyer\'s, verbatim (EN)', (await b.ev("[...document.querySelectorAll('.note-card p')].map((p) => p.textContent)")).includes(FIRST_RUN.en));
ok('no tab bar on first run', (await b.ev("document.querySelector('.tabbar')")) === null);
await b.ev('window.__marker = 42');
await click('.seg button[data-value="el"]');
ok('language switch re-renders without reload (EL sentence shown, marker kept)', await wait(`[...document.querySelectorAll('.note-card p')].some((p) => p.textContent === ${JSON.stringify(FIRST_RUN.el)})`) && (await b.ev('window.__marker')) === 42);
ok('html lang follows the language', (await b.ev('document.documentElement.lang')) === 'el');
await click('.seg button[data-value="en"]');
await wait("document.querySelector('.ob h1')?.textContent.startsWith('Numbers')");
await clickText('.ob-foot .btn', 'Continue');
ok('step 2 offers three paths', await wait("document.querySelectorAll('.choice').length === 3"));
await clickText('.ob-foot .btn', 'Start on paper');

// 2. Paper home (empty)
ok('paper path lands on Home with the paper empty state', await wait("!!document.querySelector('.card.paper.empty')") && (await b.ev('location.hash')) === '#/home');
ok('top bar shows paper mode', (await b.ev("document.querySelector('.mode-switch button.paper')?.getAttribute('aria-pressed')")) === 'true');
ok('empty state names the next steps and draws no chart (AC-U1.2)', (await b.ev("document.querySelectorAll('.step').length")) === 4 && (await b.ev("document.querySelectorAll('svg.chart').length")) === 0);
ok('a pretend paper account was created (step 1 done)', await wait("!!document.querySelector('.step.done')"));
ok('tab bar has four tabs and the log button', (await b.ev("document.querySelectorAll('.tabbar .tab').length")) === 5);

// 3. Persistence across reload (the store keeps the settings)
await b.load(`${b.base}/index.html`, 500);
const persisted = await wait("!!document.querySelector('.tabbar')", 3000);
ok('after a reload the first run does not come back (settings persisted)', persisted, 'store is not persisting: the data layer may be absent');

// 4. Real mode empty + switch back
await click('.mode-switch button.real');
ok('real mode empty state offers import', await wait("[...document.querySelectorAll('.btn')].some((x) => x.textContent.includes('Import a broker file'))"));
ok('real mode top bar is not hatched', (await b.ev("document.querySelector('.topbar.paper-mode')")) === null);

// 5. Settings and its sheets
await b.ev("location.hash = '#/settings'");
ok('Settings opens with 5 groups', await wait("document.querySelectorAll('.group-h').length === 5"));
await clickText('.set-row', 'Language');
ok('Language sheet opens with focus inside', await wait("!!document.querySelector('.sheet')") && (await b.ev("document.querySelector('.sheet').contains(document.activeElement)")));
await clickText('.sheet .opt', 'Ελληνικά');
ok('choosing Greek in Settings re-renders Settings in Greek', await wait("document.querySelector('h1.title-sm')?.textContent === 'Ρυθμίσεις'") && (await b.ev("!document.querySelector('.sheet')")));
await clickText('.set-row', 'Εμφάνιση');
await clickText('.sheet .opt', 'Σκούρα');
ok('Appearance dark sets data-theme', await wait("document.documentElement.dataset.theme === 'dark'"));
await b.ev("document.documentElement.dataset.theme = ''");

// 6. Sheet: Escape closes and returns focus
await b.ev("location.hash = '#/settings'");
await wait("!!document.querySelector('.set-row')");
await b.ev("document.querySelector('.set-row').focus(); document.querySelector('.set-row').click()");
await wait("!!document.querySelector('.sheet')");
await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
ok('Escape closes a sheet', await wait("!document.querySelector('.sheet')"));

// 7. About
await b.ev("location.hash = '#/about'");
ok('About shows the approved first-run sentence and About text (Greek now)', await wait("!!document.querySelector('.about-head')")
  && (await b.ev("document.body.innerText")).includes(FIRST_RUN.el.slice(0, 40)) && (await b.ev("document.body.innerText")).includes(ABOUT.el.slice(-40)));
await b.ev("(async () => { const m = await import('/src/i18n/i18n.js'); m.setLang('en'); })()");

// 8. Unknown route falls back to Home; a route whose view has not landed shows a designed page
await b.ev("location.hash = '#/nope'");
ok('an unknown route opens Home', await wait("!!document.querySelector('.tabbar')"));

// 9. Installability and offline
const sw = await b.ev("(async () => { const r = await navigator.serviceWorker.ready; return { scope: r.scope, active: !!r.active }; })()");
ok('service worker active at the app scope', sw?.active && sw.scope === `${b.base}/`, JSON.stringify(sw));
const cached = await b.ev("(async () => { const c = await caches.open('tj-v1'); return (await c.keys()).length; })()");
ok('shell precached under tj-v1', cached >= 60, cached);
const manifest = await b.ev("fetch('./manifest.webmanifest').then((r) => r.json()).then((m) => ({ name: m.name, icons: m.icons.length }))");
ok('manifest reachable', manifest.name === 'Trading Journal' && manifest.icons === 3);
await b.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
await b.load(`${b.base}/index.html#/about`, 500);
ok('the app opens offline (About, no network)', await wait("!!document.querySelector('.about-head')", 5000));
await b.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

// 10. Console, CSP, network
await sleep(200);
const problems = b.problems.filter((p) => !KNOWN_ABSENT.test(p));
ok('no console error or warning', problems.length === 0, problems.join(' | '));
ok('no CSP violation', (await b.ev('window.__csp')).length === 0, await b.ev('JSON.stringify(window.__csp)'));
const external = b.network.filter((u) => !u.startsWith(b.base) && !u.startsWith('data:') && !u.startsWith('about:') && !u.startsWith('chrome'));
ok('network: same-origin only (AC-P8.2 for the shell)', external.length === 0, external.join(', '));
await b.close();

const failed = checks.filter((c) => !c.ok);
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
console.log(`${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
