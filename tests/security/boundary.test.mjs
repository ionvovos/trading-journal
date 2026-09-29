// L4b probe 3: the no-advice boundary (legal-review.md sections 1-2, requirements P5, B1). The review agent runs on the three seeded weeks
// in both languages, on the rules path and on the AI path with a stub model that returns advice-shaped text. The guard is measured
// against an independent scanner written here (not banned.js) and against a corpus of paraphrases that carry no listed word.
// Findings that are not yet met are `todo` tests (they run and report, they do not fail the suite).
import test from 'node:test';
import assert from 'node:assert/strict';
import { runReview } from '../../src/review/run.js';
import { check, screenModelText, normalize } from '../../src/review/guard.js';
import { assistSentence } from '../../src/sentence/assist.js';
import { parseSentence } from '../../src/sentence/parse.js';
import { evaluatePlan } from '../../src/plan/check.js';
import { parseExport } from '../../src/storage/exportImport.js';
import { learnStrings } from '../../src/learn/index.js';
import { reviewInput, legalTable, weeks, visibleStrings, reviewWithReply } from './helpers.mjs';
import { CORPUS, CORPUS_L4FIX } from './corpus.mjs';

const LANGS = ['en', 'el'];
const WEEKS = ['stocks', 'crypto', 'forex'];

// ---- an independent scanner: what legal-review section 2 rules 1-7 forbid, written separately from src/review/banned.js
const LINT = {
  en: [/\b(should|must|ought to|need to|have to|consider|try|avoid|recommend\w*|suggest\w*|advis\w*)\b/i, /\b(will|won'?t|going to|shall|gonna)\b|'ll\b/i, /\b(better|worse|best|worst)\b/i, /\b(guarantee\w*|risk[- ]free)\b/i, /\b(ready|suitable|go live)\b/i, /\b(revenge|overtrad\w*|gambler|undisciplined|reckless)\b/i, /\b(analysis|research|outlook|signals?|coach\w*|insights?)\b/i],
  // sentence-initial imperatives about a trade: applied to review text only (interface buttons such as Add or Close are imperatives about the app)
  initial: [/^(buy|sell|hold|close|short|cut|move|pause|stop|add|reduce|increase|trim)\b/i],
  el: [/(πρεπει|επρεπε|αποφευγ|προτειν|σκεφτειτε|δοκιμαστε)/, /(^|\s)θα\s/, /(καλυτερ|χειροτερ)/, /(εγγυ|χωρισ ρισκο)/, /(ετοιμ|καταλληλ)/, /(εκδικητικ|υπερσυναλλαγ)/],
};
LINT.initial_el = [/^(αγορασ|πουλησ|κρατησ|κλεισ|μετακινησ|αυξησ|μειωσ)τε?\b/];
const lint = (text, lang, { initial = true } = {}) => {
  const n = normalize(text);
  const rules = [...LINT[lang], ...(initial ? (lang === 'en' ? LINT.initial : LINT.initial_el) : [])];
  return rules.filter((re) => re.test(lang === 'en' ? text : n)).map(String);
};
const shown = (review) => review.findings.flatMap((f) => [f.text, f.question]).filter(Boolean);
const stripQuoted = (s) => s.replace(/[“«][^”»]*[”»]/g, ' ');

// ---------------------------------------------------------------- 3a. rules path
for (const lang of LANGS) {
  for (const name of WEEKS) {
    test(`rules path, ${name} week, ${lang}: every sentence and question passes the guard and the independent scanner; no future tense, no ranking, no label`, async () => {
      const review = await runReview(reviewInput(name, { lang }));
      assert.equal(review.engine, 'rules');
      assert.ok(review.findings.length >= 2);
      for (const s of shown(review)) {
        assert.deepEqual(check(stripQuoted(s), lang, { scope: 'review' }).hits, [], s);
        assert.deepEqual(lint(stripQuoted(s), lang), [], `independent scanner: ${s}`);
      }
      for (const l of Object.values(review.lines)) if (l) assert.deepEqual(lint(l, lang), [], l);
    });
  }
}

test('rules path: every question is open (starts with what/how/which/when/where or the Greek equivalents)', async () => {
  for (const lang of LANGS) for (const name of WEEKS) {
    const review = await runReview(reviewInput(name, { lang }));
    for (const f of review.findings) if (f.question) assert.equal(check(f.question, lang, { scope: 'review' }).hits.some((h) => h.class === 'leading_question'), false, f.question);
  }
});

test('every interface, learn and template string in both languages passes the independent scanner (learn entries may name revenge trading and overtrading as terms)', async () => {
  const misses = [];
  const TERM = /revenge|overtrad|εκδικητικ|υπερσυναλλαγ/i;
  for (const lang of LANGS) {
    for (const shard of ['shell', 'data', 'review']) {
      const cat = (await import(`../../src/i18n/${lang}/${shard}.js`)).default;
      for (const [k, v] of Object.entries(cat)) {
        if (typeof v !== 'string' || k.startsWith('legal.')) continue;
        // words that name a statistic or a placeholder disclaimer, not a statement about a trade
        const text = v.replace(/not a recommendation|Nothing here is recommended|Expectancy|month edge|edge of the period|The checks suggest/gi, '');
        if (lint(text, lang, { initial: false }).length) misses.push(`${lang}/${shard} ${k}: ${v.slice(0, 90)}`);
      }
    }
    for (const s of learnStrings(lang)) {
      const text = s.text.replace(TERM, '').replace(/Expectancy|expected/gi, '');
      const hits = lint(text, lang, { initial: false });
      if (hits.length) misses.push(`${lang}/learn ${s.key}: ${s.text.slice(0, 90)}`);
    }
  }
  assert.deepEqual(misses, []);
});

test('the legal-review section 2 table through the model gate: every banned review row is rejected, every safe row is accepted', () => {
  const facts = { n: '3', x: '1' };
  for (const r of legalTable.banned.filter((x) => x.scope === 'review')) assert.equal(screenModelText(r.text, facts, r.lang).ok, false, r.text);
  for (const r of legalTable.safe.filter((x) => x.scope === 'review' && /[\p{L}]+(\s+[\p{L}]+){3,}/u.test(x.text))) {
    const numbers = Object.fromEntries((r.text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n, i) => [`n${i}`, n]));
    const g = screenModelText(r.text, { ...numbers, instruments: (r.text.match(/\b[A-Z]{3,6}\b/g) ?? []) }, r.lang);
    assert.equal(g.reasons.some((x) => x.startsWith('guard:')), false, `${r.text} -> ${g.reasons}`);
  }
});

