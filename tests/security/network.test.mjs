// L4b probe 2: what leaves the device, and when. A scripted session runs the real code paths with fetch, WebSocket, EventSource and
// XMLHttpRequest replaced by recorders. Requirements AC-P8.2, AC-P9.1, AC-P9.2, AC-B1.2, AC-B1.3, architecture section 6.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { runReview } from '../../src/review/run.js';
import { parseSentence } from '../../src/sentence/parse.js';
import { assistSentence } from '../../src/sentence/assist.js';
import { createMemoryStore } from '../../src/storage/memory.js';
import { buildExport, parseExport, mergeImport } from '../../src/storage/exportImport.js';
import { reportHtml, reportJson } from '../../src/import/reportHtml.js';
import { createFormat } from '../../src/i18n/format.js';
import { makeEnv, saveOwnKey, ownKeySettings, reviewInput, hostOf, wire, weeks } from './helpers.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function trapNetwork() {
  const seen = [];
  const saved = {};
  const names = ['fetch', 'WebSocket', 'EventSource', 'XMLHttpRequest'];
  for (const n of names) {
    saved[n] = globalThis[n];
    globalThis[n] = function trapped(...args) { seen.push({ api: n, arg: String(args[0]) }); throw new Error(`network call by ${n}: ${args[0]}`); };
  }
  return { seen, restore: () => { for (const n of names) { if (saved[n] === undefined) delete globalThis[n]; else globalThis[n] = saved[n]; } } };
}

async function scriptedSession(settings, lang = 'en') {
  const env = makeEnv({ fetchImpl: (...a) => globalThis.fetch(...a) });
  const store = createMemoryStore();
  for (const t of weeks.stocks.trades) await store.trades.put(t);
  for (const a of weeks.stocks.accounts) await store.accounts.put({ name: 'Main', mode: 'real', ...a });
  await store.plans.put(weeks.stocks.plan);
  const engine = await env.engines.resolve(settings, lang);
  await env.engines.status(settings, lang);
  const review = await runReview(reviewInput('stocks', { lang }), { engine, bus: env.bus });
  await store.reviews.put(review);
  const parsed = parseSentence('Bought 50 AAPL at 100 stop 98', { lang, setups: ['breakout'], instruments: ['AAPL'], now: '2026-09-25T10:00:00Z' });
  await assistSentence(engine, 'Bought 50 AAPL at 100 stop 98', parsed, { lang, setups: ['breakout'] });
  const file = await buildExport(store, { now: '2026-09-29T00:00:00Z' });
  const back = parseExport(JSON.stringify(file));
  await mergeImport(createMemoryStore(), back.data);
  const record = { id: 'i1', fileName: 'x.csv', formatId: 'generic-csv', createdAt: '2026-09-29T00:00:00Z', report: { rowsInFile: 1, rowsRead: 1, tradesBuilt: 1, matched: 0, skipped: [], rKnownShare: { known: 1, of: 1 }, period: null }, anomalies: [] };
  reportHtml(record, { t: (k) => k, fmt: createFormat({ lang, tz: 'UTC' }) });
  reportJson(record);
  return { review, engine };
}

test('no key, no consent: a full scripted session makes no network request at all (rules engine)', async () => {
  const net = trapNetwork();
  try {
    for (const lang of ['en', 'el']) {
      const { review } = await scriptedSession({ 'ai.engine': 'auto', 'ai.provider': 'none', 'ai.own.confirmed': false, 'ai.device.consent': 'ask' }, lang);
      assert.equal(review.engine, 'rules');
    }
  } finally { net.restore(); }
  assert.deepEqual(net.seen, []);
});

test('consent to the model download alone requests nothing until the user starts the download', async () => {
  const net = trapNetwork();
  try {
    const { review } = await scriptedSession({ 'ai.engine': 'on-device', 'ai.provider': 'none', 'ai.own.confirmed': false, 'ai.device.consent': 'yes' });
    assert.equal(review.engine, 'rules', 'no model is loaded, so rules answer');
  } finally { net.restore(); }
  assert.deepEqual(net.seen, []);
});

