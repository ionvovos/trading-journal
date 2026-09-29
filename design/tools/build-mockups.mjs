// Generates the static mockups in design/mockups/ (one file per screen or state).
// Run: node design/tools/build-mockups.mjs   (no dependencies, no network)
// Every trading figure comes from TRADES / S in lib.mjs; the asserts at the end fail the build if screens stop adding up.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import {
  ic, money, signed, fmt, R, rCls, MINUS, page, tabbar, modeSwitch, badge, mk,
  equityPoints, ddStats, MONTH_TOTAL, N_CLOSED, S, TRADES, RBINS, week, summary,
  equityChart, drawdownChart, rHistogram, calendar, candleShot,
} from './lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'mockups');
mkdirSync(out, { recursive: true });

const PTS = equityPoints();
const DD = ddStats(PTS);
const SCREENS = [];
const add = (name, group, title, html) => { SCREENS.push({ name, group, title }); writeFileSync(join(out, `${name}.html`), html); };
const mkt = (name) => S.markets.find((m) => m.key === name);
const STOCK_NET = mkt('Stocks').net, FX_NET = mkt('Forex').net;
const n2 = (v, lang = 'en') => fmt(v, lang, 2);
const pct1 = (v, lang = 'en') => `${fmt(v, lang, 1)}%`;
const hm = (m) => `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, '0')} min`;
const find = (day, sym) => TRADES.find((t) => t.day === day && t.sym === sym);

// Broker check sample (IBKR, September): causes with known amounts, and a remainder the app does not fit anywhere (G1)
const MSFT_HELD = 64.20, AAPL_DUP = -21.90, AMD_FEE = -2.00;
const IBKR_JOURNAL = STOCK_NET;
const IBKR_BROKER = Math.round((IBKR_JOURNAL + MSFT_HELD + AAPL_DUP + AMD_FEE) * 100) / 100;
const IBKR_DIFF = Math.round((IBKR_BROKER - IBKR_JOURNAL) * 100) / 100;
const IBKR_EXPLAINED = Math.round((MSFT_HELD + AAPL_DUP) * 100) / 100;
const IBKR_UNEXPLAINED = Math.round((IBKR_DIFF - IBKR_EXPLAINED) * 100) / 100;
const IBKR_N = mkt('Stocks').n;
const TOL = Math.min(0.01 * IBKR_N, 1);

// ---------- shared fragments ----------
const topbar = ({ title, mode, right = '', left = '', paper = false, lang = 'en' }) => `<header class="topbar${paper ? ' paper-mode' : ''}">${left}${title ? `<h1>${title}</h1>` : ''}${mode ? modeSwitch(mode, lang) : ''}${right}</header>`;
const navbar = ({ back, title, right = '', paper = false }) => `<header class="topbar${paper ? ' paper-mode' : ''}"><button class="back">${ic('left')}${back}</button><h1 class="title-sm">${title}</h1>${right || '<span style="width:64px"></span>'}</header>`;
const gear = `<button class="icon-btn" aria-label="Settings">${ic('gear')}</button>`;
const status = (k, label) => `<span class="status ${k}">${ic({ ok: 'checkc', open: 'neq', skip: 'skip', ask: 'question' }[k], 'sm')}${label}</span>`;
const info = (label) => `<button class="icon-btn hit" aria-label="Explain ${label}" style="width:26px;height:26px;margin:-6px -4px">${ic('info', 'info-dot')}</button>`;
const sizeLine = (t, lang = 'en') => `${t.side} ${t.size}${t.pips != null ? ` · ${signed(t.pips, lang, 1)} pips` : ''}`;
const tradeRow = (t, { meta = '', flags = '', cls = '', end = '' } = {}) => `<a class="row ${cls}" href="#">${mk(t.m)}<div class="main"><span class="t">${t.sym}${flags}</span><span class="d">${sizeLine(t)}${t.setup ? ` · ${t.setup}` : ''}${meta}</span></div><div class="end">${end || `<span class="m">${money(t.net)}</span><span class="rr ${rCls(t.r)}">${R(t.r)}</span>`}</div></a>`;
const rowPlain = ({ m, sym, line, flags = '', cls = '', end }) => `<a class="row ${cls}" href="#">${mk(m)}<div class="main"><span class="t">${sym}${flags}</span><span class="d">${line}</span></div><div class="end">${end}</div></a>`;
const avgR = (x, lang = 'en') => (x.rk ? `avg ${signed(x.sumR / x.rk, lang)}R${x.rk < x.n ? ` over ${x.rk} with R` : ''}` : 'no R');
const behind = (paper = false) => `${topbar({ title: '', mode: paper ? 'paper' : 'real', paper, right: `<span style="flex:1"></span>${gear}` })}<main class="content"><section class="card" style="height:300px"></section></main>${tabbar('home')}<div class="scrim"></div>`;
const h2 = (text) => `<h2 style="margin:0;font:700 22px/28px var(--font-display)">${text}</h2>`;

const RECENT = [find(29, 'AAPL'), find(28, 'EUR/USD'), find(28, 'BTC/USD'), find(28, 'NVDA')];

// ---------- DASHBOARD (real) + Greek + offline ----------
const L = {
  en: {
    banner: 'IBKR, September: difference open', bannerBody: `Your broker shows ${n2(IBKR_DIFF)} more. 2 trades may explain most of it.`,
    net: 'Net P&amp;L', month: 'September', sub: `${N_CLOSED} closed · 1 held out · 2 open`,
    exp: 'Expectancy', expN: `n ${S.rk}<br>no R on ${S.n - S.rk}`, win: 'Win rate', winN: `${S.wins} of ${N_CLOSED}`, dd: 'Max drawdown', ddN: `${MINUS}${n2(-DD.dd)}<br>% incl. deposits`,
    check: 'Broker check', all: 'All periods', recent: 'Recent trades', seeAll: 'See all',
    st: { open: 'Difference', ok: 'Reconciled', skip: 'Skipped', ask: 'Not asked' },
    periods: [['IBKR', `Sep 2026 · +${n2(IBKR_DIFF)}`, 'open'], ['Kraken', 'Sep 2026', 'skip'], ['MT4 forex', 'Sep 2026 · imported 29 Sep', 'ask'], ['IBKR', `Aug 2026 · within ±0.14`, 'ok']],
    offline: 'You are offline', offlineBody: 'Everything on this device keeps working. Reviews with your own key wait for a connection.',
  },
  el: {
    banner: 'IBKR, Σεπτέμβριος: ανοιχτή διαφορά', bannerBody: `Ο broker δείχνει ${n2(IBKR_DIFF, 'el')} παραπάνω. Μπορεί να το εξηγούν κυρίως 2 συναλλαγές.`,
    net: 'Καθαρό Κ/Ζ', month: 'Σεπτέμβριος', sub: `${N_CLOSED} κλειστές · 1 σε αναμονή · 2 ανοιχτές`,
    exp: 'Μέσο R', expN: `n ${S.rk}<br>χωρίς R: ${S.n - S.rk}`, win: 'Κερδοφόρες', winN: `${S.wins} από ${N_CLOSED}`, dd: 'Μέγ. πτώση', ddN: `${MINUS}${n2(-DD.dd, 'el')}<br>% με καταθέσεις`,
    check: 'Έλεγχος με τον broker', all: 'Όλες οι περίοδοι', recent: 'Πρόσφατες συναλλαγές', seeAll: 'Όλες',
    st: { open: 'Διαφορά', ok: 'Συμφωνεί', skip: 'Παραλείφθηκε', ask: 'Δεν ζητήθηκε' },
    periods: [['IBKR', `Σεπ 2026 · +${n2(IBKR_DIFF, 'el')}`, 'open'], ['Kraken', 'Σεπ 2026', 'skip'], ['MT4 forex', 'Σεπ 2026 · εισαγωγή 29 Σεπ', 'ask'], ['IBKR', 'Αύγ 2026 · εντός ±0,14', 'ok']],
  },
};
function dashboard(lang = 'en', { offline = false } = {}) {
  const s = L[lang];
  const eqXl = lang === 'el' ? { xl: [[1, '1 Σεπ'], [8, '8'], [15, '15'], [22, '22'], [29, '29']] } : {};
  const periods = s.periods.map(([acct, per, k]) => `<a class="row" href="#" style="min-height:52px"><div class="main" style="grid-column:1/3"><span class="t">${acct}</span><span class="d">${per}</span></div><div class="end">${status(k, s.st[k])}</div></a>`).join('');
  // Greek number format for text only; tags (and SVG path data inside them) are left untouched
  const elText = (x) => x.replace(/(\d),(\d{3})\.(\d{2})/g, '$1.$2,$3').replace(/(\d)\.(\d{1,2})(?!\d)/g, '$1,$2').replace(/ Sep/g, ' Σεπ').replace(/shares/g, 'μετοχές').replace(/R unknown/g, 'R άγνωστο');
  const el = (h) => (lang === 'el' ? h.split(/(<[^>]*>)/).map((part) => (part.startsWith('<') ? part : elText(part))).join('') : h);
  const recent = el(RECENT.slice(0, 3).map((t) => tradeRow(t, { meta: ` · ${t.day} Sep` })).join(''));
  const body = `${topbar({ title: '', mode: 'real', lang, right: `<span style="flex:1"></span>${offline ? `<span class="pill-offline">${ic('wifioff', 'sm')}Offline</span>` : ''}${gear}` })}
<main class="content">
${offline ? `<div class="banner neutral">${ic('wifioff')}<div class="body"><b style="color:var(--text)">${s.offline}</b>${s.offlineBody}</div><span></span></div>` : `<a class="banner attention" href="#">${ic('neq')}<div class="body"><b style="color:var(--attention)">${s.banner}</b>${s.bannerBody}</div>${ic('right', 'chev')}</a>`}
<section class="card" aria-label="${s.net}">
  <div class="hero-label">${s.net} · ${s.month} ${badge('real', lang)}</div>
  <div class="hero">${money(MONTH_TOTAL, { lang })}<span class="cur">USD</span></div>
  <div class="sub num" style="margin-top:2px">${s.sub}</div>
  <div style="margin-top:12px">${equityChart(PTS, { h: 116, lang, ...eqXl })}</div>
  <div class="tiles">
    <div class="tile"><span class="k">${s.exp} ${info(s.exp)}</span><span class="v gain">${signed(S.expR, lang)}R</span><span class="n">${s.expN}</span></div>
    <div class="tile"><span class="k">${s.win} ${info(s.win)}</span><span class="v">${pct1(S.winRate, lang)}</span><span class="n">${s.winN}</span></div>
    <div class="tile"><span class="k">${s.dd} ${info(s.dd)}</span><span class="v loss">${MINUS}${pct1(-DD.pct, lang)}</span><span class="n">${s.ddN}</span></div>
  </div>
</section>
<div class="section-h"><h2>${s.check}</h2><a href="#">${s.all}</a></div>
<div class="list">${periods}</div>
<div class="section-h"><h2>${s.recent}</h2><a href="#">${s.seeAll}</a></div>
<div class="list">${recent}</div>
</main>
${tabbar('home', lang)}`;
  return page({ title: lang === 'el' ? 'Αρχική (Ελληνικά)' : offline ? 'Home, offline' : 'Home', lang, body });
}
add('dashboard', 'Home', 'Home, real mode, difference open', dashboard('en'));
add('dashboard-el', 'Home', 'Home in Greek', dashboard('el'));
add('offline', 'States', 'Offline', dashboard('en', { offline: true }));

// ---------- DASHBOARD (paper, beginner, small sample) ----------
// Paper sample: 6 closed trades 21-28 Sep, R known on 5, R: +1.05, -1.00, +0.72, (none), +0.80, -0.67
const PAPER = [[21, 42.10, 1.05], [22, -25.00, -1.00], [23, 31.50, 0.72], [24, -18.40, null], [25, 16.00, 0.80], [28, -8.00, -0.67]];
const PAPER_NET = PAPER.reduce((s, p) => s + Math.round(p[1] * 100), 0) / 100;
const PAPER_RK = PAPER.filter((p) => p[2] != null);
const PAPER_EXP = PAPER_RK.reduce((s, p) => s + p[2], 0) / PAPER_RK.length;
const PAPER_WEEK = PAPER.filter((p) => p[0] <= 27 && p[2] != null);
{
  let eq = 10000;
  const pp = [{ v: eq, day: 21 }, ...PAPER.map(([d, v]) => { eq = Math.round((eq + v) * 100) / 100; return { v: eq, day: d }; })];
  const body = `${topbar({ title: '', mode: 'paper', paper: true, right: `<span style="flex:1"></span>${gear}` })}
<main class="content">
<section class="card paper" aria-label="Net P&amp;L paper">
  <div class="hero-label">Net P&amp;L · September ${badge('paper')}</div>
  <div class="hero">${money(PAPER_NET)}<span class="cur">EUR</span></div>
  <div class="sub">${PAPER.length} closed paper trades</div>
  <div class="banner neutral" style="margin-top:12px;padding:10px 12px;grid-template-columns:auto 1fr">${ic('info', 'sm')}<div class="body" style="color:var(--text-2)"><b style="font-size:13px;color:var(--text)">Small sample: ${PAPER.length} trades</b>Averages move a lot below 30 trades (your setting).</div></div>
  <div style="margin-top:12px">${equityChart(pp, { h: 104, xl: [[21, '21 Sep'], [28, '28']] })}</div>
  <div class="tiles">
    <div class="tile"><span class="k">Expectancy ${info('expectancy')}</span><span class="v gain">${signed(PAPER_EXP)}R</span><span class="n">n ${PAPER_RK.length}<br>no R on ${PAPER.length - PAPER_RK.length}</span></div>
    <div class="tile"><span class="k">Followed plan</span><span class="v">6 of 6</span><span class="n">100%</span></div>
    <div class="tile"><span class="k">Win rate ${info('win rate')}</span><span class="v">50.0%</span><span class="n">3 of 6</span></div>
  </div>
</section>
<a class="card" href="#" style="display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center">
  <span class="mk" style="background:var(--accent-soft);color:var(--accent)">${ic('review')}</span>
  <div><h3>Your first review is here</h3><p class="sub">${PAPER.length} trades closed. See what the app found in them.</p></div>${ic('right', 'chev')}
</a>
<div class="section-h"><h2>Paper trades</h2><a href="#">See all</a></div>
<div class="list">
${rowPlain({ m: 'crypto', sym: 'ETH/USD', line: 'Long 0.2 ETH · Breakout · 28 Sep', cls: 'paper-row', end: `<span class="m">${money(-8)}</span><span class="rr loss">${MINUS}0.67R</span>` })}
${rowPlain({ m: 'stock', sym: 'MSFT', line: 'Long 5 shares · Pullback · 25 Sep', cls: 'paper-row', end: `<span class="m">${money(16)}</span><span class="rr gain">+0.80R</span>` })}
${rowPlain({ m: 'fx', sym: 'EUR/USD', line: `Short 0.05 lot · ${MINUS}36.8 pips · 24 Sep`, cls: 'paper-row', end: `<span class="m">${money(-18.4)}</span><span class="rr muted">R unknown</span>` })}
</div>
<div class="banner neutral" style="grid-template-columns:auto 1fr">${ic('book')}<div class="body">Paper results leave out real fills, emotions and often costs. <button class="link" style="color:var(--accent)">Read why</button></div></div>
</main>
${tabbar('home')}`;
  add('dashboard-paper', 'Home', 'Home, paper mode, beginner, small sample', page({ title: 'Home, paper', body }));
}

