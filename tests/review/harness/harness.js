// harness.html?route=%23/review&lang=en&mode=real&week=stocks[&plan=0][&ai=downloading|unavailable|rules] mounts the shell on the seeded week.
globalThis.__TJ_NO_BOOT__ = true;
const q = new URLSearchParams(location.search);
const route = q.get('route') ?? '#/review';
const lang = q.get('lang') ?? 'en';
const mode = q.get('mode') ?? 'real';
const weekName = q.get('week') ?? 'stocks';
const weeks = await (await fetch('../../fixtures/review/weeks.json')).json();
const week = weeks[weekName];
const { createFallbackStore } = await import('../../../src/ui/ctx.js');
const { mountApp } = await import('../../../src/app.js');
const store = createFallbackStore();
for (const a of week.accounts) await store.accounts.put({ ...a, name: a.id, mode: 'real', currency: a.baseCurrency });
await store.accounts.put({ id: 'acc-sp', name: 'Paper', mode: 'paper', baseCurrency: 'USD', startBalance: '10000' });
for (const t of week.trades) await store.trades.put(t);
if (q.get('paper') === '1') {
  // the same week again as paper trades on the paper account, so the paper-versus-real comparison has both modes
  for (const t of week.trades.filter((x) => !x.holds?.length && !x.excluded && x.closeTime)) await store.trades.put({ ...t, id: `p-${t.id}`, mode: 'paper', accountId: 'acc-sp', plan: { ...t.plan, followed: true } });
}
if (q.get('plan') !== '0') await store.plans.put(week.plan);
const seed = { firstRunDone: true, mode, lang, tz: week.tz, theme: 'system', 'displayCurrency.real': 'USD', 'displayCurrency.paper': 'USD' };
if (q.get('ai') === 'own') Object.assign(seed, { 'ai.engine': 'own-key' });
for (const [k, v] of Object.entries(seed)) await store.setSetting(k, v);
window.__errors = [];
window.addEventListener('error', (e) => window.__errors.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => window.__errors.push(String(e.reason?.message ?? e.reason)));
location.hash = route;
const s3 = await import('../../../src/review/index.js');
const app = await mountApp({ store, storage: { kind: 'fallback', refused: false }, data: { ...s3 } });
window.__app = app;
window.__store = store;
await new Promise((r) => setTimeout(r, 400));
for (const sel of (q.get('click') ?? '').split('|').filter(Boolean)) { document.querySelector(sel)?.click(); await new Promise((r) => setTimeout(r, 300)); }
window.__ready = true;
