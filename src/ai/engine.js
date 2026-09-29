// The engine ladder (architecture 5.2): 1. own key, when set, confirmed and online; 2. on-device model, when the user agreed to the
// download, the device can run it and it is loaded; 3. rules. The engine and its state are always reported (AC-P9.3, AC-P5.7) on the
// bus as `ai-state { engine, state, progress, reason }`. Pure apart from the injected `device`, `fetch` and `keys`.
import { extractJson, resolveProvider, validateReword, validateAssist, TIMEOUTS, describeAiError } from './adapter.js';
import { rewordPrompt, assistPrompt, asMessages } from './prompts.js';
import { LLM_BYTES } from './device.js';

// B2 measured English only. For Greek the on-device rung stays off until L4 rates the model's Greek acceptable on the three seeded weeks.
export const DEVICE_GREEK_OK = false;

export const STATES = Object.freeze(['ready', 'downloading', 'unavailable', 'failed']);

export const RULES_ENGINE = Object.freeze({ id: 'rules', reword: null, assist: null });

// device: createDeviceHost() result. Wraps its generate() as the same reword/assist surface as an own-key provider.
export function deviceEngine(device) {
  const ask = async (prompt, maxTokens, timeoutMs) => extractJson(await device.generate(asMessages(prompt), { maxTokens, timeoutMs }));
  return {
    id: 'on-device',
    model: device.model,
    async reword(items, lang) { return validateReword(await ask(rewordPrompt(items, lang), 900, 60000)).items; },
    async assist(text, { setups = [], lang = 'en' } = {}) { return validateAssist(await ask(assistPrompt(text, { setups, lang }), 300, TIMEOUTS.assist), setups); },
  };
}

// deps: { device, keys, fetch, bus, online(): boolean }
export function createEngines({ device, keys, fetch, bus, online = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false) }) {
  let state = { engine: 'rules', state: 'ready', progress: null, reason: null };
  const emit = (next) => { state = { ...state, ...next }; bus?.emit('ai-state', { ...state }); };

  return {
    state: () => ({ ...state }),

    // What could run right now, with the reason when nothing above rules can. Cheap: no download, no request.
    async status(settings, lang = 'en') {
      const provider = resolveProvider(settings, keys, { fetch });
      if (provider && settings['ai.own.confirmed'] === true) {
        return online() ? { engine: 'own-key', state: 'ready', reason: null } : { engine: 'rules', state: 'unavailable', reason: 'offline' };
      }
      if (settings['ai.device.consent'] === 'yes') {
        if (lang === 'el' && !DEVICE_GREEK_OK) return { engine: 'rules', state: 'unavailable', reason: 'greek' };
        const problem = await device.check();
        if (problem) return { engine: 'rules', state: 'unavailable', reason: problem.reason };
        return device.loaded() ? { engine: 'on-device', state: 'ready', reason: null } : { engine: 'rules', state: 'unavailable', reason: 'not_loaded' };
      }
      return { engine: 'rules', state: 'ready', reason: 'no_model_set_up' };
    },

    // The engine object for one run. Never throws: an unavailable rung falls to the next and finally to rules.
    async resolve(settings, lang = 'en') {
      const provider = resolveProvider(settings, keys, { fetch });
      if (provider && settings['ai.own.confirmed'] === true && online()) {
        emit({ engine: 'own-key', state: 'ready', reason: null });
        return provider;
      }
      const s = await this.status(settings, lang);
      if (s.engine === 'on-device') {
        emit({ engine: 'on-device', state: 'ready', reason: null });
        return deviceEngine(device);
      }
      emit({ engine: 'rules', state: s.state, reason: s.reason });
      return RULES_ENGINE;
    },

    // Explicit download with progress, started from the AI settings screen after consent (the 830 MB download).
    async loadDevice({ onProgress } = {}) {
      const problem = await device.check();
      if (problem) { emit({ engine: 'rules', state: 'unavailable', reason: problem.reason }); return { ok: false, reason: problem.reason }; }
      emit({ engine: 'on-device', state: 'downloading', progress: 0, reason: null });
      try {
        await device.load({ onProgress: (pct, text) => { emit({ engine: 'on-device', state: 'downloading', progress: pct }); onProgress?.(pct, text); } });
        emit({ engine: 'on-device', state: 'ready', progress: 100, reason: null });
        return { ok: true };
      } catch (err) {
        emit({ engine: 'rules', state: 'failed', progress: null, reason: err?.code ?? 'load-failed' });
        return { ok: false, reason: err?.code ?? 'load-failed', message: describeAiError(err) };
      }
    },

    downloadBytes: LLM_BYTES,
  };
}
