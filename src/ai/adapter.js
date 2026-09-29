// Provider-neutral AI layer for the own-key rung: settings to provider, JSON extraction, validation, timeouts. Pure: fetch, clock
// and key reader are injected. Ported from thought-catcher src/core/ai/adapter.js (same author, MIT), with the journal's calls:
// reword review sentences and assist a typed trade sentence. Settings keys: ai.provider, ai.model, ai.baseUrl.
import { AiError, describeAiError } from './http.js';
import { createAnthropic, ANTHROPIC_DEFAULT_MODEL, ANTHROPIC_URL } from './anthropic.js';
import { createOpenAi, OPENAI_DEFAULT_BASE_URL } from './openai.js';
import { arrangePrompt, assistPrompt } from './prompts.js';

export { AiError, describeAiError, ANTHROPIC_DEFAULT_MODEL, OPENAI_DEFAULT_BASE_URL };

export const PROVIDERS = Object.freeze(['none', 'anthropic', 'openai']);
export const TIMEOUTS = Object.freeze({ arrange: 45000, assist: 20000, test: 10000 });

// Strips code fences, takes the first balanced {...} and parses it.
export function extractJson(text) {
  if (typeof text !== 'string') throw new AiError('malformed', 'The AI reply was empty.');
  const src = text.replace(/```(?:json)?/gi, '');
  const start = src.indexOf('{');
  if (start < 0) throw new AiError('malformed', 'The AI reply had no JSON object.');
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < src.length; i += 1) {
    const c = src[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          const value = JSON.parse(src.slice(start, i + 1));
          if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('not an object');
          return value;
        } catch {
          throw new AiError('malformed', 'The AI reply was not valid JSON.');
        }
      }
    }
  }
  throw new AiError('malformed', 'The AI reply was cut off.');
}

const bad = (why) => new AiError('malformed', `The AI reply was not usable: ${why}.`);

// { order: [id, ...] } -> the ids that are in `knownIds`, each once, in the model's order. Everything else in the reply is dropped:
// a text field, an unknown id and a repeated id never reach the review (RULING-L4-F5 R1).
export function validateArrange(obj, knownIds = []) {
  if (!obj || !Array.isArray(obj.order)) throw bad('no order');
  const known = new Set(knownIds);
  const order = [];
  for (const id of obj.order) if (typeof id === 'string' && known.has(id) && !order.includes(id)) order.push(id);
  return { order };
}

export const ASSIST_NUMBER_FIELDS = Object.freeze(['size', 'entry', 'stop', 'target', 'fee']);

// { setup, notes, numbers }: setup must be one of the user's own setups, notes a short string, numbers plain decimals the model read
// from the sentence. The numbers are only ever compared with the code parser's values (src/sentence/assist.js), never used as fields.
export function validateAssist(obj, setups = []) {
  if (!obj || typeof obj !== 'object') throw bad('no object');
  const setup = typeof obj.setup === 'string' && setups.includes(obj.setup.trim()) ? obj.setup.trim() : null;
  const notes = typeof obj.notes === 'string' && obj.notes.trim() ? obj.notes.replace(/\s+/g, ' ').trim().slice(0, 200) : null;
  const numbers = {};
  for (const f of ASSIST_NUMBER_FIELDS) {
    const v = typeof obj[f] === 'number' && Number.isFinite(obj[f]) ? String(obj[f]) : typeof obj[f] === 'string' ? obj[f].trim() : null;
    if (v !== null && /^\d+(?:\.\d+)?$/.test(v)) numbers[f] = v;
  }
  return { setup, notes, numbers };
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

// The device itself only: a `.local` name is another machine, so it is not local (L4b F2).
export function isLocalUrl(url) {
  try {
    return LOOPBACK.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

// A typed address: https, or http to this device only; no user-info and no query string or fragment (a secret typed there would
// be stored and exported as typed, L4b F1/F3). Returns { ok: true, url } or { ok: false, reason } with reason one of
// `invalid`, `scheme`, `userinfo`, `query`.
export function checkBaseUrl(text) {
  let u;
  try { u = new URL(String(text ?? '').trim()); } catch { return { ok: false, reason: 'invalid' }; }
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && LOOPBACK.has(u.hostname))) return { ok: false, reason: 'scheme' };
  if (u.username || u.password) return { ok: false, reason: 'userinfo' };
  if (u.search || u.hash) return { ok: false, reason: 'query' };
  return { ok: true, url: u };
}

// settings is the flat settings object. Returns the config or null.
export function configFromSettings(settings, key) {
  const provider = settings?.['ai.provider'];
  if (provider === 'anthropic') {
    return key ? { provider, model: settings['ai.model'] || ANTHROPIC_DEFAULT_MODEL, baseUrl: null } : null;
  }
  if (provider === 'openai') {
    const baseUrl = settings['ai.baseUrl'] || OPENAI_DEFAULT_BASE_URL;
    const model = settings['ai.model'];
    if (!model) return null;
    if (!key && !isLocalUrl(baseUrl)) return null;
    return { provider, model, baseUrl };
  }
  return null;
}

// The provider, scheme and host (with port) a key belongs to: what the key is bound to when saved, and what it is compared with
// before any request. An address that checkBaseUrl refuses has no binding, so no request is made to it (L4b F1).
export function keyBinding(settings) {
  const provider = settings?.['ai.provider'];
  try {
    if (provider === 'anthropic') { const u = new URL(ANTHROPIC_URL); return { provider, scheme: u.protocol.slice(0, -1), host: u.host }; }
    if (provider === 'openai') {
      const checked = checkBaseUrl(settings['ai.baseUrl'] || OPENAI_DEFAULT_BASE_URL);
      if (checked.ok) return { provider, scheme: checked.url.protocol.slice(0, -1), host: checked.url.host };
    }
  } catch { /* an unparseable address has no host to bind to */ }
  return null;
}

export function providerLabel(provider) {
  return provider === 'anthropic' ? 'Anthropic' : provider === 'openai' ? 'the OpenAI-compatible address' : 'this provider';
}

// keys: { getKeyFor(binding) }, the only way a stored key is read. The key is looked up again at every request and returned only
// for the provider and host it was saved for. typedKey (optional) is a key just typed for these settings, used by Test connection
// before it is saved. Returns null when the settings do not allow a request.
export function resolveProvider(settings, keys, { fetch, typedKey = '' } = {}) {
  const binding = keyBinding(settings);
  if (!binding) return null;
  const getKey = () => (typedKey ? typedKey : keys.getKeyFor(binding));
  const config = configFromSettings(settings, getKey());
  return config ? createProvider(config, { fetch, getKey }) : null;
}

// config: { provider: 'anthropic'|'openai', model, baseUrl }. deps: { fetch, getKey(): string|null }.
export function createProvider(config, { fetch, getKey = () => null } = {}) {
  let core;
  if (config?.provider === 'anthropic') core = createAnthropic({ model: config.model, getKey }, { fetch });
  else if (config?.provider === 'openai') core = createOpenAi({ model: config.model, baseUrl: config.baseUrl, getKey }, { fetch });
  else throw new TypeError('provider must be anthropic or openai');

  const ask = async (prompt, maxTokens, timeoutMs) => extractJson(await core.complete({ ...prompt, maxTokens, timeoutMs }));

  return {
    id: 'own-key',
    provider: core.id,
    model: core.model,
    async arrange(items) {
      return validateArrange(await ask(arrangePrompt(items), 300, TIMEOUTS.arrange), items.map((i) => i.id)).order;
    },
    async assist(text, { setups = [], lang = 'en' } = {}) {
      return validateAssist(await ask(assistPrompt(text, { setups, lang }), 300, TIMEOUTS.assist), setups);
    },
    async test() {
      await core.complete({ system: 'Reply with the single word ok.', user: 'ping', maxTokens: 8, timeoutMs: TIMEOUTS.test });
      return { ok: true };
    },
  };
}
