// Shared fixtures for the L4b security probes (tests/security/*). Behavioural: the probes drive the real engine ladder, the real
// review agent and the real store code with an intercepting fetch, and read what would have left the device.
import { readFileSync } from 'node:fs';
import { createKeyStore } from '../../src/ai/keystore.js';
import { createEngines } from '../../src/ai/engine.js';
import { keyBinding } from '../../src/ai/adapter.js';

export const weeks = JSON.parse(readFileSync(new URL('../fixtures/review/weeks.json', import.meta.url), 'utf8'));
export const legalTable = JSON.parse(readFileSync(new URL('../fixtures/review/legal-table.json', import.meta.url), 'utf8'));

// What runReview takes, from one seeded week; `mutate(week)` may return a modified deep copy.
export const reviewInput = (name, over = {}, mutate = (w) => w) => {
  const w = mutate(structuredClone(weeks[name]));
  return {
    trades: w.trades, cash: [], accounts: w.accounts, plans: [w.plan], settings: { smallSampleMin: 30, lossWindowMin: 30, tz: w.tz, dayCutoffHour: 0 },
    mode: w.mode, period: w.period, lang: 'en', tz: w.tz, now: new Date('2026-09-25T10:00:00Z'), ...over,
  };
};

export const memoryStorage = () => {
  const m = new Map();
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null };
};

// A fetch that records every request in full and answers a reword or assist call with a valid, harmless reply
// (the finding's own template sentence, so the review accepts it and the model path is really exercised).
export function recorder({ status = 200, body = null } = {}) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    const headers = Object.fromEntries(Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
    const raw = typeof init.body === 'string' ? init.body : '';
    calls.push({ url: String(url), method: init.method ?? 'GET', headers, body: raw });
    if (body !== null) return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
    let user = '';
    try {
      const j = JSON.parse(raw);
      user = typeof j.messages?.at(-1)?.content === 'string' ? j.messages.at(-1).content : '';
    } catch { /* not JSON */ }
    let payload = {};
    try { payload = JSON.parse(user); } catch { /* the test-connection ping */ }
    const reply = Array.isArray(payload.items)
      ? { order: payload.items.map((i) => i.id) }
      : payload.sentence !== undefined ? { setup: null, notes: null } : { ok: true };
    const text = JSON.stringify(reply);
    return new Response(JSON.stringify({ choices: [{ message: { content: text } }], content: [{ type: 'text', text }] }), { status });
  };
  return { calls, fetch };
}

export const hostOf = (url) => { try { return new URL(url).host; } catch { return null; } };
export const wire = (call) => `${call.url}\n${JSON.stringify(call.headers)}\n${call.body}`;

// Mirrors what Settings > AI does when the user saves an own key: bind it to the provider and host of the settings being saved.
export function saveOwnKey(keys, settings, key) {
  const binding = keyBinding(settings);
  keys.reconcileKey(binding);
  keys.setKey(key, binding);
  return binding;
}

export function makeEnv({ storage = memoryStorage(), fetchImpl = null } = {}) {
  const keys = createKeyStore(storage);
  const rec = recorder();
  const events = [];
  const bus = { emit: (name, payload) => events.push([name, payload]), on: () => () => {} };
  const device = { model: 'stub', check: async () => ({ state: 'not-supported', reason: 'no-webgpu' }), loaded: () => false, load: async () => { throw new Error('the probes never download a model'); } };
  const engines = createEngines({ device, keys, fetch: fetchImpl ?? rec.fetch, bus, online: () => true });
  return { storage, keys, rec, events, bus, engines, device };
}

export const ownKeySettings = (over = {}) => ({ 'ai.engine': 'own-key', 'ai.provider': 'anthropic', 'ai.model': '', 'ai.baseUrl': null, 'ai.own.confirmed': true, 'ai.device.consent': 'ask', ...over });

// ---- L4 fix round (RULING-L4-F5 R1): what a review shows, and a review driven by a raw model reply
import { createProvider } from '../../src/ai/adapter.js';
import { runReview } from '../../src/review/run.js';

// Every string the review view prints for a review: titles, sentences, questions and the summary lines (src/ui/views/review.js).
export const visibleStrings = (review) => [...review.findings.flatMap((f) => [f.title, f.text, f.question]), ...Object.values(review.lines ?? {})].filter(Boolean);

// A real provider (real JSON extraction and validation) whose HTTP answer is `content`; `content` may be a function of the parsed request.
// Returns the finished review and the ids the request carried.
export async function reviewWithReply(name, lang, content, over = {}) {
  let ids = [];
  const fetch = async (url, init = {}) => {
    let payload = {};
    try { payload = JSON.parse(JSON.parse(init.body).messages.at(-1).content); } catch { /* not JSON */ }
    ids = Array.isArray(payload.items) ? payload.items.map((i) => i.id) : ids;
    const text = typeof content === 'function' ? content(payload) : content;
    return new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), { status: 200 });
  };
  const provider = createProvider({ provider: 'openai', model: 'm', baseUrl: 'http://localhost:11434/v1' }, { fetch });
  const review = await runReview(reviewInput(name, { lang, ...over }), { engine: provider });
  return { review, ids };
}