// ---------------------------------------------------------------- 3b. AI path, stub model
const banned = (lang) => legalTable.banned.filter((r) => r.lang === lang && r.scope === 'review').map((r) => r.text);
const stub = (make) => ({ id: 'on-device', reword: async (items) => items.map((i) => ({ id: i.id, text: make(i) })) });

for (const lang of LANGS) {
  for (const name of WEEKS) {
    test(`AI path, ${name} week, ${lang}: text made of a banned row, alone or appended to the finding's own sentence, is never shown`, async () => {
      const base = await runReview(reviewInput(name, { lang }));
      for (const attack of banned(lang)) {
        for (const mk of [() => attack, (i) => `${i.ruleText} ${attack}`, (i) => `${attack} ${i.ruleText}`]) {
          const review = await runReview(reviewInput(name, { lang }), { engine: stub(mk) });
          for (const s of shown(review)) assert.deepEqual(check(stripQuoted(s), lang, { scope: 'review' }).hits, [], `${name}/${lang}: ${s}`);
          assert.deepEqual(review.findings.map((f) => [f.pattern, f.n, f.tradeIds, f.facts]), base.findings.map((f) => [f.pattern, f.n, f.tradeIds, f.facts]), 'figures unchanged');
        }
      }
    });
  }
}

// ---- paraphrases that contain none of the listed words. The model gate must not pass them (legal-review section 2 rule 10 says the
//      template is the fallback; this corpus measures how often the scan alone would let advice through).
async function findingsFor(lang) {
  const items = [];
  for (const w of WEEKS) await runReview(reviewInput(w, { lang }), { engine: { id: 'x', reword: async (i) => { items.push(...i); return []; } } });
  return items;
}

