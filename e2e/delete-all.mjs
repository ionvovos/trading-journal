// AC-P8.9: "Delete all data on this device" empties IndexedDB, removes the own key and the settings mirror from localStorage, deletes the
// downloaded model caches only when the user ticks that option, keeps the app-shell cache, and returns to the first run.
// Run outside the Bash sandbox: node e2e/delete-all.mjs   (exit 1 on any failed check)
import { launch, sleep } from './lib/cdp.mjs';

const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: Boolean(cond), detail: cond ? '' : String(detail) });
const b = await launch();
await b.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
const wait = (expr, ms = 5000) => b.until(expr, ms);
const clickText = (sel, label) => b.ev(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(sel)})].find((x) => x.textContent.trim() === ${JSON.stringify(label)}); if (!e) return false; e.click(); return true; })()`);

async function firstRunPaper() {
  await b.load(`${b.base}/index.html`, 400);
  await wait("!!document.querySelector('.ob h1')");
  await clickText('.ob-foot .btn', 'Continue');
  await wait("document.querySelectorAll('.choice').length === 3");
  await clickText('.ob-foot .btn', 'Start on paper');
  await wait("!!document.querySelector('.tabbar')");
}

// Rows in every store, the own key, model caches and a shell cache: the state a used app has.
const SEED = `(async () => {
  const { createIdbStore } = await import('/src/storage/idb.js');
  const store = await createIdbStore(indexedDB);
  await store.trades.put({ id: 't1', accountId: 'a1', mode: 'paper', instrument: 'AAPL', legs: [], holds: [], closeTime: null });
  await store.cash.put({ id: 'c1', accountId: 'a1', time: '2026-09-01T00:00:00Z', kind: 'deposit', amount: '100', currency: 'USD' });
  await store.plans.put({ id: 'p1', name: 'My plan', active: true, items: [] });
  await store.reviews.put({ id: 'r1', mode: 'paper', createdAt: '2026-09-02T00:00:00Z' });
  await store.blobs.put({ id: 'b1', type: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,AA==' });
  await store.setSetting('lastExportAt', '2026-09-03T00:00:00Z');
  localStorage.setItem('trading-journal.ai-key', 'sk-test-not-real');
  localStorage.setItem('trading-journal.ai-key-binding', 'anthropic|api.anthropic.com');
  for (const n of ['webllm/model', 'webllm/config']) { const c = await caches.open(n); await c.put('/x', new Response('weights')); }
  return true;
})()`;
const STATE = `(async () => {
  const { createIdbStore } = await import('/src/storage/idb.js');
  const store = await createIdbStore(indexedDB);
  const counts = {};
  for (const n of ['accounts', 'trades', 'cash', 'imports', 'reconciliations', 'plans', 'reviews', 'blobs']) counts[n] = (await store[n].getAll()).length;
  return { counts, lastExportAt: (await store.getSetting('lastExportAt')) ?? null, firstRunDone: (await store.getSetting('firstRunDone')) ?? false,
    ls: Object.keys(localStorage).filter((k) => k.startsWith('trading-journal.')), caches: await caches.keys() };
})()`;

async function deleteRun(alsoModel) {
  await firstRunPaper();
  await b.ev(SEED);
  await b.ev("location.hash = '#/settings/data'");
  await wait("[...document.querySelectorAll('.btn')].some((x) => x.textContent.trim() === 'Delete everything')");
  await clickText('.btn', 'Delete everything');
  await wait("!!document.querySelector('.sheet')");
  ok(`(${alsoModel ? 'with' : 'without'} model) the confirm step names what is lost and offers an export first`, await b.ev("document.querySelector('.sheet').textContent.includes('Export first') && document.querySelector('.sheet .kv') !== null"));
  ok(`(${alsoModel ? 'with' : 'without'} model) the button stays disabled until the word is typed`, await b.ev("document.querySelector('.sheet-foot .btn').disabled") === true);
  if (alsoModel) await b.ev("document.querySelector('.sheet input[type=checkbox]').click()");
  await b.ev("(() => { const i = document.querySelector('.sheet input:not([type=checkbox])'); i.value = 'DELETE'; i.dispatchEvent(new Event('input', { bubbles: true })); })()");
  await wait("document.querySelector('.sheet-foot .btn').disabled === false", 2000);
  await b.ev("document.querySelector('.sheet-foot .btn').click()");
  ok(`(${alsoModel ? 'with' : 'without'} model) the app returns to the first run`, await wait("!!document.querySelector('.ob h1')", 8000));
  return b.ev(STATE);
}

const a = await deleteRun(false);
ok('every store is empty', Object.values(a.counts).every((n) => n === 0), JSON.stringify(a.counts));
ok('settings are gone (export date, first-run flag)', a.lastExportAt === null && a.firstRunDone === false, JSON.stringify(a));
ok('the own key and its binding are gone from localStorage', a.ls.length === 0, a.ls.join(','));
ok('the model caches stay when the option is not ticked', a.caches.includes('webllm/model') && a.caches.includes('webllm/config'), a.caches.join(','));
ok('the app-shell cache stays', a.caches.some((n) => /^tj-v\d+$/.test(n)), a.caches.join(','));

const c = await deleteRun(true);
ok('every store is empty (second run)', Object.values(c.counts).every((n) => n === 0), JSON.stringify(c.counts));
ok('the own key is gone (second run)', c.ls.length === 0);
ok('the model caches are deleted when the option is ticked', !c.caches.some((n) => /webllm/.test(n)), c.caches.join(','));
ok('the app-shell cache still stays', c.caches.some((n) => /^tj-v\d+$/.test(n)), c.caches.join(','));
await sleep(100);
await b.close();

const failed = checks.filter((x) => !x.ok);
for (const x of checks) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.name}${x.detail ? `  [${x.detail}]` : ''}`);
console.log(`${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