// ---------- EMPTY (first run, paper) ----------
add('empty', 'States', 'Empty journal after first run', page({ title: 'Empty journal', body: `${topbar({ title: '', mode: 'paper', paper: true, right: `<span style="flex:1"></span>${gear}` })}
<main class="content">
<section class="card paper empty">
  <div class="art" style="background:var(--paper-soft);background-image:var(--hatch-paper);color:var(--paper)">${ic('paper', 'lg')}</div>
  <h2>Your paper journal is empty</h2>
  <p class="sub" style="max-width:280px">Paper trades use made-up money and the same steps as real ones. Four steps get you to your first review.</p>
</section>
<section class="card">
  <div class="step-list">
    <a class="step done" href="#"><span class="n">${ic('check', 'sm')}</span><div><div style="font-weight:600">Pretend starting balance</div><div class="caption num">10,000.00 EUR</div></div>${ic('right', 'chev')}</a>
    <a class="step" href="#"><span class="n">2</span><div><div style="font-weight:600">Write your plan</div><div class="caption">Your own rules, about 2 minutes</div></div>${ic('right', 'chev')}</a>
    <a class="step" href="#"><span class="n">3</span><div><div style="font-weight:600">Log a paper trade</div><div class="caption">Type one sentence or fill the form</div></div>${ic('right', 'chev')}</a>
    <div class="step"><span class="n">4</span><div><div style="font-weight:600;color:var(--text-2)">Read your first review</div><div class="caption">After 5 closed trades</div></div><span class="caption num">0 of 5</span></div>
  </div>
</section>
<div class="vstack"><button class="btn primary lg block">Write my plan</button><button class="btn plain lg block">Log a paper trade</button><button class="btn ghost block">Already trade? Import a broker file</button></div>
</main>
${tabbar('home')}` }));

// ---------- LOADING ----------
add('loading', 'States', 'Loading the journal', page({ title: 'Loading', body: `${topbar({ title: '', mode: 'real', right: `<span style="flex:1"></span>${gear}` })}
<main class="content" aria-busy="true">
<section class="card"><div class="sk" style="width:46%;height:14px"></div><div class="sk" style="width:64%;height:34px;margin-top:10px"></div><div class="sk" style="width:52%;height:12px;margin-top:10px"></div>
<div class="sk" style="width:100%;height:112px;margin-top:16px;border-radius:10px"></div>
<div class="grid3" style="margin-top:12px"><div class="sk" style="height:58px"></div><div class="sk" style="height:58px"></div><div class="sk" style="height:58px"></div></div></section>
<p class="caption" style="text-align:center">Opening your journal on this device…</p>
<div class="list">${[1, 2, 3].map(() => '<div class="row"><div class="sk" style="width:36px;height:36px;border-radius:10px"></div><div class="main"><div class="sk" style="width:60%;height:14px"></div><div class="sk" style="width:40%;height:10px;margin-top:6px"></div></div><div class="sk" style="width:56px;height:14px"></div></div>').join('')}</div>
</main>
${tabbar('home')}` }));

// ---------- ONBOARDING ----------
const FIRST_RUN_EN = 'This app keeps your trade record and reviews your own past trades against your own rules. It never tells you to buy, sell or hold anything, never predicts prices, never holds or moves money and never asks for your broker login.';
const FIRST_RUN_EL = 'Η εφαρμογή κρατά το αρχείο των συναλλαγών σας και ελέγχει τις δικές σας παλιότερες συναλλαγές με βάση τους δικούς σας κανόνες. Δεν σας λέει ποτέ να αγοράσετε, να πουλήσετε ή να κρατήσετε κάτι, δεν προβλέπει τιμές, δεν κρατά ούτε μετακινεί χρήματα και δεν ζητά ποτέ τα στοιχεία σύνδεσής σας στον broker.';
add('onboarding-welcome', 'Onboarding', 'First run: welcome and boundary', page({ title: 'Welcome', cls: 'ob', body: `
<div class="steps" aria-label="Step 1 of 2"><i class="done"></i><i></i></div>
<div style="width:64px;height:64px;border-radius:16px;overflow:hidden;box-shadow:var(--e2)">${iconSvg(64)}</div>
<div class="vstack" style="gap:10px"><h1>Numbers you can check against your broker</h1>
<p class="lead">Log trades or import your broker’s file. Every figure opens to the trades and the arithmetic behind it.</p></div>
<section class="card" style="display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:start">
  <span class="mk" style="background:var(--accent-soft);color:var(--accent)">${ic('shield')}</span>
  <p style="font-size:15px;line-height:21px">${FIRST_RUN_EN}</p>
</section>
<section class="card" style="display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:start">
  <span class="mk" style="background:var(--surface-2);color:var(--text-2)">${ic('lock')}</span>
  <p style="font-size:15px;line-height:21px">No account. Your trades stay on this phone until you export them.</p>
</section>
<div class="spacer"></div>
<div class="ob-foot"><div class="field"><span class="lbl">Language</span><div class="seg" role="group"><button aria-pressed="true">English</button><button aria-pressed="false">Ελληνικά</button></div></div>
<button class="btn primary lg block">Continue</button></div>` }));

add('onboarding-path', 'Onboarding', 'First run: beginner or trader path', page({ title: 'How to start', cls: 'ob', body: `
<div class="steps" aria-label="Step 2 of 2"><i class="done"></i><i class="done"></i></div>
<div class="vstack" style="gap:10px"><h1>How do you want to start?</h1><p class="lead">You can switch between paper and real at any time. They never mix.</p></div>
<div class="vstack" style="gap:12px">
<button class="choice sel"><span class="ic paper">${ic('paper')}</span><span><h3>I’m new: practise on paper</h3><span class="sub">Log made-up trades with the same steps as real ones. Good for learning the terms from your own numbers.</span></span><span class="radio on"></span></button>
<button class="choice"><span class="ic real">${ic('import')}</span><span><h3>I trade already: import my history</h3><span class="sub">Bring in a file from your broker or exchange, then check the totals against your broker’s.</span></span><span class="radio"></span></button>
<button class="choice"><span class="ic real">${ic('pencil')}</span><span><h3>Log a real trade by hand</h3><span class="sub">Start from today with no file.</span></span><span class="radio"></span></button>
</div>
<div class="spacer"></div>
<div class="ob-foot"><p class="caption" style="text-align:center">Paper results leave out real fills, emotions and often costs.</p>
<button class="btn primary lg block">Start on paper</button></div>` }));

// ---------- LOG TRADE (sheet over home), with exit time and legs (G5) ----------
add('log-trade', 'Log', 'Log a trade: sheet with entry and exit times and legs', page({ title: 'New trade', body: `${behind()}
<section class="sheet" role="dialog" aria-label="New trade" style="top:calc(var(--safe-top) + 10px)">
<div class="grabber"></div>
<div class="sheet-h"><button class="btn ghost">Cancel</button><h2>New trade</h2><span style="min-width:64px;display:flex;justify-content:flex-end">${badge('real')}</span></div>
<div class="sheet-body">
  <div class="sentence"><span class="txt"><span class="muted">Or type: bought 50 AAPL at 227.40</span></span><button class="go" aria-label="Read sentence">${ic('send')}</button></div>
  <div class="grid2"><div class="field"><label>Broker account</label><div class="input select">IBKR${ic('down', 'sm')}</div></div><div class="field"><span class="lbl">Market</span><div class="input select">Stocks${ic('down', 'sm')}</div></div></div>
  <div class="grid2"><div class="field"><label>Instrument</label><div class="input">AAPL</div></div>
  <div class="field"><span class="lbl">Side</span><div class="seg" role="group" style="height:48px;align-items:stretch"><button aria-pressed="true">Long</button><button aria-pressed="false">Short</button></div></div></div>
  <div class="grid2"><div class="field"><label>Size</label><div class="input">50<span class="unit">shares</span></div></div><div class="field"><label>Entry</label><div class="input">227.40<span class="unit">USD</span></div></div></div>
  <div class="grid2"><div class="field"><label>Entry time</label><div class="input select">Today 17:41${ic('down', 'sm')}</div></div><div class="field"><label>Stop</label><div class="input">224.90</div></div></div>
  <div class="card" style="padding:12px 14px;display:grid;gap:4px;background:var(--accent-soft);box-shadow:none">
    <div class="spread"><span class="sub" style="color:var(--text)">Risk if the stop is hit</span><b class="num">125.00 USD</b></div>
    <div class="spread"><span class="caption">0.91% of equity · plan 1%</span><span class="tag info">${ic('check', 'xs')}within plan</span></div>
    <button class="btn ghost" style="justify-self:start;padding:0">${ic('scale', 'sm')}Size from risk</button>
  </div>
  <div class="grid2"><div class="field"><label>Exit</label><div class="input focus">229.10<span class="caret"></span><span class="unit">USD</span></div></div><div class="field"><label>Exit time</label><div class="input select">Today 19:02${ic('down', 'sm')}</div></div></div>
  <div class="grid2"><div class="field"><label>Fees</label><div class="input">1.00<span class="unit">USD</span></div></div><div class="field"><label>Target</label><div class="input"><span class="ph">optional</span></div></div></div>
  <div class="card" style="padding:12px 14px;display:grid;gap:4px"><div class="spread"><span class="sub" style="color:var(--text)">Result</span><b class="num">${money(84)} · +0.67R</b></div><p class="caption">(229.10 ${MINUS} 227.40) × 50 ${MINUS} 1.00 fees = 84.00; 84.00 ÷ 125.00 = 0.67R</p></div>
  <div class="field"><span class="lbl">Legs</span><div class="list">
    <div class="leg" style="padding:10px 14px"><span class="side">Buy</span><span>50 @ 227.40</span><span class="caption">today 17:41</span></div>
    <div class="leg" style="padding:10px 14px"><span class="side">Sell</span><span>50 @ 229.10</span><span class="caption">today 19:02</span></div>
    <button class="btn ghost block">${ic('plus', 'sm')}Add a leg: scale-in or partial exit</button></div></div>
  <div class="field"><span class="lbl">Setup</span><div class="chips" style="margin:0;padding:2px 0"><button class="chip" aria-pressed="true">Breakout</button><button class="chip" aria-pressed="false">Pullback</button><button class="chip" aria-pressed="false">Range fade</button><button class="chip" aria-pressed="false">${ic('plus', 'sm')}New</button></div></div>
</div>
<div class="sheet-foot"><button class="btn primary lg block">Save trade</button></div>
</section>` }));

add('log-sentence', 'Log', 'One-sentence entry: confirm and one question (paper)', page({ title: 'Check and save', body: `${behind(true)}
<section class="sheet" role="dialog" aria-label="Check and save" style="top:calc(var(--safe-top) + 64px)">
<div class="grabber"></div>
<div class="sheet-h"><button class="btn ghost">Back</button><h2>Check and save</h2><span style="min-width:64px;display:flex;justify-content:flex-end">${badge('paper')}</span></div>
<div class="sheet-body">
  <div class="sentence" style="box-shadow:none;background:var(--surface-2)"><span class="txt">bought 0,2 eth at 2410, stop 2350, breakout</span></div>
  <div class="list">
    ${[['Market', 'Crypto', '“eth”'], ['Side', 'Long', '“bought”'], ['Size', '0.2 ETH', '“0,2”'], ['Entry', '2,410.00', '“at 2410”'], ['Stop', '2,350.00', '“stop 2350”'], ['Setup', 'Breakout', '“breakout”']].map(([k, v, src]) => `<div class="set-row" style="min-height:44px"><span class="check auto-ok" style="width:22px;height:22px;border-radius:6px">${ic('check')}</span><span class="lbl">${k}<small>read from ${src}</small></span><span class="val num" style="color:var(--text);font-weight:600">${v}</span></div>`).join('')}
  </div>
  <section class="q" style="box-shadow:inset 0 0 0 1.5px var(--accent)">
    <span class="qn" style="color:var(--accent)">One question</span>
    <p class="qt">ETH against which currency? The sentence names no pair.</p>
    <div class="chips" style="margin:0;padding:2px 0"><button class="chip">ETH/USDT</button><button class="chip">ETH/USD</button><button class="chip">ETH/EUR</button></div>
  </section>
  <p class="caption">Read by code on this device. Entry time: now, 16:52 Athens. Nothing is saved until you tap Save.</p>
</div>
<div class="sheet-foot"><button class="btn primary lg block" disabled style="opacity:.45">Save paper trade</button></div>
</section>` }));

