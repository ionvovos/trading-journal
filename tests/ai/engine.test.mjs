import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngines, RULES_ENGINE, DEVICE_GREEK_OK } from '../../src/ai/engine.js';
import { createDeviceHost, WATCHDOG_MS, MODEL_APP_CONFIG, WEBLLM_URL } from '../../src/ai/device.js';
import { createKeyStore } from '../../src/ai/keystore.js';
import { keyBinding } from '../../src/ai/adapter.js';
import { createBus } from '../../src/ui/bus.js';

const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };
const fakeDevice = ({ problem = null, loaded = false, loadError = null } = {}) => ({
  model: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', check: async () => problem, loaded: () => loaded,
  load: async ({ onProgress }) => { if (loadError) throw loadError; onProgress?.(50, 'half'); onProgress?.(100, 'done'); },
  generate: async () => '{"order":["f2","f1","zzz"],"items":[{"id":"f1","text":"You should cut size."}]}',
});
const ANTH = { 'ai.provider': 'anthropic' };
const setup = (device, { key = true, online = true } = {}) => {
  const keys = createKeyStore(memory());
  if (key) keys.setKey('K', keyBinding(ANTH));
  const bus = createBus();
  const events = [];
  bus.on('ai-state', (e) => events.push(e));
  return { engines: createEngines({ device, keys, fetch: async () => new Response('{}'), bus, online: () => online }), events };
};

test('with no setup the review runs on rules and the state says so', async () => {
  const { engines } = setup(fakeDevice(), { key: false });
  const s = await engines.status({}, 'en');
  assert.deepEqual(s, { engine: 'rules', state: 'ready', reason: 'no_model_set_up' });
  assert.equal(await engines.resolve({}, 'en'), RULES_ENGINE);
});

test('rung 1: an own key that is set, confirmed and online wins; offline it falls to rules with the reason', async () => {
  const { engines } = setup(fakeDevice({ loaded: true }));
  const on = { ...ANTH, 'ai.own.confirmed': true, 'ai.device.consent': 'yes' };
  assert.equal((await engines.resolve(on, 'en')).id, 'own-key');
  assert.deepEqual(await engines.status({ ...ANTH }, 'en'), { engine: 'rules', state: 'ready', reason: 'no_model_set_up' }, 'not confirmed by the user');
  const off = setup(fakeDevice(), { online: false });
  assert.deepEqual(await off.engines.status(on, 'en'), { engine: 'rules', state: 'unavailable', reason: 'offline' });
});

test('an own key typed for another provider does not turn the rung on', async () => {
  const keys = createKeyStore(memory());
  keys.setKey('K', keyBinding({ 'ai.provider': 'openai', 'ai.model': 'm' }));
  const engines = createEngines({ device: fakeDevice(), keys, fetch: async () => new Response('{}'), bus: createBus(), online: () => true });
  assert.equal((await engines.resolve({ ...ANTH, 'ai.own.confirmed': true }, 'en')).id, 'rules');
});

test('rung 2: the on-device model needs consent, a capable device and a loaded model; each gap has its reason', async () => {
  const yes = { 'ai.device.consent': 'yes' };
  assert.equal((await setup(fakeDevice({ loaded: true }), { key: false }).engines.resolve(yes, 'en')).id, 'on-device');
  assert.deepEqual(await setup(fakeDevice({ loaded: false }), { key: false }).engines.status(yes, 'en'), { engine: 'rules', state: 'unavailable', reason: 'not_loaded' });
  assert.deepEqual(await setup(fakeDevice({ problem: { state: 'not-supported', reason: 'no-webgpu' } }), { key: false }).engines.status(yes, 'en'), { engine: 'rules', state: 'unavailable', reason: 'no-webgpu' });
  assert.equal((await setup(fakeDevice({ loaded: true }), { key: false }).engines.status({ 'ai.device.consent': 'ask' }, 'en')).reason, 'no_model_set_up');
});

