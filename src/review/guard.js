// The no-advice guard (architecture 5.2; legal-review.md section 2; requirements P5, P4.5, B1). Pure, synchronous, no DOM.
// check(text, lang, { scope, key, segments }) -> { ok, hits: [{ class, match, sentence }] }
//   scope 'review' | 'comparison' run every class; 'ui' runs every class except `imperative` and runs `instruction` only on
//   sentences (interface labels such as "Size", "Pause download" or "Short 20 shares" are not instructions, V1 gate A2/G22);
//   'learn' allows the terms revenge trading, overtrading, disposition effect and skips `imperative` under learn.*.steps;
//   'legal' accepts a string only if its SHA-256 is pinned in legalTexts.js.
// Quoted segments (the user's own plan rule inserted by a template) are not scanned. Model text never carries segments.
import { WORD_LISTS, PLATFORM, INSTRUCTION, IMPERATIVE, OPEN_QUESTION, CLAUSE_INSTRUCTION } from './banned.js';
import { ALL_LEGAL_HASHES } from './legalTexts.js';
import { sha256Hex } from './sha256.js';

export const MAX_MODEL_SENTENCE = 280;
const QUOTE_MARK = '‹q›';
const COPULA = new Set(['is', 'are', 'was', 'were', 'has', 'have', 'had', 'does', 'did', 'can', 'could', 'would', 'ειναι', 'ηταν', 'εχει']);
const LEARN_TERMS = /^(revenge|overtrad|disposition effect|εκδικητικ|υπερσυναλλαγ)/;
const SENTENCE_WORD = /[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu;

// Lower-case, curly apostrophe to straight, Greek accents removed, final sigma folded.
export function normalize(text) {
  return String(text ?? '')
    .normalize('NFC')
    .replace(/[’‘]/g, "'")
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ς/g, 'σ')
    .normalize('NFC');
}

const cache = new Map();
const re = (src) => {
  if (!cache.has(src)) cache.set(src, new RegExp(src, 'gu'));
  const r = cache.get(src);
  r.lastIndex = 0;
  return r;
};