add('log-sentence-el', 'Log', 'Greek sentence entry with an ambiguous “1.085” (AC-P7.2)', page({ title: 'Έλεγχος και αποθήκευση', lang: 'el', body: `${topbar({ title: '', mode: 'real', lang: 'el', right: `<span style="flex:1"></span>${gear}` })}<main class="content"><section class="card" style="height:300px"></section></main>${tabbar('home', 'el')}<div class="scrim"></div>
<section class="sheet" role="dialog" aria-label="Έλεγχος και αποθήκευση" style="top:calc(var(--safe-top) + 64px)">
<div class="grabber"></div>
<div class="sheet-h"><button class="btn ghost">Πίσω</button><h2>Έλεγχος</h2><span style="min-width:64px;display:flex;justify-content:flex-end">${badge('real', 'el')}</span></div>
<div class="sheet-body">
  <div class="sentence" style="box-shadow:none;background:var(--surface-2)"><span class="txt">πούλησα 1.085 ADA/USD στα 0,6120, στοπ 0,6300</span></div>
  <div class="list">
    ${[['Είδος', 'Κρυπτονόμισμα', '«ADA/USD»'], ['Κατεύθυνση', 'Short', '«πούλησα»'], ['Είσοδος', '0,6120', '«στα 0,6120»'], ['Stop', '0,6300', '«στοπ 0,6300»']].map(([k, v, src]) => `<div class="set-row" style="min-height:44px"><span class="check auto-ok" style="width:22px;height:22px;border-radius:6px">${ic('check')}</span><span class="lbl">${k}<small>από ${src}</small></span><span class="val num" style="color:var(--text);font-weight:600">${v}</span></div>`).join('')}
  </div>
  <section class="q" style="box-shadow:inset 0 0 0 1.5px var(--accent)">
    <span class="qn" style="color:var(--accent)">Μία ερώτηση</span>
    <p class="qt">Το «1.085» είναι χίλια ογδόντα πέντε ή ένα κόμμα μηδέν ογδόντα πέντε;</p>
    <div class="vstack"><div class="opt"><span class="radio"></span><span>1.085 ADA<small>χίλια ογδόντα πέντε</small></span></div><div class="opt"><span class="radio"></span><span>1,085 ADA<small>ένα κόμμα μηδέν ογδόντα πέντε</small></span></div></div>
  </section>
  <p class="caption">Ο κώδικας δεν μαντεύει αριθμούς: με τελεία και τρία ψηφία ρωτά πάντα.</p>
</div>
<div class="sheet-foot"><button class="btn primary lg block" disabled style="opacity:.45">Αποθήκευση</button></div>
</section>` }));

add('log-error', 'Log', 'Log a trade: entry with errors', page({ title: 'New trade, errors', body: `${behind()}
<section class="sheet" role="dialog" aria-label="New trade" style="top:calc(var(--safe-top) + 10px)">
<div class="grabber"></div>
<div class="sheet-h"><button class="btn ghost">Cancel</button><h2>New trade</h2><span style="min-width:64px;display:flex;justify-content:flex-end">${badge('real')}</span></div>
<div class="sheet-body">
  <div class="banner danger" style="grid-template-columns:auto 1fr">${ic('alert')}<div class="body"><b style="color:var(--loss)">1 field needs a value</b>Size is required to save.</div></div>
  <div class="grid2"><div class="field"><label>Broker account</label><div class="input select">IBKR${ic('down', 'sm')}</div></div><div class="field"><span class="lbl">Market</span><div class="input select">Stocks${ic('down', 'sm')}</div></div></div>
  <div class="grid2"><div class="field"><label>Instrument</label><div class="input">TSLA</div></div>
  <div class="field"><span class="lbl">Side</span><div class="seg" role="group" style="height:48px;align-items:stretch"><button aria-pressed="true">Long</button><button aria-pressed="false">Short</button></div></div></div>
  <div class="grid2"><div class="field"><label>Size</label><div class="input err"><span class="ph">0</span><span class="unit">shares</span></div><span class="err-msg">${ic('alert', 'xs')}Required</span></div><div class="field"><label>Entry</label><div class="input">242.10<span class="unit">USD</span></div></div></div>
  <div class="field"><label>Stop</label><div class="input" style="box-shadow:inset 0 0 0 2px var(--attention)">244.00</div>
  <span class="err-msg" style="color:var(--attention)">${ic('info', 'xs')}For a long, the stop sits below the entry. With 244.00 the risk is unknown, so R stays empty. You can still save.</span></div>
  <div class="grid2"><div class="field"><label>Exit</label><div class="input"><span class="ph">still open</span></div></div><div class="field"><label>Fees</label><div class="input"><span class="ph">0.00</span><span class="unit">USD</span></div></div></div>
</div>
<div class="sheet-foot"><button class="btn primary lg block" style="opacity:.45" disabled>Fill in size to save</button></div>
</section>` }));

// ---------- CHECKLIST ----------
const chk = (state, text, note) => `<div class="set-row" style="min-height:56px;align-items:flex-start;padding-top:12px;padding-bottom:12px"><span class="check ${state}">${ic(state === 'auto-no' ? 'x' : 'check')}</span><span class="lbl">${text}${note ? `<small>${note}</small>` : ''}</span></div>`;
add('checklist', 'Log', 'Pre-trade checklist', page({ title: 'Before this trade', cls: 'app has-actions', body: `${navbar({ back: 'Home', title: 'Before this trade', right: badge('real') })}
<main class="content">
<div class="vstack" style="gap:4px;margin-top:4px">${h2('Your checklist')}<p class="sub">From “My plan”. Tick what is true. The app checks the rows marked “checked by the app”.</p></div>
<div class="group-h">Checked by the app</div>
<div class="list">
${chk('auto-ok', 'Inside my hours, 10:00 to 23:00 Athens', 'Now 17:41')}
${chk('auto-ok', 'At most 4 trades a day', '2 so far today')}
${chk('auto-ok', 'Daily loss limit not reached (1.5%)', `Today ${MINUS}0.4%`)}
</div>
<div class="group-h">You tick</div>
<div class="list">
${chk('on', 'The setup is on my list')}
${chk('on', 'Stop decided before I enter')}
${chk('', 'I am calm, not chasing a loss')}
</div>
<p class="caption" style="padding:0 4px">Skipping never blocks saving. The trade keeps a record of which items were ticked.</p>
</main>
<div class="actions"><button class="btn primary lg block">Continue to the trade</button><button class="btn ghost block">Skip checklist</button></div>` }));

// ---------- PLAN (G10: examples unselected, every number empty) ----------
add('plan', 'Log', 'Plan editor: empty plan, examples to pick', page({ title: 'My plan', cls: 'app has-actions', body: `${navbar({ back: 'Home', title: 'My plan', paper: true, right: badge('paper') })}
<main class="content">
<div class="group-h">Your checklist</div>
<section class="card" style="display:grid;gap:8px"><p class="sub">No items yet. Write your own, or start from an example below.</p><button class="btn secondary block">${ic('plus', 'sm')}Write an item</button></section>
<div class="group-h">Examples, yours to change</div>
<div class="list">
  ${['The setup is on my list', 'Stop decided before I enter', 'I am calm, not chasing a loss'].map((x) => `<div class="set-row"><span class="lbl">${x}</span><button class="btn plain">${ic('plus', 'sm')}Add</button></div>`).join('')}
</div>
<div class="group-h">Rules the app checks</div>
<section class="card" style="display:grid;gap:14px">
  <div class="field"><span class="lbl">My setups</span><div class="chips" style="margin:0;padding:2px 0"><span class="caption" style="align-self:center">None yet</span><button class="chip">${ic('plus', 'sm')}Add a setup</button></div></div>
  <div class="grid2"><div class="field"><label>Hours from</label><div class="input"><span class="ph">your number</span></div></div><div class="field"><label>to</label><div class="input"><span class="ph">your number</span></div></div></div>
  <div class="grid2"><div class="field"><label>Risk per trade</label><div class="input"><span class="ph">your number</span><span class="unit">%</span></div></div><div class="field"><label>Daily loss limit</label><div class="input"><span class="ph">your number</span><span class="unit">%</span></div></div></div>
  <div class="field"><label>At most, trades a day</label><div class="input"><span class="ph">your number</span></div></div>
  <p class="caption">Nothing here is recommended; a rule you leave empty is not checked. Percent of the account’s equity at entry; paper uses your pretend balance, 10,000.00 EUR.</p>
</section>
</main>
<div class="actions"><button class="btn primary lg block">Save plan</button></div>` }));

// ---------- SIZING (G4, AC-P2.6) ----------
add('sizing', 'Log', 'Position size from risk, forex with pip size', page({ title: 'Size from risk', cls: 'app has-actions', body: `${navbar({ back: 'New trade', title: 'Size from risk', right: badge('real') })}
<main class="content">
<div class="seg" role="group" aria-label="Market"><button aria-pressed="false">Stocks</button><button aria-pressed="false">Crypto</button><button aria-pressed="true">Forex</button></div>
<section class="card" style="display:grid;gap:14px">
  <div class="grid2"><div class="field"><label>Account equity</label><div class="input">10,000.00<span class="unit">USD</span></div></div><div class="field"><label>Risk</label><div class="input">1<span class="unit">%</span></div></div></div>
  <div class="grid2"><div class="field"><label>Pair</label><div class="input select">EUR/USD${ic('down', 'sm')}</div></div><div class="field"><label>Stop distance</label><div class="input">50<span class="unit">pips</span></div></div></div>
  <div class="grid2"><div class="field"><label>Pip size</label><div class="input" style="background:var(--surface-2)">0.0001</div></div><div class="field"><label>Pip value per lot</label><div class="input">10.00<span class="unit">USD</span></div></div></div>
  <p class="caption">For USD/JPY and other yen pairs the pip size is 0.01. Every value here is yours to type; nothing is filled from a price feed.</p>
</section>
<section class="card" style="display:grid;gap:6px"><span class="caption">Size</span><b class="num" style="font:700 28px/34px var(--font-display)">0.20 lot</b>
<div class="formula" style="font-size:14px;line-height:21px">10,000.00 × 1% = 100.00 risk<br>100.00 ÷ (50 pips × 10.00 per pip per lot) = 0.20 lot</div></section>
<section class="card"><div class="card-h"><h3>Worked examples</h3><span class="tag">example numbers only</span></div>
<div class="kv"><div><dt>Stock: 10,000 × 1%, entry 50, stop 48</dt><dd>50 shares</dd></div><div><dt>Crypto: risk 100, entry 60,000, stop 58,800</dt><dd>0.0833 coin</dd></div><div><dt>Forex: risk 100, 50 pips, 10 per pip per lot</dt><dd>0.20 lot</dd></div></div></section>
</main>
<div class="actions"><button class="btn primary lg block">Use 0.20 lot in the trade</button></div>` }));

// ---------- TRADE DETAIL (stock) ----------
const NV = find(28, 'NVDA');
add('trade-detail', 'Journal', 'Trade detail, stock', page({ title: 'NVDA trade', body: `${navbar({ back: 'Journal', title: 'NVDA', right: `<button class="icon-btn" aria-label="More">${ic('more')}</button>` })}
<main class="content">
<section class="card">
  <div class="hero-label">Short 20 shares · Stock · Range fade ${badge('real')}</div>
  <div class="hero">${money(NV.net)}<span class="cur">USD</span></div>
  <div class="hstack wrap" style="margin-top:4px"><button class="tag on hit" style="height:28px;font-size:12px;border:0">+2.00R ${ic('info', 'xs')}</button><span class="tag info" style="height:28px;font-size:12px">${ic('check', 'xs')}Followed plan</span><span class="caption">Closed 28 Sep, 21:05</span></div>
</section>
<section class="card"><div class="card-h"><h3>Legs</h3><span class="caption">times in Athens</span></div>
<div class="legs">
  <div class="leg"><span class="side">Sell</span><span>20 @ 118.20<br><span class="caption">28 Sep, 17:41 · entry</span></span><span class="caption">stop 121.20</span></div>
  <div class="leg"><span class="side">Buy</span><span>20 @ 112.10<br><span class="caption">28 Sep, 21:05 · exit</span></span><span class="caption">target 111.00</span></div>
</div><p class="caption" style="margin-top:6px">Held 3 h 24 min</p></section>
<section class="card"><div class="card-h"><h3>Result, step by step</h3><button class="icon-btn" aria-label="Explain">${ic('book', 'sm')}</button></div>
  <div class="eq-row"><span>Gross (118.20 ${MINUS} 112.10) × 20</span><span class="v gain">+122.00</span></div>
  <div class="eq-row"><span>Fees</span><span class="v loss">${MINUS}2.00</span></div>
  <div class="eq-row total"><span>Net P&amp;L</span><span class="v gain">+120.00</span></div>
  <div class="eq-row"><span>Initial risk (121.20 ${MINUS} 118.20) × 20 = 1R</span><span class="v">60.00</span></div>
  <div class="eq-row"><span>R = 120.00 ÷ 60.00</span><span class="v gain">+2.00R</span></div>
</section>
<section class="card"><div class="card-h"><h3>Plan check</h3><span class="caption">you confirmed</span></div>
${[['Inside my hours, 10:00 to 23:00', '17:41'], ['Setup on my list', 'Range fade'], ['Risk up to 1% of equity', '0.45%'], ['Stop set at entry', '121.20'], ['At most 4 trades a day', '3rd']].map(([k, v]) => `<div class="spread" style="padding:7px 0;border-bottom:1px solid var(--line)"><span class="hstack sub" style="color:var(--text)"><span class="check auto-ok" style="width:20px;height:20px;border-radius:6px">${ic('check')}</span>${k}</span><span class="caption num">${v}</span></div>`).join('')}
</section>
<section class="card"><div class="card-h"><h3>Notes</h3><span class="caption">Before: calm · After: satisfied</span></div>
<p class="sub" style="color:var(--text)">Faded the open after the gap failed at 118.50. Held to target area, closed before the close.</p>
<div class="shot" style="margin-top:12px">${candleShot()}</div></section>
<a class="card spread" href="#"><span class="hstack">${ic('file')}<span>Import report · IBKR, 29 Sep, row 214</span></span>${ic('right', 'chev')}</a>
</main>
${tabbar('journal')}` }));

