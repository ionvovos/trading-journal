// L4b local-model probe, replay half (nexa-build-trading-journal-2026-09-29, brief L4-local-model). No live model runs here: the raw outputs
// of K2-Horizon-7B ("judgment") and Ornith-1.5-9B ("coding") were saved by tests/security/local-model/run-probe.mjs, and this file replays
// them through the app's own code (extractJson, validateReword, validateAssist, screenModelText, mergeAssist) and pins the counts.
// `readings.json` is the manual reading of every sentence that is not a copy of the app's template. Findings not yet met are `todo` tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs, { readFileSync, readdirSync } from 'node:fs';
import { replayReview, replaySentence } from './local-model/analyse.mjs';
import { screenModelText, check, normalize } from '../../src/review/guard.js';
import { legalTable, reviewInput, visibleStrings, reviewWithReply } from './helpers.mjs';
import { runReview } from '../../src/review/run.js';

const OUT = new URL('./local-model/out/', import.meta.url);
const files = readdirSync(OUT).filter((f) => /^(review|sentence)-.*\.json$/.test(f)).sort();
const load = (f) => JSON.parse(readFileSync(new URL(f, OUT), 'utf8'));
const readings = load('readings.json');
const summary = load('summary.json');
const reviewRuns = files.filter((f) => f.startsWith('review-')).map((f) => ({ file: f, run: load(f) })).filter((x) => !x.run.skipped);
const sentenceRuns = files.filter((f) => f.startsWith('sentence-')).map((f) => ({ file: f, run: load(f) }));
const replayed = reviewRuns.map(({ file, run }) => ({ ...replayReview(run), file, raw: run }));
const items = replayed.flatMap((r) => r.items.map((i) => ({ ...i, file: r.file, model: r.model, lang: r.lang, run: r.raw })));
const sentences = sentenceRuns.map(({ file, run }) => ({ ...replaySentence(run), file, model: run.model, run }));

