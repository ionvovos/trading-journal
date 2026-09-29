// Sentence entry, code first (architecture 5.3, requirements AC-P1.5, AC-P1.6, AC-P7.2). One typed sentence in English or Greek becomes a
// trade draft field by field. No model, no network. A field that cannot be read stays null and is named in `missing`; a number that
// can be read two ways ("1.085" in Greek: 1.085 or 1085) stays null and is listed in `ambiguous` with both readings. The parser never
// guesses a number. A model may add `setup` and `notes` afterwards (src/sentence/assist.js); it cannot change a number.
import { normalize } from '../review/guard.js';
import { CRYPTO_BASES, CRYPTO_NAMES, FIAT, CRYPTO_QUOTES, LOWERCASE_OK } from './crypto.js';
import { pipSizeOf } from '../plan/sizing.js';
import { mul, sub, add } from '../core/decimal.js';

export const REQUIRED = Object.freeze(['instrument', 'side', 'size', 'entry']);

const BUY = new Set(['bought', 'buy', 'buying', 'long', 'longed', 'αγορασα', 'αγοραζω', 'αγορα', 'αγορασε', 'λονγκ']);
const SELL = new Set(['sold', 'sell', 'selling', 'short', 'shorted', 'πουλησα', 'πουλαω', 'πωληση', 'πουλησε', 'σορτ']);
const AT = new Set(['at', '@', 'στα', 'στο', 'στισ', 'στην', 'στη', 'στον', 'around']);
const STOP = new Set(['stop', 'sl', 'στοπ']);
const TARGET = new Set(['target', 'tp', 'στοχοσ', 'στοχο']);
const FEE = new Set(['fee', 'fees', 'commission', 'προμηθεια', 'προμηθειεσ', 'εξοδα']);
const SIZE_KW = new Set(['size', 'μεγεθοσ']);
const UNITS = new Set(['lot', 'lots', 'λοτ', 'shares', 'share', 'μετοχεσ', 'μετοχη', 'contracts', 'contract', 'συμβολαια', 'coins', 'coin', 'units', 'unit']);
const PIPS = new Set(['pip', 'pips', 'πιπ', 'πιπσ']);
const LOSSWORD = new Set(['loss', 'λοσ']);
const IGNORE_UPPER = new Set(['SL', 'TP', 'AT', 'R', 'USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'NZD', 'CAD', 'PIPS', 'PIP', 'LOT', 'LOTS', 'I', 'A', 'OK']);

const TOKEN = /[\p{L}][\p{L}\p{N}/'’-]*|\d+(?:[.,]\d+)*|@/gu;

// Number token to { value, readings }. English: "60,000" thousands, "0,2" decimal comma, "1.085" decimal. Greek: "0,2" decimal,
// "2.410,5" thousands dot and decimal comma, "1.085" ambiguous (a dot followed by exactly three digits after 1-3 digits).
export function readNumber(token, lang = 'en') {
  const t = String(token);
  if (!/^\d+(?:[.,]\d+)*$/.test(t)) return { value: null, readings: null };
  const dots = (t.match(/\./g) ?? []).length;
  const commas = (t.match(/,/g) ?? []).length;
  if (!dots && !commas) return { value: t, readings: null };
  const lastDot = t.lastIndexOf('.');
  const lastComma = t.lastIndexOf(',');
  const groups3 = (sep) => new RegExp(`^\\d{1,3}(?:\\${sep}\\d{3})+$`).test(t);
  if (lang === 'el') {
    if (dots && commas) return lastComma > lastDot ? { value: t.replaceAll('.', '').replace(',', '.'), readings: null } : { value: null, readings: null };
    if (commas === 1 && !dots) return { value: t.replace(',', '.'), readings: null };
    if (commas > 1) return { value: null, readings: null };
    if (dots > 1) return groups3('.') ? { value: t.replaceAll('.', ''), readings: null } : { value: null, readings: null };
    // one dot
    return groups3('.') ? { value: null, readings: [t, t.replace('.', '')] } : { value: t, readings: null };
  }
  if (dots && commas) return lastDot > lastComma ? { value: t.replaceAll(',', ''), readings: null } : { value: t.replaceAll('.', '').replace(',', '.'), readings: null };
  if (commas === 1 && !dots) return groups3(',') ? { value: t.replace(',', ''), readings: null } : { value: t.replace(',', '.'), readings: null };
  if (commas > 1) return groups3(',') ? { value: t.replaceAll(',', ''), readings: null } : { value: null, readings: null };
  if (dots > 1) return groups3('.') ? { value: t.replaceAll('.', ''), readings: null } : { value: null, readings: null };
  return { value: t, readings: null };
}

// An instrument from one token: { instrument, market } or null. Pairs with a slash or six letters, crypto symbols and names, the user's own list.
function instrumentOf(raw, known) {
  const up = raw.toUpperCase();
  const knownHit = known.find((k) => k.toUpperCase() === up || k.toUpperCase().replace('/', '') === up.replace('/', ''));
  const pair = /^([A-Z]{3,5})\/([A-Z]{3,5})$/.exec(up) ?? (/^[A-Z]{6}$/.test(up) ? [null, up.slice(0, 3), up.slice(3)] : null);
  if (pair) {
    const [, base, quote] = pair;
    if (FIAT.has(base) && FIAT.has(quote)) return { instrument: `${base}/${quote}`, market: 'forex' };
    if (CRYPTO_BASES.has(base) && (FIAT.has(quote) || CRYPTO_QUOTES.has(quote))) return { instrument: `${base}/${quote}`, market: 'crypto' };
  }
  if (knownHit) return { instrument: knownHit, market: /^[A-Z]{3}\/[A-Z]{3}$/.test(knownHit.toUpperCase()) && FIAT.has(knownHit.slice(0, 3).toUpperCase()) ? 'forex' : CRYPTO_BASES.has(knownHit.toUpperCase().split('/')[0]) ? 'crypto' : 'stock' };
  const named = CRYPTO_NAMES[raw.toLowerCase()];
  if (named) return { instrument: named, market: 'crypto' };
  if (CRYPTO_BASES.has(up) && (raw === up || LOWERCASE_OK.has(up))) return { instrument: up, market: 'crypto' };
  if (/^[A-Z]{1,5}(?:\.[A-Z])?$/.test(raw) && raw.length >= 2 && !IGNORE_UPPER.has(raw)) return { instrument: raw, market: 'stock' };
  return null;
}

// text, { lang, setups: [string], instruments: [string], now } -> { fields, missing, ambiguous, derived }
export function parseSentence(text, { lang = 'en', setups = [], instruments = [] } = {}) {
  const src = String(text ?? '');
  const raws = [...src.matchAll(TOKEN)].map((m) => m[0]);
  const toks = raws.map((r) => normalize(r));
  const used = new Set();
  const fields = { side: null, instrument: null, market: null, size: null, entry: null, exit: null, stop: null, target: null, fee: null, setup: null, stopPips: null };
  const ambiguous = [];
  const derived = [];

  const isNum = (i) => i >= 0 && i < toks.length && /^\d/.test(toks[i]);
  const setNumber = (field, i) => {
    used.add(i);
    const r = readNumber(raws[i], lang);
    if (r.readings) { fields[field] = null; ambiguous.push({ field, readings: r.readings }); return; }
    fields[field] = r.value;
  };

  // instrument (first hit) and its position
  let instIdx = -1;
  for (let i = 0; i < raws.length; i += 1) {
    if (isNum(i)) continue;
    const hit = instrumentOf(raws[i], instruments);
    if (hit && !BUY.has(toks[i]) && !SELL.has(toks[i]) && !STOP.has(toks[i]) && !TARGET.has(toks[i]) && !FEE.has(toks[i])) {
      fields.instrument = hit.instrument;
      fields.market = hit.market;
      instIdx = i;
      used.add(i);
      break;
    }
  }

  // side words in order
  const sides = [];
  toks.forEach((t, i) => { if (BUY.has(t)) sides.push({ i, side: 'long' }); else if (SELL.has(t)) sides.push({ i, side: 'short' }); });
  if (sides.length) { fields.side = sides[0].side; sides.forEach((s) => used.add(s.i)); }

  // keyword followed by a number: at (entry, exit), stop, target, fee, size
  const numberAfter = (i, { skip = () => false, max = 3 } = {}) => {
    for (let j = i + 1; j <= i + max && j < toks.length; j += 1) {
      if (isNum(j)) return j;
      if (!skip(toks[j]) && !AT.has(toks[j]) && !LOSSWORD.has(toks[j])) return -1;
    }
    return -1;
  };
  const atPrices = [];
  toks.forEach((t, i) => {
    if (AT.has(t)) { const j = numberAfter(i, { max: 1 }); if (j >= 0 && !used.has(j)) atPrices.push({ j, prev: i }); }
  });
  const sideBefore = (j) => [...sides].reverse().find((s) => s.i < j) ?? null;
  for (const p of atPrices) {
    const s = sideBefore(p.j);
    const field = s && s.side !== fields.side ? 'exit' : 'entry'; // a price after the opposite side word is the exit
    if (fields[field] === null && !ambiguous.some((a) => a.field === field)) setNumber(field, p.j);
  }

  toks.forEach((t, i) => {
    if (STOP.has(t)) {
      const j = numberAfter(i);
      if (j < 0 || used.has(j)) return;
      used.add(i);
      if (PIPS.has(toks[j + 1])) { fields.stopPips = readNumber(raws[j], lang).value; used.add(j); used.add(j + 1); } else setNumber('stop', j);
    } else if (TARGET.has(t)) {
      const j = numberAfter(i);
      if (j >= 0 && !used.has(j)) { used.add(i); setNumber('target', j); }
    } else if (FEE.has(t)) {
      const j = numberAfter(i, { skip: (w) => w === '$' });
      if (j >= 0 && !used.has(j)) { used.add(i); setNumber('fee', j); }
    } else if (SIZE_KW.has(t)) {
      const j = numberAfter(i);
      if (j >= 0 && !used.has(j)) { used.add(i); setNumber('size', j); }
    }
  });

  // size: a number right before the instrument (or before a unit word before it)
  if (fields.size === null && !ambiguous.some((a) => a.field === 'size')) {
    let j = instIdx - 1;
    if (j >= 0 && UNITS.has(toks[j])) { used.add(j); j -= 1; }
    if (j >= 0 && isNum(j) && !used.has(j)) setNumber('size', j);
    else if (instIdx >= 0 && UNITS.has(toks[instIdx + 1] ?? '')) { /* "EURUSD lots 0.2" is not read */ }
  }
  if (fields.size === null && !ambiguous.some((a) => a.field === 'size')) {
    // a number followed by a unit word: "0.2 lot"
    const j = toks.findIndex((t, i) => isNum(i) && !used.has(i) && UNITS.has(toks[i + 1] ?? ''));
    if (j >= 0) { used.add(j + 1); setNumber('size', j); }
  }
  // entry without "at": the first free number after the instrument
  if (fields.entry === null && !ambiguous.some((a) => a.field === 'entry') && instIdx >= 0) {
    const j = toks.findIndex((t, i) => i > instIdx && isNum(i) && !used.has(i) && !UNITS.has(toks[i + 1] ?? ''));
    if (j >= 0) setNumber('entry', j);
  }

  // stop from pips: derived by exact arithmetic from the stated distance, never a guess
  if (fields.stop === null && fields.stopPips !== null && fields.entry !== null && fields.market === 'forex' && fields.side) {
    const pip = pipSizeOf(fields.instrument);
    if (pip) {
      const dist = mul(fields.stopPips, pip);
      fields.stop = fields.side === 'long' ? sub(fields.entry, dist) : add(fields.entry, dist);
      derived.push('stop');
    }
  }

  // setup: one of the user's own setup names found in the sentence
  const norm = ` ${toks.join(' ')} `;
  const found = setups.find((s) => s && norm.includes(` ${normalize(s).trim().replace(/\s+/g, ' ')} `));
  if (found) fields.setup = found;

  const missing = REQUIRED.filter((f) => fields[f] === null && !ambiguous.some((a) => a.field === f));
  return { fields, missing, ambiguous, derived };
}
