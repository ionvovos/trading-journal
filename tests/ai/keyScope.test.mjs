// Thought-catcher V2 gate G1, ported (requirements AC-P9.2): a saved key is bound to the provider and host it was typed for and is
// never sent anywhere else. Changing the provider or the address never sends it elsewhere.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createKeyStore, KEY_ENTRY, BINDING_ENTRY } from '../../src/ai/keystore.js';
import { keyBinding, resolveProvider } from '../../src/ai/adapter.js';

const OLD_KEY = 'sk-ant-OLD-KEY-DO-NOT-LEAK';
const NEW_KEY = 'sk-new-typed-key';
const ITEMS = [{ id: 'f1', pattern: 'busy_days', facts: { n: 5, median: 1 } }];

const memoryStorage = () => {
  const m = new Map();
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};

const ANTHROPIC = { 'ai.provider': 'anthropic', 'ai.model': '', 'ai.baseUrl': null };
const TARGETS = {
  'openai, no base URL (api.openai.com)': { 'ai.provider': 'openai', 'ai.model': 'gpt-x', 'ai.baseUrl': null },
  'openai, http://localhost:11434/v1': { 'ai.provider': 'openai', 'ai.model': 'llama3', 'ai.baseUrl': 'http://localhost:11434/v1' },
  'openai, https://openrouter.ai/api/v1': { 'ai.provider': 'openai', 'ai.model': 'm', 'ai.baseUrl': 'https://openrouter.ai/api/v1' },
};

// A fetch that records every request and answers with a valid arrange reply in both providers' shapes.
const recorder = () => {
  const calls = [];
  const body = JSON.stringify({ order: ['f1'] });
  const fetch = async (url, init) => {
    calls.push({ url, headers: init.headers, body: init.body });
    return new Response(JSON.stringify({ choices: [{ message: { content: body } }], content: [{ type: 'text', text: body }] }), { status: 200 });
  };
  return { calls, fetch };
};
const carriesKey = (calls, key) => calls.some((c) => JSON.stringify(c).includes(key));

const withAnthropicKey = () => {
  const keys = createKeyStore(memoryStorage());
  keys.setKey(OLD_KEY, keyBinding(ANTHROPIC));
  return keys;
};

test('keyBinding names provider, scheme and host, using the default host when the address is empty', () => {
  assert.deepEqual(keyBinding(ANTHROPIC), { provider: 'anthropic', scheme: 'https', host: 'api.anthropic.com' });
  assert.deepEqual(keyBinding(TARGETS['openai, no base URL (api.openai.com)']), { provider: 'openai', scheme: 'https', host: 'api.openai.com' });
  assert.deepEqual(keyBinding(TARGETS['openai, http://localhost:11434/v1']), { provider: 'openai', scheme: 'http', host: 'localhost:11434' });
  assert.equal(keyBinding({ 'ai.provider': 'none' }), null);
});

test('positive control: the key goes to the provider and host it was saved for, and only there', async () => {
  const keys = withAnthropicKey();
  const { calls, fetch } = recorder();
  const out = await resolveProvider(ANTHROPIC, keys, { fetch }).arrange(ITEMS);
  assert.deepEqual(out, ['f1']);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(calls[0].headers['x-api-key'], OLD_KEY);
});