// F5 is fixed structurally (RULING-L4-F5 R1): a model's reply is read for an order of ids and nothing else, so no sentence it writes is shown.
// Every corpus sentence is put in every place a reply could carry text; the rendered strings must equal the rules-only review's, and the
// stored review must not contain the sentence at all.
const replyShapes = (s) => [
  (p) => JSON.stringify({ order: p.items.map((i) => i.id), items: p.items.map((i) => ({ id: i.id, text: s })) }),
  (p) => JSON.stringify({ order: p.items.map((i) => i.id), text: s, notes: s, question: s }),
  () => JSON.stringify({ order: [s] }),
  () => s,
  (p) => JSON.stringify({ items: p.items.map((i) => ({ id: i.id, text: `${i.id} ${s}` })) }),
];

for (const lang of LANGS) {
  test(`model gate, ${lang}: no advice-shaped sentence of either corpus, in any reply shape, reaches the rendered review`, async () => {
    const all = [...Object.values(CORPUS[lang]).flat(), ...Object.values(CORPUS_L4FIX[lang]).flat()];
    assert.ok(all.length >= 20);
    for (const name of WEEKS) {
      const base = visibleStrings(await runReview(reviewInput(name, { lang }))).sort();
      for (const s of all) {
        for (const shape of replyShapes(s)) {
          const { review } = await reviewWithReply(name, lang, shape);
          assert.deepEqual(visibleStrings(review).sort(), base, `${name}/${lang}: ${s}`);
          assert.equal(JSON.stringify(review).includes(s), false, `${name}/${lang} stored review carries: ${s}`);
        }
      }
    }
  });
}

test('positive control for the model gate: an order the model returns is applied (the model path really ran), and only the order changes', async () => {
  const base = await runReview(reviewInput('stocks'));
  const ids = base.findings.map((f) => f.id);
  const { review, ids: asked } = await reviewWithReply('stocks', 'en', () => JSON.stringify({ order: [...ids].reverse() }));
  assert.equal(review.engine, 'own-key');
  assert.deepEqual(asked.sort(), base.findings.filter((f) => f.pattern !== 'plan_not_followed').map((f) => f.id).sort(), 'the finding that quotes the plan rule was not sent');
  assert.notDeepEqual(review.findings.map((f) => f.id), ids, 'the order changed');
  assert.deepEqual(visibleStrings(review).sort(), visibleStrings(base).sort());
});

// ---- a closed-vocabulary check would close F5 for wording that adds meaning: a model sentence may use only words of the sentence
//      it rewords plus a fixed list of glue words. Prototype here to show it is feasible and does not reject the legitimate rewordings.
const GLUE = {
  en: 'a an the of in on at to from than and or but was were is are be been had has have with per over across during this that these those it its your you period week days day n'.split(' '),
  el: 'σε από το τα τη την του των και ή ήταν ήταν είναι είχε είχαν με ανά στην στο στη στις στους της τους ο η οι ένα μια αυτή αυτό αυτά περίοδο εβδομάδα ημέρα ημέρες n'.split(' '),
};
const tokens = (s, lang) => (normalize(s).match(/[\p{L}]+/gu) ?? []).filter((w) => w !== 'n' || true);
function closedVocabulary(text, ruleText, lang) {
  const allowed = new Set([...tokens(ruleText, lang), ...GLUE[lang].map((w) => normalize(w))]);
  return tokens(text, lang).every((w) => allowed.has(w));
}

for (const lang of LANGS) {
  test(`prototype closed-vocabulary check, ${lang}: rejects every corpus paraphrase, keeps the reorderings a model would legitimately produce`, async () => {
    const items = await findingsFor(lang);
    for (const item of items) {
      for (const list of Object.values(CORPUS[lang])) for (const s of list) assert.equal(closedVocabulary(`${item.ruleText} ${s}`, item.ruleText, lang), false, s);
      const keep = lang === 'en' ? [`Across the week, ${item.ruleText}`, `In this period: ${item.ruleText}`] : [item.ruleText];
      for (const k of keep) assert.equal(closedVocabulary(k, item.ruleText, lang), true, k);
    }
  });
}

// ---------------------------------------------------------------- 3c. model-written notes on a typed sentence
test('sentence assist: model-written notes that are not in the typed sentence are dropped', async () => {
  const sentence = 'Bought 50 AAPL at 100 stop 98';
  const parsed = parseSentence(sentence, { lang: 'en', setups: ['breakout'], instruments: ['AAPL'], now: '2026-09-25T10:00:00Z' });
  const engine = { id: 'own-key', assist: async () => ({ setup: null, notes: 'The record supports a wider stop and smaller size.', numbers: {} }) };
  const out = await assistSentence(engine, sentence, parsed, { lang: 'en', setups: ['breakout'] });
  assert.equal(out.fields.notes, null);
});