// ---------- TRADE DETAIL (forex, pips, G4 / review F4) ----------
const EU = find(28, 'EUR/USD');
add('trade-detail-fx', 'Journal', 'Trade detail, forex with pips and lots', page({ title: 'EUR/USD trade', body: `${navbar({ back: 'Journal', title: 'EUR/USD', right: `<button class="icon-btn" aria-label="More">${ic('more')}</button>` })}
<main class="content">
<section class="card">
  <div class="hero-label">Long 1.00 lot · Forex · Breakout ${badge('real')}</div>
  <div class="hero">${money(EU.net)}<span class="cur">USD</span></div>
  <div class="hstack wrap" style="margin-top:4px"><span class="tag" style="height:28px;font-size:12px">+33.0 pips</span><button class="tag on hit" style="height:28px;font-size:12px;border:0">${signed(EU.r)}R ${ic('info', 'xs')}</button><span class="caption">MT4 forex · London session</span></div>
</section>
<section class="card"><div class="card-h"><h3>Legs</h3><span class="caption">server time New York + 7 h = Athens</span></div>
<div class="legs">
  <div class="leg"><span class="side">Buy</span><span>1.00 lot @ 1.1112<br><span class="caption">28 Sep, 11:05 · entry</span></span><span class="caption">stop 1.1082</span></div>
  <div class="leg"><span class="side">Sell</span><span>1.00 lot @ 1.1145<br><span class="caption">28 Sep, 16:20 · exit</span></span><span class="caption">S/L at close</span></div>
</div></section>
<section class="card"><div class="card-h"><h3>Result, step by step</h3></div>
  <div class="eq-row"><span>Pip size EUR/USD</span><span class="v">0.0001</span></div>
  <div class="eq-row"><span>(1.1145 ${MINUS} 1.1112) ÷ 0.0001</span><span class="v gain">+33.0 pips</span></div>
  <div class="eq-row"><span>33.0 pips × 10.00 per pip × 1.00 lot</span><span class="v gain">+330.00</span></div>
  <div class="eq-row"><span>Commission · swap</span><span class="v loss">${MINUS}3.88 · 0.00</span></div>
  <div class="eq-row total"><span>Net P&amp;L</span><span class="v gain">+326.12</span></div>
  <div class="eq-row"><span>Initial risk 30.0 pips × 10.00 × 1.00 = 1R</span><span class="v">300.00</span></div>
  <div class="eq-row"><span>R = 326.12 ÷ 300.00</span><span class="v gain">+1.09R</span></div>
  <p class="caption" style="margin-top:6px">Pips are shown per pair and never added across pairs.</p>
</section>
</main>
${tabbar('journal')}` }));

// ---------- JOURNAL ----------
add('journal', 'Journal', 'Journal list with filters, held out, open, R unknown', page({ title: 'Journal', body: `${topbar({ title: 'Journal', mode: 'real', right: `<button class="icon-btn" aria-label="Search" style="margin-left:6px">${ic('search')}</button><button class="icon-btn" aria-label="Import">${ic('import')}</button>` })}
<main class="content">
<div class="chips" role="toolbar" aria-label="Filters"><button class="chip" aria-pressed="true">${ic('calendar', 'sm')}Sep 2026</button><button class="chip">All accounts${ic('down', 'sm')}</button><button class="chip">All markets${ic('down', 'sm')}</button><button class="chip">Setup${ic('down', 'sm')}</button><button class="chip">Result${ic('down', 'sm')}</button><button class="chip">Plan${ic('down', 'sm')}</button></div>
<div class="section-h" style="margin-top:4px"><h2>Needs you</h2><span class="caption">not in statistics</span></div>
<div class="list">
${rowPlain({ m: 'stock', sym: 'MSFT', flags: '<span class="tag warn">Held out</span>', line: 'Long 30 shares · opened before the file', cls: 'held', end: '<button class="link" style="color:var(--accent);font-size:13px;font-weight:600">Answer</button>' })}
${rowPlain({ m: 'crypto', sym: 'SOL/USD', flags: '<span class="tag">Open</span>', line: 'Long 12 SOL · Breakout · open 7 days', end: '<button class="link" style="color:var(--accent);font-size:13px;font-weight:600">Add exit</button>' })}
${rowPlain({ m: 'stock', sym: '12 IBKR trades', flags: '<span class="tag warn">No stop</span>', line: 'From the 29 Sep import · R unknown', end: '<button class="link" style="color:var(--accent);font-size:13px;font-weight:600">Add stops</button>' })}
</div>
<div class="day-h"><span>Tue 29 Sep</span><span class="num">${money(-117.50, { arrow: false })}</span></div>
<div class="list">${tradeRow(RECENT[0], { meta: ' · 17:05' })}</div>
<div class="day-h"><span>Mon 28 Sep</span><span class="num">${money(616.10, { arrow: false })}</span></div>
<div class="list">${RECENT.slice(1).map((t) => tradeRow(t)).join('')}</div>
<div class="day-h"><span>Wed 23 Sep</span><span class="num">${money(96.30, { arrow: false })}</span></div>
<div class="list">${tradeRow(find(23, 'GBP/USD'), { meta: ' · no stop', flags: '<span class="tag off">Off plan</span>' })}</div>
</main>
${tabbar('journal')}` }));

// ---------- STOPS (G3a, AC-P1.11) ----------
const stopRow = (sym, line, val, extra = '') => `<div class="stop-row"><div class="main"><div class="t" style="font-weight:600">${sym}</div><div class="caption num">${line}</div></div><div class="input${val ? '' : ''}" style="${extra}">${val || '<span class="ph">stop</span>'}</div>${extra ? `<span class="err-msg" style="color:var(--attention)">${ic('info', 'xs')}For a long the stop sits below the entry. With 88.40 R stays unknown.</span>` : ''}</div>`;
add('stops', 'Journal', 'Initial stops after an import (bulk entry)', page({ title: 'Initial stops', cls: 'app has-actions', body: `${navbar({ back: 'Journal', title: 'Initial stops', right: badge('real') })}
<main class="content">
<p class="sub" style="padding:0 4px">The IBKR file has no stop column. Type the stop you planned when you entered; R appears as you type. Leave a trade empty and its R stays unknown.</p>
<section class="card" style="display:grid;gap:8px"><div class="spread"><span class="sub" style="color:var(--text)">R known</span><b class="num">5 of 17</b></div><div class="progress"><i style="width:29%"></i></div></section>
<div class="chips"><button class="chip" aria-pressed="true">No stop <span class="count">12</span></button><button class="chip">All <span class="count">17</span></button></div>
<div class="list">
${stopRow('AAPL · Long 50 shares', 'in 227.40 · out 225.05 · 29 Sep', '224.90')}
${stopRow('NVDA · Short 20 shares', 'in 118.20 · out 112.10 · 28 Sep', '121.20')}
${stopRow('TSLA · Long 30 shares', 'in 244.10 · out 252.45 · 24 Sep', '239.10')}
${stopRow('MSFT · Long 20 shares', 'in 428.60 · out 430.71 · 16 Sep', '')}
${stopRow('AMD · Long 70 shares', 'in 92.80 · out 91.39 · 17 Sep', '88.40', 'box-shadow:inset 0 0 0 2px var(--attention)').replace('For a long the stop sits below the entry. With 88.40 R stays unknown.', 'With 88.40, 1R is 308.00, more than the 1% of equity in your plan.')}
${stopRow('AAPL · Long 45 shares', 'in 229.30 · out 226.80 · 15 Sep', '')}
</div>
</main>
<div class="actions"><button class="btn primary lg block">Save 5 stops</button><p class="caption" style="text-align:center">The file’s trades keep their prices; only the stop is added.</p></div>` }));

// ---------- CASH (G4) ----------
add('cash', 'Journal', 'Cash movements: deposits and withdrawals', page({ title: 'Cash movements', body: `${navbar({ back: 'Settings', title: 'Cash movements', right: badge('real') })}
<main class="content">
<div class="chips"><button class="chip" aria-pressed="true">All accounts</button><button class="chip">IBKR</button><button class="chip">Kraken</button><button class="chip">MT4 forex</button></div>
<div class="banner neutral" style="grid-template-columns:auto 1fr">${ic('info')}<div class="body">Deposits and withdrawals change a balance. They are never trades, never a gain or a loss, and the broker check subtracts them in the balance form.</div></div>
<div class="list">
  ${[['20 Sep', 'Kraken', 'Withdrawal', -300, 'typed by you'], ['12 Sep', 'MT4 forex', 'Deposit', 250, 'from the MT4 import'], ['3 Sep', 'IBKR', 'Deposit', 500, 'from the IBKR import'], ['17 Aug', 'IBKR', 'Deposit', 500, 'from the IBKR import']].map(([d, a, k, v, src]) => `<a class="row" href="#"><span class="mk" style="background:var(--surface-2);color:var(--text-2)">${ic(v > 0 ? 'import' : 'export')}</span><div class="main"><span class="t">${k} · ${a}</span><span class="d">${d} · ${src}</span></div><div class="end"><span class="m num">${v > 0 ? '+' : MINUS}${n2(Math.abs(v))}</span></div></a>`).join('')}
</div>
<button class="btn secondary block">${ic('plus', 'sm')}Add a deposit or withdrawal</button>
</main>
${tabbar('home')}` }));

// ---------- IMPORT ----------
const importSteps = (n) => `<div class="steps" aria-label="Step ${n} of 4">${[1, 2, 3, 4].map((i) => `<i class="${i <= n ? 'done' : ''}"></i>`).join('')}</div>`;
const mapRow = (src, dst, ex, warn) => `<div class="map-row"><span class="src">${src}<span class="ex">${ex}</span></span>${ic('arrowr', 'sm')}<span class="dst${warn ? ' warn' : ''}">${dst}${ic('down', 'sm')}</span></div>`;
add('import-mapping', 'Import', 'Import: columns and skipped rows (IBKR)', page({ title: 'Import columns', cls: 'app has-actions', body: `${navbar({ back: 'Journal', title: 'Import', right: badge('real') })}
<main class="content">
${importSteps(2)}
<section class="card" style="display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:center">
  <span class="mk" style="background:var(--surface-2);color:var(--text-2)">${ic('file')}</span>
  <div style="min-width:0"><div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">U1234567_2026-09.csv</div><div class="caption num">IBKR Activity Statement, detected · into account IBKR</div></div>
</section>
<section class="card"><div class="card-h"><h3>Columns of the Trades section</h3><span class="caption">8 of 16</span></div>
<p class="caption" style="margin:-4px 0 4px">Sample values from row 214, the NVDA closing buy</p>
${mapRow('Date/Time', 'Time', '2026-09-28, 14:05:31')}
${mapRow('Symbol', 'Instrument', 'NVDA')}
${mapRow('Quantity', 'Size and side', '20')}
${mapRow('T. Price', 'Price', '112.1')}
${mapRow('Comm/Fee', 'Fees', `${MINUS}1`)}
${mapRow('Currency', 'Currency', 'USD')}
${mapRow('Realized P/L', 'Broker P&amp;L', '120')}
<div class="set-row" style="padding:10px 0 0;min-height:44px"><span class="lbl">Time zone of the file<small>Not stated in the file; please confirm</small></span><span class="val" style="color:var(--attention)">New York${ic('right', 'sm')}</span></div>
</section>
<section class="card"><div class="card-h"><h3>Rows</h3><span class="caption num">412 in the file</span></div>
<div class="kv"><div><dt>Trade fills</dt><dd>53</dd></div><div><dt>Deposits, stored as cash</dt><dd>2</dd></div><div><dt>Other sections, not trades</dt><dd>354</dd></div><div><dt>Skipped, cannot be read</dt><dd style="color:var(--attention)">3</dd></div></div>
${[['Row 188', 'Trades SubTotal row, not a fill'], ['Row 231', 'Date “2026-09-31, 10:02:11” does not exist'], ['Row 297', 'Quantity is empty']].map(([a, b]) => `<div class="spread" style="padding:8px 0 0;align-items:flex-start"><span class="caption num" style="width:62px;flex:none;color:var(--text-2);font-weight:600">${a}</span><span class="sub" style="flex:1;color:var(--text)">${b}</span></div>`).join('')}
</section>
</main>
<div class="actions"><button class="btn primary lg block">Build trades from 53 fills</button><p class="caption" style="text-align:center">Nothing enters your statistics until the checks run.</p></div>` }));

add('import-mt4', 'Import', 'MT4 import: server time and S/L as stops', page({ title: 'MT4 import', cls: 'app has-actions', body: `${navbar({ back: 'Journal', title: 'Import', right: badge('real') })}
<main class="content">
${importSteps(2)}
<section class="card" style="display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:center">
  <span class="mk" style="background:var(--surface-2);color:var(--text-2)">${ic('file')}</span>
  <div style="min-width:0"><div style="font-weight:600">DetailedStatement.htm</div><div class="caption num">MT4 statement, detected · Currency: USD · into MT4 forex</div></div>
</section>
<section class="q"><span class="qn">Question 1 of 2</span><p class="qt">Which clock does your broker’s MT4 server use? The file does not say.</p>
<div class="vstack">
  <div class="opt on"><span class="radio on"></span><span>New York time + 7 hours<small>UTC+2 in winter, UTC+3 in summer; common for MT4 servers</small></span></div>
  <div class="opt"><span class="radio"></span><span>Another time zone<small>Pick from the list</small></span></div>
</div>
<p class="caption num">Ticket 1005 opened 2026.09.28 11:05:12 server time = 28 Sep 11:05 Athens, London session.</p></section>
<section class="q"><span class="qn">Question 2 of 2</span><p class="qt">10 trades have an S/L value. MT4 shows the stop at close, which may not be the stop you started with.</p>
<div class="vstack">
  <div class="opt"><span class="radio"></span><span>Use S/L as the initial stop for all 10</span></div>
  <div class="opt on"><span class="radio on"></span><span>Check them one by one<small>Opens the initial-stops list</small></span></div>
  <div class="opt"><span class="radio"></span><span>Leave R unknown</span></div>
</div></section>
<section class="card"><div class="kv"><div><dt>Closed trades</dt><dd>10</dd></div><div><dt>Deposit, stored as cash</dt><dd>+250.00</dd></div><div><dt>Closed Trade P/L in the file</dt><dd>+${n2(FX_NET)}</dd></div></div></section>
</main>
<div class="actions"><button class="btn primary lg block">Continue</button></div>` }));

add('import-running', 'Import', 'Import running with checks', page({ title: 'Importing', cls: 'app no-tabs', body: `${navbar({ back: 'Journal', title: 'Import', right: badge('real') })}
<main class="content">
${importSteps(2)}
<section class="card" style="display:grid;gap:10px">
  <div class="spread"><h3>Building trades</h3><span class="caption num">1,264 of 2,011 rows</span></div>
  <div class="progress"><i style="width:63%"></i></div>
  <p class="caption">kraken-trades-2025-10-to-2026-09.csv · Kraken · a year of fills</p>
</section>
<section class="card"><div class="card-h"><h3>Checks</h3></div>
${[['ok', 'Rows read match rows in the file', '2,011 of 2,011'], ['ok', 'Repeats of earlier imports', '1 found'], ['run', 'Positions left open or flipped', 'checking'], ['wait', 'Sells with no buy in the journal', ''], ['wait', 'Times near the edge of a month', ''], ['wait', 'Empty fee fields', ''], ['wait', 'Fees in a coin with no rate', '']].map(([st, k, v]) => `<div class="spread" style="padding:10px 0;border-bottom:1px solid var(--line)"><span class="hstack sub" style="color:${st === 'wait' ? 'var(--text-3)' : 'var(--text)'}">${st === 'ok' ? `<span class="check auto-ok" style="width:22px;height:22px;border-radius:50%">${ic('check')}</span>` : st === 'run' ? '<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="8" fill="none" stroke="var(--surface-2)" stroke-width="3"/><path d="M11 3a8 8 0 0 1 8 8" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round"/></svg>' : '<span style="width:22px;height:22px;border-radius:50%;box-shadow:inset 0 0 0 1.5px var(--line-strong)"></span>'}${k}</span><span class="caption num">${v}</span></div>`).join('')}
</section>
<p class="caption" style="text-align:center">Everything runs on this phone. Leaving this screen keeps the import running.</p>
<button class="btn plain block">Cancel import</button>
</main>` }));

