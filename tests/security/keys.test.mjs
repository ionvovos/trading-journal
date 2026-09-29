// L4b probe 1 (nexa-build-trading-journal-2026-09-29): the own AI key. Behavioural, not a grep: the real engine ladder, the real review
// agent and sentence assist run with an intercepting fetch, a key saved for provider A, and the settings then changed to B. Every
// request is inspected in full (URL, headers, body). Findings that the app does not yet satisfy are `todo` tests: they run and
// report, they do not fail the suite, and each becomes an ordinary test when the fix lands.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { runReview } from '../../src/review/run.js';
import { resolveProvider, describeAiError, keyBinding } from '../../src/ai/adapter.js';
import { KEY_ENTRY, BINDING_ENTRY } from '../../src/ai/keystore.js';
import { createMemoryStore } from '../../src/storage/memory.js';
import { buildExport, parseExport, mergeImport } from '../../src/storage/exportImport.js';
import { deleteAllData } from '../../src/storage/actions.js';
import { saveAiSetting, loadAiSettings } from '../../src/ai/settings.js';
import { makeEnv, recorder, saveOwnKey, ownKeySettings, reviewInput, hostOf, wire, weeks } from './helpers.mjs';

const KEY_A = 'sk-ant-PROBE-KEY-A-0123456789';
const KEY_O = 'sk-openai-PROBE-KEY-O-0123456789';
const SETUPS = ['breakout', 'pullback'];

// Every path that can send a key: the review arrange call, sentence assist, and Test connection.
async function driveEveryPath(env, settings) {
  const engine = await env.engines.resolve(settings, 'en');
  await runReview(reviewInput('stocks'), { engine, bus: env.bus });
  await runReview(reviewInput('forex'), { engine, bus: env.bus });
  if (typeof engine.assist === 'function') await engine.assist('Bought 10 AAPL at 100 stop 98', { setups: SETUPS, lang: 'en' }).catch(() => {});
  if (typeof engine.test === 'function') await engine.test().catch(() => {});
  const direct = resolveProvider(settings, env.keys, { fetch: env.rec.fetch });
  if (direct) {
    await direct.test().catch(() => {});
    await direct.arrange([{ id: 'f1', pattern: 'busy_days', facts: { n: 5 } }]).catch(() => {});
  }
  return engine;
}

// ---------------------------------------------------------------- 1a. Anthropic key, then the provider setting changes
const AFTER_ANTHROPIC = {
  'switch to openai, default address': { 'ai.provider': 'openai', 'ai.model': 'gpt-x', 'ai.baseUrl': null },
  'switch to openai, custom https host': { 'ai.provider': 'openai', 'ai.model': 'm', 'ai.baseUrl': 'https://openrouter.ai/api/v1' },
  'switch to openai, hostile https host': { 'ai.provider': 'openai', 'ai.model': 'm', 'ai.baseUrl': 'https://collector.example/v1' },
  'switch to openai, local address': { 'ai.provider': 'openai', 'ai.model': 'm', 'ai.baseUrl': 'http://localhost:11434/v1' },
  'switch to openai, LAN name (.local)': { 'ai.provider': 'openai', 'ai.model': 'm', 'ai.baseUrl': 'https://nas.local/v1' },
  'switch to openai, address that names the Anthropic host in its path': { 'ai.provider': 'openai', 'ai.model': 'm', 'ai.baseUrl': 'https://collector.example/api.anthropic.com' },
  'switch to openai, Anthropic host as the address': { 'ai.provider': 'openai', 'ai.model': 'm', 'ai.baseUrl': 'https://api.anthropic.com/v1' },
  'provider none': { 'ai.provider': 'none', 'ai.model': '', 'ai.baseUrl': null },
};

test('positive control: an Anthropic key is sent to api.anthropic.com and only there, on every path', async () => {
  const env = makeEnv();
  const s = ownKeySettings();
  saveOwnKey(env.keys, s, KEY_A);
  await driveEveryPath(env, s);
  assert.ok(env.rec.calls.length >= 4, 'the paths ran');
  for (const c of env.rec.calls) {
    assert.equal(hostOf(c.url), 'api.anthropic.com');
    assert.equal(c.headers['x-api-key'], KEY_A);
    assert.equal(c.url.includes(KEY_A), false, 'key in the URL');
    assert.equal(c.body.includes(KEY_A), false, 'key in the body');
  }
});

for (const [name, patch] of Object.entries(AFTER_ANTHROPIC)) {
  test(`Anthropic key saved, then ${name}: the key leaves for no other host, on any path`, async () => {
    const env = makeEnv();
    saveOwnKey(env.keys, ownKeySettings(), KEY_A);
    await driveEveryPath(env, ownKeySettings(patch));
    for (const c of env.rec.calls) assert.equal(wire(c).includes(KEY_A), false, `key reached ${hostOf(c.url)}`);
    assert.equal(env.events.some(([, p]) => JSON.stringify(p).includes(KEY_A)), false, 'key in a bus event');
  });
}