test('sentence assist: a model number that differs from the code parse never replaces it (AC-P1.6)', async () => {
  const sentence = 'Bought 50 AAPL at 100 stop 98';
  const parsed = parseSentence(sentence, { lang: 'en', setups: [], instruments: ['AAPL'], now: '2026-09-25T10:00:00Z' });
  const engine = { id: 'own-key', assist: async () => ({ setup: null, notes: null, numbers: { entry: '1000', stop: '9.8', size: '5' } }) };
  const out = await assistSentence(engine, sentence, parsed, { lang: 'en', setups: [] });
  assert.equal(out.fields.entry, parsed.fields.entry);
  assert.equal(out.fields.stop, parsed.fields.stop);
  assert.equal(out.fields.size, parsed.fields.size);
  assert.ok(out.conflicts.length >= 2, 'the difference is shown beside the code value');
});

// ---------------------------------------------------------------- 3d. hostile data that reaches the review
test('an imported plan with malformed hours is refused at import (F7); a malformed plan already stored does not crash the plan check or the review', async () => {
  const rows = (hours) => ({ format: 'trading-journal-export', version: 1, exportedAt: '2026-09-29T00:00:00Z', plans: [{ id: 'p', active: true, hours }] });
  for (const hours of [[{ from: '09:30', to: '11:30, cut your position size' }], [{ from: '25:00', to: '11:00' }], [{ from: '09:30' }], 'junk', [null], [{ from: '9:5', to: '11:00' }]]) {
    const parsed = parseExport(JSON.stringify(rows(hours)));
    assert.equal(parsed.ok, false, JSON.stringify(hours));
    assert.match(parsed.detail, /^plans\[0\]\.hours$/);
  }
  assert.equal(parseExport(JSON.stringify(rows([{ from: '09:30', to: '11:30' }, { from: '22:00', to: '02:00' }, { from: '00:00', to: '24:00' }]))).ok, true, 'real windows, wrapping ones included, still import');
  for (const bad of [{ dailyCap: 0 }, { dailyCap: 1.5 }, { dailyCap: 'x' }, { riskPct: 'abc' }, { riskPct: -1 }, { dailyLossLimitPct: {} }, { items: 'x' }, { items: [{ id: 'i' }] }, { setups: [1] }]) {
    const parsed = parseExport(JSON.stringify({ ...rows([]), plans: [{ id: 'p', ...bad }] }));
    assert.equal(parsed.ok, false, JSON.stringify(bad));
  }
  assert.equal(parseExport(JSON.stringify({ ...rows([]), plans: [{ id: 'p', dailyCap: 3, riskPct: '1.5', dailyLossLimitPct: 2, items: [{ id: 'i', text: 'x' }], setups: ['a'] }] })).ok, true);
  // a plan that is already stored (an older build, a hand-edited store) must not break the checklist or the review either
  const plan = { ...weeks.stocks.plan, hours: [{ from: '09:30', to: '11:30, cut your position size' }, { from: 'junk', to: '10:00' }, null, { from: '09:30', to: '11:30' }] };
  assert.doesNotThrow(() => evaluatePlan(weeks.stocks.trades[0], plan, { sameDayTrades: [], equityAtEntryMinor: 1000000, tz: 'America/New_York' }));
  const review = await runReview(reviewInput('stocks', {}, (w) => { w.plan = plan; return w; }));
  assert.equal(JSON.stringify(review).includes('cut your position size'), false, 'a malformed window is never printed');
});

test('a hostile plan cannot put advice into a review sentence through the hours field (the malformed value is refused before it is printed)', async () => {
  for (const to of ['11:30, cut your position size', '11:30 so trade less', '11:30; stay flat tomorrow']) {
    let text = '';
    try {
      const r = await runReview(reviewInput('stocks', {}, (w) => { w.plan.hours = [{ from: '09:30', to }]; return w; }));
      text = JSON.stringify(r.findings);
    } catch { /* refused: nothing printed */ }
    assert.equal(/cut your|trade less|stay flat/.test(text), false);
  }
});
