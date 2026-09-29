// The own AI key on this device (architecture 4.1, requirements AC-P9.2). Pure: the storage is injected (localStorage in the page).
// The key lives only in localStorage['trading-journal.ai-key'], never in IndexedDB and never in an export or a log. It is bound to
// the provider and host it was typed for; getKeyFor() hands it out only for that pair, so changing the provider or the address
// never sends it elsewhere (thought-catcher V2 gate G1, ported).
export const PREFIX = 'trading-journal.';
export const KEY_ENTRY = `${PREFIX}ai-key`;
export const BINDING_ENTRY = `${PREFIX}ai-key-binding`;

export function createKeyStore(storage) {
  const memory = new Map(); // used when storage is missing or blocked; lives for the session only
  const read = (k) => { try { return storage.getItem(k); } catch { return memory.get(k) ?? null; } };
  const write = (k, v) => { try { storage.setItem(k, v); } catch { memory.set(k, v); } };
  const remove = (k) => { try { storage.removeItem(k); } catch { /* blocked storage: nothing was written */ } memory.delete(k); };

  return {
    getKey() { const v = read(KEY_ENTRY); return v || null; },
    // binding: { provider, scheme, host } for the provider the key is being saved for (host includes the port). Without a complete
    // binding the key is stored unbound and getKeyFor never hands it out. A key saved before the scheme was part of the binding
    // has no scheme, so it is no longer handed out: the person types it again (L4b F1).
    setKey(key, binding) {
      const v = String(key ?? '').trim();
      if (!v) { remove(KEY_ENTRY); remove(BINDING_ENTRY); return; }
      write(KEY_ENTRY, v);
      if (binding?.provider && binding?.scheme && binding?.host) write(BINDING_ENTRY, JSON.stringify({ provider: binding.provider, scheme: binding.scheme, host: binding.host }));
      else remove(BINDING_ENTRY);
    },
    getKeyBinding() {
      const raw = read(BINDING_ENTRY);
      if (!raw) return null;
      try {
        const b = JSON.parse(raw);
        return b && typeof b.provider === 'string' && typeof b.scheme === 'string' && typeof b.host === 'string' ? { provider: b.provider, scheme: b.scheme, host: b.host } : null;
      } catch { return null; }
    },
    // The only way the app reads a key to send it.
    getKeyFor(binding) {
      const key = this.getKey();
      const stored = this.getKeyBinding();
      if (!key || !binding || !stored) return null;
      return stored.provider === binding.provider && stored.scheme === binding.scheme && stored.host === binding.host ? key : null;
    },
    hasKeyFor(binding) { return this.getKeyFor(binding) !== null; },
    hasKey() { return Boolean(this.getKey()); },
    keyIsForOther(binding) { return this.hasKey() && !this.hasKeyFor(binding); },
    // Save-time rule: a saved key that was typed for another provider or address is removed, never carried over.
    reconcileKey(binding) {
      if (!this.getKey()) return 'none';
      if (this.hasKeyFor(binding)) return 'kept';
      this.removeKey();
      return 'removed';
    },
    removeKey() { remove(KEY_ENTRY); remove(BINDING_ENTRY); },
    clearAll() { this.removeKey(); },
  };
}

// The page's store, resolved on each call so a blocked localStorage falls back to the session copy.
export function browserKeyStore() {
  return createKeyStore({
    getItem: (k) => { const s = globalThis.localStorage; if (!s) throw new Error('no localStorage'); return s.getItem(k); },
    setItem: (k, v) => { const s = globalThis.localStorage; if (!s) throw new Error('no localStorage'); s.setItem(k, v); },
    removeItem: (k) => { const s = globalThis.localStorage; if (!s) throw new Error('no localStorage'); s.removeItem(k); },
  });
}
