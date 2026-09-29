// Tiny synchronous event bus. Events: trades-changed, mode-changed, account-filter-changed, lang-changed, ai-state,
// import-progress, import-done, anomaly-answered, reconcile-changed (architecture section 10).
export function createBus() {
  const handlers = new Map();
  return {
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, new Set());
      handlers.get(name).add(fn);
      return () => handlers.get(name)?.delete(fn);
    },
    off(name, fn) { handlers.get(name)?.delete(fn); },
    emit(name, detail) {
      for (const fn of [...(handlers.get(name) ?? [])]) {
        try { fn(detail); } catch (e) { console.error(`bus handler for ${name} threw`, e); }
      }
    },
  };
}

export const BUS_EVENTS = ['trades-changed', 'mode-changed', 'account-filter-changed', 'lang-changed', 'ai-state', 'import-progress', 'import-done', 'anomaly-answered', 'reconcile-changed'];
