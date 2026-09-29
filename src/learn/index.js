// Learn layer (requirements P6): entries T1-T25 and the CFD text in both languages, the term behind each statistics figure, and
// explain() that puts the user's own numbers into a figure's formula (A5, AC-P6.2). Pure.
import { formatMessage } from '../i18n/i18n.js';
import { ENTRIES as EN, EXAMPLE_ONLY } from './entries.en.js';
import { ENTRIES as EL } from './entries.el.js';

export { EXAMPLE_ONLY };
export const EXAMPLE_ONLY_TEXT = { en: EXAMPLE_ONLY, el: 'Μόνο παραδείγματα αριθμών.' };

const TABLE = { en: EN, el: EL };
export const TERM_IDS = Object.freeze(EN.map((e) => e.id));

// Terms worth reading next, by id.
const RELATED = { T1: ['T2', 'T9'], T2: ['T1', 'T3'], T3: ['T2', 'T6', 'T25'], T4: ['T5'], T5: ['T4'], T6: ['T3', 'T25'], T7: ['T3'], T8: ['T1'], T9: ['T1', 'T17', 'T18'], T12: ['T14'], T14: ['T12', 'T13'], T15: ['T16'], T16: ['T15'], T17: ['T18', 'T9'], T18: ['T17'], T19: ['T20'], T20: ['T19'], T22: ['T23'], T23: ['T22', 'T24'], T24: ['T23'], T25: ['T3', 'T6'], T26: ['T27'], T27: ['T26'], T28: ['T4'], T29: ['T25'], T30: ['T31'], T31: ['T30'], T32: ['T2', 'T12', 'T14'], T33: ['T27'], T34: ['T35'], T35: ['T34'] };

export const entries = (lang = 'en') => (TABLE[lang] ?? EN).map((e) => ({ ...e, source: EN.find((x) => x.id === e.id)?.source ?? null, related: RELATED[e.id] ?? [] }));
export const entryFor = (slugOrId, lang = 'en') => entries(lang).find((e) => e.slug === slugOrId || e.id === slugOrId) ?? null;
export const slugFor = (id) => EN.find((e) => e.id === id)?.slug ?? null;

// The learn term to open from a figure (S-ids of the requirements). A figure with no term has no entry to open.
export const TERM_FOR_FIGURE = Object.freeze({ S4: 'T6', S5: 'T6', S6: 'T7', S7: 'T1', S8: 'T2', S9: 'T3', S2: 'T27', S3: 'T31', S10: 'T28', S11: 'T4', S13: 'T34', S16: 'T29', A1: 'T30', S17: 'T17', S18: 'T24', P2_6: 'T9' });

// Every learn string with its guard scope, for tests/learn and the strings-boundary test: [{ key, text, scope }].
export function learnStrings(lang) {
  const out = [];
  for (const e of TABLE[lang]) {
    const scope = e.scope ?? 'learn';
    out.push({ key: `learn.${e.id}.title`, text: e.title, scope: 'ui' }); // a heading is a noun label, not a sentence
    out.push({ key: `learn.${e.id}.plain`, text: e.plain, scope });
    (e.steps ?? []).forEach((s, i) => out.push({ key: `learn.${e.id}.steps.${i + 1}`, text: s, scope: 'learn' }));
  }
  return out;
}

// {name} placeholders filled from the user's own figure. formulaKey is the figure id ("S8"). A missing parameter gives null: the screen
// then shows the explanation and the trade lists without a formula rather than a formula with holes.
const FORMULAS = {
  en: {
    S4: 'Win rate = winners ÷ closed trades = {wins} ÷ {n} = {value}',
    S6: 'Profit factor = total profit ÷ total loss = {profit} ÷ {loss} = {value}',
    S7: 'Initial risk = |entry − stop| × size = {risk}',
    S8: 'R = net result ÷ initial risk = {net} ÷ {risk} = {r}',
    S9: 'Expectancy = average R over trades with a known R = {sumR} ÷ {n} = {value}',
    S11: 'Maximum drawdown = peak − lowest point after it = {peak} − {trough} = {amount} ({pct} of the peak)',
    S18: 'Average holding time = total time from entry to close ÷ trades = {total} ÷ {n} = {value}',
  },
  el: {
    S4: 'Ποσοστό κερδισμένων = κερδισμένες ÷ κλειστές συναλλαγές = {wins} ÷ {n} = {value}',
    S6: 'Profit factor = συνολικό κέρδος ÷ συνολική ζημιά = {profit} ÷ {loss} = {value}',
    S7: 'Αρχικό ρίσκο = |είσοδος − stop| × μέγεθος = {risk}',
    S8: 'R = καθαρό αποτέλεσμα ÷ αρχικό ρίσκο = {net} ÷ {risk} = {r}',
    S9: 'Expectancy = μέσο R των συναλλαγών με γνωστό R = {sumR} ÷ {n} = {value}',
    S11: 'Μέγιστη πτώση = κορυφή − χαμηλότερο σημείο μετά από αυτήν = {peak} − {trough} = {amount} ({pct} της κορυφής)',
    S18: 'Μέσος χρόνος διακράτησης = συνολικός χρόνος από την είσοδο έως το κλείσιμο ÷ συναλλαγές = {total} ÷ {n} = {value}',
  },
};

// explainResult: { formulaKey, params, includedIds, excluded: [{ id, reason }] } from the statistics engine (architecture 3.2 A5).
export function explain(figureId, explainResult, lang = 'en') {
  const termId = TERM_FOR_FIGURE[figureId] ?? null;
  const entry = termId ? entryFor(termId, lang) : null;
  const key = explainResult?.formulaKey ?? figureId;
  const template = FORMULAS[lang]?.[key] ?? null;
  const params = explainResult?.params ?? {};
  const names = template ? [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]) : [];
  const complete = template && names.every((n) => params[n] !== undefined && params[n] !== null);
  return {
    figureId,
    termId,
    slug: entry?.slug ?? null,
    title: entry?.title ?? null,
    plain: entry?.plain ?? null,
    formulaWithNumbers: complete ? formatMessage(template, params, lang) : null,
    includedIds: explainResult?.includedIds ?? [],
    excluded: explainResult?.excluded ?? [],
  };
}
