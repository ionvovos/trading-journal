// Service worker: makes the app open offline. Lives at the site root so its scope is the whole app.
// Bump VERSION on every release: the old shell cache is deleted on activate and the new files are fetched fresh.
const VERSION = 'tj-v1';
// Pinned, immutable files from cdn.jsdelivr.net (the on-device model runtime). It survives releases and holds no journal data.
const CDN_CACHE = 'tj-cdn';

// Every file the browser loads. tests/shell/pwa.test.mjs fails when a file under src/, css/, fonts/ or icons/ is missing from
// this list; node tools/shell-list.mjs regenerates it.
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './css/charts.css',
  './css/components.css',
  './css/screens.css',
  './css/tokens.css',
  './icons/apple-touch-icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/icon.svg',
  './src/about/text.js',
  './src/ai/adapter.js',
  './src/ai/anthropic.js',
  './src/ai/device.js',
  './src/ai/engine.js',
  './src/ai/http.js',
  './src/ai/keystore.js',
  './src/ai/openai.js',
  './src/ai/prompts.js',
  './src/ai/worker.js',
  './src/app.js',
  './src/core/decimal.js',
  './src/core/money.js',
  './src/core/time.js',
  './src/core/trade.js',
  './src/i18n/el/shell.js',
  './src/i18n/en/data.js',
  './src/i18n/en/shell.js',
  './src/i18n/format.js',
  './src/i18n/i18n.js',
  './src/import/anomalies.js',
  './src/import/csv.js',
  './src/import/decode.js',
  './src/import/group.js',
  './src/import/htmlTable.js',
  './src/import/reconcile.js',
  './src/import/registry.js',
  './src/import/reportHtml.js',
  './src/import/run.js',
  './src/learn/entries.el.js',
  './src/learn/entries.en.js',
  './src/learn/index.js',
  './src/plan/check.js',
  './src/plan/derive.js',
  './src/plan/sizing.js',
  './src/review/banned.js',
  './src/review/guard.js',
  './src/review/legalTexts.js',
  './src/review/patterns.js',
  './src/review/rows.js',
  './src/review/run.js',
  './src/review/sha256.js',
  './src/review/templates.js',
  './src/sentence/assist.js',
  './src/sentence/crypto.js',
  './src/sentence/parse.js',
  './src/storage/actions.js',
  './src/storage/exportImport.js',
  './src/storage/idb.js',
  './src/storage/memory.js',
  './src/storage/migrate.js',
  './src/storage/model.js',
  './src/storage/periods.js',
  './src/storage/settings.js',
  './src/storage/viewkit.js',
  './src/ui/bus.js',
  './src/ui/charts/barList.js',
  './src/ui/charts/calendarGrid.js',
  './src/ui/charts/defaultFmt.js',
  './src/ui/charts/histogram.js',
  './src/ui/charts/lineChart.js',
  './src/ui/charts/underwaterChart.js',
  './src/ui/components/button.js',
  './src/ui/components/emptyState.js',
  './src/ui/components/field.js',
  './src/ui/components/figure.js',
  './src/ui/components/icons.js',
  './src/ui/components/index.js',
  './src/ui/components/listRow.js',
  './src/ui/components/modeBadge.js',
  './src/ui/components/notBuilt.js',
  './src/ui/components/progress.js',
  './src/ui/components/segmented.js',
  './src/ui/components/sheet.js',
  './src/ui/components/stateBanner.js',
  './src/ui/components/statusChip.js',
  './src/ui/components/tabbar.js',
  './src/ui/components/toast.js',
  './src/ui/components/topbar.js',
  './src/ui/ctx.js',
  './src/ui/dom.js',
  './src/ui/router.js',
  './src/ui/routes.js',
  './src/ui/views/about.js',
  './src/ui/views/accounts.js',
  './src/ui/views/bulkStops.js',
  './src/ui/views/cash.js',
  './src/ui/views/dataSettings.js',
  './src/ui/views/firstRun.js',
  './src/ui/views/home.js',
  './src/ui/views/import.js',
  './src/ui/views/journal.js',
  './src/ui/views/reconcile.js',
  './src/ui/views/settings.js',
  './src/ui/views/trade.js',
  './src/ui/views/tradeForm.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // One file at a time: a file that fails to load must not stop the rest from being cached.
    await Promise.all(SHELL.map(async (url) => {
      try { await cache.add(new Request(url, { cache: 'reload' })); } catch { /* fetched on first use instead */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Only old app-shell caches go. The jsDelivr cache and the WebLLM model caches are never touched.
    for (const name of await caches.keys()) {
      if (name.startsWith('tj-v') && name !== VERSION) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate') {
      event.respondWith((async () => {
        const cached = await caches.match('./index.html', { ignoreSearch: true });
        return cached || fetch(req);
      })());
      return;
    }
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') (await caches.open(VERSION)).put(req, res.clone());
      return res;
    })());
    return;
  }

  if (url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith((async () => {
      const cache = await caches.open(CDN_CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })());
  }
  // Everything else, including every AI provider request, is not intercepted.
});
