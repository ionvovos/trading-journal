// i18n core: t(key, params), setLang, onLang. Catalogues are flat { key: 'text' } files split by owning shard:
// src/i18n/{en,el}/{shell,data,review}.js. {name} placeholders and {n, plural, one {..} other {..}} via Intl.PluralRules.
// A key missing in the active language falls back to English (never shows the key) and is recorded for tests and the visual check.
export const LANGS = ['en', 'el'];
export const SHARDS = ['shell', 'data', 'review'];

const catalogues = { en: {}, el: {} };
const listeners = new Set();
const missing = new Set();
let lang = 'en';

export const getLang = () => lang;

export function registerCatalogue(l, entries) {
  if (!catalogues[l]) throw new Error(`unknown language: ${l}`);
  Object.assign(catalogues[l], entries);
}

// Loads every shard catalogue in both languages. A shard that has not landed yet is skipped.
export async function loadCatalogues() {
  const jobs = [];
  for (const l of LANGS) for (const s of SHARDS) jobs.push(import(`./${l}/${s}.js`).then((m) => registerCatalogue(l, m.default ?? m.messages ?? {}), () => null));
  await Promise.all(jobs);
}

export function setLang(next) {
  if (!LANGS.includes(next) || next === lang) return lang;
  lang = next;
  if (typeof document !== 'undefined') document.documentElement.lang = next;
  for (const fn of [...listeners]) fn(next);
  return lang;
}

export function onLang(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Parses one message into parts. Supports {name} and {n, plural, one {..} other {..}}; '#' inside a branch is the number.
function findClose(s, open) {
  let depth = 0;
  for (let i = open; i < s.length; i += 1) {
    if (s[i] === '{') depth += 1;
    else if (s[i] === '}') { depth -= 1; if (depth === 0) return i; }
  }
  return -1;
}

export function formatMessage(template, params = {}, l = lang) {
  let out = '';
  let i = 0;
  while (i < template.length) {
    const open = template.indexOf('{', i);
    if (open === -1) { out += template.slice(i); break; }
    out += template.slice(i, open);
    const close = findClose(template, open);
    if (close === -1) { out += template.slice(open); break; }
    const body = template.slice(open + 1, close);
    const m = /^\s*(\w+)\s*,\s*plural\s*,([\s\S]*)$/.exec(body);
    if (m) {
      const n = Number(params[m[1]]);
      const branches = {};
      const rest = m[2];
      let j = 0;
      while (j < rest.length) {
        const kMatch = /\s*(=?\w+)\s*\{/.exec(rest.slice(j));
        if (!kMatch) break;
        const start = j + kMatch.index + kMatch[0].length - 1;
        const end = findClose(rest, start);
        if (end === -1) break;
        branches[kMatch[1]] = rest.slice(start + 1, end);
        j = end + 1;
      }
      const cat = new Intl.PluralRules(l === 'el' ? 'el-GR' : 'en-GB').select(n);
      const pick = branches[`=${n}`] ?? branches[cat] ?? branches.other ?? '';
      out += formatMessage(pick.replaceAll('#', String(n)), params, l);
    } else {
      const v = params[body.trim()];
      out += v === undefined || v === null ? `{${body}}` : String(v);
    }
    i = close + 1;
  }
  return out;
}

export function t(key, params) {
  let s = catalogues[lang][key];
  if (s === undefined) {
    missing.add(`${lang}:${key}`);
    s = catalogues.en[key];
  }
  if (s === undefined) { missing.add(`en:${key}`); return key; }
  return params ? formatMessage(s, params, lang) : formatMessage(s, {}, lang);
}

export const has = (key, l = lang) => catalogues[l]?.[key] !== undefined;
export const untranslated = () => [...missing].sort();
export const catalogue = (l) => catalogues[l];

// The set of parameter names a message uses, for the parity test (a placeholder present in one language only fails it).
export function placeholders(template) {
  const names = new Set();
  const walk = (s) => {
    let i = 0;
    while (i < s.length) {
      const open = s.indexOf('{', i);
      if (open === -1) break;
      const close = findClose(s, open);
      if (close === -1) break;
      const body = s.slice(open + 1, close);
      const m = /^\s*(\w+)\s*,\s*plural\s*,([\s\S]*)$/.exec(body);
      if (m) {
        names.add(m[1]);
        let j = 0;
        const rest = m[2];
        while (j < rest.length) {
          const k = /\s*(=?\w+)\s*\{/.exec(rest.slice(j));
          if (!k) break;
          const start = j + k.index + k[0].length - 1;
          const end = findClose(rest, start);
          if (end === -1) break;
          walk(rest.slice(start + 1, end));
          j = end + 1;
        }
      } else names.add(body.trim());
      i = close + 1;
    }
  };
  walk(template);
  return [...names].sort();
}
