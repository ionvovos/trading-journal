import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHash } from '../../src/ui/router.js';
import { ROUTES, VIEW_MODULES, TABS, DEFAULT_HASH, LOG_HASH } from '../../src/ui/routes.js';

// The route list of architecture section 10, verbatim (plus the settings sections that host S2 and S3 screens).
const ARCH_ROUTES = ['/home', '/journal', '/trade/new', '/trade/:id', '/stops', '/accounts', '/cash', '/import', '/import/:id', '/reconcile/:accountId', '/stats/:tab', '/calendar', '/drill/:figure', '/plan', '/sizing', '/review', '/review/:id', '/learn/:term', '/sentence', '/settings', '/about'];

test('every route of architecture section 10 exists', () => {
  const have = new Set(ROUTES.map((r) => r.path));
  for (const p of ARCH_ROUTES) assert.ok(have.has(p), `missing route ${p}`);
});

test('every route names a view that the loader table knows, and every hash parses back to its route', () => {
  for (const r of ROUTES) assert.equal(typeof VIEW_MODULES[r.view], 'function', `${r.path}: no loader for ${r.view}`);
  const sample = { '/trade/:id': '/trade/abc', '/import/:id': '/import/i1', '/reconcile/:accountId': '/reconcile/acc-1', '/stats/:tab': '/stats/buckets', '/drill/:figure': '/drill/expectancy', '/review/:id': '/review/r1', '/learn/:term': '/learn/r', '/settings/:section': '/settings/ai' };
  for (const r of ROUTES) assert.equal(parseHash(`#${sample[r.path] ?? r.path}`).route.path, r.path);
});

test('a specific route beats a parameter route: /trade/new is the form, /trade/abc is a trade', () => {
  assert.equal(parseHash('#/trade/new').route.view, 'tradeForm');
  assert.equal(parseHash('#/trade/abc').route.view, 'trade');
  assert.equal(parseHash('#/trade/abc').params.id, 'abc');
});

test('params, query and defaults', () => {
  const m = parseHash('#/stats/overview?from=2026-09-01&acct=acc%201');
  assert.deepEqual(m.params, { tab: 'overview' }); assert.deepEqual(m.query, { from: '2026-09-01', acct: 'acc 1' });
  assert.equal(parseHash('').route.path, '/home'); assert.equal(parseHash('#/nope').route, null);
  assert.equal(parseHash('#/reconcile/acc%2F1').params.accountId, 'acc/1');
});

test('tabs point at real routes and the log button opens the trade form', () => {
  assert.equal(TABS.length, 4);
  for (const tab of TABS) assert.ok(parseHash(tab.hash).route, tab.hash);
  assert.equal(parseHash(LOG_HASH).route.view, 'tradeForm');
  assert.equal(DEFAULT_HASH, '#/home');
  const tabIds = new Set(TABS.map((x) => x.id));
  for (const r of ROUTES) if (r.tab) assert.ok(tabIds.has(r.tab), `${r.path}: unknown tab ${r.tab}`);
});