for (const [name, settings] of Object.entries(TARGETS)) {
  test(`arrange and Test paths: an Anthropic key is never sent after switching to ${name}`, async () => {
    const keys = withAnthropicKey();
    const { calls, fetch } = recorder();
    const provider = resolveProvider(settings, keys, { fetch });
    if (provider) {
      await provider.arrange(ITEMS).catch(() => {}); // a local address needs no key, so it may run, without the old key
      await provider.test();
    }
    assert.equal(carriesKey(calls, OLD_KEY), false, `${name}: old key leaked`);
    if (name.includes('api.openai.com') || name.includes('openrouter')) assert.equal(provider, null, 'no key for this host: no request at all');
    assert.equal(calls.every((c) => !c.headers.authorization), true);
  });

  test(`save path: switching to ${name} removes the old key and asks for a new one`, () => {
    const st = memoryStorage();
    const keys = createKeyStore(st);
    keys.setKey(OLD_KEY, keyBinding(ANTHROPIC));
    assert.equal(keys.reconcileKey(keyBinding(settings)), 'removed');
    assert.equal(keys.getKey(), null);
    assert.equal(st.m.has(KEY_ENTRY), false);
    assert.equal(st.m.has(BINDING_ENTRY), false);
  });

  test(`a key typed for ${name} is sent only there`, async () => {
    const keys = withAnthropicKey();
    const { calls, fetch } = recorder();
    await resolveProvider(settings, keys, { fetch, typedKey: NEW_KEY }).test(); // Test connection before saving
    assert.equal(carriesKey(calls, OLD_KEY), false);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].headers.authorization, `Bearer ${NEW_KEY}`);
    assert.ok(calls[0].url.startsWith(settings['ai.baseUrl'] || 'https://api.openai.com/v1'));
  });
}

test('saving with the same provider and host keeps the key; a different host on the same provider does not', () => {
  const keys = createKeyStore(memoryStorage());
  const a = { 'ai.provider': 'openai', 'ai.model': 'm', 'ai.baseUrl': 'https://api.openai.com/v1' };
  keys.setKey(NEW_KEY, keyBinding(a));
  assert.equal(keys.reconcileKey(keyBinding({ ...a, 'ai.baseUrl': 'https://api.openai.com/v2' })), 'kept');
  assert.equal(keys.reconcileKey(keyBinding({ ...a, 'ai.baseUrl': 'https://example.com/v1' })), 'removed');
  assert.equal(keys.getKey(), null);
});

test('a key with no binding is never handed out; removing the key removes the binding; delete-all clears both', () => {
  const st = memoryStorage();
  const keys = createKeyStore(st);
  keys.setKey(OLD_KEY); // unbound
  assert.equal(keys.getKeyFor(keyBinding(ANTHROPIC)), null);
  keys.setKey(OLD_KEY, keyBinding(ANTHROPIC));
  assert.equal(keys.getKeyFor(keyBinding(ANTHROPIC)), OLD_KEY);
  keys.removeKey();
  assert.equal(st.m.has(BINDING_ENTRY), false);
  keys.setKey(OLD_KEY, keyBinding(ANTHROPIC));
  keys.clearAll();
  assert.equal(st.m.has(KEY_ENTRY) || st.m.has(BINDING_ENTRY), false);
});

test('the key lives in localStorage under its own entry and is not part of any settings object', () => {
  const st = memoryStorage();
  const keys = createKeyStore(st);
  keys.setKey(OLD_KEY, keyBinding(ANTHROPIC));
  assert.deepEqual([...st.m.keys()].sort(), [BINDING_ENTRY, KEY_ENTRY].sort());
  assert.equal(KEY_ENTRY, 'trading-journal.ai-key');
  assert.equal(JSON.stringify(ANTHROPIC).includes(OLD_KEY), false);
});

test('blocked storage: the key lives for the session only and nothing throws', () => {
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  const keys = createKeyStore(blocked);
  keys.setKey(OLD_KEY, keyBinding(ANTHROPIC));
  assert.equal(keys.getKeyFor(keyBinding(ANTHROPIC)), OLD_KEY);
  keys.removeKey();
  assert.equal(keys.getKey(), null);
});

test('the request body of the arrange call holds the pattern and figures, no sentence, no journal rows, and no key', async () => {
  const keys = withAnthropicKey();
  const { calls, fetch } = recorder();
  await resolveProvider(ANTHROPIC, keys, { fetch }).arrange(ITEMS);
  const sent = JSON.stringify(calls[0].body);
  assert.equal(sent.includes(OLD_KEY), false);
  assert.ok(sent.includes('busy_days') && sent.includes('median'));
  assert.equal(sent.includes('ruleText'), false, 'no template sentence is sent');
  for (const banned of ['notes', 'screenshot', 'legs', 'accountId']) assert.equal(sent.includes(banned), false, banned);
});