add('import-questions', 'Import', 'Import: anomaly questions, trades held out', page({ title: 'Import questions', cls: 'app has-actions', body: `${navbar({ back: 'Columns', title: 'Import', right: badge('real') })}
<main class="content">
${importSteps(3)}
<div class="vstack" style="gap:4px">${h2('3 questions before these trades count')}
<p class="sub">3 trades are held out of your statistics until you answer. You can answer later from the journal.</p></div>
<section class="q"><span class="qn">Question 1 of 3</span><p class="qt">2 AAPL fills on 18 Sep repeat your 17 Sep import. Merge or keep both?</p>
<div class="hstack wrap"><a class="trade-link" href="#">AAPL · 18 Sep · buy 50 @ 226.10</a><a class="trade-link" href="#">AAPL · 17 Sep</a></div>
<div class="vstack"><div class="opt on"><span class="radio on"></span><span>Merge<small>Count them once</small></span></div><div class="opt"><span class="radio"></span><span>Keep both<small>They were separate orders</small></span></div></div></section>
<section class="q"><span class="qn">Question 2 of 3</span><p class="qt">AMD on 22 Sep has an empty fee field. What was the fee?</p>
<div class="hstack wrap"><a class="trade-link" href="#">AMD · 22 Sep · long 60 shares</a></div>
<div class="grid3"><button class="btn plain" style="font-size:14px">Type fee</button><button class="btn plain" style="font-size:14px">No fee</button><button class="btn plain" style="font-size:14px">Leave out</button></div></section>
<section class="q"><span class="qn">Question 3 of 3</span><p class="qt">MSFT on 24 Sep: 30 shares sold, 20 bought in this file. The other 10 were bought before the file starts.</p>
<div class="hstack wrap"><a class="trade-link" href="#">MSFT · 24 Sep · sell 30 @ 431.20</a></div>
<div class="vstack"><div class="opt"><span class="radio"></span><span>Type the opening price and date</span></div><div class="opt"><span class="radio"></span><span>Keep IBKR’s realised P&amp;L<small>R stays unknown</small></span></div><div class="opt"><span class="radio"></span><span>Leave out of statistics</span></div></div></section>
</main>
<div class="actions"><button class="btn primary lg block">Next: broker check</button><button class="btn ghost block">Answer later</button></div>` }));

add('import-error', 'States', 'Error: file cannot be read', page({ title: 'Import error', cls: 'app no-tabs', body: `${navbar({ back: 'Journal', title: 'Import', right: badge('real') })}
<main class="content">
${importSteps(1)}
<section class="card empty" style="padding-top:28px">
  <div class="art" style="background:var(--loss-soft);color:var(--loss)">${ic('file', 'lg')}</div>
  <h2>This file can’t be read</h2>
  <p class="sub" style="max-width:290px"><b style="color:var(--text)">kraken-september.xlsx</b> is a spreadsheet file. In Kraken, export History, then Trades, as CSV, and choose that file.</p>
</section>
<section class="card"><div class="card-h"><h3>What the app found</h3></div>
<div class="kv"><div><dt>File type</dt><dd>Excel workbook</dd></div><div><dt>Rows read</dt><dd>0</dd></div><div><dt>Your journal</dt><dd>unchanged</dd></div></div></section>
<div class="vstack"><button class="btn primary lg block">Choose another file</button><button class="btn plain lg block">Files the app reads</button></div>
</main>` }));

// ---------- BROKER CHECK (the angle) ----------
const periodLine = 'IBKR · 1–29 Sep 2026, New York time · USD';
add('reconcile-total', 'Broker check', 'Broker check: realised P&L form', page({ title: 'Broker check', cls: 'app has-actions', body: `${navbar({ back: 'Questions', title: 'Broker check', right: badge('real') })}
<main class="content">
${importSteps(4)}
<div class="vstack" style="gap:4px">${h2('What does your broker say?')}
<p class="sub">Type the figure from your IBKR statement. The journal compares it with its own and shows which trades may explain a difference.</p></div>
<section class="card" style="display:grid;gap:14px">
  <div class="set-row" style="padding:0;min-height:44px"><span class="lbl">IBKR · USD<small>1–29 Sep 2026, cut in New York time like the file</small></span><button class="link" style="color:var(--accent)">Change</button></div>
  <div class="seg" role="group" aria-label="Figure type"><button aria-pressed="true">Realised P&amp;L</button><button aria-pressed="false">Balance</button></div>
  <div class="field"><label>Realised P&amp;L after commissions</label><div class="input focus" style="height:60px;font-size:28px;font-weight:700;letter-spacing:-0.01em">${n2(IBKR_BROKER)}<span class="caret" style="height:30px"></span><span class="unit" style="font-size:15px">USD</span></div>
  <span class="help">Use the total after commissions for the same dates. A total before commissions differs by exactly the fees.</span></div>
</section>
<section class="card" style="display:grid;gap:8px">
  <div class="spread"><span class="sub">Journal, trades closed in the period</span><b class="num">${n2(IBKR_JOURNAL)}</b></div>
  <div class="spread"><span class="sub">Partial exits of trades still open</span><b class="num">0.00</b></div>
  <div class="spread"><span class="sub">Counts as a match within</span><span class="num sub" style="color:var(--text)">±${n2(TOL)}</span></div>
  <p class="caption">One cent for each of ${IBKR_N} closed trades, at most 1.00 (for a yen account, 1 JPY each). 1 trade is held out.</p>
  <button class="btn ghost" style="justify-self:start;padding:0">Change the tolerance</button>
</section>
</main>
<div class="actions"><button class="btn primary lg block">Compare</button><button class="btn ghost block">Skip for now</button></div>` }));

const cause = (amt, title, text, link, action) => `<div class="pattern"><div class="spread" style="align-items:flex-start"><h4>${title}</h4><span class="num" style="font-weight:700;white-space:nowrap">${amt}</span></div><p class="sub">${text}</p><div class="spread wrap">${link}<button class="btn secondary" style="font-size:14px;padding:0 14px">${action}</button></div></div>`;
add('reconcile-difference', 'Broker check', 'Broker check: difference open, causes and an unexplained remainder', page({ title: 'Difference open', cls: 'app has-actions', body: `${navbar({ back: 'Home', title: 'Broker check', right: badge('real') })}
<main class="content">
<p class="sub" style="text-align:center;margin-top:-4px">${periodLine}</p>
<section class="card">
  <div class="pv-grid"><div><span class="caption">Broker</span><b class="num" style="font-size:20px">${n2(IBKR_BROKER)}</b></div><div><span class="caption">Journal</span><b class="num" style="font-size:20px">${n2(IBKR_JOURNAL)}</b></div></div>
  <div class="spread" style="margin-top:12px">${status('open', 'Difference open')}<b class="num" style="font-size:20px;color:var(--attention)">+${n2(IBKR_DIFF)}</b></div>
  <div class="kv" style="margin-top:6px"><div><dt>2 trades may explain</dt><dd>+${n2(IBKR_EXPLAINED)}</dd></div><div><dt>Unexplained difference</dt><dd style="color:var(--attention)">${MINUS}${n2(-IBKR_UNEXPLAINED)}</dd></div></div>
  <p class="caption" style="margin-top:6px">Nothing has been changed. The unexplained part is not matched to any trade and not folded into fees or any figure.</p>
</section>
<section class="card"><div class="card-h"><h3>Possible causes</h3><span class="caption">broker ${MINUS} journal</span></div>
${cause(`+${n2(MSFT_HELD)}`, 'MSFT, 24 Sep, held out', 'IBKR counts this trade. The journal waits for your answer about the 10 shares bought before the file starts.', '<a class="trade-link" href="#">MSFT · sell 30</a>', 'Answer')}
${cause(`${MINUS}${n2(-AAPL_DUP)}`, 'AAPL, 18 Sep, counted twice', 'You chose “Keep both” for 2 fills that repeat the 17 Sep import.', '<a class="trade-link" href="#">AAPL · 2 fills</a>', 'Merge instead')}
</section>
<section class="card"><div class="card-h"><h3>Also check</h3></div>
<div class="pattern"><h4>AMD, 22 Sep, fee field empty</h4><p class="sub">Type the fee from your IBKR statement; the difference is recomputed. The app does not guess a fee.</p><div class="spread wrap"><a class="trade-link" href="#">AMD · long 60 shares</a><button class="btn secondary" style="font-size:14px;padding:0 14px">Type fee</button></div></div>
</section>
</main>
<div class="actions"><button class="btn primary lg block">Compare again after changes</button><button class="btn ghost block">Keep the difference open</button></div>` }));

add('reconcile-match', 'Broker check', 'Broker check: reconciled, with the import report', page({ title: 'Reconciled', body: `${navbar({ back: 'Home', title: 'Broker check', right: badge('real') })}
<main class="content">
<section class="card empty" style="padding:24px 16px 20px">
  <div class="art" style="background:var(--ok-soft);color:var(--ok);border-radius:50%">${ic('checkc', 'lg')}</div>
  <h2>Reconciled within ±${n2(TOL)}</h2>
  <p class="sub">${periodLine}</p>
  <div class="pv-grid" style="width:100%;margin-top:8px"><div><span class="caption">Broker</span><b class="num" style="font-size:20px">${n2(IBKR_BROKER)}</b></div><div><span class="caption">Journal</span><b class="num" style="font-size:20px">${n2(IBKR_BROKER)}</b></div></div>
  <p class="caption num">Exact difference 0.00</p>
</section>
<section class="card"><div class="card-h"><h3>Import report</h3><span class="caption">kept with the import</span></div>
<div class="kv">
  <div><dt>Rows read</dt><dd>412 of 412</dd></div><div><dt>Rows skipped</dt><dd>3, reasons listed</dd></div><div><dt>Trades built</dt><dd>17 from 53 fills</dd></div>
  <div><dt>Trades with R known</dt><dd>15 of 17</dd></div><div><dt>Questions answered</dt><dd>3 of 3</dd></div><div><dt>Held out now</dt><dd>0</dd></div>
</div>
<div class="divider"></div>
<p class="sub">Your answers: merged the AAPL repeat, typed a 2.00 fee for AMD, typed the MSFT opening of 10 shares on 28 Aug. You typed 15 initial stops on the stops list.</p>
</section>
<div class="btn-row"><button class="btn plain">${ic('export', 'sm')}Save report</button><button class="btn primary">Done</button></div>
</main>
${tabbar('home')}` }));

const MT4_START = 2164.30, MT4_DEP = 250;
const MT4_END = Math.round((MT4_START + MT4_DEP + FX_NET) * 100) / 100;
add('reconcile-balance', 'Broker check', 'Broker check: balance form with cash movements', page({ title: 'Broker check, balance', cls: 'app has-actions', body: `${navbar({ back: 'Home', title: 'Broker check', right: badge('real') })}
<main class="content">
<p class="sub" style="text-align:center;margin-top:-4px">MT4 forex · 1–29 Sep 2026, server time · USD</p>
<div class="seg" role="group" aria-label="Figure type"><button aria-pressed="false">Realised P&amp;L</button><button aria-pressed="true">Balance</button></div>
<section class="card"><div class="set-row" style="padding:0;min-height:48px"><span class="lbl">No position was open on 1 Sep or at the end of 29 Sep<small>The balance form needs this; open positions move a balance without a closed trade.</small></span><button class="toggle" role="switch" aria-checked="true" aria-label="No position was open"></button></div></section>
<section class="card" style="display:grid;gap:14px">
  <div class="grid2"><div class="field"><label>Balance at start</label><div class="input">${n2(MT4_START)}</div></div><div class="field"><label>Balance at end</label><div class="input focus">${n2(MT4_END)}<span class="caret"></span></div></div></div>
  <div class="grid2"><div class="field"><label>Deposits</label><div class="input">${n2(MT4_DEP)}</div><span class="help">from cash movements</span></div><div class="field"><label>Withdrawals</label><div class="input">0.00</div></div></div>
  <div class="field"><label>Other cash, not from a trade</label><div class="input"><span class="ph">0.00, e.g. interest or a correction</span></div></div>
</section>
<section class="card"><div class="formula">${n2(MT4_END)} ${MINUS} ${n2(MT4_START)} ${MINUS} ${n2(MT4_DEP)} + 0.00 ${MINUS} 0.00<br>= <b>${n2(FX_NET)}</b> from trades, by your figures</div>
<div class="kv" style="margin-top:6px"><div><dt>Journal, trades closed in the period</dt><dd>${n2(FX_NET)}</dd></div><div><dt>Difference</dt><dd>0.00, within ±0.10</dd></div></div></section>
</main>
<div class="actions"><button class="btn primary lg block">Compare</button><button class="btn ghost block">Skip for now</button></div>` }));

