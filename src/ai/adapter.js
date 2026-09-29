// Provider-neutral AI layer for the own-key rung: settings to provider, JSON extraction, validation, timeouts. Pure: fetch, clock
// and key reader are injected. Ported from thought-catcher src/core/ai/adapter.js (same author, MIT), with the journal's calls:
// reword review sentences and assist a typed trade sentence. Settings keys: ai.provider, ai.model, ai.baseUrl.
import { AiError, describeAiError } from './http.js';
import { createAnthropic, ANTHROPIC_DEFAULT_MODEL, ANTHROPIC_URL } from './anthropic.js';
import { createOpenAi, OPENAI_DEFAULT_BASE_URL } from './openai.js';
import { rewordPrompt, assistPrompt } from './prompts.js';

export { AiError, describeAiError, ANTHROPIC_DEFAULT_MODEL, OPENAI_DEFAULT_BASE_URL };

export const PROVIDERS = Object.freeze(['none', 'anthropic', 'openai']);
export const TIMEOUTS = Object.freeze({ reword: 45000, assist: 20000, test: 10000 });

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

// { items: [{ id, text }] } -> the same, keeping only string ids and non-empty string texts.
export function validateReword(obj) {
  if (!obj || !Array.isArray(obj.items)) throw bad('no items');
  const items = obj.items.filter((i) => i && typeof i.id === 'string' && typeof i.text === 'string' && i.text.trim()).map((i) => ({ id: i.id, text: i.text.replace(/\s+/g, ' ').trim() }));
  return { items };
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

export function isLocalUrl(url) {
  try {
    const h = new URL(url).hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h.endsWith('.local');
  } catch {
    return false;
  }
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

// The provider and host a key belongs to: what the key is bound to when saved, and what it is compared with before any request.
export function keyBinding(settings) {
  const provider = settings?.['ai.provider'];
  try {
    if (provider === 'anthropic') return { provider, host: new URL(ANTHROPIC_URL).host };
    if (provider === 'openai') return { provider, host: new URL(settings['ai.baseUrl'] || OPENAI_DEFAULT_BASE_URL).host };
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
    async reword(items, lang) {
      return validateReword(await ask(rewordPrompt(items, lang), 1200, TIMEOUTS.reword)).items;
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