test('a saved key that the user has not turned on (ai.own.confirmed false) is not used and nothing is requested', async () => {
  const net = trapNetwork();
  try {
    const env = makeEnv();
    const s = ownKeySettings({ 'ai.own.confirmed': false });
    saveOwnKey(env.keys, s, 'sk-ant-NOT-TURNED-ON-0123456789');
    const engine = await env.engines.resolve(s, 'en');
    await runReview(reviewInput('stocks'), { engine });
  } finally { net.restore(); }
  assert.deepEqual(net.seen, []);
  const env2 = makeEnv();
  const s2 = ownKeySettings({ 'ai.own.confirmed': false });
  saveOwnKey(env2.keys, s2, 'sk-ant-NOT-TURNED-ON-0123456789');
  await runReview(reviewInput('stocks'), { engine: await env2.engines.resolve(s2, 'en') });
  assert.equal(env2.rec.calls.length, 0);
});

// ---------------------------------------------------------------- what an own-key request carries
const NOTE = 'ZQXNOTE-7431';
const SETUP = 'ZQXSETUP-7431';
const PLANNAME = 'ZQXPLAN-7431';
const ACCNAME = 'ZQXACC-7431';

function marked(week) {
  week.trades.forEach((t) => { t.notes = `${NOTE} ${t.id}`; t.setup = t.setup ? SETUP : null; t.moodBefore = 'ZQXMOOD'; });
  week.plan.name = PLANNAME;
  week.plan.setups = [SETUP];
  week.accounts.forEach((a) => { a.name = ACCNAME; });
  return week;
}

for (const lang of ['en', 'el']) {
  for (const name of ['stocks', 'crypto', 'forex']) {
    test(`own-key review request, ${name} week, ${lang}: only figures and fixed sentences are on the wire; no trade, note, name or plan text`, async () => {
      const env = makeEnv();
      const s = ownKeySettings();
      saveOwnKey(env.keys, s, 'sk-ant-WIRE-0123456789');
      const engine = await env.engines.resolve(s, lang);
      const week = weeks[name];
      const input = reviewInput(name, { lang }, marked);
      const review = await runReview(input, { engine });
      assert.ok(env.rec.calls.length >= 1, 'the model path ran');
      const forbidden = [NOTE, SETUP, PLANNAME, ACCNAME, 'ZQXMOOD',
        ...new Set(week.trades.map((t) => t.instrument)), ...week.plan.items.map((i) => i.text), ...week.accounts.map((a) => a.id)];
      for (const c of env.rec.calls) {
        const text = wire(c).replace(/sk-ant-WIRE-0123456789/g, '');
        for (const f of forbidden) assert.equal(text.includes(f), false, `${f} is on the wire`);
        assert.equal(/"t\d+"|"[a-z]{1,3}-\d+"/.test(c.body), false, 'a trade id is on the wire');
        assert.equal(hostOf(c.url), 'api.anthropic.com');
      }
      assert.equal(JSON.stringify(review).includes('ZQXMOOD'), false);
      for (const f of review.findings) assert.equal((f.text + (f.question ?? '')).includes(NOTE), false);
    });
  }
}

test('a review that quotes the user\'s own plan rule never sends that finding to the model (the quote is the user\'s words)', async () => {
  const env = makeEnv();
  const s = ownKeySettings();
  saveOwnKey(env.keys, s, 'sk-ant-WIRE-0123456789');
  const engine = await env.engines.resolve(s, 'en');
  await runReview(reviewInput('stocks'), { engine });
  const all = env.rec.calls.map((c) => c.body).join('\n');
  for (const item of weeks.stocks.plan.items) assert.equal(all.includes(item.text), false);
});

