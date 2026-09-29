// Mounts the real shell on a fixture scene: harness.html?screen=<name>[&lang=][&theme=]. Exposes window.__ready when painted.
globalThis.__TJ_NO_BOOT__ = true;
const q = new URLSearchParams(location.search);
const name = q.get('screen') ?? 'dashboard';
const { SCREENS, accountsFor } = await import('./scenes-s1.js');
const scene = { ...SCREENS[name], ...(q.get('lang') ? { lang: q.get('lang') } : {}) };
if (scene.charts) {
  const { loadCatalogues, setLang } = await import('../../src/i18n/i18n.js');
  await loadCatalogues(); setLang(scene.lang ?? 'en');
  (await import('./charts-page.js')).renderCharts(document.getElementById('app'), scene.lang ?? 'en');
  window.__ready = true;
  await new Promise(() => {});
}
const { createFallbackStore } = await import('../../src/ui/ctx.js');
const { mountApp } = await import('../../src/app.js');

const store = createFallbackStore();
for (const a of accountsFor(scene.accounts ?? 'none')) await store.accounts.put(a);
if (scene.accounts === 'all') {
  for (let i = 0; i < 4; i += 1) await store.cash.put({ id: `c${i}`, accountId: 'acc-ibkr', time: '2026-09-03T00:00:00Z', kind: 'deposit', amount: '100', currency: 'USD' });
  await store.plans.put({ id: 'plan1', name: 'My plan', active: true, items: Array.from({ length: 6 }, (_, i) => ({ id: `r${i}` })) });
}
const seed = { firstRunDone: !scene.firstRun, mode: scene.mode ?? 'real', lang: scene.lang ?? 'en', tz: scene.tz ?? 'Europe/Athens', theme: 'system', 'displayCurrency.real': 'USD', 'displayCurrency.paper': 'EUR', 'ai.engine': 'on-device' };
for (const [k, v] of Object.entries(seed)) await store.setSetting(k, v);
if (scene.offline) Object.defineProperty(navigator, 'onLine', { get: () => false });

const data = { getSummary: async (ctx) => (scene.summary === 'never' ? new Promise(() => {}) : scene.summary ? scene.summary(ctx) : undefined) };
location.hash = scene.route;
const app = await mountApp({ store, storage: { kind: 'fallback', refused: false }, data });
window.__app = app;
await new Promise((r) => setTimeout(r, 250));
if (scene.click) document.querySelector(scene.click)?.click();
for (const c of scene.clicks ?? []) [...document.querySelectorAll(c.sel)].find((e) => e.textContent.includes(c.text))?.click();
await new Promise((r) => setTimeout(r, 250));
window.__ready = true;
