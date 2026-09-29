// L4 fix round, RULING-L4-F5 R1, in a real Chrome: no sentence a model writes is ever rendered in the review screen.
//   node e2e/review-model-text.mjs          (run outside the Bash sandbox; exit 1 on any failed check)
// The real shell runs on the seeded stocks week (tests/review/harness). A mock OpenAI-compatible provider on the local static server answers
// every review request with advice-shaped text in every place a reply could carry it. The rendered DOM text (innerText of the page) is read
// and compared: the finding sentences must be the ones the rules-only review renders, and no corpus sentence may appear on the page.
import { launch, sleep } from './lib/cdp.mjs';
import { CORPUS, CORPUS_L4FIX } from '../tests/security/corpus.mjs';

const checks = [];
const ok = (name, cond, detail = '') => { checks.push({ name, ok: Boolean(cond), detail: cond ? '' : String(detail).slice(0, 500) }); };

const advice = [...Object.values(CORPUS.en).flat(), ...Object.values(CORPUS_L4FIX.en).flat()];
const seen = [];
const apiHandler = (req, res, body) => {
  let payload = {};
  try { payload = JSON.parse(JSON.parse(body).messages.at(-1).content); } catch { /* not a review request */ }
  const items = Array.isArray(payload.items) ? payload.items : [];
  seen.push({ url: req.url, items: items.length, body });
  const ids = items.map((i) => i.id).reverse();
  const reply = items.length
    ? JSON.stringify({ order: ids, items: items.map((i, n) => ({ id: i.id, text: `${advice[n % advice.length]} ${advice[(n + 7) % advice.length]}` })), text: advice[0], summary: advice[1], question: advice[2] })
    : '{"ok":true}';
  res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify({ choices: [{ message: { content: reply } }] }));
};

const b = await launch({ apiHandler });
await b.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
const clickText = (sel, label) => b.ev(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(sel)})].find((x) => x.textContent.trim() === ${JSON.stringify(label)}); if (!e) return false; e.click(); return true; })()`);
const findingTexts = () => b.ev("[...document.querySelectorAll('.pattern')].map((p) => [p.querySelector('.text')?.innerText ?? '', p.querySelector('.ask')?.innerText ?? ''])");

await b.load(`${b.base}/tests/review/harness/harness.html?route=%23/review&week=stocks&lang=en`, 600);
ok('the shell mounted on the seeded week', await b.until('window.__ready === true', 15000));

// ---- 1. rules only: the sentences the review shows without a model
ok('the period chip "All closed trades" is there', await clickText('.chips button', 'All closed trades'));
ok('rules run: the Run button is there', await clickText('button', 'Run the review'));
ok('rules run: findings rendered', await b.until("document.querySelectorAll('.pattern').length >= 3", 8000));
const rules = await findingTexts();
const rulesEngine = await b.ev("document.querySelector('.engine')?.dataset.engine");
ok('rules run: the engine chip says rules', rulesEngine === 'rules', rulesEngine);

// ---- 2. own key on a local mock provider (127.0.0.1 needs no key)
await b.ev(`(async () => {
  const s = window.__store;
  await s.setSetting('ai.provider', 'openai'); await s.setSetting('ai.model', 'mock'); await s.setSetting('ai.baseUrl', ${JSON.stringify(`${b.base}/v1`)});
  await s.setSetting('ai.own.confirmed', true); await s.setSetting('ai.engine', 'own-key');
  location.hash = '#/home'; await new Promise((r) => setTimeout(r, 300)); location.hash = '#/review';
})()`);
await sleep(700);
await clickText('.chips button', 'All closed trades');
ok('model run: the rerun/run button is there', (await clickText('button', 'Run it again')) || (await clickText('button', 'Run the review')));
ok('model run: findings rendered', await b.until("document.querySelectorAll('.pattern').length >= 3", 10000));
await sleep(300);
const model = await findingTexts();
const modelEngine = await b.ev("document.querySelector('.engine')?.dataset.engine");
ok('the model path really ran: the mock provider received a review request with findings, and the engine chip says own-key', seen.some((x) => x.items >= 2) && modelEngine === 'own-key', `${JSON.stringify(seen.map((x) => x.items))} ${modelEngine}`);
ok('what the provider received holds no sentence', seen.filter((x) => x.items).every((x) => !x.body.includes('ruleText') && !x.body.includes('marked not followed')), seen.find((x) => x.items)?.body.slice(0, 300));

const sortBySentence = (rows) => rows.map((r) => r.join(' | ')).sort();
ok('every rendered finding sentence and question equals the rules-only one (same set, the order may differ)', JSON.stringify(sortBySentence(model)) === JSON.stringify(sortBySentence(rules)), `${JSON.stringify(sortBySentence(model)).slice(0, 300)} VS ${JSON.stringify(sortBySentence(rules)).slice(0, 300)}`);
ok('the model\'s order was applied on screen (the order of the findings differs from the rules-only order)', JSON.stringify(model) !== JSON.stringify(rules));
const page = await b.ev('document.body.innerText');
const leaked = advice.filter((s) => page.includes(s));
ok(`none of ${advice.length} advice-shaped sentences is on the page`, leaked.length === 0, leaked.join(' || '));
ok('the page shows the "model only orders the findings" wording, not "reworded"', /only puts the findings in order/.test(page) && !/reworded/i.test(page), page.slice(-400));
const stored = await b.ev('window.__store.reviews.getAll().then((r) => JSON.stringify(r))');
ok('no advice-shaped sentence is in the stored review either', advice.every((s) => !stored.includes(s)));
ok('no page error and no request left the local server', b.problems.filter((p) => !/stats\/summary\.js|favicon\.ico/.test(p)).length === 0 && b.network.every((u) => u.startsWith(b.base) || u.startsWith('data:') || u.startsWith('blob:')), b.problems.join(' ; '));

await b.close();
for (const x of checks) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.name}${x.detail ? `  [${x.detail}]` : ''}`);
console.log(`${checks.filter((x) => x.ok).length}/${checks.length} checks passed`);
process.exit(checks.every((x) => x.ok) ? 0 : 1);
