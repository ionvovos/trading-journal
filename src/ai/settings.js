// AI settings kept in the settings store (architecture 4.1: `ai.*`). Non-secret values only: the own key lives in localStorage
// (src/ai/keystore.js) and never reaches this store or an export. Pure apart from the injected store.
export const AI_DEFAULTS = Object.freeze({
  'ai.engine': 'auto',        // auto | rules | on-device | own-key (what the user picked; auto = best that is set up)
  'ai.provider': 'none',      // none | anthropic | openai
  'ai.model': '',
  'ai.baseUrl': null,
  'ai.own.confirmed': false,  // the user turned the own key on after reading what is sent
  'ai.device.consent': 'ask', // ask | yes | no (the model download)
});

export const AI_KEYS = Object.freeze(Object.keys(AI_DEFAULTS));

export async function loadAiSettings(store) {
  const out = { ...AI_DEFAULTS };
  await Promise.all(AI_KEYS.map(async (k) => {
    try { const v = await store.getSetting(k); if (v !== undefined && v !== null) out[k] = v; } catch { /* keep the default */ }
  }));
  return out;
}

// ctx.settings.set writes the store and the shell's cache; without it the store is written directly.
export async function saveAiSetting(ctx, key, value) {
  if (!AI_KEYS.includes(key)) throw new RangeError(`not an AI setting: ${key}`);
  try {
    if (ctx.settings?.set) await ctx.settings.set(key, value);
    else await ctx.store.setSetting(key, value);
  } catch { /* the memory store keeps it for the session */ }
}

// The settings object the engine ladder reads: the store's values merged with the view's pending edits.
export const merge = (base, patch = {}) => ({ ...base, ...patch });