// ---------------------------------------------------------------- 1b. OpenAI-compatible key, then the address changes
const BOUND = 'https://api.openai.com/v1';
const VARIANTS = [
  ['same address', BOUND, true],
  ['trailing slash', `${BOUND}/`, true],
  ['upper-case host', 'https://API.OPENAI.COM/v1', true],
  ['same host, other path', 'https://api.openai.com/other', true],
  ['host with a suffix', 'https://api.openai.com.collector.example/v1', false],
  ['user-info trick', 'https://api.openai.com@collector.example/v1', false],
  ['host inside the path', 'https://collector.example/https://api.openai.com/v1', false],
  ['host inside the query', 'https://collector.example/v1?host=api.openai.com', false],
  ['other port', 'https://api.openai.com:8443/v1', false],
  ['trailing dot', 'https://api.openai.com./v1', false],
  ['LAN name', 'https://nas.local/v1', false],
  ['local address', 'http://localhost:11434/v1', false],
];

for (const [name, url, sameHost] of VARIANTS) {
  test(`OpenAI-compatible key saved for ${BOUND}, address changed (${name}): key goes only to the host it was saved for`, async () => {
    const env = makeEnv();
    const saved = { 'ai.provider': 'openai', 'ai.model': 'm', 'ai.baseUrl': BOUND };
    saveOwnKey(env.keys, ownKeySettings(saved), KEY_O);
    await driveEveryPath(env, ownKeySettings({ ...saved, 'ai.baseUrl': url }));
    for (const c of env.rec.calls) {
      if (wire(c).includes(KEY_O)) assert.equal(hostOf(c.url), 'api.openai.com', `key reached ${hostOf(c.url)}`);
    }
    if (!sameHost) assert.equal(env.rec.calls.some((c) => wire(c).includes(KEY_O)), false);
  });
}

test('OpenAI-compatible key saved, provider switched to Anthropic: the key is not sent, nothing is requested', async () => {
  const env = makeEnv();
  const saved = { 'ai.provider': 'openai', 'ai.model': 'm', 'ai.baseUrl': BOUND };
  saveOwnKey(env.keys, ownKeySettings(saved), KEY_O);
  await driveEveryPath(env, ownKeySettings({ 'ai.provider': 'anthropic', 'ai.model': '', 'ai.baseUrl': null }));
  assert.equal(env.rec.calls.length, 0);
});

test('a key is never sent in clear text to a non-local host: same host, scheme changed from https to http (F1)', async () => {
  const env = makeEnv();
  const saved = { 'ai.provider': 'openai', 'ai.model': 'm', 'ai.baseUrl': BOUND };
  saveOwnKey(env.keys, ownKeySettings(saved), KEY_O);
  await driveEveryPath(env, ownKeySettings({ ...saved, 'ai.baseUrl': 'http://api.openai.com/v1' }));
  const clear = env.rec.calls.filter((c) => c.url.startsWith('http://') && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(c.url));
  assert.equal(clear.some((c) => wire(c).includes(KEY_O)), false, 'key sent over http:// to a public host');
  assert.equal(env.rec.calls.length, 0, 'an http address for a public host is refused: no request at all');
});

test('the scheme is part of the binding: a key saved for http://localhost is not handed to https://localhost, and a binding saved without a scheme (an older build) hands out nothing', () => {
  const env = makeEnv();
  const http = ownKeySettings({ 'ai.provider': 'openai', 'ai.model': 'm', 'ai.baseUrl': 'http://localhost:8080/v1' });
  const https = ownKeySettings({ 'ai.provider': 'openai', 'ai.model': 'm', 'ai.baseUrl': 'https://localhost:8080/v1' });
  saveOwnKey(env.keys, http, KEY_O);
  assert.equal(env.keys.hasKeyFor(keyBinding(http)), true);
  assert.equal(env.keys.hasKeyFor(keyBinding(https)), false);
  env.storage.setItem(BINDING_ENTRY, JSON.stringify({ provider: 'openai', host: 'localhost:8080' }));
  assert.equal(env.keys.hasKeyFor(keyBinding(http)), false, 'a scheme-less binding is treated as unbound');
});

