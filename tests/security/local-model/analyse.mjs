// Reads the raw outputs in ./out/ (saved by run-probe.mjs) and replays them through the app's own code: extractJson + validateReword +
// screenModelText for review outputs, extractJson + validateAssist + mergeAssist for sentence outputs. Writes ./out/summary.json and prints
// the sentences that need a human reading. No live model is called here.
//   node tests/security/local-model/analyse.mjs [--print]
import fs from 'node:fs';
import { extractJson, validateReword, validateAssist, ASSIST_NUMBER_FIELDS } from '../../../src/ai/adapter.js';
import { screenModelText, check, normalize } from '../../../src/review/guard.js';
import { mergeAssist } from '../../../src/sentence/assist.js';
import { cmp } from '../../../src/core/decimal.js';

const OUT = new URL('./out/', import.meta.url);
const files = fs.readdirSync(OUT).filter((f) => f.endsWith('.json') && f !== 'summary.json' && f !== 'readings.json').sort();
const load = (f) => JSON.parse(fs.readFileSync(new URL(f, OUT), 'utf8'));

export function replayReview(run) {
  const out = { file: null, model: run.model, week: run.week, variant: run.variant, lang: run.lang, requested: run.items?.length ?? 0, parse: 'ok', returned: 0, items: [] };
  let items = [];
  try { items = validateReword(extractJson(run.raw)).items; } catch (e) { out.parse = `unparseable: ${e.message}`; }
  out.returned = items.length;
  for (const item of run.items ?? []) {
    const got = items.find((x) => x.id === item.id);
    if (!got) { out.items.push({ id: item.id, status: 'missing' }); continue; }
    const screen = screenModelText(got.text, item.facts, run.lang, { ruleText: item.ruleText });
    const guard = check(got.text, run.lang, { scope: 'review' });
    out.items.push({ id: item.id, pattern: item.pattern, status: screen.ok ? (got.text.trim() === item.ruleText.trim() ? 'copy_through' : 'accepted_reworded') : 'rejected', reasons: screen.reasons, guardHits: guard.hits.map((h) => h.class), text: got.text, ruleText: item.ruleText });
  }
  return out;
}

const DEC = /^\d+(?:\.\d+)?$/;
export function replaySentence(run) {
  const out = { index: run.index, text: run.text, lang: run.lang, parse: 'ok', numbers: {}, setup: null, notes: null, conflicts: [], misparse: [], missed: [], silent: [] };
  let assist = null;
  try { assist = validateAssist(extractJson(run.raw), run.setups); } catch (e) { out.parse = `unparseable: ${e.message}`; return out; }
  const expected = run.expected;
  // a phrase the app must ask about (an ambiguous dot in Greek) has no single expected value: the model's reading is recorded, not scored
  out.ambiguousPhrase = typeof expected === 'string';
  const exp = out.ambiguousPhrase ? {} : expected;
  out.ambiguousReadings = {};
  for (const f of ASSIST_NUMBER_FIELDS) {
    const m = assist.numbers[f] ?? null;
    const e = exp[f] ?? null;
    out.numbers[f] = { model: m, expected: e, code: run.code.fields[f] ?? null };
    if (out.ambiguousPhrase) { if (m !== null) out.ambiguousReadings[f] = m; continue; }
    if (m !== null && DEC.test(m)) {
      if (e === null || cmp(m, e) !== 0) out.misparse.push(f);
    } else if (e !== null && m === null) out.missed.push(f);
  }
  out.setup = { model: assist.setup, expected: exp.setup ?? null, code: run.code.fields.setup ?? null };
  out.notes = assist.notes;
  const merged = mergeAssist({ fields: run.code.fields, ambiguous: run.code.ambiguous ?? [] }, assist, { lang: run.lang });
  out.conflicts = merged.conflicts.map((c) => c.field);
  out.mergedNumbersEqualCode = ASSIST_NUMBER_FIELDS.every((f) => merged.fields[f] === run.code.fields[f]);
  out.silent = out.misparse.filter((f) => !out.conflicts.includes(f));
  out.setupSilentWrong = out.setup.code === null && out.setup.model !== null && out.setup.model !== out.setup.expected;
  out.notesSaved = merged.fields.notes;
  return out;
}