add('reconcile-quantity', 'Broker check', 'Broker check: crypto quantity form (Kraken)', page({ title: 'Broker check, quantity', cls: 'app has-actions', body: `${navbar({ back: 'Home', title: 'Broker check', right: badge('real') })}
<main class="content">
<p class="sub" style="text-align:center;margin-top:-4px">Kraken · 1–31 Aug 2026, UTC</p>
<p class="sub" style="padding:0 4px">A Kraken trades file has no realised total. Compare what you hold instead: type the ending quantity of each asset from Kraken.</p>
<section class="card" style="display:grid;gap:14px">
  <div class="grid2"><div class="field"><label>Asset</label><div class="input select">BTC${ic('down', 'sm')}</div></div><div class="field"><label>Kraken says you hold</label><div class="input focus">0.1495<span class="caret"></span></div></div></div>
</section>
<section class="card"><div class="card-h"><h3>By your fills</h3><span class="caption">exact decimals</span></div>
<div class="kv"><div><dt>Held on 1 Aug</dt><dd>0.1500</dd></div><div><dt>Bought in 3 fills</dt><dd>+0.2000</dd></div><div><dt>Sold in 3 fills</dt><dd>${MINUS}0.2000</dd></div><div><dt>Deposits and withdrawals</dt><dd>0.0000</dd></div><div><dt>Implied</dt><dd><b>0.1500</b></dd></div><div><dt>Difference</dt><dd style="color:var(--attention)">${MINUS}0.0005 BTC</dd></div></div></section>
<section class="card"><div class="card-h"><h3>Possible cause</h3><span class="caption">explains ${MINUS}0.0005</span></div>
<div class="pattern"><h4>Fees taken in BTC on 2 buy fills</h4><p class="sub">Kraken lists these fees in USD, but took them from the BTC you bought: 0.0003 and 0.0002 BTC.</p><div class="spread wrap"><div class="hstack wrap"><a class="trade-link" href="#">BTC · 4 Aug</a><a class="trade-link" href="#">BTC · 19 Aug</a></div><button class="btn secondary" style="font-size:14px;padding:0 14px">Record in BTC</button></div></div></section>
</main>
<div class="actions"><button class="btn primary lg block">Compare again</button><button class="btn ghost block">Skip for now</button></div>` }));

add('periods', 'Broker check', 'Broker check: every account and month with its state', page({ title: 'Broker check periods', body: `${navbar({ back: 'Home', title: 'Broker check', right: badge('real') })}
<main class="content">
<p class="sub" style="padding:0 4px">Each broker account keeps one of four states per month until you check it.</p>
${[['September 2026', [['IBKR', 'open', 'Difference', `+${n2(IBKR_DIFF)} · 2 trades may explain most of it`], ['Kraken', 'skip', 'Skipped', 'Skipped on 29 Sep · check any time'], ['MT4 forex', 'ask', 'Not asked', 'Imported 29 Sep · check any time']]], ['August 2026', [['IBKR', 'ok', 'Reconciled', 'Within ±0.14 · exact 0.00'], ['Kraken', 'ok', 'Reconciled', 'BTC and ETH quantities · exact'], ['MT4 forex', 'ok', 'Reconciled', 'Within ±0.07 · exact 0.00']]]].map(([m, rows]) => `<div class="group-h">${m}</div><div class="list">${rows.map(([a, k, l, d]) => `<a class="row" href="#"><span class="mk" style="background:var(--surface-2);color:var(--text-2)">${ic('file')}</span><div class="main"><span class="t">${a}</span><span class="d">${d}</span></div><div class="end">${status(k, l)}</div></a>`).join('')}</div>`).join('')}
<div class="banner neutral" style="grid-template-columns:auto 1fr">${ic('info')}<div class="body">Paper trades have no broker, so they have no broker check.</div></div>
</main>
${tabbar('home')}` }));

// ---------- STATISTICS ----------
const statsHead = (sel) => `${topbar({ title: 'Statistics', mode: 'real' })}
<div style="padding:8px var(--gutter);display:grid;gap:10px"><div class="seg" role="tablist"><button aria-pressed="${sel === 'o'}">Overview</button><button aria-pressed="${sel === 'c'}">Calendar</button><button aria-pressed="${sel === 'b'}">Buckets</button></div>
<div class="hstack"><button class="chip sm" aria-pressed="true">${ic('calendar', 'sm')}Sep 2026</button><button class="chip sm">All accounts${ic('down', 'sm')}</button></div>
<p class="caption num" style="padding:0 2px">${N_CLOSED} closed · 1 held out · 2 open · no R on ${S.n - S.rk}</p></div>`;
const bkRow = (b, max, name = b.key) => `<div class="bk"><span class="name">${name}</span><span class="num" style="font-size:14px">${money(b.net, { arrow: true })}</span><span class="meta">n ${b.n} · won ${Math.round((b.wins / b.n) * 100)}% · ${b.rk ? `${signed(b.sumR / b.rk)}R on ${b.rk} with R` : 'no R'}</span><span class="track"><span class="bar ${b.net >= 0 ? 'g' : 'l'}" style="width:${((Math.abs(b.net) / max) * 50).toFixed(1)}%"></span></span></div>`;
const bkCard = (title, note, rows, name) => { const max = Math.max(...rows.map((r) => Math.abs(r.net))); return `<section class="card"><div class="card-h"><h3>${title}</h3><span class="caption">${note}</span></div>${rows.map((r) => bkRow(r, max, name ? name(r) : undefined)).join('')}</section>`; };
add('stats', 'Statistics', 'Statistics overview', page({ title: 'Statistics', body: `${statsHead('o')}
<main class="content">
<section class="card"><div class="card-h"><h3>Equity and drawdown</h3><span class="caption">1 Sep ${n2(12500)}</span></div>
${equityChart(PTS, { h: 124, marks: true, noX: true })}
<div style="margin-top:6px">${drawdownChart(PTS)}</div>
<div class="legend"><span><i class="sw eq"></i>Equity</span><span><i class="sw dd"></i>Below the last peak</span></div>
<div class="kv" style="margin-top:8px">
  <div><dt>Max drawdown ${info('drawdown')}</dt><dd>${money(DD.dd, { arrow: false })} · ${MINUS}${pct1(-DD.pct)}</dd></div>
  <div><dt>Peak to low</dt><dd>12 Sep → 19 Sep</dd></div>
  <div><dt>Recovered</dt><dd>25 Sep · needed +${pct1(DD.recoveryGain)}</dd></div>
  <div><dt>Now below peak</dt><dd>${money(DD.current, { arrow: false })} · ${MINUS}${pct1(-DD.currentPct)}</dd></div>
</div>
<p class="caption" style="margin-top:6px">Amounts and dates come from closed trades only. Percents divide by equity including deposits and withdrawals: ${n2(DD.ePeak)} at the peak, ${n2(DD.eTrough)} at the low. Swings inside a trade are not measured.</p></section>
<section class="card"><div class="card-h"><h3>R per trade</h3><span class="caption">${S.rk} with R · missing on ${S.n - S.rk}</span></div>
${rHistogram()}
<div class="legend"><span><i class="sw gain"></i>Above 0R</span><span><i class="sw loss"></i>Below 0R</span></div></section>
${bkCard('By setup', 'A to Z, No setup last', S.setups)}
<section class="card"><div class="card-h"><h3>Figures</h3><span class="caption">tap any for its trades</span></div>
<div class="kv">
  <div><dt>Expectancy ${info('expectancy')}</dt><dd class="gain">${signed(S.expR)}R · ${signed(S.expCur)}</dd></div>
  <div><dt>Win rate</dt><dd>${pct1(S.winRate)} · ${S.wins} of ${S.n}</dd></div>
  <div><dt>Break-even trades</dt><dd>${S.even}</dd></div>
  <div><dt>Average win</dt><dd>+${n2(S.avgWin)} · +${n2(S.avgWinR)}R</dd></div>
  <div><dt>Average loss</dt><dd>${n2(S.avgLoss)} · ${n2(S.avgLossR)}R</dd></div>
  <div><dt>Profit factor</dt><dd>${n2(S.pf)}</dd></div>
  <div><dt>Followed your plan</dt><dd>${S.followed.n} of ${S.n} · ${pct1((S.followed.n / S.n) * 100)}</dd></div>
  <div><dt>Holding time, winners · losers</dt><dd>${hm(S.holdWin)} · ${hm(S.holdLoss)}</dd></div>
  <div><dt>Longest streaks</dt><dd>${S.streaks.wins} wins · ${S.streaks.losses} losses</dd></div>
  ${S.pips.map((p) => `<div><dt>Pips ${p.pair} · n ${p.n}</dt><dd>${signed(p.pips, 'en', 1)}</dd></div>`).join('')}
  <div><dt>Fees · funding and swap</dt><dd>214.60 · 18.40</dd></div>
</div></section>
</main>
${tabbar('stats')}` }));

add('stats-buckets', 'Statistics', 'Statistics buckets: market, account, weekday, session, hour', page({ title: 'Buckets', body: `${statsHead('b')}
<main class="content">
<div class="chips" role="toolbar" aria-label="Jump to"><button class="chip sm" aria-pressed="true">Market</button><button class="chip sm">Account</button><button class="chip sm">Weekday</button><button class="chip sm">Session</button><button class="chip sm">Hour</button><button class="chip sm">Instrument</button></div>
${bkCard('By market', 'A to Z', S.markets)}
${bkCard('By account', 'A to Z', S.accounts)}
${bkCard('By weekday', 'Monday first · entry day, Athens', S.weekdays)}
${bkCard('By session', 'entry time; forex and US stocks', S.sessions)}
<section class="card hours"><div class="card-h"><h3>By hour of entry</h3><span class="caption">Athens · hours with trades</span></div>
${(() => { const max = Math.max(...S.hours.map((r) => Math.abs(r.net))); return S.hours.map((r) => bkRow(r, max, `${String(r.key).padStart(2, '0')}:00`)).join(''); })()}
<p class="caption" style="margin-top:6px">${24 - S.hours.length} hours without trades are not listed. Changing your time zone or day start moves trades between rows.</p></section>
</main>
${tabbar('stats')}` }));

add('calendar', 'Statistics', 'Calendar heat map', page({ title: 'Calendar', body: `${statsHead('c')}
<main class="content">
<section class="card" style="padding:14px 12px">
  <div class="spread" style="padding:0 4px 10px"><button class="icon-btn" aria-label="Previous month" style="margin:0">${ic('left')}</button><div style="text-align:center"><div style="font-weight:600">September 2026</div><div class="num">${money(MONTH_TOTAL)}</div></div><button class="icon-btn" aria-label="Next month" style="margin:0">${ic('right')}</button></div>
  ${calendar()}
  <p class="caption" style="margin-top:10px;padding:0 4px">Days cut at 00:00 Athens. Day cells are rounded to whole USD; week and month totals use the exact figures. Tap a day for its trades.</p>
</section>
<div class="day-h"><span>Mon 28 Sep · 3 trades</span><span class="num">${money(616.10, { arrow: false })}</span></div>
<div class="list">${RECENT.slice(1).map((t) => tradeRow(t)).join('')}</div>
</main>
${tabbar('stats')}` }));

const missing = TRADES.filter((t) => t.r == null);
add('stats-drilldown', 'Statistics', 'A figure opened: formula, included and excluded trades', page({ title: 'Expectancy', body: `${navbar({ back: 'Statistics', title: 'Expectancy', right: badge('real') })}
<main class="content">
<section class="card"><div class="hero-label">September · trades with a known stop</div><div class="hero gain">${signed(S.expR)}R</div><p class="sub">Your average result per trade, counted in R.</p></section>
<section class="card"><div class="card-h"><h3>The calculation</h3><button class="icon-btn" aria-label="Explain expectancy">${ic('book', 'sm')}</button></div>
<div class="formula">Sum of R ÷ trades<br><b>${n2(S.sumR)}R ÷ ${S.rk} = ${signed(S.expR)}R</b></div>
<p class="caption" style="margin:10px 0 6px">Same trades, second way:</p>
<div class="formula">${pct1(S.winRShare)} wins × ${n2(S.avgWinR)}R<br>${MINUS} ${pct1(100 - S.winRShare)} losses × ${n2(S.avgLossR)}R<br><b>= ${signed(S.expR)}R</b></div></section>
<div class="section-h"><h2>Included · ${S.rk}</h2><span class="caption">sum ${n2(S.sumR)}R</span></div>
<div class="list">${RECENT.map((t) => tradeRow(t, { meta: ` · ${t.day} Sep` })).join('')}<button class="btn ghost block">Show all ${S.rk}</button></div>
<div class="section-h"><h2>Left out · 12</h2></div>
<div class="list">
  <div class="set-row"><span class="lbl">R missing, no stop<small>${missing.map((t) => `${t.sym} ${t.day} Sep`).join(', ')}</small></span><span class="val">${missing.length}${ic('right', 'sm')}</span></div>
  <div class="set-row"><span class="lbl">Held out<small>MSFT 24 Sep, question open</small></span><span class="val">1${ic('right', 'sm')}</span></div>
  <div class="set-row"><span class="lbl">Open<small>SOL/USD, USD/JPY</small></span><span class="val">2${ic('right', 'sm')}</span></div>
  <div class="set-row"><span class="lbl">Other mode ${badge('paper')}<small>Paper trades never mix with real</small></span><span class="val">6${ic('right', 'sm')}</span></div>
</div>
</main>
${tabbar('stats')}` }));

// Learn popovers: expectancy (stats), R (trade detail), drawdown (stats)
const popover = (top, arrow, term, body, number, extra = '') => `<div class="scrim" style="background:rgb(0 0 0 / 0.18)"></div>
<div class="popover" role="dialog" aria-label="${term} explained" style="top:calc(var(--safe-top) + ${top}px);--arrow:${arrow}px;max-height:calc(100vh - var(--safe-top) - ${top + 16}px);overflow:auto">
  <div class="spread"><span class="tag info">${ic('book', 'xs')}Learn</span><button class="icon-btn" aria-label="Close" style="margin:-8px -10px">${ic('x')}</button></div>
  <h3 style="margin:0;font:700 20px/26px var(--font-display)">${term}</h3>
  <p style="font-size:15px;line-height:22px">${body}</p>
  <div class="formula" style="font-size:14px;line-height:21px">${number}</div>
  <p class="caption">This describes your past trades only.</p>
  <div class="btn-row">${extra}<button class="btn primary">See the calculation</button></div>
</div>`;
add('learn', 'Statistics', 'Learn popover: expectancy', page({ title: 'Learn: expectancy', body: `${statsHead('o')}
<main class="content"><section class="card"><div class="card-h"><h3>Figures</h3></div><div class="kv">
  <div><dt style="color:var(--accent);font-weight:600">Expectancy ${ic('info', 'info-dot')}</dt><dd class="gain">${signed(S.expR)}R · ${signed(S.expCur)}</dd></div><div><dt>Win rate</dt><dd>${pct1(S.winRate)} · ${S.wins} of ${S.n}</dd></div></div></section>
<section class="card" style="height:260px"></section></main>
${tabbar('stats')}
${popover(262, 48, 'Expectancy', 'What you made or lost per trade on average, counted in R. <b>R</b> is what you planned to risk on a trade.', `Your number: <b class="gain">${signed(S.expR)}R</b> over ${S.rk} trades. On average each trade returned about a sixth of the amount you risked on it.`, '<button class="btn plain">What is R?</button>')}` }));