test('a key saved for a local address goes to that port only', async () => {
  const env = makeEnv();
  const local = { 'ai.provider': 'openai', 'ai.model': 'm', 'ai.baseUrl': 'http://localhost:11434/v1' };
  saveOwnKey(env.keys, ownKeySettings(local), KEY_O);
  await driveEveryPath(env, ownKeySettings({ ...local, 'ai.baseUrl': 'http://localhost:9999/v1' }));
  for (const c of env.rec.calls) assert.equal(wire(c).includes(KEY_O), false);
});

// ---------------------------------------------------------------- 1c. the key does not appear where it must not
test('the key is not in an export, a stored setting, a review, a bus event, an error message or the URL', async () => {
  const env = makeEnv();
  const store = createMemoryStore();
  const s = ownKeySettings({ 'ai.provider': 'openai', 'ai.model': 'm', 'ai.baseUrl': BOUND });
  saveOwnKey(env.keys, s, KEY_O);
  for (const [k, v] of Object.entries(s)) await saveAiSetting({ store }, k, v);
  await store.trades.put(reviewInput('stocks').trades[0]);
  const engine = await env.engines.resolve(s, 'en');
  const review = await runReview(reviewInput('stocks'), { engine, bus: env.bus });
  await store.reviews.put(review);
  const file = JSON.stringify(await buildExport(store, { now: '2026-09-29T00:00:00Z' }));
  assert.equal(file.includes(KEY_O), false, 'key in the export');
  assert.equal(file.includes(BINDING_ENTRY), false);
  assert.equal(JSON.stringify(review).includes(KEY_O), false, 'key in the stored review');
  assert.equal(JSON.stringify(await store.allSettings()).includes(KEY_O), false, 'key in settings');
  assert.equal(JSON.stringify(env.events).includes(KEY_O), false, 'key in a bus event');
  assert.deepEqual([...env.storage.m.keys()].sort(), [BINDING_ENTRY, KEY_ENTRY].sort(), 'only the two documented localStorage entries exist');
  for (const c of env.rec.calls) assert.equal(c.url.includes(KEY_O), false);
});

test('a provider that echoes the key in an error body cannot put it on screen (429, 500, 401; Bearer and x-api-key)', async () => {
  for (const [provider, key, status, shape] of [['anthropic', KEY_A, 429, 'plain'], ['anthropic', KEY_A, 500, 'json'], ['anthropic', KEY_A, 401, 'plain'], ['openai', KEY_O, 500, 'json'], ['openai', KEY_O, 429, 'plain']]) {
    const body = shape === 'json' ? JSON.stringify({ error: { message: `Incorrect API key provided: ${key}. Contact support.` } }) : `bad key ${key} for this request`;
    const env = makeEnv();
    const failing = recorder({ status, body });
    const s = provider === 'anthropic' ? ownKeySettings() : ownKeySettings({ 'ai.provider': 'openai', 'ai.model': 'm', 'ai.baseUrl': BOUND });
    saveOwnKey(env.keys, s, key);
    const p = resolveProvider(s, env.keys, { fetch: failing.fetch });
    let shown = '';
    try { await p.test(); } catch (err) { shown = `${err.message} | ${describeAiError(err)}`; }
    assert.ok(shown.length > 0, 'the call failed as arranged');
    assert.equal(shown.includes(key), false, `${provider} ${status}: key on screen`);
  }
});

test('delete-all removes the key and its binding, the AI settings, and every store; the shell cache stays', async () => {
  const env = makeEnv();
  const store = createMemoryStore();
  saveOwnKey(env.keys, ownKeySettings(), KEY_A);
  env.storage.setItem('trading-journal.other', 'x');
  env.storage.setItem('unrelated.site.entry', 'keep');
  await saveAiSetting({ store }, 'ai.provider', 'anthropic');
  await store.trades.put(reviewInput('stocks').trades[0]);
  const caches = { names: ['tj-v1', 'tj-cdn', 'webllm/model', 'webllm/config'], async keys() { return [...this.names]; }, async delete(n) { this.names = this.names.filter((x) => x !== n); return true; } };
  await deleteAllData({ store, storage: env.storage, caches, alsoModel: true });
  assert.equal(env.storage.m.has(KEY_ENTRY) || env.storage.m.has(BINDING_ENTRY) || env.storage.m.has('trading-journal.other'), false);
  assert.equal(env.storage.m.get('unrelated.site.entry'), 'keep');
  assert.deepEqual(await store.allSettings(), {});
  assert.equal((await store.trades.getAll()).length, 0);
  assert.deepEqual(caches.names, ['tj-v1'], 'model and runtime caches go with the option, the app shell stays');
});

