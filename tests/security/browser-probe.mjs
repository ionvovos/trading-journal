// L4b probe 5: the app in a real Chrome. CSP effectiveness, network log, storage layout, the key against a mock provider, hostile
// import files through the real Settings screen. Not part of `npm test` (it needs Chrome outside the Bash sandbox).
// Run outside the sandbox:  node tests/security/browser-probe.mjs      (exit 1 on any failed check)
// No third-party host is contacted: the mock provider is the local static server; the one non-local fetch uses the reserved
// .invalid TLD and only shows that CSP does not block https.
import fs from 'node:fs';
import { launch, sleep } from '../../e2e/lib/cdp.mjs';

const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: Boolean(cond), detail: cond ? '' : String(detail) });
const note = (name, detail) => checks.push({ name, ok: true, detail, note: true });

const KEY = 'sk-ant-BROWSER-PROBE-0123456789';
const seen = [];
const apiHandler = (req, res, body) => {
  seen.push({ url: req.url, headers: req.headers, body });
  let payload = {};
  try { payload = JSON.parse(JSON.parse(body).messages.at(-1).content); } catch { /* ping */ }
  const text = JSON.stringify(Array.isArray(payload.items) ? { order: payload.items.map((i) => i.id) } : { ok: true });
  res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify({ choices: [{ message: { content: text } }] }));
};
const b = await launch({ apiHandler });
await b.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
const wait = (expr, ms = 8000) => b.until(expr, ms);
const clickText = (sel, label) => b.ev(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(sel)})].find((x) => x.textContent.trim() === ${JSON.stringify(label)}); if (!e) return false; e.click(); return true; })()`);
const origin = new URL(b.base).origin;

// ---- first run, paper account (the same steps as e2e/delete-all.mjs)
await b.load(`${b.base}/index.html`, 500);
await b.ev(`window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI));`);
await wait("!!document.querySelector('.ob h1')");
ok('first run: no request left the origin before the first screen', b.network.every((u) => u.startsWith(origin) || u.startsWith('data:') || u.startsWith('blob:')), b.network.filter((u) => !u.startsWith(origin)).join(', '));
await clickText('.ob-foot .btn', 'Continue');
await wait("document.querySelectorAll('.choice').length === 3");
await clickText('.ob-foot .btn', 'Start on paper');
await wait("!!document.querySelector('.tabbar')");

// ---- 1. CSP present and effective
const csp = await b.ev("document.querySelector('meta[http-equiv=\"Content-Security-Policy\"]')?.content ?? ''");
ok('CSP meta is present and names default-src, script-src, connect-src, object-src none, base-uri, form-action', /default-src 'self'/.test(csp) && /script-src 'self'/.test(csp) && /connect-src/.test(csp) && /object-src 'none'/.test(csp) && /base-uri 'self'/.test(csp) && /form-action 'self'/.test(csp), csp);
ok("CSP: no 'unsafe-inline' and no 'unsafe-eval' (only 'wasm-unsafe-eval', which allows WebAssembly and not eval)", !/unsafe-inline|(?<!wasm-)unsafe-eval/.test(csp), csp);
// DevTools evaluation is exempt from the page's CSP unless asked otherwise, so eval is tried with the exemption switched off.
const evStrict = async (expression) => {
  const r = await b.send('Runtime.evaluate', { expression, returnByValue: true, allowUnsafeEvalBlockedByCSP: false });
  return r.result.exceptionDetails ? `threw:${r.result.exceptionDetails.exception?.className ?? 'error'}` : r.result.result.value;
};
ok('CSP effective: an inline script injected into the page does not run', (await b.ev("(() => { const s = document.createElement('script'); s.textContent = 'window.__inline = 1'; document.head.append(s); return window.__inline === undefined; })()")) === true);
ok('CSP effective: an inline event handler attribute does not run', (await b.ev("(() => { const d = document.createElement('div'); d.innerHTML = '<img src=\"data:image/gif;base64,R0lGODlhAQABAAAAACw=\" onload=\"window.__h=1\">'; document.body.append(d); return true; })()")) === true && (await sleep(300), (await b.ev('window.__h === undefined')) === true));
ok('CSP effective: eval is refused', (await evStrict("(() => { try { eval('1'); return 'ran'; } catch (e) { return e.name; } })()")) === 'EvalError');
ok('CSP effective: new Function is refused', (await evStrict("(() => { try { new Function('return 1')(); return 'ran'; } catch (e) { return e.name; } })()")) === 'EvalError');
await evStrict("(() => { try { setTimeout('window.__t=1', 0); } catch (e) { /* refused by throwing */ } return true; })()");
await sleep(300);
ok('CSP effective: setTimeout with a string does not run', (await b.ev('window.__t === undefined')) === true);
ok('CSP effective: a script from a host outside script-src does not load', (await b.ev("new Promise((res) => { const s = document.createElement('script'); s.src = 'https://evil.invalid/x.js'; s.onerror = () => res('blocked'); s.onload = () => res('loaded'); document.head.append(s); setTimeout(() => res('timeout'), 3000); })")) === 'blocked');
ok('CSP effective: a <base> tag cannot rebase relative URLs', (await b.ev("(() => { const before = document.baseURI; const e = document.createElement('base'); e.href = 'https://evil.invalid/'; document.head.append(e); const same = document.baseURI === before; e.remove(); return same; })()")) === true);
ok('CSP effective: fetch to a plain-http public host is blocked by connect-src', (await b.ev("fetch('http://example.invalid/x').then(() => 'sent', () => 'failed')")) === 'failed' && (await b.ev('window.__csp.some((x) => x.startsWith("connect-src"))')) === true);
await b.ev("fetch('https://example.invalid/x').catch(() => {})");
await sleep(500);
const httpsBlocked = await b.ev('window.__csp.filter((x) => x.startsWith("connect-src") && x.includes("https://example.invalid")).length');
note('CSP connect-src allows any https host (by design, own-key addresses are user-typed): fetch to https://example.invalid was not blocked by CSP', `violations for that URL: ${httpsBlocked}`);
ok('CSP effective: a form cannot post to another origin', (await b.ev("new Promise((res) => { const f = document.createElement('form'); f.action = 'https://evil.invalid/post'; f.method = 'post'; document.body.append(f); document.addEventListener('securitypolicyviolation', (e) => { if (e.violatedDirective.startsWith('form-action')) res('blocked'); }, { once: true }); f.requestSubmit ? f.requestSubmit() : f.submit(); setTimeout(() => res('timeout'), 2000); })")) === 'blocked');
ok('CSP effective: an inline style attribute is refused', (await b.ev("new Promise((res) => { const d = document.createElement('div'); document.addEventListener('securitypolicyviolation', (e) => { if (e.violatedDirective.startsWith('style-src')) res('blocked'); }, { once: true }); d.setAttribute('style', 'color:red'); document.body.append(d); setTimeout(() => res('timeout'), 1500); })")) === 'blocked');

// ---- 2. seed the journal, then walk every screen and read the network log
await b.ev(`(async () => {
  const w = ${JSON.stringify(JSON.parse(fs.readFileSync(new URL('../fixtures/review/weeks.json', import.meta.url), 'utf8')).stocks)};
  const { createIdbStore } = await import('/src/storage/idb.js');
  const store = await createIdbStore(indexedDB);
  for (const a of w.accounts) await store.accounts.put({ name: 'Main', mode: 'real', ...a });
  for (const t of w.trades) await store.trades.put(t);
  await store.plans.put(w.plan);
  return true;
})()`);
const routes = ['#/home', '#/journal', '#/stats', '#/calendar', '#/plan', '#/review', '#/learn', '#/about', '#/import', '#/accounts', '#/settings', '#/settings/ai', '#/settings/data', '#/sizing'];
const before = b.network.length;
for (const r of routes) { await b.ev(`location.hash = ${JSON.stringify(r)}`); await sleep(500); }
const walked = b.network.slice(before);
const foreign = walked.filter((u) => !u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:'));
ok(`no consent, no key: walking ${routes.length} screens makes only same-origin requests`, foreign.length === 0, foreign.join(', '));
ok('no request carries a query string or path built from journal data (same-origin requests are static files)', walked.every((u) => !/AAPL|MSFT|TSLA|acc-s|breakout/.test(u)), walked.filter((u) => /AAPL|MSFT|TSLA|acc-s|breakout/.test(u)).join(', '));

// ---- 3. the key against a mock provider, in the real browser
const runReview = (settingsJs, keyJs) => b.ev(`(async () => {
  const { createIdbStore } = await import('/src/storage/idb.js');
  const { enginesFor, browserKeyStore } = await import('/src/ai/index.js');
  const { keyBinding } = await import('/src/ai/adapter.js');
  const { runReview } = await import('/src/review/run.js');
  const store = await createIdbStore(indexedDB);
  const w = ${JSON.stringify(JSON.parse(fs.readFileSync(new URL('../fixtures/review/weeks.json', import.meta.url), 'utf8')).stocks)};
  const keys = browserKeyStore();
  ${keyJs}
  const settings = ${settingsJs};
  const events = [];
  const engine = await enginesFor({ bus: { emit: (n, p) => events.push([n, p]), on: () => () => {} } }).resolve(settings, 'en');
  const review = await runReview({ trades: w.trades, cash: [], accounts: w.accounts, plans: [w.plan], settings: { smallSampleMin: 30, lossWindowMin: 30, tz: w.tz, dayCutoffHour: 0 }, mode: w.mode, period: w.period, lang: 'en', tz: w.tz, now: new Date('2026-09-25T10:00:00Z') }, { engine });
  return { engine: review.engine, note: review.engineNote, events: JSON.stringify(events) };
})()`);
const LOCAL = `${b.base}/v1`;
const mockHost = new URL(b.base).host;

seen.length = 0;
const A = await runReview(`({ 'ai.engine': 'own-key', 'ai.provider': 'openai', 'ai.model': 'm', 'ai.baseUrl': '${LOCAL}', 'ai.own.confirmed': true, 'ai.device.consent': 'ask' })`,
  `keys.setKey('${KEY}', keyBinding({ 'ai.provider': 'anthropic' }));`);
ok('a key saved for Anthropic, provider switched to a local OpenAI-compatible address: the review still runs on the model path', A.engine === 'own-key' && seen.length >= 1, JSON.stringify(A));
ok('...and the Anthropic key is in no header, no body and no URL that reached that address', seen.every((r) => !JSON.stringify(r).includes(KEY) && !r.headers.authorization && !r.headers['x-api-key']), JSON.stringify(seen.map((r) => r.headers)));
ok('...and it is not in any bus event', !A.events.includes(KEY));

seen.length = 0;
const B = await runReview(`({ 'ai.engine': 'own-key', 'ai.provider': 'openai', 'ai.model': 'm', 'ai.baseUrl': '${LOCAL}', 'ai.own.confirmed': true, 'ai.device.consent': 'ask' })`,
  `keys.setKey('${KEY}', keyBinding({ 'ai.provider': 'openai', 'ai.baseUrl': '${LOCAL}' }));`);
ok('positive control: a key saved for this address is sent there as a Bearer header', B.engine === 'own-key' && seen.length >= 1 && seen.every((r) => r.headers.authorization === `Bearer ${KEY}`), JSON.stringify(seen.map((r) => r.headers.authorization)));
ok('what the mock provider received carries no instrument, trade id, account id or plan text', seen.every((r) => !/AAPL|MSFT|TSLA|NVDA|AMD|META|GOOG|"t\d+"|acc-s|Stop set before entry|Wait for the first 15/.test(r.body)), seen.map((r) => r.body.slice(0, 200)).join(' | '));

// ---- 4. storage layout after all of that
const layout = await b.ev(`(async () => ({
  ls: Object.keys(localStorage), ss: Object.keys(sessionStorage), cookie: document.cookie,
  dbs: (await indexedDB.databases()).map((d) => d.name), caches: await caches.keys(),
  cachedUrls: (await Promise.all((await caches.keys()).map(async (n) => (await (await caches.open(n)).keys()).map((r) => r.url)))).flat(),
}))()`);
ok('storage: localStorage holds only the two documented own-key entries', layout.ls.every((k) => ['trading-journal.ai-key', 'trading-journal.ai-key-binding'].includes(k)), layout.ls.join(','));
ok('storage: no cookie, no sessionStorage', layout.cookie === '' && layout.ss.length === 0, JSON.stringify(layout));
ok('storage: exactly one IndexedDB database, trading-journal', layout.dbs.length === 1 && layout.dbs[0] === 'trading-journal', layout.dbs.join(','));
ok('storage: only tj-v* / tj-cdn caches exist; no provider request or key is in any cache', layout.caches.every((n) => /^(tj-v\d+|tj-cdn)$/.test(n)) && layout.cachedUrls.every((u) => !u.includes('/v1/') && !u.includes(KEY)), `${layout.caches.join(',')} ${layout.cachedUrls.filter((u) => u.includes('/v1/')).join(',')}`);

// ---- 5. hostile import files through the real Settings > Your data screen
async function importFile(name, content) {
  await b.ev("location.hash = '#/home'");
  await sleep(300);
  await b.ev("location.hash = '#/settings/data'");
  await wait("!!document.querySelector('input[type=file]')");
  // a File built in the page and handed to the real change handler of the real file input
  await b.ev(`(() => { const i = document.querySelector('input[type=file]'); const dt = new DataTransfer(); dt.items.add(new File([${JSON.stringify(content)}], ${JSON.stringify(name)}, { type: 'application/json' })); i.files = dt.files; i.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  await sleep(1500);
  return b.ev("[...document.querySelectorAll('.banner')].map((x) => x.innerText).join(' || ')");
}
const dbState = () => b.ev(`(async () => { const { createIdbStore } = await import('/src/storage/idb.js'); const s = await createIdbStore(indexedDB); return { trades: (await s.trades.getAll()).length, settings: await s.allSettings() }; })()`);
const s0 = await dbState();
// positive control first: a valid file must land, otherwise "nothing was written" below would prove nothing
const controlTrade = { ...JSON.parse(fs.readFileSync(new URL('../fixtures/review/weeks.json', import.meta.url), 'utf8')).forex.trades[0], id: 'probe-control-trade' };
const mc = await importFile('control.json', JSON.stringify({ format: 'trading-journal-export', version: 1, exportedAt: '2026-09-29T00:00:00Z', settings: {}, trades: [controlTrade] }));
const sc = await dbState();
ok('positive control: a valid export file restores through the real screen (one trade added, the banner says so)', sc.trades === s0.trades + 1 && /Added 1/.test(mc), `${mc} | ${sc.trades} vs ${s0.trades}`);
const m1 = await importFile('bad.json', '{"format":"trading-journal-export","version":1,"trades":[{"id":"x"}]}');
ok('hostile import (invalid row) through the UI: the error banner names the row, "Nothing was changed", and the trade count is unchanged', (await dbState()).trades === sc.trades && /not valid.*Nothing was changed/s.test(m1), m1);
const m2 = await importFile('junk.json', '\u0000\u0001 not json');
ok('hostile import (not JSON) through the UI: the error banner says nothing was changed, and the trade count is unchanged', (await dbState()).trades === sc.trades && /not a JSON export.*Nothing was changed/s.test(m2), m2);
const m4 = await importFile('newer.json', JSON.stringify({ format: 'trading-journal-export', version: 99 }));
ok('hostile import (version from the future) through the UI: refused with "Nothing was changed"', /newer version.*Nothing was changed/s.test(m4), m4);
const hostile = JSON.stringify({ format: 'trading-journal-export', version: 1, exportedAt: '2026-09-29T00:00:00Z', settings: { 'ai.provider': 'openai', 'ai.model': 'x', 'ai.baseUrl': 'https://collector.local/v1', 'ai.own.confirmed': true, 'ai.engine': 'own-key', dayCutoffHour: 3 } });
const m3 = await importFile('ai-settings.json', hostile);
const s3 = await dbState();
const aiKeys = Object.keys(s3.settings).filter((k) => k.startsWith('ai.') && k !== 'ai.engine');
ok('the settings-only file went through the real import path (the restore banner appeared)', /Added 0, kept 0/.test(m3), m3);
ok('F2 (R2): a file\'s ai.* settings are not written to the store through Settings > Your data; an allow-listed data setting is', aiKeys.length === 0 && s3.settings['ai.baseUrl'] !== 'https://collector.local/v1' && s3.settings['ai.own.confirmed'] !== true && s3.settings.dayCutoffHour === 3, JSON.stringify(s3.settings));

await b.close();
const failed = checks.filter((x) => !x.ok);
for (const x of checks) console.log(`${x.note ? 'NOTE' : x.todo ? 'TODO' : x.ok ? 'PASS' : 'FAIL'}  ${x.name}${x.detail ? `  [${x.detail}]` : ''}`);
console.log(`${checks.filter((x) => x.ok && !x.note && !x.todo).length}/${checks.filter((x) => !x.note && !x.todo).length} checks passed, ${checks.filter((x) => x.note || x.todo).length} notes`);
process.exit(failed.length ? 1 : 0);