add('learn-r', 'Statistics', 'Learn popover: R, from the trade’s R chip', page({ title: 'Learn: R', body: `${navbar({ back: 'Journal', title: 'NVDA' })}
<main class="content"><section class="card"><div class="hero-label">Short 20 shares · Stock · Range fade ${badge('real')}</div><div class="hero">${money(120)}<span class="cur">USD</span></div>
<div class="hstack wrap" style="margin-top:4px"><span class="tag on" style="height:28px;font-size:12px;box-shadow:0 0 0 2px var(--accent)">+2.00R ${ic('info', 'xs')}</span></div></section><section class="card" style="height:300px"></section></main>
${tabbar('journal')}
${popover(216, 40, 'R, the risk unit', 'R is what you planned to lose if the stop was hit: the distance from entry to stop, times the size, times what one unit of price move is worth. That is 1 for shares and coins; for forex lots it is the pip value per lot, and for contracts the value per point.', 'This trade: (121.20 − 118.20) × 20 × 1 = <b>60.00 = 1R</b>. It made 120.00, which is <b class="gain">+2.00R</b>.', '<button class="btn plain">R on forex</button>')}` }));

add('learn-drawdown', 'Statistics', 'Learn popover: drawdown', page({ title: 'Learn: drawdown', body: `${statsHead('o')}
<main class="content"><section class="card"><div class="card-h"><h3>Equity and drawdown</h3></div><div class="kv">
  <div><dt style="color:var(--accent);font-weight:600">Max drawdown ${ic('info', 'info-dot')}</dt><dd>${money(DD.dd, { arrow: false })} · ${MINUS}${pct1(-DD.pct)}</dd></div><div><dt>Peak to low</dt><dd>12 Sep → 19 Sep</dd></div></div></section>
<section class="card" style="height:260px"></section></main>
${tabbar('stats')}
${popover(236, 56, 'Drawdown', 'How far your balance fell from its highest point before it climbed back, measured from peak to low on closed trades.', `Your largest: <b class="loss">${MINUS}${n2(-DD.dd)}</b> from the 12 Sep peak to the 19 Sep low. That is ${MINUS}${pct1(-DD.pct)} of your equity at the peak, ${n2(DD.ePeak)} including deposits and withdrawals. Getting back needed +${pct1(DD.recoveryGain)}, reached on 25 Sep.`, '<button class="btn plain">Recovery gain</button>')}` }));

// ---------- COMPARE paper vs real ----------
add('compare', 'Review', 'Your paper and real figures', page({ title: 'Your paper and real figures', body: `${navbar({ back: 'Review', title: 'Paper and real figures' })}
<main class="content">
<p class="sub" style="padding:0 4px">Your own measures in both modes, Aug to Sep 2026. Each figure opens to its trades.</p>
<section class="card"><div class="cmp">
  <span></span><span class="h">${badge('paper')}</span><span class="h">${badge('real')}</span>
  <span class="k">Followed your plan</span><span class="v">92%<small>22 of 24</small></span><span class="v">71%<small>44 of 62</small></span>
  <span class="k">Risk per trade, median</span><span class="v">0.8%<small>n 22 with a stop</small></span><span class="v">1.3%<small>n 57 with a stop</small></span>
  <span class="k">Trades per trading day</span><span class="v">1.6<small>24 trades, 15 days</small></span><span class="v">3.0<small>62 trades, 21 days</small></span>
  <span class="k">Opened within 30 min of a losing close</span><span class="v">4%<small>1 of 24</small></span><span class="v">16%<small>10 of 62</small></span>
</div></section>
<p class="caption" style="padding:0 4px">30 minutes is a placeholder you set, not a recommendation. Paper leaves out real fills, emotions and often costs.</p>
</main>
${tabbar('review')}` }));

// ---------- REVIEW ----------
const WK = week(21, 27);
const WF = summary(WK.filter((t) => t.followed)), WO = summary(WK.filter((t) => !t.followed));
const PATTERN_TITLES = ['Plan rules not followed', 'Entries soon after a losing close', 'Days with more trades than your median', 'Position size rising', 'Legs added while the position showed a loss', 'Stops moved or missing', 'Holding time and plan target', 'Trades outside the hours you set', 'Entries after the daily loss limit'];
const link = (t) => `<a class="trade-link" href="#">${t.sym} · ${t.day} Sep</a>`;
const moved = [find(21, 'AMD'), find(25, 'ETH/USD')];
add('review', 'Review', 'Weekly review with linked trades (on-device model)', page({ title: 'Review', body: `${topbar({ title: 'Review', mode: 'real' })}
<main class="content">
<div class="spread wrap"><button class="chip sm" aria-pressed="true">${ic('calendar', 'sm')}21–27 Sep</button><span class="engine">${ic('chip', 'sm')}On-device model</span></div>
<section class="card"><div class="card-h"><h3>Process and outcome</h3><span class="caption">${WK.length} closed trades</span></div>
<div class="pv-grid">
  <div><span class="caption">Followed plan</span><b class="num" style="font-size:18px">${WF.n} trades</b><span class="num ${WF.sumR >= 0 ? 'gain' : 'loss'}" style="font-weight:600">${avgR(WF)}</span></div>
  <div><span class="caption">Off plan</span><b class="num" style="font-size:18px">${WO.n} trades</b><span class="num ${WO.sumR >= 0 ? 'gain' : 'loss'}" style="font-weight:600">${avgR(WO)}</span></div>
</div>
<p class="caption" style="margin-top:8px">1 open trade not reviewed · 0 held out</p></section>
<section class="card"><div class="card-h"><h3>Review questions</h3><a href="#" class="link" style="color:var(--accent);font-size:13px;font-weight:500">Paper and real</a></div>
<div class="pattern"><h4><span class="tag warn">n ${WO.n}</span>${PATTERN_TITLES[0]}</h4>
<p class="sub" style="color:var(--text)">${WO.n} of ${WK.length} trades are marked not followed: stop moved (2), no stop (1), entry soon after a loss (2), outside your hours (1).</p>
<div class="hstack wrap">${WK.filter((t) => !t.followed).map(link).join('')}</div>
<p class="ask">Which of these rules felt hardest to keep this week?</p></div>
<div class="pattern"><h4><span class="tag warn">n 2</span>${PATTERN_TITLES[1]}</h4>
<p class="sub" style="color:var(--text)">2 of ${WK.length} trades opened within 30 minutes of a losing close, with risk 1.8 times your median risk.</p>
<div class="hstack wrap">${link(find(22, 'EUR/USD'))}${link(find(24, 'TSLA'))}</div>
<p class="ask">What was going on before these two trades?</p></div>
<div class="pattern"><h4><span class="tag warn">n 3</span>${PATTERN_TITLES[5]}</h4>
<p class="sub" style="color:var(--text)">Your plan says: “The stop only moves toward profit.” On 2 trades it moved the other way; they closed at ${signed((moved[0].r + moved[1].r) / 2)}R on average. 1 trade had no stop.</p>
<div class="hstack wrap">${moved.map(link).join('')}${link(find(23, 'GBP/USD'))}</div>
<p class="ask">What made you move them?</p></div>
<div class="pattern"><h4><span class="tag warn">n 1</span>${PATTERN_TITLES[7]}</h4>
<p class="sub" style="color:var(--text)">1 trade opened at 23:12. Your plan’s hours are 10:00 to 23:00 Athens.</p>
<div class="hstack wrap">${link(find(26, 'ETH/USD'))}</div>
<p class="ask">What was different about that evening?</p></div>
</section>
<section class="card"><div class="card-h"><h3>Checked, nothing found</h3><span class="caption">5 of 9</span></div><p class="sub">${[2, 3, 4, 6, 8].map((i) => PATTERN_TITLES[i]).join(', ')}.</p></section>
<p class="caption" style="padding:0 4px">About your past trades only. 30 minutes is a placeholder you set, not a recommendation. Every number in the text was checked against the computed one.</p>
</main>
${tabbar('review')}` }));

add('review-fallback', 'Review', 'Fallback: model unavailable, review by rules, no pattern found', page({ title: 'Review by rules', body: `${topbar({ title: 'Review', mode: 'paper', paper: true })}
<main class="content">
<div class="banner neutral" style="grid-template-columns:auto 1fr">${ic('chip')}<div class="body"><b style="color:var(--text)">The on-device model can’t run here</b>This browser lacks what the model needs. Rules wrote this review; nothing is missing from the figures.</div></div>
<div class="spread wrap"><button class="chip sm" aria-pressed="true">${ic('calendar', 'sm')}21–27 Sep</button><span class="engine">${ic('sliders', 'sm')}Written by rules, no model available</span></div>
<section class="card paper"><div class="card-h"><h3>Process and outcome</h3>${badge('paper')}</div>
<div class="pv-grid"><div><span class="caption">Followed plan</span><b class="num" style="font-size:18px">5 trades</b><span class="num gain" style="font-weight:600">avg ${signed(PAPER_WEEK.reduce((s, p) => s + p[2], 0) / PAPER_WEEK.length)}R over ${PAPER_WEEK.length} with R</span></div><div><span class="caption">Off plan</span><b class="num" style="font-size:18px">0 trades</b><span class="caption">nothing to compare</span></div></div>
<p class="caption" style="margin-top:8px">Small sample: 5 trades.</p></section>
<section class="card empty" style="padding:20px 16px">
  <div class="art" style="width:56px;height:56px;border-radius:16px">${ic('search', 'lg')}</div>
  <h2 style="font-size:19px;line-height:24px">No pattern found</h2>
  <p class="sub">Checked all 9 patterns on 5 trades:</p>
  <p class="sub" style="color:var(--text)">${PATTERN_TITLES.map((x) => x.toLowerCase().replace('your median', 'your median')).join(', ')}.</p>
</section>
<button class="btn plain block">AI engine settings</button>
</main>
${tabbar('review')}` }));

// ---------- SETTINGS, AI, KEY, DATA, ABOUT ----------
const sRow = (icon, color, lbl, val, sub = '') => `<a class="set-row" href="#"><span class="ic" style="background:${color}">${ic(icon)}</span><span class="lbl">${lbl}${sub ? `<small>${sub}</small>` : ''}</span><span class="val">${val}${ic('right', 'sm')}</span></a>`;
add('settings', 'Settings', 'Settings', page({ title: 'Settings', body: `${navbar({ back: 'Home', title: 'Settings' })}
<main class="content">
<div class="group-h">General</div>
<div class="list">${sRow('globe', 'var(--accent)', 'Language', 'English')}${sRow('moon', 'var(--real)', 'Appearance', 'System')}${sRow('clock', 'var(--text-3)', 'Your time zone', 'Athens', 'Days, hours and weekdays use it')}${sRow('calendar', 'var(--text-3)', 'A day starts at', '00:00')}</div>
<div class="group-h">Broker accounts</div>
<div class="list">${sRow('file', 'var(--real)', 'IBKR', 'USD', 'Real · stocks · start 8,000.00')}${sRow('file', 'var(--real)', 'Kraken', 'USD', 'Real · crypto · start 2,500.00')}${sRow('file', 'var(--real)', 'MT4 forex', 'USD', 'Real · forex · start 2,000.00')}${sRow('paper', 'var(--paper)', 'Paper account', 'EUR', 'Pretend start 10,000.00')}${sRow('scale', 'var(--text-3)', 'Display currency', 'USD, EUR', 'Real in USD, paper in EUR')}${sRow('import', 'var(--text-3)', 'Cash movements', '4')}</div>
<div class="group-h">Plan and checks</div>
<div class="list">${sRow('target', 'var(--gain)', 'My plan', '6 rules')}${sRow('sliders', 'var(--attention)', 'Review thresholds', '', 'Placeholders you set, not recommendations')}${sRow('neq', 'var(--attention)', 'Broker check tolerance', '0.01', 'Per closed trade, at most 1.00')}${sRow('info', 'var(--text-3)', 'Small-sample note', '30', 'Shown below this many trades')}</div>
<div class="group-h">AI</div>
<div class="list">${sRow('chip', 'var(--accent)', 'Engine', 'On-device')}${sRow('key', 'var(--text-3)', 'Your own key', 'Not set')}</div>
<div class="group-h">Data</div>
<div class="list">${sRow('database', 'var(--gain)', 'Your data', '', 'Export, restore, delete · last export 12 Sep')}${sRow('info', 'var(--text-3)', 'About', 'v1.0.0')}</div>
</main>
${tabbar('home')}` }));

add('settings-ai', 'Settings', 'AI engine: model downloading', page({ title: 'AI engine', body: `${navbar({ back: 'Settings', title: 'AI engine' })}
<main class="content">
<p class="sub" style="padding:0 4px">AI words the reviews and reads free text. It never produces a number: every figure comes from code.</p>
<div class="list">
  <div class="set-row" style="min-height:64px"><span class="radio"></span><span class="lbl">Rules only<small>Works on every device, offline</small></span></div>
  <div class="set-row" style="min-height:64px;align-items:flex-start;padding-top:14px;padding-bottom:14px"><span class="radio on"></span><span class="lbl">On-device model<small>Runs on this phone. Nothing leaves it.</small>
    <span style="display:grid;gap:6px;margin-top:10px"><span class="spread"><span class="caption num" style="color:var(--text)">Downloading · 412 of 830 MB</span><span class="caption num">50%</span></span><span class="progress"><i style="width:50%"></i></span><span class="caption">Rules write reviews until the download finishes, and write every Greek review for now.</span></span></span></div>
  <a class="set-row" href="#" style="min-height:64px"><span class="radio"></span><span class="lbl">Your own key<small>Anthropic or an OpenAI-compatible service</small></span><span class="val">Not set${ic('right', 'sm')}</span></a>
</div>
<button class="btn plain block">Pause download</button>
</main>
${tabbar('home')}` }));

