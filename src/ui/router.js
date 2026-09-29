// Hash router. `#/stats/overview?from=2026-09-01` -> { route, params: { tab: 'overview' }, query: { from: '2026-09-01' } }.
import { ROUTES, DEFAULT_HASH } from './routes.js';

const compile = (path) => {
  const keys = [];
  const re = new RegExp(`^${path.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; })}$`);
  return { re, keys };
};
const COMPILED = ROUTES.map((r) => ({ ...r, ...compile(r.path) }));

export function parseHash(hash = DEFAULT_HASH) {
  const raw = (hash || '').replace(/^#/, '') || DEFAULT_HASH.slice(1);
  const [pathPart, queryPart = ''] = raw.split('?');
  const path = pathPart.startsWith('/') ? pathPart : `/${pathPart}`;
  const query = Object.fromEntries(new URLSearchParams(queryPart));
  for (const r of COMPILED) {
    const m = r.re.exec(path);
    if (m) {
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      return { route: r, path, params, query, hash: `#${raw}` };
    }
  }
  return { route: null, path, params: {}, query, hash: `#${raw}` };
}

// Navigation state that does not belong in the URL (a draft to prefill a form) travels through history.state.
export function createRouter({ win = window, onRoute }) {
  let current = null;
  const handle = () => {
    current = parseHash(win.location.hash);
    current.state = win.history.state;
    onRoute(current);
  };
  const onHash = () => handle();
  return {
    start() { win.addEventListener('hashchange', onHash); handle(); },
    stop() { win.removeEventListener('hashchange', onHash); },
    navigate(hash, state) {
      const target = hash.startsWith('#') ? hash : `#${hash}`;
      if (state !== undefined) win.history.pushState(state, '', target); // pushState raises no hashchange
      if (state !== undefined || win.location.hash === target) handle(); // same hash: nothing would fire either
      else win.location.hash = target;
    },
    replace(hash) { win.history.replaceState(null, '', hash.startsWith('#') ? hash : `#${hash}`); handle(); },
    get current() { return current; },
    refresh: handle,
  };
}