// ---------------------------------------------------------------- 1d. findings: settings are exported and imported
test('an imported file cannot switch the own-key engine on or point it at an address of its own: its trades import, no ai.* setting does (R2, F2)', async () => {
  const hostile = { format: 'trading-journal-export', version: 1, exportedAt: '2026-09-29T00:00:00Z', settings: { 'ai.provider': 'openai', 'ai.model': 'x', 'ai.baseUrl': 'https://collector.local/v1', 'ai.own.confirmed': true, 'ai.engine': 'own-key', 'ai.device.consent': 'yes', 'ai.key': 'sk-x', 'apiKey': 'sk-y', 'dayCutoffHour': 4, 'x.unknown': 'z', 'lang': { nested: true } }, trades: [weeks.stocks.trades[0]], accounts: [{ id: 'acc-s', name: 'Main', mode: 'real', baseCurrency: 'USD' }] };
  const parsed = parseExport(JSON.stringify(hostile));
  assert.equal(parsed.ok, true);
  const store = createMemoryStore();
  const r = await mergeImport(store, parsed.data);
  assert.equal(r.byStore.trades.added, 1, 'the trades of the file are imported');
  assert.deepEqual(await store.allSettings(), { dayCutoffHour: 4 }, 'only an allow-listed data setting with a plain value comes from the file');
  const s = await loadAiSettings(store);
  assert.equal(s['ai.own.confirmed'], false);
  assert.equal(s['ai.baseUrl'], null);
  assert.equal(s['ai.provider'], 'none');
  const env = makeEnv();
  const engine = await env.engines.resolve(s, 'en');
  await runReview(reviewInput('stocks'), { engine, bus: env.bus });
  assert.equal(env.rec.calls.length, 0, `review data went to ${env.rec.calls.map((c) => hostOf(c.url)).join(', ')} with no key and no consent screen`);
});

test('an address typed with a secret in it (query string or user-info) does not reach an export file (F3)', async () => {
  const store = createMemoryStore();
  await saveAiSetting({ store }, 'ai.baseUrl', 'https://gateway.example/v1?api-key=SECRET-IN-URL');
  await saveAiSetting({ store }, 'ai.model', 'm');
  const file = JSON.stringify(await buildExport(store, { now: '2026-09-29T00:00:00Z' }));
  assert.equal(file.includes('SECRET-IN-URL'), false);
});

// ---------------------------------------------------------------- 1e. service worker: provider requests are never intercepted or cached
function loadServiceWorker() {
  const src = readFileSync(new URL('../../sw.js', import.meta.url), 'utf8');
  const listeners = {};
  const cachePuts = [];
  const opened = [];
  const cache = { add: async () => {}, put: async (req) => { cachePuts.push(req.url ?? String(req)); }, match: async () => undefined };
  const context = {
    self: { location: { origin: 'https://app.example' }, addEventListener: (t, fn) => { listeners[t] = fn; }, skipWaiting: async () => {}, clients: { claim: async () => {} } },
    caches: { open: async (n) => { opened.push(n); return cache; }, match: async () => undefined, keys: async () => [], delete: async () => true },
    fetch: async () => new Response('ok', { status: 200 }), Request, Response, URL, console, Promise,
  };
  vm.createContext(context);
  vm.runInContext(src, context);
  const fire = async (url, { method = 'GET', mode = 'cors' } = {}) => {
    let responded = null;
    const ev = { request: { url, method, mode, clone() { return this; } }, respondWith: (p) => { responded = Promise.resolve(p); }, waitUntil: () => {} };
    listeners.fetch(ev);
    if (responded) await responded;
    return { intercepted: responded !== null };
  };
  return { fire, cachePuts, opened };
}

test('service worker: an AI provider request (POST or GET, any provider host, key in a header or in the URL) is never intercepted or cached', async () => {
  const sw = loadServiceWorker();
  for (const [url, method] of [['https://api.anthropic.com/v1/messages', 'POST'], ['https://api.openai.com/v1/chat/completions', 'POST'], ['https://collector.example/v1/chat/completions?key=abc', 'GET'], ['http://localhost:11434/v1/chat/completions', 'POST'], ['https://api.anthropic.com/v1/messages?x-api-key=abc', 'GET'], ['https://huggingface.co/mlc-ai/x/resolve/main/model.bin', 'GET']]) {
    const r = await sw.fire(url, { method });
    assert.equal(r.intercepted, false, `${method} ${url}`);
  }
  assert.deepEqual(sw.cachePuts, [], 'nothing was written to a cache');
});

test('service worker: only the app shell and the pinned jsDelivr library are cached; caches are named tj-v* and tj-cdn', async () => {
  const sw = loadServiceWorker();
  const shell = await sw.fire('https://app.example/src/app.js');
  const cdn = await sw.fire('https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.85/+esm');
  assert.equal(shell.intercepted && cdn.intercepted, true);
  for (const n of sw.opened) assert.match(n, /^(tj-v\d+|tj-cdn)$/);
});