export function analyseAll() {
  const review = [];
  const sentence = [];
  for (const f of files) {
    const run = load(f);
    if (f.startsWith('review-')) { if (run.skipped) continue; const r = replayReview(run); r.file = f; review.push(r); }
    else if (f.startsWith('sentence-')) { const r = replaySentence(run); r.file = f; r.model = run.model; sentence.push(r); }
  }
  return { review, sentence };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const { review, sentence } = analyseAll();
  const summary = { review: {}, sentence: {} };
  for (const model of [...new Set(review.map((r) => r.model))]) {
    const rs = review.filter((r) => r.model === model);
    const items = rs.flatMap((r) => r.items);
    const byLang = Object.fromEntries(['en', 'el'].map((l) => { const it = rs.filter((r) => r.lang === l).flatMap((r) => r.items); return [l, { items: it.length, copyThrough: it.filter((i) => i.status === 'copy_through').length, acceptedReworded: it.filter((i) => i.status === 'accepted_reworded').length, rejectedByGuard: it.filter((i) => i.status === 'rejected').length }]; }));
    summary.review[model] = { byLang, runs: rs.length, unparseable: rs.filter((r) => r.parse !== 'ok').length, itemsRequested: items.length, missing: items.filter((i) => i.status === 'missing').length, copyThrough: items.filter((i) => i.status === 'copy_through').length, acceptedReworded: items.filter((i) => i.status === 'accepted_reworded').length, rejectedByGuard: items.filter((i) => i.status === 'rejected').length };
  }
  for (const model of [...new Set(sentence.map((r) => r.model))]) {
    const ss = sentence.filter((r) => r.model === model);
    const fieldsAsked = ss.reduce((n, r) => n + Object.values(r.numbers).filter((v) => v.expected !== null).length, 0);
    const returned = ss.filter((r) => !r.ambiguousPhrase).reduce((n, r) => n + Object.values(r.numbers).filter((v) => v.model !== null).length, 0);
    summary.sentence[model] = { phrases: ss.length, ambiguousPhrases: ss.filter((r) => r.ambiguousPhrase).length, ambiguousReadingsCommittedByModel: ss.reduce((n, r) => n + Object.keys(r.ambiguousReadings ?? {}).length, 0), numbersReturnedByModel: returned, unparseable: ss.filter((r) => r.parse !== 'ok').length, numberFieldsExpected: fieldsAsked, misparsedNumbers: ss.reduce((n, r) => n + r.misparse.length, 0), phrasesWithMisparse: ss.filter((r) => r.misparse.length).length, missedNumbers: ss.reduce((n, r) => n + r.missed.length, 0), misparsesShownAsConflict: ss.reduce((n, r) => n + r.conflicts.filter((c) => r.misparse.includes(c)).length, 0), misparsesSilent: ss.reduce((n, r) => n + r.silent.length, 0), mergedNumbersAlwaysEqualCode: ss.every((r) => r.parse !== 'ok' || r.mergedNumbersEqualCode), setupSilentWrong: ss.filter((r) => r.setupSilentWrong).length, notesReturned: ss.filter((r) => r.notes).length };
  }
  fs.writeFileSync(new URL('summary.json', OUT), JSON.stringify({ summary, review, sentence }, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  if (process.argv.includes('--print')) {
    for (const r of review) for (const i of r.items) if (i.status !== 'copy_through') console.log(`\n[${r.file}] ${i.id} ${i.pattern ?? ''} ${i.status} ${i.reasons?.join(',') ?? ''}\n  rule : ${i.ruleText ?? ''}\n  model: ${i.text ?? ''}`);
    for (const r of review) if (r.parse !== 'ok') console.log(`\n[${r.file}] ${r.parse}`);
  }
}
