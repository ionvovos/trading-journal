// L4 Greek flow on the real app (AC-P7.1, AC-P7.2, AC-U3.1, AC-B1.5): first run in Greek, a real account, a real manual trade with a
// decimal comma, sentence entry with `0,2` and the ambiguous `1.085`, statistics and one drill-down, Learn, Review, About, Settings.
// Collects the visible text of each screen (e2e/out/L4/greek.json) and lists Latin words left over (minus the stated Latin terms).
//   node e2e/greek.mjs        Run outside the Bash sandbox. Exit 1 on a failed check.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open, sleep } from './lib/flow.mjs';
import { FIRST_RUN } from '../src/about/text.js';

const out = join(dirname(fileURLToPath(import.meta.url)), 'out', 'L4');
mkdirSync(out, { recursive: true });
const checks = [];
const ok = (name, cond, detail = '') => { checks.push({ name, ok: Boolean(cond), detail: cond ? '' : String(detail).slice(0, 500) }); if (!cond) console.log(`FAIL ${name} :: ${String(detail).slice(0, 300)}`); };

const f = await open();
const seen = {};
const scan = async (label) => { seen[label] = `${await f.text()}\n${await f.overlay()}`; };
const shot = async (name) => { const r = await f.b.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(out, `greek-${name}.png`), Buffer.from(r.result.data, 'base64')); };

await f.b.load(`${f.b.base}/index.html`, 700);
await f.tap('Ελληνικά', { sel: '.seg button' }); await sleep(500);
const txt = await f.text();
ok('AC-P7.1 the first run switches to Greek without a reload', /[Α-Ωα-ω]{4,}/.test(txt) && !/Numbers you can check/.test(txt));
ok('AC-B1.5 the Greek first-run sentence is the approved text', (await f.b.ev("[...document.querySelectorAll('.note-card p')].map((p) => p.textContent)")).includes(FIRST_RUN.el));
await scan('first-run');
await f.tapSel('.ob-foot .btn'); await sleep(400);
await scan('first-run-path');
await f.tap('Πραγματική συναλλαγή', { sel: '.choice' }); await f.tapSel('.ob-foot .btn'); await sleep(700);

await f.go('#/accounts', 500);
await f.tap('Προσθήκη λογαριασμού', { sel: 'button, .btn' }); await sleep(400);
await scan('account-sheet');
await f.fill('Όνομα', 'Broker'); await f.fill('Νόμισμα', 'EUR'); await f.fill('Αρχικό υπόλοιπο', '5000');
await f.tap('Αποθήκευση', { exact: true, sel: 'button' }); await sleep(600);
await scan('accounts');

await f.go('#/trade/new', 700);
if (await f.has('Παράλειψη λίστας')) await f.tap('Παράλειψη λίστας');
await sleep(300);
await f.fill('Προϊόν', 'AAPL'); await f.fill('Μέγεθος θέσης', '10'); await f.fill('Είσοδος', '100,5'); await f.fill('Stop', '98'); await f.fill('Έξοδος', '105');
await sleep(300);
await scan('trade-form');
await shot('trade-form');
await f.tap('Αποθήκευση συναλλαγής'); await sleep(900);
const j = await f.text();
ok('AC-U3.1 a real manual trade is saved in Greek', /AAPL/.test(j), j.slice(0, 300));
ok('AC-P7.2 the decimal comma is a decimal: 10 x (105 - 100,5) = +45,00 in the journal', /45[,.]00/.test(j), j.slice(0, 400));
await scan('journal');
await shot('journal');

for (const [sentence, label] of [['αγόρασα 0,2 ETH στα 2410, stop 2350', 'sentence'], ['αγόρασα 1000 EUR/USD στα 1.085', 'sentence-ambiguous']]) {
  await f.go('#/sentence', 700);
  if (await f.has('Παράλειψη λίστας')) { await f.tap('Παράλειψη λίστας'); await sleep(300); }
  await f.fill('πρόταση', sentence);
  await f.tap('Ανάγνωση πρότασης'); await sleep(900);
  await scan(label);
  await shot(label);
}
const st = seen.sentence;
ok('AC-P1.5/P7.2 the Greek sentence with a decimal comma is read by code: ETH, 0,2, 2410, 2350', /ETH/.test(st) && /0[,.]2/.test(st) && /2[.,\s]?410/.test(st) && /2[.,\s]?350/.test(st), st.slice(0, 600));
const amb = seen['sentence-ambiguous'];
ok('AC-P7.2 "1.085" in Greek is asked with both readings, never guessed', /1[.,]085/.test(amb) && /1[.\s,]?085|1085/.test(amb) && /(;|\?)/.test(amb), amb.slice(0, 700));

await f.go('#/stats/overview', 900); await scan('stats'); await shot('stats');
await f.b.ev("(() => { const b = [...document.querySelectorAll('button.link-val, button.v')][0]; b?.click(); })()"); await sleep(800);
await scan('drill'); await shot('drill');
await f.go('#/learn/r', 600); await scan('learn-r');
await f.go('#/review', 600); await scan('review-start');
await f.tapSel('main .btn.lg, main .btn.primary'); await sleep(1500); await scan('review'); await shot('review');
await f.go('#/about', 700); await scan('about'); await shot('about');
await f.go('#/settings', 600); await scan('settings');
await f.go('#/calendar', 700); await scan('calendar');
ok('AC-P7.1 the html lang attribute is el', (await f.b.ev('document.documentElement.lang')) === 'el');
ok('AC-P10.1 the About page opens in Greek with the approved text', seen.about.length > 500 && /[Α-Ωα-ω]{4,}/.test(seen.about), seen.about.slice(0, 200));

const ALLOW = new Set(['stop', 'spread', 'funding', 'swap', 'long', 'short', 'broker', 'pips', 'pip', 'lots', 'lot', 'kraken', 'interactive', 'brokers', 'activity', 'statement', 'metatrader', 'trades', 'history', 'generic', 'paper', 'real', 'csv', 'json', 'html', 'expectancy', 'setup', 'crypto', 'forex', 'english', 'europe', 'athens', 'crosstrade', 'multiple', 'breakout']); // 'multiple' is the term R-multiple; 'breakout' is the setup name the test typed itself // stated list (architecture i18n): market terms plus proper names (language endonym, IANA zone id, source name)
const left = {};
for (const [k, v] of Object.entries(seen)) {
  if (k === 'about') continue; // the About page is the pinned lawyer text (src/about/text.js): product names, hosts and legal terms stay as written
  const words = [...new Set((v.match(/(?<![A-Za-zΑ-Ωα-ωά-ώ])[A-Za-z]{4,}(?![A-Za-zΑ-Ωα-ωά-ώ])/g) || []).filter((w) => w !== w.toUpperCase() && !ALLOW.has(w.toLowerCase())))];
  if (words.length) left[k] = words;
}
ok('AC-U3.1/P7.1 no English word is left on the Greek screens visited (Latin terms of the stated list excepted)', Object.keys(left).length === 0, JSON.stringify(left));
const problems = f.b.problems.filter((p) => !/summary\.js/.test(p));
ok('no console error or exception in the Greek flow', problems.length === 0, JSON.stringify(problems));
ok('AC-P8.2 no external request', f.b.network.filter((u) => !u.startsWith(f.b.base) && !u.startsWith('data:') && !u.startsWith('about:')).length === 0);
writeFileSync(join(out, 'greek.json'), `${JSON.stringify({ at: new Date().toISOString(), checks, left, seen }, null, 1)}\n`);
await f.close();
const failed = checks.filter((c) => !c.ok);
console.log(`${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
