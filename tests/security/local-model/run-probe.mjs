// L4b local-model probe driver (needs a live oMLX and the ais-os tool; NOT part of `npm test`). Builds the exact prompts the app sends,
// calls a small local model through ais-os `tools/aios-local-model.mjs`, and saves every raw output to ./out/.
//   node tests/security/local-model/run-probe.mjs review   <judgment|coding>
//   node tests/security/local-model/run-probe.mjs sentence <coding|judgment>
// The tool sends one user turn, so the app's system text and user JSON are joined by a blank line (the app sends them as two roles).
// Run outside the Bash sandbox (the sandbox blocks the local oMLX port). One model at a time: run one alias to the end before the next.
import fs from 'node:fs';
import vm from 'node:vm';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runReview } from '../../../src/review/run.js';
import { rewordPrompt, assistPrompt } from '../../../src/ai/prompts.js';
import { parseSentence } from '../../../src/sentence/parse.js';
import { weeks, reviewInput } from '../helpers.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const OUT = `${here}out/`;
const AIOS = '/Users/ionvovos/Εγγραφα/ais-os';
const [kind, alias] = process.argv.slice(2);
if (!['review', 'sentence'].includes(kind) || !['judgment', 'coding'].includes(alias)) { console.error('usage: run-probe.mjs review|sentence judgment|coding'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });

function callModel(prompt) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const p = spawn('node', ['tools/aios-local-model.mjs', '--model', alias, prompt], { cwd: AIOS });
    let out = '';
    let err = '';
    const timer = setTimeout(() => p.kill('SIGKILL'), 240000);
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => { clearTimeout(timer); resolve({ code, raw: out.replace(/\n$/, ''), err: err.trim(), ms: Date.now() - t0 }); });
  });
}
const joined = ({ system, user }) => `${system}\n\n${user}`;

// ---- review: the request the app builds for each seeded week (whole week, first half, second half), both languages
async function capture(name, lang, period) {
  let captured = null;
  await runReview(reviewInput(name, { lang, ...(period ? { period } : {}) }), { engine: { id: 'own-key', reword: async (items) => { captured = items; return []; } } });
  return captured;
}
function variantsOf(name) {
  const w = weeks[name];
  const dates = [...new Set(w.trades.filter((t) => t.closeTime).map((t) => t.closeTime.slice(0, 10)))].sort();
  const mid = dates[Math.floor(dates.length / 2) - 1] ?? dates[0];
  const next = dates[Math.floor(dates.length / 2)] ?? dates.at(-1);
  return { full: null, first: { ...w.period, to: mid }, second: { ...w.period, from: next } };
}

if (kind === 'review') {
  for (const name of ['stocks', 'crypto', 'forex']) {
    for (const [variant, period] of Object.entries(variantsOf(name))) {
      for (const lang of ['en', 'el']) {
        const file = `${OUT}review-${alias}-${name}-${variant}-${lang}.json`;
        if (fs.existsSync(file)) { console.log('have', file); continue; }
        const items = await capture(name, lang, period);
        if (!items || !items.length) { fs.writeFileSync(file, JSON.stringify({ model: alias, week: name, variant, lang, skipped: 'the app sends nothing to a model: no finding without a quoted plan rule' }, null, 2)); console.log('skip (no request)', name, variant, lang); continue; }
        const prompt = rewordPrompt(items, lang);
        const r = await callModel(joined(prompt));
        fs.writeFileSync(file, JSON.stringify({ model: alias, week: name, variant, lang, period, items, prompt, joinedPrompt: joined(prompt), raw: r.raw, exit: r.code, error: r.err, ms: r.ms }, null, 2));
        console.log(alias, name, variant, lang, `exit=${r.code}`, `${r.ms}ms`, `${r.raw.length} chars`);
      }
    }
  }
}

// ---- sentence entry: every phrase of tests/sentence/parse.test.mjs through the app's assist prompt
if (kind === 'sentence') {
  const src = fs.readFileSync(new URL('../../sentence/parse.test.mjs', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('const CASES = ['), src.indexOf('\n];', src.indexOf('const CASES = [')) + 3).replace('const CASES =', 'CASES =');
  const ctx = { CASES: null }; vm.createContext(ctx); vm.runInContext(body, ctx);
  const SETUPS = ['breakout', 'pullback', 'range'];
  const phrases = ctx.CASES;
  for (const [i, [text, lang, expected]] of phrases.entries()) {
    const file = `${OUT}sentence-${alias}-${String(i + 1).padStart(3, '0')}.json`;
    if (fs.existsSync(file)) { console.log('have', file); continue; }
    const prompt = assistPrompt(text, { setups: SETUPS, lang });
    const parsed = parseSentence(text, { lang, setups: SETUPS, instruments: [], now: '2026-09-25T10:00:00Z' });
    const r = await callModel(joined(prompt));
    fs.writeFileSync(file, JSON.stringify({ model: alias, index: i + 1, text, lang, expected: JSON.parse(JSON.stringify(expected)), setups: SETUPS, code: { fields: parsed.fields, ambiguous: parsed.ambiguous, missing: parsed.missing }, prompt, raw: r.raw, exit: r.code, error: r.err, ms: r.ms }, null, 2));
    console.log(alias, i + 1, `exit=${r.code}`, `${r.ms}ms`);
  }
}