// Splits into sentences on . ! ? at a word end, on line breaks, and (Greek only) on the Greek question mark ;.
export function splitSentences(text, lang = 'en') {
  const out = [];
  let cur = '';
  const s = String(text ?? '');
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    const next = s[i + 1];
    cur += c;
    const boundary = c === '\n'
      || ((c === '.' || c === '!' || c === '?' || c === '…') && (next === undefined || /\s/.test(next)))
      || (lang === 'el' && c === ';' && (next === undefined || /\s/.test(next)));
    if (boundary) {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const endsQuestion = (sentence) => /[?]$/.test(sentence) || /;$/.test(sentence);
const words = (sentence) => normalize(sentence).match(SENTENCE_WORD) ?? [];

function wordListHits(norm, list, scope, lists, key = null) {
  const hits = [];
  const add = (cls, patterns) => {
    for (const src of patterns) {
      for (const m of norm.matchAll(re(src))) hits.push({ class: cls, match: m[0] });
    }
  };
  for (const cls of ['modal', 'future', 'ranking', 'label', 'promise', 'readiness', 'benchmark', 'screen_word']) {
    const before = hits.length;
    add(cls, lists[cls] ?? []);
    if (cls === 'label' && (scope === 'learn' || (key && /^learn\./.test(key)))) {
      for (let i = hits.length - 1; i >= before; i -= 1) if (LEARN_TERMS.test(hits[i].match)) hits.splice(i, 1);
    }
    if (cls === 'readiness' && scope === 'comparison') add('readiness', lists.readinessComparison ?? []);
  }
  return hits;
}

function platformHits(sentence, langs) {
  const hits = [];
  const ws = words(sentence);
  for (const l of langs) {
    const cfg = PLATFORM[l];
    ws.forEach((w, i) => {
      if (!re(cfg.verbs).test(w)) return;
      const window = ws.slice(Math.max(0, i - 5), i + 6).join(' ');
      const m = re(cfg.targets).exec(window);
      if (m) hits.push({ class: 'platform', match: `${w} … ${m[0]}` });
    });
  }
  return hits;
}

function initialHits(sentence, { scope, key, langs, terminated }) {
  const hits = [];
  const ws = words(sentence);
  if (!ws.length) return hits;
  const first = ws[0];
  const two = ws.length > 1 ? `${ws[0]} ${ws[1]}` : first;
  const startsWith = (list) => list.find((w) => (w.includes(' ') ? two === w : first === w));

  // instruction
  const labelKey = key && (/^label\./.test(key) || /^action\.app\./.test(key));
  const sentenceLike = terminated || /(?<![\p{L}])(you|your|yours|σου|σασ|σασ)(?![\p{L}])/u.test(normalize(sentence));
  const skipInstruction = labelKey || (scope === 'ui' && !sentenceLike);
  if (!skipInstruction) {
    for (const l of langs) {
      const hit = startsWith(INSTRUCTION[l]);
      if (hit && !COPULA.has(ws[1] ?? '')) hits.push({ class: 'instruction', match: hit });
    }
  }

  // a directive verb that opens a later clause of the same sentence
  if (!skipInstruction) {
    const clauses = normalize(sentence).split(/[,;:]\s+|\s+(?:so|then|and|but)\s+/).slice(1);
    for (const clause of clauses) {
      const cw = clause.match(SENTENCE_WORD) ?? [];
      while (['so', 'then', 'and', 'but', 'or'].includes(cw[0])) cw.shift();
      if (cw.length < 2) continue;
      for (const l of langs) {
        if (CLAUSE_INSTRUCTION.verbs[l].includes(cw[0]) && CLAUSE_INSTRUCTION.before.includes(cw[1])) hits.push({ class: 'instruction', match: `${cw[0]} ${cw[1]}` });
      }
    }
  }

  // imperative
  const runImperative = scope === 'review' || scope === 'comparison' || (scope === 'learn' && !(key && /^learn\..*\.steps/.test(key)));
  if (runImperative) {
    for (const l of langs) {
      const hit = startsWith(IMPERATIVE[l]);
      if (hit && !COPULA.has(ws[1] ?? '')) hits.push({ class: 'imperative', match: hit });
    }
  }

  // leading question
  if (endsQuestion(sentence)) {
    const open = langs.some((l) => OPEN_QUESTION[l].includes(first));
    if (!open) hits.push({ class: 'leading_question', match: first });
  }
  return hits;
}

export function isLegalText(text) {
  return ALL_LEGAL_HASHES.has(sha256Hex(String(text ?? '').normalize('NFC').trim()));
}

// Replaces \u201c...\u201d and \u00ab...\u00bb spans by a neutral token. For text that a template produced (the user's own rule is inside
// the marks); model text is never passed through this.
export const stripQuotedSpans = (text) => String(text ?? '').replace(/[\u201c\u00ab][^\u201d\u00bb]*[\u201d\u00bb]/g, QUOTE_MARK);

// segments: [{ text, quoted? }]. Quoted segments are replaced by a neutral token, so the sentence structure around them stays.
const flatten = (segments) => segments.map((s) => (s.quoted ? QUOTE_MARK : s.text)).join('');

export function check(text, lang = 'en', { scope = 'review', key = null, segments = null } = {}) {
  if (scope === 'legal') {
    const src = segments ? segments.map((s) => s.text).join('') : text;
    return isLegalText(src) ? { ok: true, hits: [] } : { ok: false, hits: [{ class: 'legal_mismatch', match: String(src ?? '').slice(0, 60), sentence: String(src ?? '') }] };
  }
  const source = segments ? flatten(segments) : String(text ?? '');
  const langs = [...new Set([lang, 'en', 'el'])];
  const hits = [];
  for (const sentence of splitSentences(source, lang)) {
    const norm = normalize(sentence);
    const terminated = /[.!?]$/.test(sentence) || (lang === 'el' && /;$/.test(sentence));
    const found = [];
    for (const l of langs) found.push(...wordListHits(norm, l, scope, WORD_LISTS[l], key));
    found.push(...platformHits(sentence, langs));
    found.push(...initialHits(sentence, { scope, key, langs, terminated }));
    // one hit per class and sentence keeps the report short; the first match is kept
    const seen = new Set();
    for (const h of found) {
      if (seen.has(h.class)) continue;
      seen.add(h.class);
      hits.push({ ...h, sentence });
    }
  }
  return { ok: hits.length === 0, hits };
}

// Scope of a catalogue key (architecture section 9, strings-boundary): legal.* legal; review.ui.* and every key outside the
// list below ui; review.* review; compare.* comparison; learn.*.title ui; learn.* learn.
export function scopeForKey(key) {
  if (/^legal\./.test(key)) return 'legal';
  if (/^review\.ui\./.test(key)) return 'ui';
  if (/^review\./.test(key)) return 'review';
  if (/^compare\./.test(key)) return 'comparison';
  if (/^learn\..*\.title$/.test(key)) return 'ui'; // a heading is a noun label, not a sentence
  if (/^learn\./.test(key)) return 'learn';
  return 'ui';
}

// ---- model output checks ----

const NUMBER = /[+\-−]?\d+(?:[.,]\d+)*/g;

// Parses the digits of one number token as the language reads them. Returns a finite number or null.
function readNumber(token, lang) {
  let t = token.replace(/^[+\-−]/, '');
  const groupSep = lang === 'el' ? '.' : ',';
  const decSep = lang === 'el' ? ',' : '.';
  if (t.includes(groupSep) && !t.includes(decSep) && /^\d{1,3}(?:[.,]\d{3})+$/.test(t)) t = t.replaceAll(groupSep, '');
  else t = t.replaceAll(groupSep, '').replace(decSep, '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const canon = (n) => String(Number(Math.abs(n).toFixed(6)));

// Numbers found in a fact object: numbers as they are, numeric substrings of strings in either notation. `tradeIds` is skipped.
export function factNumbers(facts) {
  const set = new Set();
  const walk = (v, key) => {
    if (key === 'tradeIds' || key === 'ids') return;
    if (typeof v === 'number' && Number.isFinite(v)) set.add(canon(v));
    else if (typeof v === 'string') {
      for (const m of v.matchAll(NUMBER)) {
        for (const l of ['en', 'el']) {
          const n = readNumber(m[0], l);
          if (n !== null) set.add(canon(n));
        }
      }
    } else if (Array.isArray(v)) v.forEach((x) => walk(x, key));
    else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => walk(x, k));
  };
  walk(facts, null);
  return set;
}

// Every number in the text equals a fact value after the same formatting (AC-P5.6). Times such as 10:00 read as 10 and 0.
export function numbersMatch(text, facts, lang = 'en') {
  const allowed = factNumbers(facts);
  const bad = [];
  for (const m of String(text ?? '').matchAll(NUMBER)) {
    const n = readNumber(m[0], lang);
    if (n === null || !allowed.has(canon(n))) bad.push(m[0]);
  }
  return { ok: bad.length === 0, bad };
}

const KNOWN_UPPER = new Set(['R', 'UTC', 'AM', 'PM', 'EN', 'EL', 'USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'OK', 'PDF', 'JSON']);

// Tickers and pairs in the text must be instruments listed in facts.instruments.
export function entitiesMatch(text, facts) {
  const listed = new Set((facts?.instruments ?? []).flatMap((i) => [String(i).toUpperCase(), String(i).toUpperCase().replace('/', '')]));
  const found = String(text ?? '').match(/\b[A-Z]{3}\/[A-Z]{3,4}\b|\b[A-Z]{2,6}[0-9]?\b/g) ?? [];
  const bad = found.filter((tok) => !KNOWN_UPPER.has(tok) && !listed.has(tok) && !listed.has(tok.replace('/', '')));
  return { ok: bad.length === 0, bad };
}

// Every number of the rule sentence is still in the model sentence: rewording may not drop or swap a figure.
export function numbersPreserved(text, ruleText, lang = 'en') {
  const have = new Set([...String(text ?? '').matchAll(NUMBER)].map((m) => readNumber(m[0], lang)).filter((n) => n !== null).map(canon));
  const missing = [...String(ruleText ?? '').matchAll(NUMBER)].map((m) => readNumber(m[0], lang)).filter((n) => n !== null).map(canon).filter((c) => !have.has(c));
  return { ok: missing.length === 0, missing };
}

// One model sentence: length, boundary scan, numbers and entities. Returns { ok, reasons }. `ruleText` is the template sentence it
// rewords: its figures must all survive. The model is never given an instrument name, so any ticker or pair it writes is invented.
export function screenModelText(text, facts, lang = 'en', { ruleText = null } = {}) {
  const reasons = [];
  const s = String(text ?? '').trim();
  if (!s) reasons.push('empty');
  if (s.length > MAX_MODEL_SENTENCE) reasons.push('too_long');
  if (s && (s.match(/\p{L}+/gu) ?? []).length < 4) reasons.push('too_short');
  const g = check(s, lang, { scope: 'review' });
  if (!g.ok) reasons.push(...g.hits.map((h) => `guard:${h.class}`));
  if (!numbersMatch(s, facts, lang).ok) reasons.push('numbers');
  if (ruleText !== null && !numbersPreserved(s, ruleText, lang).ok) reasons.push('numbers_dropped');
  if (!entitiesMatch(s, facts).ok) reasons.push('entities');
  return { ok: reasons.length === 0, reasons };
}
