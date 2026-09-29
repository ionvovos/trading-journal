// Route table (architecture section 10). Hash routing, all URLs relative, so the app works under /trading-journal/ with no 404 fallback.
// A view module exports render(root, ctx, params) -> cleanup | void. A view that has not landed yet renders the not-built page.
// `tab` names the bottom tab that stays highlighted; `chrome: 'none'` hides the tab bar (sheets and focused flows).
export const ROUTES = [
  { path: '/home', view: 'home', tab: 'home' },
  { path: '/journal', view: 'journal', tab: 'journal' },
  { path: '/trade/new', view: 'tradeForm', chrome: 'none' },
  { path: '/trade/:id', view: 'trade', tab: 'journal' },
  { path: '/stops', view: 'bulkStops', tab: 'journal' },
  { path: '/accounts', view: 'accounts', tab: 'stats' },
  { path: '/cash', view: 'cash', tab: 'stats' },
  { path: '/import', view: 'import', chrome: 'none' },
  { path: '/import/:id', view: 'import', chrome: 'none' },
  { path: '/reconcile/:accountId', view: 'reconcile', tab: 'home' },
  { path: '/stats/:tab', view: 'stats', tab: 'stats' },
  { path: '/calendar', view: 'calendar', tab: 'stats' },
  { path: '/drill/:figure', view: 'drill', tab: 'stats' },
  { path: '/plan', view: 'plan', tab: 'review', chrome: 'none' }, // its Save bar is fixed at the bottom: the tab bar would cover it (V2 G1)
  { path: '/sizing', view: 'sizing', tab: 'review' },
  { path: '/review', view: 'review', tab: 'review' },
  { path: '/review/:id', view: 'review', tab: 'review' },
  { path: '/learn/:term', view: 'learn', tab: 'review' },
  { path: '/sentence', view: 'sentence', chrome: 'none' },
  { path: '/settings', view: 'settings', tab: 'home' },
  { path: '/settings/:section', view: 'settings', tab: 'home' },
  { path: '/about', view: 'about', tab: 'home' },
];

export const TABS = [
  { id: 'home', hash: '#/home', icon: 'home', labelKey: 'nav.home' },
  { id: 'journal', hash: '#/journal', icon: 'journal', labelKey: 'nav.journal' },
  { id: 'stats', hash: '#/stats/overview', icon: 'stats', labelKey: 'nav.stats' },
  { id: 'review', hash: '#/review', icon: 'review', labelKey: 'nav.review' },
];

export const DEFAULT_HASH = '#/home';
export const LOG_HASH = '#/trade/new';

// Views written by S1; every other view comes from S2 or S3 and loads on demand.
export const VIEW_MODULES = {
  home: () => import('./views/home.js'),
  settings: () => import('./views/settings.js'),
  about: () => import('./views/about.js'),
  firstRun: () => import('./views/firstRun.js'),
  journal: () => import('./views/journal.js'),
  trade: () => import('./views/trade.js'),
  tradeForm: () => import('./views/tradeForm.js'),
  bulkStops: () => import('./views/bulkStops.js'),
  accounts: () => import('./views/accounts.js'),
  cash: () => import('./views/cash.js'),
  import: () => import('./views/import.js'),
  reconcile: () => import('./views/reconcile.js'),
  stats: () => import('./views/stats.js'),
  calendar: () => import('./views/calendar.js'),
  drill: () => import('./views/drill.js'),
  plan: () => import('./views/plan.js'),
  checklist: () => import('./views/checklist.js'),
  sizing: () => import('./views/sizing.js'),
  review: () => import('./views/review.js'),
  learn: () => import('./views/learn.js'),
  sentence: () => import('./views/sentence.js'),
};
