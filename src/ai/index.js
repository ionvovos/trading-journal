// The AI layer as the views use it: one shared on-device host, the own-key store and the engine ladder. Browser objects are read
// lazily, so importing this file in Node runs nothing.
import { createDeviceHost } from './device.js';
import { browserKeyStore } from './keystore.js';
import { createEngines } from './engine.js';

let host = null;
export const deviceHost = () => (host ||= createDeviceHost());

export function enginesFor(ctx) {
  return createEngines({ device: deviceHost(), keys: browserKeyStore(), fetch: (...args) => globalThis.fetch(...args), bus: ctx.bus });
}

export { browserKeyStore } from './keystore.js';
export { loadAiSettings, saveAiSetting } from './settings.js';
