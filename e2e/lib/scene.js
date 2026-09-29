// Test scenes (architecture section 9): ?scene=<name> loads e2e/scenes/<name>.json into the memory store with a fixed clock and mounts
// the real app on it. Only reachable on 127.0.0.1 or localhost (src/app.js checks). A scene is
// { now: ISO, settings: {...}, accounts: [...], trades: [...], cash: [...], plans: [...], reviews: [...], imports: [...], reconciliations: [...] }.
export async function bootScene(name, { mountApp }) {
  const scene = await (await fetch(`/e2e/scenes/${encodeURIComponent(name)}.json`)).json();
  if (scene.now) {
    const fixed = new Date(scene.now).getTime();
    const Real = Date;
    globalThis.Date = class extends Real { constructor(...a) { super(...(a.length ? a : [fixed])); } static now() { return fixed; } };
  }
  const { createMemoryStore } = await import('../../src/storage/memory.js');
  const { loadData } = await import('../../src/app.js');
  const { settings = {}, ...rows } = scene;
  delete rows.now;
  const store = createMemoryStore({ ...rows, settings: { firstRunDone: true, ...settings } });
  return mountApp({ store, storage: { kind: 'memory', refused: false }, data: await loadData() });
}