test('sentence assist request: what is on the wire beyond the typed sentence', { todo: 'F4: assist also sends the user\'s setup names (the "setups" list); the disclosure on the AI screen lists the sentence but not the setup names' }, async () => {
  const env = makeEnv();
  const s = ownKeySettings();
  saveOwnKey(env.keys, s, 'sk-ant-WIRE-0123456789');
  const engine = await env.engines.resolve(s, 'en');
  const sentence = 'Bought 50 AAPL at 100 stop 98';
  const parsed = parseSentence(sentence, { lang: 'en', setups: [SETUP], instruments: ['AAPL'], now: '2026-09-25T10:00:00Z' });
  await assistSentence(engine, sentence, parsed, { lang: 'en', setups: [SETUP, 'ZQXSETUP-OTHER'] });
  assert.equal(env.rec.calls.length, 1);
  assert.equal(env.rec.calls[0].body.includes('ZQXSETUP'), false, 'setup names left the device');
});

// ---------------------------------------------------------------- static: every host the code can name
const walk = (dir) => readdirSync(join(root, dir)).flatMap((n) => { const rel = `${dir}/${n}`; return statSync(join(root, rel)).isDirectory() ? walk(rel) : [rel]; });
const codeOf = (f) => readFileSync(join(root, f), 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
const CODE = [...walk('src').filter((f) => f.endsWith('.js') && !/^src\/(learn|about|i18n)\//.test(f)), 'sw.js'];
const ALLOWED_HOSTS = new Set([
  'cdn.jsdelivr.net', 'huggingface.co', 'raw.githubusercontent.com',       // architecture 6: model runtime, weights, model library
  'api.anthropic.com', 'api.openai.com',                                    // own-key defaults (the address is otherwise typed by the user)
  'github.com', 'www.w3.org',                                               // About link, SVG namespace
]);

test('every URL literal in code that can run a request names a host architecture section 6 allows', () => {
  const bad = [];
  for (const f of CODE) {
    for (const m of codeOf(f).matchAll(/https?:\/\/([^\s'"`)/:]+)/g)) {
      const host = m[1];
      if (ALLOWED_HOSTS.has(host) || /^(localhost|127\.0\.0\.1)$/.test(host) || host === '${REPO}' || host.startsWith('${')) continue;
      bad.push(`${f}: ${m[0]}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('the model download pins its files to commits on the three allowed hosts, and the library to one version', async () => {
  const { MODEL_APP_CONFIG, WEBLLM_URL } = await import('../../src/ai/device.js');
  const entry = MODEL_APP_CONFIG.model_list[0];
  assert.match(entry.model, /^https:\/\/huggingface\.co\/[^/]+\/[^/]+\/resolve\/[0-9a-f]{40}\//);
  assert.match(entry.model_lib, /^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[0-9a-f]{40}\//);
  assert.match(WEBLLM_URL, /^https:\/\/cdn\.jsdelivr\.net\/npm\/@mlc-ai\/web-llm@\d+\.\d+\.\d+\/\+esm$/);
  assert.match(readFileSync(join(root, 'src/ai/worker.js'), 'utf8'), /web-llm@0\.2\.85\/\+esm/);
});

test('no code path reads a price feed, a broker API or an account: no request builder other than the AI provider and the model download exists (AC-B1.2, AC-B1.3)', () => {
  const callers = [];
  for (const f of CODE) if (/\bfetch\s*\(|new WebSocket|XMLHttpRequest|EventSource|sendBeacon|navigator\.credentials/.test(codeOf(f))) callers.push(f);
  // src/ai/http.js receives fetch by injection; the two files that hand it the real fetch are the engine wiring and Test connection.
  assert.deepEqual(callers.sort(), ['src/ai/index.js', 'src/ui/views/aiSettings.js', 'sw.js'].sort());
});

test('learn entries link to https sources only, with rel noopener (a link the user taps, never fetched by the app)', () => {
  for (const f of ['src/learn/entries.en.js', 'src/learn/entries.el.js']) {
    for (const m of readFileSync(join(root, f), 'utf8').matchAll(/https?:\/\/[^\s'"`)]+/g)) assert.match(m[0], /^https:\/\//, `${f}: ${m[0]}`);
  }
  assert.match(readFileSync(join(root, 'src/ui/views/learn.js'), 'utf8'), /rel: 'noopener noreferrer'/);
});
