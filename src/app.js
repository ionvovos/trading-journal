// App entry. boot() opens the store, loads the language, and mounts the shell (router, tab bar, first run, overlays).
// mountApp() takes the store and data-layer functions as arguments, so the e2e harness and tests can mount it on fixtures.
import { loadCatalogues, setLang, t, onLang } from './i18n/i18n.js';
import { createBus } from './ui/bus.js';
import { createRouter, parseHash } from './ui/router.js';
import { VIEW_MODULES } from './ui/routes.js';
import { createCtx, createSettings, createFallbackStore } from './ui/ctx.js';
import { tabbar } from './ui/components/tabbar.js';
import { stateBanner } from './ui/components/stateBanner.js';
import { el, mount } from './ui/dom.js';

// Where the data layer (S2) and review layer (S3) hang their modules. Each is tried in order; the first that loads wins.
// A layer that has not landed is skipped and the shell runs on what it has (empty states, settings, first run).
const STORE_MODULES = [['./storage/idb.js', 'createIdbStore'], ['./storage/index.js', 'createIdbStore']];
const MEMORY_MODULES = [['./storage/memory.js', 'createMemoryStore'], ['./storage/index.js', 'createMemoryStore']];
const SUMMARY_MODULES = [['./stats/summary.js', 'getSummary'], ['./storage/summary.js', 'getSummary'], ['./import/summary.js', 'getSummary']];

async function firstExport(candidates) {
  for (const [path, name] of candidates) {
    try { const mod = await import(path); if (typeof mod[name] === 'function') return mod[name]; } catch { /* not built yet */ }
  }
  return null;
}

export async function openStore(win = globalThis) {
  const createIdb = await firstExport(STORE_MODULES);
  if (createIdb && win.indexedDB) {
    try { return { store: await createIdb(win.indexedDB), storage: { kind: 'idb', refused: false } }; } catch (e) { console.warn('IndexedDB refused, using memory', e); }
  }
  const createMemory = await firstExport(MEMORY_MODULES);
  const refused = Boolean(createIdb);
  if (createMemory) return { store: createMemory(), storage: { kind: 'memory', refused } };
  if (!createIdb) console.warn('data layer not present: running on the shell store');
  return { store: createFallbackStore(), storage: { kind: 'fallback', refused } };
}

// Everything the shell hangs on ctx.data (architecture section 10). Each module is optional, so the shell also runs while a shard is
// missing; a module that fails to load is skipped and logged, never silent.
const DATA_SOURCES = [
  ['./review/index.js', null], // S3: runChecklist, afterSave, latestReview, evaluatePlan, positionSize, parseSentence, runReview, renderAiSettings, learn, guard
  ['./import/run.js', ['runImport', 'answerAnomaly', 'commitImport']], // S2
  ['./import/reconcile.js', ['reconcile', 'realisedTotal', 'reconcileQuantity']],
  ['./ui/views/tradeForm.js', ['openTradeForm']],
  ['./ui/views/dataSettings.js', ['renderDataSettings']],
];

export async function loadData() {
  const data = {};
  const getSummary = await firstExport(SUMMARY_MODULES);
  if (getSummary) data.getSummary = getSummary;
  for (const [path, names] of DATA_SOURCES) {
    try {
      const mod = await import(path);
      if (names) for (const n of names) data[n] = mod[n]; else Object.assign(data, mod);
    } catch (e) { console.warn(`data layer module ${path} did not load`, e); }
  }
  try { data.stats = await import('./stats/index.js'); } catch { /* the statistics engine (C5) has not merged yet */ }
  data.deleteAll = deleteAll;
  return data;
}

// Delete all data on this device (AC-P8.9): the stores, the own key, the settings mirror and, when chosen, the downloaded model.
export async function deleteAll({ store, alsoModel = false, storage = globalThis.localStorage, caches = globalThis.caches } = {}) {
  const actions = await import('./storage/actions.js');
  const removed = await actions.deleteAllData({ store, storage, caches, alsoModel });
  const ai = await import('./ai/keystore.js');
  ai.browserKeyStore().clearAll();
  if (alsoModel) await (await import('./ai/device.js')).deleteModelCaches(caches);
  return removed;
}

const applyTheme = (theme) => {
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
};

export async function mountApp({ store, storage, data = {}, root = document.getElementById('app'), win = window } = {}) {
  await loadCatalogues();
  const bus = createBus();
  const settings = await createSettings(store);
  const startLang = settings.get('lang') || (/^el/i.test(win.navigator.language) ? 'el' : 'en');
  setLang(startLang);
  applyTheme(settings.get('theme'));

  let router;
  const ctx = createCtx({ store, bus, settings, data, storage, router: { navigate: (h, s) => router.navigate(h, s) } });

  const chrome = el('div', { id: 'chrome' });
  const main = el('main', { class: 'view', id: 'view', tabindex: '-1' });
  mount(root, main, chrome);
  let cleanup = null;
  let token = 0;
  let firstPaint = true;

  async function loadView(name) {
    try { return { mod: await VIEW_MODULES[name]() }; } catch (error) { return { error }; }
  }

  async function renderRoute(match) {
    const mine = ++token;
    cleanup?.(); cleanup = null;
    const needsFirstRun = !settings.get('firstRunDone') && match.route?.view !== 'about';
    const viewName = needsFirstRun ? 'firstRun' : match.route?.view ?? 'home';
    const tab = needsFirstRun ? null : match.route?.tab;
    const chromeNone = needsFirstRun || match.route?.chrome === 'none';
    root.classList.toggle('no-tabs', chromeNone);
    mount(chrome, chromeNone ? null : tabbar({ current: tab }));
    const holder = el('div', { class: firstPaint ? null : 'view-enter' });
    mount(main, holder);
    const { mod, error } = await loadView(viewName);
    if (mine !== token) return;
    try {
      if (!mod?.render) {
        // The view has not landed yet: a designed state, not a blank screen.
        const notBuilt = await import('./ui/components/notBuilt.js');
        cleanup = notBuilt.render(holder, ctx, { ...match.params, name: viewName, error });
      } else cleanup = (await mod.render(holder, ctx, { ...match.params, query: match.query, state: match.state })) ?? null;
    } catch (e) {
      console.error(`view ${viewName} failed`, e);
      mount(holder, el('div', { class: 'content' }, stateBanner({ kind: 'danger', iconName: 'alert', title: t('error.viewTitle'), body: t('error.viewBody') })));
    }
    if (mine === token && !firstPaint) main.focus({ preventScroll: true });
    firstPaint = false;
    win.scrollTo?.(0, 0);
  }

  router = createRouter({ win, onRoute: renderRoute });
  bus.on('lang-changed', () => router.refresh());
  bus.on('mode-changed', () => router.refresh());
  onLang((l) => { win.document.documentElement.lang = l; });
  router.start();
  return { ctx, router, bus, settings };
}

export async function boot() {
  const { store, storage } = await openStore();
  const data = await loadData();
  const app = await mountApp({ store, storage, data });
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* offline support is a convenience, never a blocker */ });
  }
  return app;
}

if (!globalThis.__TJ_NO_BOOT__ && typeof location !== 'undefined') {
  const scene = new URLSearchParams(location.search).get('scene');
  if (scene && ['127.0.0.1', 'localhost'].includes(location.hostname)) {
    // Test scenes (architecture section 9): e2e/lib/scene.js fills the memory store from e2e/scenes/<name>.json with a fixed clock.
    import('../e2e/lib/scene.js').then((m) => m.bootScene(scene, { mountApp }));
  } else boot();
}