// an independent scanner (not banned.js): the classes of legal-review section 2 rules 1-7
const LINT = {
  en: [/\b(should|must|ought to|need to|have to|consider|try|avoid|recommend\w*|suggest\w*|advis\w*)\b/i, /\b(will|won'?t|going to|shall|gonna)\b|'ll\b/i, /\b(better|worse|best|worst)\b/i, /\b(guarantee\w*|risk[- ]free)\b/i, /\b(ready|suitable|go live)\b/i, /\b(revenge|overtrad\w*|gambler|undisciplined|reckless)\b/i, /\b(likely|probably|expect\w*|tomorrow|next (week|month|trade))\b/i],
  el: [/(πρεπει|επρεπε|αποφευγ|προτειν|σκεφτειτε|δοκιμαστε)/, /(^|\s)θα\s/, /(καλυτερ|χειροτερ)/, /(εγγυ|χωρισ ρισκο)/, /(ετοιμ|καταλληλ)/, /(εκδικητικ|υπερσυναλλαγ)/, /(πιθαν|αναμεν|αυριο)/],
};
const lint = (text, lang) => LINT[lang].filter((re) => re.test(lang === 'en' ? text : normalize(text))).length;

test('all 81 raw outputs are saved: 18 review prompts per model, 45 sentence phrases, every call exited 0', () => {
  assert.equal(reviewRuns.filter((x) => x.run.model === 'judgment').length, 18);
  assert.equal(reviewRuns.filter((x) => x.run.model === 'coding').length, 18);
  assert.equal(sentenceRuns.length, 45);
  for (const { file, run } of [...reviewRuns, ...sentenceRuns]) { assert.equal(run.exit, 0, file); assert.ok(run.raw.length > 0, file); }
});

test('the sentence prompts are the app\'s own (assistPrompt, unchanged); the review outputs answer the L4b free-text prompt, which the app no longer sends', async () => {
  const { assistPrompt, arrangePrompt } = await import('../../src/ai/prompts.js');
  for (const { run } of sentenceRuns) assert.deepEqual(run.prompt, assistPrompt(run.text, { setups: run.setups, lang: run.lang }));
  for (const { run } of reviewRuns) {
    assert.match(run.prompt.system, /You reword short sentences/, 'the saved outputs are replies to the retired reword prompt');
    assert.equal(arrangePrompt(run.items).system.includes('reword'), false, 'the app\'s review prompt asks for an order, not for wording');
  }
});

// ---------------------------------------------------------------- review outputs
test('replay: every review output parses with the app\'s extractJson and returns every requested id (0 unparseable, 0 missing)', () => {
  for (const r of replayed) { assert.equal(r.parse, 'ok', r.file); assert.equal(r.items.filter((i) => i.status === 'missing').length, 0, r.file); }
});

test('replay: the counts recorded in summary.json are what the app code gives today (a guard change that alters a verdict fails here)', () => {
  const recorded = Object.fromEntries(summary.review.map((r) => [r.file, r.items.map((i) => [i.id, i.status])]));
  for (const r of replayed) assert.deepEqual(r.items.map((i) => [i.id, i.status]), recorded[r.file], r.file);
  for (const model of ['coding', 'judgment']) {
    const it = items.filter((i) => i.model === model);
    assert.equal(it.length, 74);
    assert.deepEqual([it.filter((i) => i.status === 'copy_through').length, it.filter((i) => i.status === 'accepted_reworded').length, it.filter((i) => i.status === 'rejected').length], model === 'coding' ? [30, 36, 8] : [63, 7, 4]);
  }
});

test('reading: 0 of 148 model sentences breach the boundary (no buy/sell advice, prediction, ranking, label on the person, readiness, platform, benchmark)', () => {
  let read = 0;
  for (const [file, byItem] of Object.entries(readings.runs)) for (const [id, v] of Object.entries(byItem)) { assert.equal(v.breach, false, `${file} ${id}`); read += 1; }
  assert.equal(read, items.filter((i) => i.status !== 'copy_through').length, 'every sentence that is not a copy of the template was read');
  for (const i of items) assert.equal(lint(i.text, i.lang), 0, `independent scanner: ${i.file} ${i.id}: ${i.text}`);
});

test('reading: the 12 sentences the guard rejected were rejected for figures, not for a breach (11 spelled-out or dropped numerals in Greek, 1 English false positive on "Risk ...")', () => {
  const rejected = items.filter((i) => i.status === 'rejected');
  assert.equal(rejected.length, 12);
  for (const i of rejected) assert.ok(i.reasons.every((r) => ['numbers', 'numbers_dropped', 'guard:imperative'].includes(r)), `${i.file} ${i.id}: ${i.reasons}`);
  assert.equal(rejected.filter((i) => i.lang === 'el').length, 11);
  assert.deepEqual(rejected.filter((i) => i.reasons.includes('guard:imperative')).map((i) => i.text.slice(0, 19)), ['Risk per trade rose']);
});

test('positive control: the replay would have caught a breach — a real run with each banned legal-table row substituted is rejected by the same code path', () => {
  const run = reviewRuns.find((x) => x.run.model === 'coding' && x.run.lang === 'en').run;
  const item = run.items[0];
  for (const row of legalTable.banned.filter((r) => r.lang === 'en' && r.scope === 'review')) {
    assert.equal(screenModelText(row.text, item.facts, 'en', { ruleText: item.ruleText }).ok, false, row.text);
    assert.equal(screenModelText(`${item.ruleText} ${row.text}`, item.facts, 'en', { ruleText: item.ruleText }).ok, false, row.text);
  }
});

// ---- findings from the reading: the guard accepts these
const accepted = items.filter((i) => i.status === 'accepted_reworded');
const observed = (code) => Object.entries(readings.runs).flatMap(([file, byItem]) => Object.entries(byItem).filter(([, v]) => v.status === 'accepted_reworded' && v.observations.includes(code)).map(([id]) => `${file} ${id}`));

// R1 closes F9, F10 and F11 structurally: the review reads only an order of ids from a reply, so a sentence the model wrote cannot be
// shown. Each saved reply is fed through the app's real provider code on the week and period it answered, and what the review then
// renders is compared with the sentences the model wrote.
const screenOf = new Map();
async function screenFor({ file, run }) {
  if (!screenOf.has(file)) {
    const { review } = await reviewWithReply(run.week, run.lang, run.raw, run.period ? { period: run.period } : {});
    const base = await runReview(reviewInput(run.week, { lang: run.lang, ...(run.period ? { period: run.period } : {}) }));
    screenOf.set(file, { stored: JSON.stringify(review), shown: visibleStrings(review), templates: new Set(visibleStrings(base)) });
  }
  return screenOf.get(file);
}

test('all 148 saved model sentences of the L4b probe: none that differs from the app\'s own sentence reaches the rendered review; every rendered string is a template string', async () => {
  let checked = 0;
  for (const r of reviewRuns) {
    const screen = await screenFor(r);
    for (const s of screen.shown) assert.ok(screen.templates.has(s), `${r.file}: not a template string: ${s}`);
    for (const i of items.filter((x) => x.file === r.file)) {
      checked += 1;
      if (i.text.trim() !== i.ruleText.trim()) assert.equal(screen.stored.includes(i.text.trim()), false, `${r.file} ${i.id}: ${i.text}`);
    }
  }
  assert.equal(checked, 148);
});

const shownFor = async (code) => {
  const rows = accepted.filter((i) => observed(code).includes(`${i.file} ${i.id}`));
  assert.ok(rows.length > 0);
  for (const i of rows) {
    const screen = await screenFor({ file: i.file, run: i.run });
    assert.equal(screen.stored.includes(i.text), false, i.text);
  }
  return rows.length;
};

test('F9: a model sentence that gives a figure a meaning it does not have ("across 5 days" where n counts trades) is not shown', async () => {
  assert.equal(await shownFor('wrong_unit'), 2);
});

test('F10: a model sentence that shows internal field names ("(days=2, median=1, n=5)") is not shown', async () => {
  assert.equal(await shownFor('field_names_shown') > 0, true);
});

test('F11: a model sentence that drops "you set" or "marked not followed" is not shown; the template keeps both', async () => {
  const n = (await shownFor('attribution_dropped')) + (await shownFor('clause_dropped'));
  assert.ok(n >= 6);
  const en = await runReview(reviewInput('stocks', { lang: 'en' }));
  assert.ok(en.findings.some((f) => /the hours you set/.test(f.text)), 'the hours are attributed to the user in the template');
});

// ---------------------------------------------------------------- sentence entry
test('replay: every sentence output parses; the merged number fields always equal the code parse (the model never fills a number)', () => {
  assert.equal(sentences.length, 45);
  for (const s of sentences) { assert.equal(s.parse, 'ok', s.file); assert.equal(s.mergedNumbersEqualCode, true, s.file); }
});

test('the model misparsed 5 numbers in 5 of 45 phrases; each one surfaces as a conflict banner, none is silent, none is applied', () => {
  const wrong = sentences.filter((s) => s.misparse.length);
  assert.deepEqual(wrong.map((s) => [s.run.index, ...s.misparse]), [[29, 'target'], [30, 'entry'], [36, 'stop'], [43, 'stop'], [44, 'target']]);
  for (const s of wrong) assert.deepEqual(s.silent, [], `phrase ${s.run.index}`);
  assert.equal(sentences.reduce((n, s) => n + s.silent.length, 0), 0);
  assert.equal(sentences.filter((s) => s.setupSilentWrong).length, 0, 'no wrong setup tag');
  const p30 = sentences.find((s) => s.run.index === 30);
  assert.equal(p30.numbers.entry.model, '1.2005', 'the Greek thousands separator was read as a decimal point');
  assert.equal(p30.numbers.entry.code, '1200.5');
});

test('the two ambiguous Greek phrases ("2.410", "1.085"): the model commits to a reading, the app ignores it and asks the person', () => {
  const amb = sentences.filter((s) => s.ambiguousPhrase);
  assert.equal(amb.length, 2);
  for (const s of amb) { assert.deepEqual(s.conflicts, [], `phrase ${s.run.index}: no banner, the app asks with both readings`); assert.ok(Object.keys(s.ambiguousReadings).length >= 1); }
});

test('model-returned notes copy the typed sentence and carry no advice-shaped text', () => {
  const withNotes = sentences.filter((s) => s.notes);
  assert.equal(withNotes.length, 35);
  for (const s of withNotes) {
    assert.ok(s.run.text.includes(s.notes) || normalize(s.run.text).includes(normalize(s.notes)), `phrase ${s.run.index}: ${s.notes}`);
    assert.equal(check(s.notes, s.lang, { scope: 'review' }).hits.filter((h) => !['imperative', 'instruction'].includes(h.class)).length, 0, s.notes);
  }
});

test('a model number is never offered as a one-tap replacement of the code value (F12, R3): both values are shown, the person types the value, merged fields equal the code parse', () => {
  const view = fs.readFileSync(new URL('../../src/ui/views/sentence.js', import.meta.url), 'utf8');
  assert.equal(/conflict\.use|=\s*c\.model|\.model\s*\)?\s*;?\s*\}\s*\}/.test(view), false, 'no path writes the model value into a field');
  assert.match(view, /sentence\.conflict\.type/, 'the person types the value');
  assert.match(view, /parseUserDecimal\(String\(typed\[c\.field\]/, 'what is typed goes through the same decimal reader as the questions');
  for (const lang of ['en', 'el']) {
    const table = fs.readFileSync(new URL(`../../src/i18n/${lang}/review.js`, import.meta.url), 'utf8');
    assert.equal(table.includes("'sentence.conflict.use'"), false, `${lang}: the Use button string is gone`);
    assert.ok(table.includes("'sentence.conflict.type'") && table.includes("'sentence.conflict.set'"));
  }
  for (const s of sentences) assert.equal(s.mergedNumbersEqualCode, true, `phrase ${s.run.index}`);
  const shown = sentences.filter((x) => x.conflicts.length);
  assert.equal(shown.length, 5, 'the five misreads still surface as a banner with both values');
});