test('for Greek the on-device rung stays off until L4 rates the model\'s Greek acceptable', async () => {
  assert.equal(DEVICE_GREEK_OK, false);
  const s = await setup(fakeDevice({ loaded: true }), { key: false }).engines.status({ 'ai.device.consent': 'yes' }, 'el');
  assert.deepEqual(s, { engine: 'rules', state: 'unavailable', reason: 'greek' });
});

test('the download reports progress on the bus, ends ready, and a failure ends failed with the rule-based result standing', async () => {
  const ok = setup(fakeDevice());
  const seen = [];
  assert.deepEqual(await ok.engines.loadDevice({ onProgress: (p) => seen.push(p) }), { ok: true });
  assert.deepEqual(seen, [50, 100]);
  assert.deepEqual(ok.events.map((e) => e.progress), [0, 50, 100, 100]);
  assert.deepEqual(ok.events.slice(0, 3).map((e) => e.state), ['downloading', 'downloading', 'downloading']);
  assert.equal(ok.events.at(-1).state, 'ready');
  const bad = setup(fakeDevice({ loadError: Object.assign(new Error('x'), { code: 'watchdog' }) }));
  const r = await bad.engines.loadDevice();
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'watchdog');
  assert.deepEqual([bad.events.at(-1).engine, bad.events.at(-1).state], ['rules', 'failed']);
  const gone = setup(fakeDevice({ problem: { state: 'not-supported', reason: 'memory' } }));
  assert.deepEqual(await gone.engines.loadDevice(), { ok: false, reason: 'memory' });
  assert.equal(gone.events.at(-1).state, 'unavailable');
});

test('the on-device engine asks the model host for an order and keeps only the known ids of it (no text)', async () => {
  const { engines } = setup(fakeDevice({ loaded: true }), { key: false });
  const engine = await engines.resolve({ 'ai.device.consent': 'yes' }, 'en');
  assert.deepEqual(await engine.arrange([{ id: 'f1', pattern: 'busy_days', facts: {} }, { id: 'f2', pattern: 'days_over_cap', facts: {} }]), ['f2', 'f1']);
});

test('device host: capability check, watchdog, pinned model files (copied from thought-catcher, model and URL pinned)', async () => {
  assert.equal(WATCHDOG_MS, 150000);
  assert.ok(WEBLLM_URL.includes('@mlc-ai/web-llm@0.2.85'));
  const entry = MODEL_APP_CONFIG.model_list[0];
  assert.equal(entry.model_id, 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC');
  assert.match(entry.model, /resolve\/[0-9a-f]{40}\/$/, 'weights pinned to a commit');
  assert.match(entry.model_lib, /binary-mlc-llm-libs\/[0-9a-f]{40}\//, 'library pinned to a commit');
  const adapter = (features = ['shader-f16']) => ({ features: new Set(features) });
  const nav = (over = {}) => ({ gpu: { requestAdapter: async () => adapter() }, deviceMemory: 8, storage: { persist: async () => true }, ...over });
  assert.equal(await createDeviceHost({ nav: nav() }).check(), null);
  assert.deepEqual(await createDeviceHost({ nav: {} }).check(), { state: 'not-supported', reason: 'no-webgpu' });
  assert.deepEqual(await createDeviceHost({ nav: nav({ gpu: { requestAdapter: async () => adapter([]) } }) }).check(), { state: 'not-supported', reason: 'no-f16' });
  assert.deepEqual(await createDeviceHost({ nav: nav({ deviceMemory: 2 }) }).check(), { state: 'not-supported', reason: 'memory' });
  const w = { terminated: 0, terminate() { w.terminated += 1; }, addEventListener() {} };
  const host = createDeviceHost({ nav: nav(), watchdogMs: 30, createWorker: () => w, loadLib: async () => ({ CreateWebWorkerMLCEngine: () => new Promise(() => {}) }) });
  await assert.rejects(host.load(), (e) => e.code === 'watchdog');
  assert.ok(w.terminated >= 1);
  assert.equal(host.loaded(), false);
});