add('settings-key', 'Settings', 'Own key: what is sent, before turning it on (AC-P9.2)', page({ title: 'Your own key', cls: 'app has-actions', body: `${navbar({ back: 'AI engine', title: 'Your own key' })}
<main class="content">
<div class="seg" role="group" aria-label="Provider"><button aria-pressed="true">Anthropic</button><button aria-pressed="false">OpenAI-compatible</button></div>
<section class="card" style="display:grid;gap:14px">
  <div class="field"><label>Service address</label><div class="input">api.anthropic.com</div></div>
  <div class="field"><label>Key</label><div class="input">sk-ant-••••••••••••••••••••4f2a</div><span class="help">Stored on this phone only. Never exported, never shown in a screenshot or log.</span></div>
</section>
<section class="card"><div class="card-h"><h3>What is sent, for each review</h3></div>
<div class="kv">
  <div><dt>Each finding’s figures, pattern and dates</dt><dd>sent</dd></div>
  <div><dt>Instrument names in those findings</dt><dd>sent</dd></div>
  <div><dt>Your plan rule when a finding quotes it</dt><dd>sent</dd></div>
  <div><dt>Notes, moods, screenshots</dt><dd>never</dd></div>
  <div><dt>Other trades and your files</dt><dd>never</dd></div>
</div>
<p class="caption" style="margin-top:8px">Only to api.anthropic.com. That service applies its own terms to what it receives.</p></section>
</main>
<div class="actions"><button class="btn primary lg block">Turn on with this key</button><button class="btn ghost block">Cancel</button></div>` }));

add('data', 'Settings', 'Data: storage refused, export done, delete everything', page({ title: 'Export and backup', cls: 'app has-toast', body: `${navbar({ back: 'Settings', title: 'Your data' })}
<main class="content">
<div class="banner attention" style="grid-template-columns:auto 1fr">${ic('alert')}<div class="body"><b style="color:var(--attention)">Storage is not protected</b>The browser did not grant lasting storage, so it may clear this app’s data when the phone runs low on space. Export a backup regularly.</div></div>
<button class="btn secondary block">Ask the browser again</button>
<section class="card"><div class="card-h"><h3>Export everything</h3></div>
<p class="sub">214 trades, 4 accounts (3 broker, 1 paper) with their cash movements, 1 plan, 6 import reports and 18 screenshots in one file. Your own key is left out.</p>
<button class="btn primary block" style="margin-top:12px">${ic('export', 'sm')}Export</button></section>
<section class="card"><div class="card-h"><h3>Restore from a file</h3></div><p class="sub">Adds a previous export to this device. Older export versions are read too.</p>
<button class="btn plain block" style="margin-top:12px">${ic('import', 'sm')}Choose a file</button></section>
<div class="list"><a class="set-row" href="#"><span class="lbl">Remind me to export<small>After this many new trades</small></span><span class="val">50${ic('right', 'sm')}</span></a></div>
<section class="card"><div class="card-h"><h3>Delete everything on this device</h3></div><p class="sub">Removes every trade, plan, import, screenshot, setting and your key. There is no copy anywhere else; export first if you want one. You type DELETE to confirm.</p>
<button class="btn danger-btn block" style="margin-top:12px">Delete everything</button></section>
</main>
<div class="toast" role="status">${ic('checkc')}<span>Exported <b>trading-journal-2026-09-29.json</b> · 2.4 MB</span><button class="link" style="color:inherit;font-weight:600">Share</button></div>
${tabbar('home')}` }));

add('data-delete', 'Settings', 'Delete everything: typed confirmation and the model choice (AC-P8.9)', page({ title: 'Delete everything', body: `${navbar({ back: 'Settings', title: 'Your data' })}<main class="content"><section class="card" style="height:300px"></section></main>${tabbar('home')}<div class="scrim"></div>
<section class="sheet" role="dialog" aria-label="Delete everything" style="top:calc(var(--safe-top) + 40px)">
<div class="grabber"></div>
<div class="sheet-h"><button class="btn ghost">Cancel</button><h2>Delete everything</h2><span style="min-width:64px"></span></div>
<div class="sheet-body">
  <section class="card"><div class="card-h"><h3>This removes, from this device only</h3></div>
  <div class="kv"><div><dt>Trades, real and paper</dt><dd>214</dd></div><div><dt>Accounts and cash movements</dt><dd>4 · 4</dd></div><div><dt>Plans and reviews</dt><dd>1 · 9</dd></div><div><dt>Import reports and screenshots</dt><dd>6 · 18</dd></div><div><dt>Settings and your own key</dt><dd>all</dd></div></div>
  <p class="caption" style="margin-top:8px">There is no copy anywhere else. Last export 29 Sep.</p></section>
  <button class="btn secondary block">${ic('export', 'sm')}Export first</button>
  <div class="list"><div class="set-row" style="min-height:56px"><span class="check">${ic('check')}</span><span class="lbl">Also delete the downloaded model<small>830 MB. Leave it and reviews by the model keep working after you start again.</small></span></div></div>
  <div class="field"><label>Type DELETE to confirm</label><div class="input focus">DELETE<span class="caret"></span></div></div>
  <p class="caption">Afterwards the app opens at the first-run screen.</p>
</div>
<div class="sheet-foot"><button class="btn danger-btn lg block">Delete everything</button></div>
</section>` }));

const ABOUT = {
  en: {
    title: 'About', back: 'Settings', version: 'Version 1.0.0 · MIT licence · Ion Vovos / Nexa Systems', one: 'In one sentence',
    isH: 'What this app is', is: 'A journal and review tool. It analyses the trades you enter or import against the rules you set.',
    notH: 'What it is not', not: 'It gives no investment advice and no recommendation about any financial instrument or crypto-asset, does not recommend brokers, exchanges or platforms, and does not predict prices. It is not tax or legal advice. Figures describe your past trades and say nothing certain about future ones. Trading can lose money, including more than you put in when leverage is used. Every decision is yours. Its numbers are only as good as the data you enter; check them against your broker’s statements. The software is provided free, as is, under the licence in the repository.',
    numH: 'How the numbers are made', num: 'Code computes every figure from your trades and is tested against worked examples. AI only words reviews and reads typed sentences.',
    defs: 'The 18 definitions', chkH: 'The broker check', chk: 'After an import you can type your broker’s own figure. The journal compares, holds unclear trades out of your statistics until you answer, and names the trades that may explain a difference.',
    dataH: 'Your data', data: ['Trades, plans, screenshots and settings are stored only on this device. Nothing is sent to the developer. No account, no analytics, no advertising, no tracking cookies.', 'GitHub Pages hosts the app’s files and may log your IP address in ordinary server logs. The on-device model downloads from cdn.jsdelivr.net, huggingface.co and raw.githubusercontent.com, which see those requests.', 'With your own key, the review facts go only to the service you typed, under its own terms.', 'Export saves everything to one file. Settings → Your data → Delete everything removes it all from this device. Clearing browser data or losing the phone also loses the journal.'],
    code: 'Code and problem reports',
  },
  el: {
    title: 'Σχετικά', back: 'Ρυθμίσεις', version: 'Έκδοση 1.0.0 · άδεια MIT · Ion Vovos / Nexa Systems', one: 'Με μία πρόταση',
    isH: 'Τι είναι η εφαρμογή', is: 'Ένα ημερολόγιο και εργαλείο ανασκόπησης. Αναλύει τις συναλλαγές που καταχωρίζετε ή εισάγετε με βάση τους κανόνες που θέτετε εσείς.',
    notH: 'Τι δεν είναι', not: 'Δεν παρέχει επενδυτικές συμβουλές ούτε συστάσεις για κανένα χρηματοπιστωτικό μέσο ή κρυπτο-περιουσιακό στοιχείο, δεν προτείνει brokers, χρηματιστήρια ή πλατφόρμες και δεν προβλέπει τιμές. Δεν αποτελεί φορολογική ή νομική συμβουλή. Τα στοιχεία περιγράφουν τις παλιότερες συναλλαγές σας και δεν λένε τίποτα βέβαιο για το μέλλον. Οι συναλλαγές μπορεί να σας κοστίσουν χρήματα, και με μόχλευση περισσότερα από όσα καταθέσατε. Κάθε απόφαση είναι δική σας. Οι αριθμοί είναι τόσο σωστοί όσο τα δεδομένα που δίνετε: ελέγχετέ τους με τις καταστάσεις του broker σας. Το λογισμικό διατίθεται δωρεάν, ως έχει, με την άδεια που αναφέρεται στο αποθετήριο.',
    numH: 'Πώς βγαίνουν οι αριθμοί', num: 'Κάθε αριθμός υπολογίζεται με κώδικα από τις συναλλαγές σας και ελέγχεται με λυμένα παραδείγματα. Η τεχνητή νοημοσύνη μόνο διατυπώνει τις ανασκοπήσεις και διαβάζει τις προτάσεις που γράφετε.',
    defs: 'Οι 18 ορισμοί', chkH: 'Ο έλεγχος με τον broker', chk: 'Μετά από μια εισαγωγή γράφετε το ποσό του broker σας. Το ημερολόγιο συγκρίνει, κρατά τις αβέβαιες συναλλαγές έξω από τα στατιστικά μέχρι να απαντήσετε και δείχνει ποιες συναλλαγές μπορεί να εξηγούν μια διαφορά.',
    dataH: 'Τα δεδομένα σας', data: ['Συναλλαγές, σχέδια, στιγμιότυπα και ρυθμίσεις μένουν μόνο σε αυτή τη συσκευή. Τίποτα δεν στέλνεται στον δημιουργό. Χωρίς λογαριασμό, χωρίς στατιστικά χρήσης, χωρίς διαφημίσεις, χωρίς cookies παρακολούθησης.', 'Τα αρχεία της εφαρμογής φιλοξενεί το GitHub Pages, που μπορεί να καταγράφει τη διεύθυνση IP σας στα συνήθη αρχεία καταγραφής. Το μοντέλο της συσκευής κατεβαίνει από τα cdn.jsdelivr.net, huggingface.co και raw.githubusercontent.com, που βλέπουν αυτά τα αιτήματα.', 'Με δικό σας κλειδί, τα στοιχεία της ανασκόπησης πηγαίνουν μόνο στην υπηρεσία που γράψατε, με τους δικούς της όρους.', 'Η εξαγωγή αποθηκεύει τα πάντα σε ένα αρχείο. Ρυθμίσεις → Τα δεδομένα σας → Διαγραφή όλων σβήνει τα πάντα από τη συσκευή. Αν σβήσετε τα δεδομένα του browser ή χάσετε το τηλέφωνο, χάνεται και το ημερολόγιο.'],
    code: 'Κώδικας και αναφορά προβλημάτων',
  },
};
function about(lang) {
  const a = ABOUT[lang];
  return page({ title: a.title, lang, body: `${navbar({ back: a.back, title: a.title })}
<main class="content">
<section class="card" style="display:grid;grid-template-columns:auto 1fr;gap:14px;align-items:center">
  <div style="width:56px;height:56px;border-radius:14px;overflow:hidden">${iconSvg(56)}</div>
  <div><h2 style="margin:0;font:700 20px/26px var(--font-display)">Trading Journal</h2><p class="caption">${a.version}</p></div>
</section>
<section class="card vstack" style="gap:10px"><h3>${a.one}</h3><p class="sub" style="color:var(--text)">${lang === 'el' ? FIRST_RUN_EL : FIRST_RUN_EN}</p></section>
<section class="card vstack" style="gap:10px"><h3>${a.isH}</h3><p class="sub" style="color:var(--text)">${a.is}</p>
<h3 style="margin-top:4px">${a.notH}</h3><p class="sub" style="color:var(--text)">${a.not}</p></section>
<section class="card vstack" style="gap:10px"><h3>${a.numH}</h3><p class="sub">${a.num}</p><button class="btn ghost" style="justify-self:start;padding:0">${a.defs}</button>
<h3 style="margin-top:4px">${a.chkH}</h3><p class="sub">${a.chk}</p></section>
<section class="card vstack" style="gap:10px"><h3>${a.dataH}</h3>${a.data.map((p) => `<p class="sub">${p}</p>`).join('')}</section>
<a class="card" href="#" style="display:grid;gap:2px"><span class="hstack">${ic('code')}<span style="font-weight:600">${a.code}</span></span><span class="caption">github.com/ionvovos/trading-journal</span></a>
</main>
${tabbar('home', lang)}` });
}
add('about', 'Settings', 'About: the one-page explanation (approved wording)', about('en'));
add('about-el', 'Settings', 'About in Greek', about('el'));

// ---------- app icon (inline for onboarding and about) ----------
function iconSvg(size) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 512 512" aria-hidden="true"><defs><linearGradient id="ig${size}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b62e0"/><stop offset="1" stop-color="#2140a8"/></linearGradient></defs><rect width="512" height="512" fill="url(#ig${size})"/><path d="M96 352h320M96 272h320M96 192h320" stroke="#fff" stroke-opacity=".14" stroke-width="10"/><path d="M128 290l80 70 176-196" fill="none" stroke="#fff" stroke-width="44" stroke-linecap="round" stroke-linejoin="round"/><circle cx="384" cy="164" r="30" fill="#fff"/></svg>`;
}

// ---------- consistency checks (G15): the screens must add up ----------
const sum = (xs, f) => Math.round(xs.reduce((s, x) => s + Math.round(f(x) * 100), 0)) / 100;
for (const [name, rows] of Object.entries({ setups: S.setups, markets: S.markets, accounts: S.accounts, weekdays: S.weekdays, hours: S.hours, sessions: S.sessions })) {
  assert.equal(rows.reduce((s, r) => s + r.n, 0), S.n, `${name} n`);
  assert.equal(sum(rows, (r) => r.net), S.net, `${name} net`);
  assert.equal(rows.reduce((s, r) => s + r.rk, 0), S.rk, `${name} R-known`);
  assert.equal(Math.round(rows.reduce((s, r) => s + r.sumR, 0) * 100) / 100, S.sumR, `${name} sum R`);
}
assert.equal(RBINS.reduce((s, b) => s + b[2], 0), S.rk, 'histogram count');
assert.equal(Math.abs(DD.dd - -842.30) < 0.005, true, 'max drawdown');
assert.equal(Math.round((IBKR_EXPLAINED + IBKR_UNEXPLAINED) * 100) / 100, IBKR_DIFF, 'broker check parts');
assert.equal(S.followed.n + S.offPlan.n, S.n, 'plan marks');
assert.equal(Math.abs(S.winRShare / 100 * S.avgWinR - (1 - S.winRShare / 100) * S.avgLossR - S.expR) < 1e-9, true, 'expectancy two ways');

writeFileSync(join(root, 'tools', 'screens.json'), `${JSON.stringify(SCREENS, null, 2)}\n`);
console.log(`${SCREENS.length} mockups written; figures consistent (n ${S.n}, net ${S.net}, expectancy ${signed(S.expR)}R on ${S.rk}, IBKR ${n2(IBKR_JOURNAL)} vs ${n2(IBKR_BROKER)})`);
