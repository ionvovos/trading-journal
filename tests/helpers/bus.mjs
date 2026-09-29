// Same shape as src/ui/bus.js createBus (S1); duplicated so tests do not depend on S1's file.
export function createBus() {
  const handlers = new Map();
  return {
    on(name, fn) { if (!handlers.has(name)) handlers.set(name, new Set()); handlers.get(name).add(fn); return () => handlers.get(name)?.delete(fn); },
    emit(name, detail) { for (const fn of [...(handlers.get(name) ?? [])]) fn(detail); },
  };
}
