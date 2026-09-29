// Generates the static mockups in design/mockups/ (one file per screen or state).
// Run: node design/tools/build-mockups.mjs   (no dependencies, no network)
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ic, money, signed, fmt, R, rCls, MINUS, page, tabbar, modeSwitch, badge, mk,
  equityPoints, ddStats, MONTH_TOTAL, N_CLOSED, SETUPS, equityChart, drawdownChart, rHistogram, calendar, candleShot,
} from './lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'mockups');
mkdirSync(out, { recursive: true });

const PTS = equityPoints();
const DD = ddStats(PTS);
const SCREENS = [];
const add = (name, group, title, html) => { SCREENS.push({ name, group, title }); writeFileSync(join(out, `${name}.html`), html); };

// ---------- shared fragments ----------
const topbar = ({ title, mode, right = '', left = '', paper = false, lang = 'en' }) => `<header class="topbar${paper ? ' paper-mode' : ''}">${left}${title ? `<h1>${title}</h1>` : ''}${mode ? modeSwitch(mode, lang) : ''}${right}</header>`;
const navbar = ({ back, title, right = '', paper = false }) => `<header class="topbar${paper ? ' paper-mode' : ''}"><button class="back">${ic('left')}${back}</button><h1 class="title-sm">${title}</h1>${right || '<span style="width:64px"></span>'}</header>`;
const gear = `<button class="icon-btn" aria-label="Settings">${ic('gear')}</button>`;
const status = (k, label) => {
  const icon = { ok: 'checkc', open: 'neq', skip: 'skip', ask: 'question' }[k];
  return `<span class="status ${k}">${ic(icon, 'sm')}${label}</span>`;
};
const tradeRow = ({ m, sym, side, size, setup, net, r, meta = '', flags = '', cls = '' }) => `<a class="row ${cls}" href="#">${mk(m)}<div class="main"><span class="t">${sym}${flags}</span><span class="d">${side} ${size}${setup ? ` · ${setup}` : ''}${meta}</span></div><div class="end">${net == null ? '<span class="m muted">open</span>' : `<span class="m">${money(net)}</span>`}<span class="rr ${rCls(r)}">${r === undefined ? '' : R(r)}</span></div></a>`;

const RECENT = [
  { m: 'stock', sym: 'AAPL', side: 'Long', size: '50', setup: 'Breakout', net: -117.50, r: -0.94, meta: ' · 29 Sep' },
  { m: 'fx', sym: 'EUR/USD', side: 'Long', size: '1.00 lot', setup: 'Breakout', net: 326.12, r: 1.09, meta: ' · 28 Sep' },
  { m: 'crypto', sym: 'BTC/USD', side: 'Long', size: '0.05', setup: 'Pullback', net: 169.98, r: 2.79, meta: ' · 28 Sep' },
  { m: 'stock', sym: 'NVDA', side: 'Short', size: '20', setup: 'Range fade', net: 120.00, r: 2.0, meta: ' · 28 Sep' },
];

// ---------- DASHBOARD (real) + Greek + offline ----------
const L = {
  en: {
    home: 'Home', banner: 'IBKR, September: difference open', bannerBody: 'Your broker shows 25.80 more. 3 trades may explain it.',
    net: 'Net P&amp;L', month: 'September', sub: `${N_CLOSED} closed · 1 held out · 2 open`,
    exp: 'Expectancy', expN: 'n 35<br>no R on 3', win: 'Win rate', winN: `18 of ${N_CLOSED}`, dd: 'Max drawdown', ddN: MINUS + '842.30',
    check: 'Broker check', all: 'All periods', recent: 'Recent trades', seeAll: 'See all',
    st: { open: 'Difference', ok: 'Reconciled', skip: 'Skipped', ask: 'Not asked' },
    periods: [['IBKR', 'Sep 2026 · +25.80', 'open'], ['Kraken', 'Sep 2026', 'skip'], ['MT4 forex', 'Sep 2026 · entered by hand', 'ask'], ['IBKR', 'Aug 2026 · within ±0.14', 'ok']],
    offline: 'You are offline', offlineBody: 'Everything on this device keeps working. Reviews with your own key wait for a connection.',
  },
  el: {
    home: 'Αρχική', banner: 'IBKR, Σεπτέμβριος: ανοιχτή διαφορά', bannerBody: 'Ο broker δείχνει 25,80 παραπάνω. Μπορεί να το εξηγούν 3 συναλλαγές.',
    net: 'Καθαρό Κ/Ζ', month: 'Σεπτέμβριος', sub: `${N_CLOSED} κλειστές · 1 σε αναμονή · 2 ανοιχτές`,
    exp: 'Προσδοκία', expN: 'n 35<br>χωρίς R: 3', win: 'Κερδοφόρες', winN: `18 από ${N_CLOSED}`, dd: 'Μέγ. πτώση', ddN: MINUS + '842,30',
    check: 'Έλεγχος με τον broker', all: 'Όλες οι περίοδοι', recent: 'Πρόσφατες συναλλαγές', seeAll: 'Όλες',
    st: { open: 'Διαφορά', ok: 'Συμφωνεί', skip: 'Παραλείφθηκε', ask: 'Δεν ζητήθηκε' },
    periods: [['IBKR', 'Σεπ 2026 · +25,80', 'open'], ['Kraken', 'Σεπ 2026', 'skip'], ['MT4 forex', 'Σεπ 2026 · καταχώριση με το χέρι', 'ask'], ['IBKR', 'Αύγ 2026 · εντός ±0,14', 'ok']],
  },
};
function dashboard(lang = 'en', { offline = false } = {}) {
  const s = L[lang];
  const eqXl = lang === 'el' ? [[1, '1 Σεπ'], [8, '8'], [15, '15'], [22, '22'], [29, '29']] : undefined;
  const periods = s.periods.map(([acct, per, k]) => `<a class="row" href="#" style="min-height:52px"><div class="main" style="grid-column:1/3"><span class="t">${acct}</span><span class="d">${per}</span></div><div class="end">${status(k, s.st[k])}</div></a>`).join('');
  const recent = RECENT.slice(0, 3).map((r) => tradeRow(lang === 'el' ? { ...r, meta: r.meta.replace('Sep', 'Σεπ') } : r)).join('')
    .replace(/R unknown/g, lang === 'el' ? 'R άγνωστο' : 'R unknown');
  const fixNum = (h) => (lang === 'el' ? h.replace(/(\d),(\d{3})\.(\d{2})/g, '$1.$2,$3').replace(/(\d)\.(\d{2})(?!\d)/g, '$1,$2') : h);
  const body = `${topbar({ title: '', mode: 'real', lang, right: `<span style="flex:1"></span>${offline ? `<span class="pill-offline">${ic('wifioff', 'sm')}Offline</span>` : ''}${gear}` })}
<main class="content">
${offline ? `<div class="banner neutral">${ic('wifioff')}<div class="body"><b style="color:var(--text)">${s.offline}</b>${s.offlineBody}</div><span></span></div>` : `<a class="banner attention" href="#">${ic('neq')}<div class="body"><b style="color:var(--attention)">${s.banner}</b>${s.bannerBody}</div>${ic('right', 'chev')}</a>`}
<section class="card" aria-label="${s.net}">
  <div class="hero-label">${s.net} · ${s.month} ${badge('real', lang)}</div>
  <div class="hero">${money(MONTH_TOTAL, { lang })}<span class="cur">USD</span></div>
  <div class="sub num" style="margin-top:2px">${s.sub}</div>
  <div style="margin-top:12px">${equityChart(PTS, { h: 116, lang, ...(eqXl ? { xl: eqXl } : {}) })}</div>
  <div class="tiles">
    <button class="tile"><span class="k">${s.exp} ${ic('info', 'info-dot')}</span><span class="v gain">${signed(0.21, lang)}R</span><span class="n">${s.expN}</span></button>
    <button class="tile"><span class="k">${s.win}</span><span class="v">${fmt(47.4, lang, 1)}%</span><span class="n">${s.winN}</span></button>
    <button class="tile"><span class="k">${s.dd}</span><span class="v loss">${MINUS}${fmt(DD.pct, lang, 1)}%</span><span class="n">${s.ddN}</span></button>
  </div>
</section>
<div class="section-h"><h2>${s.check}</h2><a href="#">${s.all}</a></div>
<div class="list">${periods}</div>
<div class="section-h"><h2>${s.recent}</h2><a href="#">${s.seeAll}</a></div>
<div class="list">${fixNum(recent)}</div>
</main>
${tabbar('home', lang)}`;
  return page({ title: lang === 'el' ? 'Αρχική (Ελληνικά)' : offline ? 'Home, offline' : 'Home', lang, body });
}
add('dashboard', 'Home', 'Home, real mode, difference open', dashboard('en'));
add('dashboard-el', 'Home', 'Home in Greek', dashboard('el'));
add('offline', 'States', 'Offline', dashboard('en', { offline: true }));

// ---------- DASHBOARD (paper, beginner, small sample) ----------
{
  const pp = [10000, 10042.10, 10017.10, 10048.60, 10030.20, 10046.20, 10038.20].map((v, i) => ({ v, day: [1, 21, 22, 23, 24, 25, 28][i] }));
  const body = `${topbar({ title: '', mode: 'paper', paper: true, right: `<span style="flex:1"></span>${gear}` })}
<main class="content">
<section class="card paper" aria-label="Net P&amp;L paper">
  <div class="hero-label">Net P&amp;L · September ${badge('paper')}</div>
  <div class="hero">${money(38.20)}<span class="cur">EUR</span></div>
  <div class="sub">6 closed paper trades</div>
  <div class="banner neutral" style="margin-top:12px;padding:10px 12px;grid-template-columns:auto 1fr">${ic('info', 'sm')}<div class="body" style="color:var(--text-2)"><b style="font-size:13px;color:var(--text)">Small sample: 6 trades</b>Averages move a lot below 30 trades (your setting).</div></div>
  <div style="margin-top:12px">${equityChart(pp, { h: 104, xl: [[1, '21 Sep'], [28, '28']] })}</div>
  <div class="tiles">
    <button class="tile"><span class="k">Expectancy ${ic('info', 'info-dot')}</span><span class="v gain">+0.18R</span><span class="n">n 5<br>no R on 1</span></button>
    <button class="tile"><span class="k">Followed plan</span><span class="v">5 of 6</span><span class="n">83%</span></button>
    <button class="tile"><span class="k">Win rate</span><span class="v">50.0%</span><span class="n">3 of 6</span></button>
  </div>
</section>
<a class="card" href="#" style="display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;text-decoration:none;color:inherit">
  <span class="mk" style="background:var(--accent-soft);color:var(--accent)">${ic('review')}</span>
  <div><h3>Your first review is ready</h3><p class="sub">5 trades closed. See what the app found in them.</p></div>${ic('right', 'chev')}
</a>
<div class="section-h"><h2>Paper trades</h2><a href="#">See all</a></div>
<div class="list">
${tradeRow({ m: 'crypto', sym: 'ETH/USD', side: 'Long', size: '0.2', setup: 'Breakout', net: -8.00, r: -0.67, meta: ' · 28 Sep', cls: 'paper-row' })}
${tradeRow({ m: 'stock', sym: 'MSFT', side: 'Long', size: '5', setup: 'Pullback', net: 16.00, r: 0.8, meta: ' · 25 Sep', cls: 'paper-row' })}
${tradeRow({ m: 'fx', sym: 'EUR/USD', side: 'Short', size: '0.05 lot', setup: '', net: -18.40, r: null, meta: ' · 24 Sep', cls: 'paper-row' })}
</div>
<p class="caption" style="padding:0 4px">Paper results leave out real fills, emotions and often costs. <a class="link" href="#">Why this matters</a></p>
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
<div class="vstack"><button class="btn primary lg block">Write my plan</button><button class="btn plain lg block">Log a paper trade</button></div>
<p class="caption" style="text-align:center">Already trade? <a class="link" href="#">Import a broker file</a></p>
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
add('onboarding-welcome', 'Onboarding', 'First run: welcome and boundary', page({ title: 'Welcome', cls: 'ob', body: `
<div class="steps" aria-label="Step 1 of 2"><i class="done"></i><i></i></div>
<div style="width:64px;height:64px;border-radius:16px;overflow:hidden;box-shadow:var(--e2)">${iconSvg(64)}</div>
<div class="vstack" style="gap:10px"><h1>Numbers you can check against your broker</h1>
<p class="lead">Log trades or import your broker’s file. Every figure opens to the trades and the arithmetic behind it.</p></div>
<section class="card" style="display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:start">
  <span class="mk" style="background:var(--accent-soft);color:var(--accent)">${ic('shield')}</span>
  <p style="font-size:15px;line-height:21px">This app keeps your trade record and reviews your own past trades against your own rules. It never tells you to buy, sell or hold anything, never predicts prices, never holds or moves money and never asks for your broker login.</p>
</section>
<section class="card" style="display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:start">
  <span class="mk" style="background:var(--surface-2);color:var(--text-2)">${ic('lock')}</span>
  <p style="font-size:15px;line-height:21px">No account. Your trades stay on this phone until you export them.</p>
</section>
<div class="spacer"></div>
<div class="field"><span class="lbl">Language</span><div class="seg" role="group"><button aria-pressed="true">English</button><button aria-pressed="false">Ελληνικά</button></div></div>
<button class="btn primary lg block">Continue</button>` }));

add('onboarding-path', 'Onboarding', 'First run: beginner or trader path', page({ title: 'How to start', cls: 'ob', body: `
<div class="steps" aria-label="Step 2 of 2"><i class="done"></i><i class="done"></i></div>
<div class="vstack" style="gap:10px"><h1>How do you want to start?</h1><p class="lead">You can switch between paper and real at any time. They never mix.</p></div>
<div class="vstack" style="gap:12px">
<button class="choice sel"><span class="ic paper">${ic('paper')}</span><span><h3>I’m new: practise on paper</h3><span class="sub">Log made-up trades with the same steps as real ones. Good for learning the terms from your own numbers.</span></span><span class="radio on"></span></button>
<button class="choice"><span class="ic real">${ic('import')}</span><span><h3>I trade already: import my history</h3><span class="sub">Bring in a file from your broker or exchange, then check the totals against your broker’s.</span></span><span class="radio"></span></button>
<button class="choice"><span class="ic real">${ic('pencil')}</span><span><h3>Log a real trade by hand</h3><span class="sub">Start from today with no file.</span></span><span class="radio"></span></button>
</div>
<div class="spacer"></div>
<p class="caption" style="text-align:center">Paper results leave out real fills, emotions and often costs.</p>
<button class="btn primary lg block">Start on paper</button>` }));

// ---------- LOG TRADE (sheet over home) ----------
const behind = (paper = false) => `${topbar({ title: '', mode: paper ? 'paper' : 'real', paper, right: `<span style="flex:1"></span>${gear}` })}<main class="content"><section class="card" style="height:300px"></section></main>${tabbar('home')}<div class="scrim"></div>`;
add('log-trade', 'Log', 'Log a trade: sheet', page({ title: 'New trade', body: `${behind()}
<section class="sheet" role="dialog" aria-label="New trade" style="top:calc(var(--safe-top) + 10px)">
<div class="grabber"></div>
<div class="sheet-h"><button class="btn ghost">Cancel</button><h2>New trade</h2><span style="min-width:64px;display:flex;justify-content:flex-end">${badge('real')}</span></div>
<div class="sheet-body">
  <div class="sentence"><span class="txt"><span class="muted">Or type: bought 50 AAPL at 227.40</span></span><button class="go" aria-label="Read sentence">${ic('send')}</button></div>
  <div class="grid2"><div class="field"><label>Broker account</label><div class="input select">IBKR${ic('down', 'sm')}</div></div><div class="field"><span class="lbl">Market</span><div class="input select">Stocks${ic('down', 'sm')}</div></div></div>
  <div class="grid2"><div class="field"><label>Instrument</label><div class="input focus">AAPL<span class="caret"></span></div></div>
  <div class="field"><span class="lbl">Side</span><div class="seg long-short" role="group" style="height:48px;align-items:stretch"><button class="long" aria-pressed="true">Long</button><button class="short" aria-pressed="false">Short</button></div></div></div>
  <div class="grid2"><div class="field"><label>Size <a class="link" href="#" style="font-size:12px">from risk</a></label><div class="input">50<span class="unit">shares</span></div></div><div class="field"><label>Entry</label><div class="input">227.40<span class="unit">USD</span></div></div></div>
  <div class="grid2"><div class="field"><label>Stop <span class="muted" style="font-weight:500">for R</span></label><div class="input">224.90</div></div><div class="field"><label>Target</label><div class="input"><span class="ph">optional</span></div></div></div>
  <div class="card" style="padding:12px 14px;display:grid;gap:4px;background:var(--accent-soft);box-shadow:none">
    <div class="spread"><span class="sub" style="color:var(--text)">Risk if the stop is hit</span><b class="num">125.00 USD</b></div>
    <div class="spread"><span class="caption">0.91% of equity · plan 1%</span><span class="tag info">${ic('check', 'xs')}within plan</span></div>
  </div>
  <div class="grid2"><div class="field"><label>Exit</label><div class="input"><span class="ph">still open</span></div></div><div class="field"><label>Fees</label><div class="input">1.00<span class="unit">USD</span></div></div></div>
  <div class="field"><label>Entry time</label><div class="input select">${ic('clock', 'sm')}Today, 16:41<span class="unit" style="margin-left:6px">Athens</span>${ic('down', 'sm')}</div></div>
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

add('log-error', 'Log', 'Log a trade: entry with errors', page({ title: 'New trade, errors', body: `${behind()}
<section class="sheet" role="dialog" aria-label="New trade" style="top:calc(var(--safe-top) + 10px)">
<div class="grabber"></div>
<div class="sheet-h"><button class="btn ghost">Cancel</button><h2>New trade</h2><span style="min-width:64px;display:flex;justify-content:flex-end">${badge('real')}</span></div>
<div class="sheet-body">
  <div class="banner danger" style="grid-template-columns:auto 1fr">${ic('alert')}<div class="body"><b style="color:var(--loss)">1 field needs a value</b>Size is required to save.</div></div>
  <div class="grid2"><div class="field"><label>Broker account</label><div class="input select">IBKR${ic('down', 'sm')}</div></div><div class="field"><span class="lbl">Market</span><div class="input select">Stocks${ic('down', 'sm')}</div></div></div>
  <div class="grid2"><div class="field"><label>Instrument</label><div class="input">TSLA</div></div>
  <div class="field"><span class="lbl">Side</span><div class="seg long-short" role="group" style="height:48px;align-items:stretch"><button class="long" aria-pressed="true">Long</button><button class="short" aria-pressed="false">Short</button></div></div></div>
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
<div class="vstack" style="gap:4px;margin-top:4px"><h2 style="margin:0;font:700 22px/28px var(--font-display)">Your checklist</h2><p class="sub">From “My plan”. Tick what is true. The app checks the rows marked “checked by the app”.</p></div>
<div class="group-h">Checked by the app</div>
<div class="list">
${chk('auto-ok', 'Inside my hours, 15:30 to 22:00 Athens', 'Now 16:41')}
${chk('auto-ok', 'Fewer than 4 trades today', '2 so far today')}
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

// ---------- TRADE DETAIL ----------
add('trade-detail', 'Journal', 'Trade detail', page({ title: 'NVDA trade', body: `${navbar({ back: 'Journal', title: 'NVDA', right: `<button class="icon-btn" aria-label="More">${ic('more')}</button>` })}
<main class="content">
<section class="card">
  <div class="hero-label">Short 20 shares · Stock · Range fade ${badge('real')}</div>
  <div class="hero">${money(120)}<span class="cur">USD</span></div>
  <div class="hstack wrap" style="margin-top:4px"><span class="tag on" style="height:24px;font-size:12px">+2.00R</span><span class="tag info" style="height:24px;font-size:12px">${ic('check', 'xs')}Followed plan</span><span class="caption">Closed 28 Sep, 21:05</span></div>
</section>
<section class="card"><div class="card-h"><h3>Legs</h3><span class="caption">times in Athens</span></div>
<div class="legs">
  <div class="leg"><span class="side loss">Sell</span><span>20 @ 118.20<br><span class="caption">28 Sep, 16:41 · entry</span></span><span class="caption">stop 121.20</span></div>
  <div class="leg"><span class="side gain">Buy</span><span>20 @ 112.10<br><span class="caption">28 Sep, 21:05 · exit</span></span><span class="caption">target 111.00</span></div>
</div></section>
<section class="card"><div class="card-h"><h3>Result, step by step</h3><a class="link" href="#">${ic('book', 'sm')}</a></div>
  <div class="eq-row"><span>Gross (118.20 ${MINUS} 112.10) × 20</span><span class="v gain">+122.00</span></div>
  <div class="eq-row"><span>Fees</span><span class="v loss">${MINUS}2.00</span></div>
  <div class="eq-row total"><span>Net P&amp;L</span><span class="v gain">+120.00</span></div>
  <div class="eq-row"><span>Initial risk (121.20 ${MINUS} 118.20) × 20 = 1R</span><span class="v">60.00</span></div>
  <div class="eq-row"><span>R = 120.00 ÷ 60.00</span><span class="v gain">+2.00R</span></div>
</section>
<section class="card"><div class="card-h"><h3>Plan check</h3><span class="caption">you confirmed</span></div>
${[['Inside my hours', '16:41'], ['Setup on my list', 'Range fade'], ['Risk up to 1% of equity', '0.45%'], ['Stop set at entry', '121.20'], ['Up to 4 trades a day', '3rd']].map(([k, v]) => `<div class="spread" style="padding:7px 0;border-bottom:1px solid var(--line)"><span class="hstack sub" style="color:var(--text)"><span class="check auto-ok" style="width:20px;height:20px;border-radius:6px">${ic('check')}</span>${k}</span><span class="caption num">${v}</span></div>`).join('')}
</section>
<section class="card"><div class="card-h"><h3>Notes</h3><span class="caption">Before: calm · After: satisfied</span></div>
<p class="sub" style="color:var(--text)">Faded the open after the gap failed at 118.50. Held to target area, closed before the close.</p>
<div class="shot" style="margin-top:12px">${candleShot()}</div></section>
<p class="caption" style="padding:0 4px">Imported from Interactive Brokers on 29 Sep, row 214. <a class="link" href="#">Import report</a></p>
</main>
${tabbar('journal')}` }));

// ---------- JOURNAL ----------
add('journal', 'Journal', 'Journal list with filters, held out, open, R unknown', page({ title: 'Journal', body: `${topbar({ title: 'Journal', mode: 'real', right: `<button class="icon-btn" aria-label="Search" style="margin-left:6px">${ic('search')}</button><button class="icon-btn" aria-label="Import">${ic('import')}</button>` })}
<main class="content">
<div class="chips" role="toolbar" aria-label="Filters"><button class="chip" aria-pressed="true">${ic('calendar', 'sm')}Sep 2026</button><button class="chip">All accounts${ic('down', 'sm')}</button><button class="chip">All markets${ic('down', 'sm')}</button><button class="chip">Setup${ic('down', 'sm')}</button><button class="chip">Result${ic('down', 'sm')}</button><button class="chip">Plan${ic('down', 'sm')}</button></div>
<div class="section-h" style="margin-top:4px"><h2>Needs you</h2><span class="caption">not in statistics</span></div>
<div class="list">
${tradeRow({ m: 'stock', sym: 'MSFT', side: 'Long', size: '30', setup: '', net: null, meta: ' · opened before the file', flags: '<span class="tag warn">Held out</span>', cls: 'held' }).replace('<span class="m muted">open</span>', '<span class="link" style="font-size:13px">Answer</span>')}
${tradeRow({ m: 'crypto', sym: 'SOL/USD', side: 'Long', size: '12', setup: 'Breakout', net: null, meta: ' · open 7 days', flags: '<span class="tag">Open</span>' }).replace('<span class="m muted">open</span>', '<span class="link" style="font-size:13px">Add exit</span>')}
</div>
<div class="day-h"><span>Tue 29 Sep</span><span class="num">${money(-117.50, { arrow: false })}</span></div>
<div class="list">${tradeRow({ ...RECENT[0], meta: ' · 16:02' })}</div>
<div class="day-h"><span>Mon 28 Sep</span><span class="num">${money(616.10, { arrow: false })}</span></div>
<div class="list">${RECENT.slice(1).map((r) => tradeRow({ ...r, meta: '' })).join('')}</div>
<div class="day-h"><span>Wed 23 Sep</span><span class="num">${money(96.30, { arrow: false })}</span></div>
<div class="list">${tradeRow({ m: 'fx', sym: 'GBP/USD', side: 'Short', size: '0.30 lot', setup: 'Pullback', net: 96.30, r: null, meta: ' · no stop', flags: '<span class="tag off">Off plan</span>' })}</div>
</main>
${tabbar('journal')}` }));

// ---------- IMPORT ----------
const importSteps = (n) => `<div class="steps" aria-label="Step ${n} of 4">${[1, 2, 3, 4].map((i) => `<i class="${i <= n ? 'done' : ''}"></i>`).join('')}</div>`;
const mapRow = (src, dst, ex, warn) => `<div class="map-row"><span class="src">${src}<span class="ex">${ex}</span></span>${ic('arrowr', 'sm')}<span class="dst${warn ? ' warn' : ''}">${dst}${ic('down', 'sm')}</span></div>`;
add('import-mapping', 'Import', 'Import: columns and skipped rows', page({ title: 'Import columns', cls: 'app has-actions', body: `${navbar({ back: 'Journal', title: 'Import', right: badge('real') })}
<main class="content">
${importSteps(2)}
<section class="card" style="display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:center">
  <span class="mk" style="background:var(--surface-2);color:var(--text-2)">${ic('file')}</span>
  <div style="min-width:0"><div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">U1234567_2026-09.csv</div><div class="caption num">IBKR Activity Statement, detected · into account IBKR</div></div>
</section>
<section class="card"><div class="card-h"><h3>Columns of the Trades section</h3><span class="caption">8 of 16</span></div>
${mapRow('Date/Time', 'Time', '2026-09-28, 10:41:07')}
${mapRow('Symbol', 'Instrument', 'NVDA')}
${mapRow('Quantity', 'Size and side', `${MINUS}20`)}
${mapRow('T. Price', 'Price', '118.2')}
${mapRow('Comm/Fee', 'Fees', `${MINUS}1`)}
${mapRow('Currency', 'Currency', 'USD')}
${mapRow('Realized P/L', 'Broker P&amp;L', '120')}
<div class="set-row" style="padding:10px 0 0;min-height:44px"><span class="lbl">Time zone of the file<small>Not stated in the file; please confirm</small></span><span class="val" style="color:var(--attention)">New York${ic('right', 'sm')}</span></div>
</section>
<section class="card"><div class="card-h"><h3>Rows</h3><span class="caption num">412 in the file</span></div>
<div class="kv"><div><dt>Trade fills</dt><dd>53</dd></div><div><dt>Deposits, stored as cash</dt><dd>2</dd></div><div><dt>Other sections, not trades</dt><dd>354</dd></div><div><dt>Skipped, cannot be read</dt><dd style="color:var(--attention)">3</dd></div></div>
${[['Row 188', 'Trades SubTotal row, not a fill'], ['Row 214', 'Date “2026-09-31, 10:02:11” does not exist'], ['Row 297', 'Quantity is empty']].map(([a, b]) => `<div class="spread" style="padding:8px 0 0;align-items:flex-start"><span class="caption num" style="width:62px;flex:none;color:var(--text-2);font-weight:600">${a}</span><span class="sub" style="flex:1;color:var(--text)">${b}</span></div>`).join('')}
</section>
</main>
<div class="actions"><button class="btn primary lg block">Build trades from 53 fills</button><p class="caption" style="text-align:center">Nothing enters your statistics until the checks run.</p></div>` }));

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
<div class="vstack" style="gap:4px"><h2 style="margin:0;font:700 22px/28px var(--font-display)">3 questions before these trades count</h2>
<p class="sub">3 trades are held out of your statistics until you answer. You can answer later from the journal.</p></div>
<section class="q"><span class="qn">Question 1 of 3</span><p class="qt">2 AAPL fills on 18 Sep repeat your 17 Sep import. Merge or keep both?</p>
<div class="hstack wrap"><a class="trade-link" href="#">AAPL · 18 Sep · buy 50 @ 226.10</a><a class="trade-link" href="#">AAPL · 17 Sep</a></div>
<div class="vstack"><div class="opt on"><span class="radio on"></span><span>Merge<small>Count them once</small></span></div><div class="opt"><span class="radio"></span><span>Keep both<small>They were separate orders</small></span></div></div></section>
<section class="q"><span class="qn">Question 2 of 3</span><p class="qt">AMD on 22 Sep has an empty fee field. What was the fee?</p>
<div class="hstack wrap"><a class="trade-link" href="#">AMD · 22 Sep · long 60</a></div>
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

// ---------- RECONCILE (the angle) ----------
add('reconcile-total', 'Broker check', 'Broker check: enter the broker figure', page({ title: 'Broker check', cls: 'app has-actions', body: `${navbar({ back: 'Questions', title: 'Broker check', right: badge('real') })}
<main class="content">
${importSteps(4)}
<div class="vstack" style="gap:4px"><h2 style="margin:0;font:700 22px/28px var(--font-display)">What does your broker say?</h2>
<p class="sub">Type the figure from your IBKR statement. The journal compares it with its own and shows which trades may explain a difference.</p></div>
<section class="card" style="display:grid;gap:14px">
  <div class="set-row" style="padding:0;min-height:44px"><span class="lbl">IBKR · USD<small>1–29 Sep 2026, first to last close in the file</small></span><span class="val" style="color:var(--accent)">Change${ic('right', 'sm')}</span></div>
  <div class="seg" role="group" aria-label="Figure type"><button aria-pressed="true">Realised P&amp;L</button><button aria-pressed="false">Balance</button></div>
  <div class="field"><label>Realised P&amp;L for the period</label><div class="input focus" style="height:60px;font-size:28px;font-weight:700;letter-spacing:-0.01em">728.10<span class="caret" style="height:30px"></span><span class="unit" style="font-size:15px">USD</span></div>
  <span class="help">Often in the statement’s performance summary as the realised total.</span></div>
</section>
<section class="card" style="display:grid;gap:8px">
  <div class="spread"><span class="sub">Journal, trades closed in the period</span><b class="num">702.30</b></div>
  <div class="spread"><span class="sub">Partial exits of trades still open</span><b class="num">0.00</b></div>
  <div class="spread"><span class="sub">Counts as a match within</span><span class="num sub" style="color:var(--text)">±0.16 <a class="link" href="#">change</a></span></div>
  <p class="caption">0.01 for each of 16 closed trades, at most 1.00. 1 trade is held out.</p>
</section>
</main>
<div class="actions"><button class="btn primary lg block">Compare</button><button class="btn ghost block">Skip for now</button></div>` }));

const cause = (amt, title, text, link, action) => `<div class="pattern"><div class="spread" style="align-items:flex-start"><h4>${title}</h4><span class="num" style="font-weight:700;white-space:nowrap">${amt}</span></div><p class="sub">${text}</p><div class="spread wrap">${link}<button class="btn secondary" style="font-size:14px;padding:0 14px">${action}</button></div></div>`;
add('reconcile-difference', 'Broker check', 'Broker check: difference open, possible causes named', page({ title: 'Difference open', cls: 'app has-actions', body: `${navbar({ back: 'Home', title: 'Broker check', right: badge('real') })}
<main class="content">
<p class="sub" style="text-align:center;margin-top:-4px">IBKR · 1–29 Sep 2026 · USD</p>
<section class="card">
  <div class="pv-grid"><div><span class="caption">Broker</span><b class="num" style="font-size:20px">728.10</b></div><div><span class="caption">Journal</span><b class="num" style="font-size:20px">702.30</b></div></div>
  <div class="spread" style="margin-top:12px">${status('open', 'Difference open')}<b class="num" style="font-size:20px;color:var(--attention)">+25.80</b></div>
  <p class="caption" style="margin-top:8px">3 trades add up to the whole difference. Nothing has been changed; you decide each one.</p>
</section>
<section class="card"><div class="card-h"><h3>Possible causes</h3><span class="caption">broker ${MINUS} journal</span></div>
${cause('+64.20', 'MSFT, 24 Sep, held out', 'IBKR counts this trade. The journal waits for your answer about the 10 shares bought before the file starts.', '<a class="trade-link" href="#">MSFT · sell 30</a>', 'Answer')}
${cause(`${MINUS}21.90`, 'AAPL, 18 Sep, counted twice', 'You chose “Keep both” for 2 fills that repeat the 17 Sep import.', '<a class="trade-link" href="#">AAPL · 2 fills</a>', 'Merge instead')}
${cause(`${MINUS}16.50`, 'AMD, 22 Sep, fee field empty', 'You chose “No fee”. A fee of 16.50 would account for the rest.', '<a class="trade-link" href="#">AMD · long 60</a>', 'Type fee')}
</section>
</main>
<div class="actions"><button class="btn primary lg block">Compare again after changes</button><button class="btn ghost block">Keep the difference open</button></div>` }));

add('reconcile-match', 'Broker check', 'Broker check: reconciled, with the import report', page({ title: 'Reconciled', body: `${navbar({ back: 'Home', title: 'Broker check', right: badge('real') })}
<main class="content">
<section class="card empty" style="padding:24px 16px 20px">
  <div class="art" style="background:var(--ok-soft);color:var(--ok);border-radius:50%">${ic('checkc', 'lg')}</div>
  <h2>Reconciled within ±0.16</h2>
  <p class="sub">IBKR · 1–29 Sep 2026 · USD</p>
  <div class="pv-grid" style="width:100%;margin-top:8px"><div><span class="caption">Broker</span><b class="num" style="font-size:20px">728.10</b></div><div><span class="caption">Journal</span><b class="num" style="font-size:20px">728.10</b></div></div>
  <p class="caption num">Exact difference 0.00</p>
</section>
<section class="card"><div class="card-h"><h3>Import report</h3><span class="caption">kept with the import</span></div>
<div class="kv">
  <div><dt>Rows read</dt><dd>412 of 412</dd></div><div><dt>Rows skipped</dt><dd>3, reasons listed</dd></div><div><dt>Trades built</dt><dd>17 from 53 fills</dd></div>
  <div><dt>Trades with R known</dt><dd>15 of 17</dd></div><div><dt>Questions answered</dt><dd>3 of 3</dd></div><div><dt>Held out now</dt><dd>0</dd></div>
</div>
<div class="divider"></div>
<p class="sub">Your answers: merged the AAPL repeat, typed a 16.50 fee for AMD, typed the MSFT opening of 10 shares on 28 Aug.</p>
</section>
<div class="btn-row"><button class="btn plain">${ic('export', 'sm')}Save report</button><button class="btn primary">Done</button></div>
</main>
${tabbar('home')}` }));

add('periods', 'Broker check', 'Broker check: every account and month with its state', page({ title: 'Broker check periods', body: `${navbar({ back: 'Home', title: 'Broker check', right: badge('real') })}
<main class="content">
<p class="sub" style="padding:0 4px">Each broker account keeps one of four states per month until you check it.</p>
${[['September 2026', [['IBKR', 'open', 'Difference', '+25.80 · 3 trades may explain it'], ['Kraken', 'skip', 'Skipped', 'Skipped on 29 Sep · check any time'], ['MT4 forex', 'ask', 'Not asked', 'Entered by hand · check any time']]], ['August 2026', [['IBKR', 'ok', 'Reconciled', 'Within ±0.14 · exact 0.00'], ['Kraken', 'ok', 'Reconciled', 'Within ±0.09 · exact 0.03'], ['MT4 forex', 'ok', 'Reconciled', 'Within ±0.07 · exact 0.00']]]].map(([m, rows]) => `<div class="group-h">${m}</div><div class="list">${rows.map(([a, k, l, d]) => `<a class="row" href="#"><span class="mk" style="background:var(--surface-2);color:var(--text-2)">${ic('file')}</span><div class="main"><span class="t">${a}</span><span class="d">${d}</span></div><div class="end">${status(k, l)}</div></a>`).join('')}</div>`).join('')}
<div class="banner neutral" style="grid-template-columns:auto 1fr">${ic('info')}<div class="body">Paper trades have no broker, so they have no broker check.</div></div>
</main>
${tabbar('home')}` }));

// ---------- STATISTICS ----------
const statsHead = (sel) => `${topbar({ title: 'Statistics', mode: 'real' })}
<div style="padding:0 var(--gutter) 8px;display:grid;gap:10px"><div class="seg" role="tablist"><button aria-pressed="${sel === 'o'}">Overview</button><button aria-pressed="${sel === 'c'}">Calendar</button><button aria-pressed="${sel === 'b'}">Buckets</button></div>
<div class="hstack"><button class="chip sm" aria-pressed="true">${ic('calendar', 'sm')}Sep 2026</button><button class="chip sm">All accounts${ic('down', 'sm')}</button></div>
<p class="caption num" style="padding:0 2px">${N_CLOSED} closed · 1 held out · 2 open · no R on 3</p></div>`;
const setupBars = () => {
  const max = Math.max(...SETUPS.map((s) => Math.abs(s[2])));
  return `<div class="hbars">${SETUPS.map(([n, c, v, e, rk]) => `<div class="hb"><div class="top"><span class="name">${n}</span><span class="meta">n ${c} · ${signed(e)}R (${rk} with R)</span></div><div class="spread" style="gap:10px"><div class="track" style="flex:1"><span class="bar ${v > 0 ? 'g' : 'l'}" style="width:${((Math.abs(v) / max) * 50).toFixed(1)}%"></span></div><span class="num" style="width:78px;text-align:right;font-size:13px">${money(v, { arrow: true })}</span></div></div>`).join('')}</div>`;
};
add('stats', 'Statistics', 'Statistics overview', page({ title: 'Statistics', body: `${statsHead('o')}
<main class="content">
<section class="card"><div class="card-h"><h3>Equity and drawdown</h3><span class="caption">start 12,500.00</span></div>
${equityChart(PTS, { h: 124, marks: true, noX: true })}
<div style="margin-top:6px">${drawdownChart(PTS)}</div>
<div class="legend"><span><i class="sw eq"></i>Equity</span><span><i class="sw dd"></i>Below the last peak</span></div>
<div class="kv" style="margin-top:8px">
  <div><dt>Max drawdown</dt><dd>${money(DD.dd, { arrow: false })} · ${MINUS}${fmt(DD.pct, 'en', 1)}%</dd></div>
  <div><dt>Peak to low</dt><dd>12 Sep → 19 Sep</dd></div>
  <div><dt>Recovered</dt><dd>25 Sep · needed +${fmt(DD.recoveryGain, 'en', 1)}%</dd></div>
  <div><dt>Now below peak</dt><dd>${money(DD.current, { arrow: false })}</dd></div>
</div>
<p class="caption" style="margin-top:6px">Measured on closed trades; swings inside a trade are not measured.</p></section>
<section class="card"><div class="card-h"><h3>R per trade</h3><span class="caption">35 with R · missing on 3</span></div>
${rHistogram()}
<div class="legend"><span><i class="sw gain"></i>Above 0R</span><span><i class="sw loss"></i>Below 0R</span></div></section>
<section class="card"><div class="card-h"><h3>By setup</h3><span class="caption">A to Z · net P&amp;L</span></div>${setupBars()}</section>
<section class="card"><div class="card-h"><h3>Figures</h3><span class="caption">tap any for its trades</span></div>
<div class="kv">
  <div><dt>Expectancy</dt><dd class="gain">+0.21R · +33.81</dd></div>
  <div><dt>Win rate</dt><dd>47.4% · 18 of 38</dd></div>
  <div><dt>Break-even trades</dt><dd>0</dd></div>
  <div><dt>Average win</dt><dd>+241.29 · +1.53R</dd></div>
  <div><dt>Average loss</dt><dd>152.93 · 0.90R</dd></div>
  <div><dt>Profit factor</dt><dd>1.42</dd></div>
  <div><dt>Longest streaks</dt><dd>4 wins · 5 losses</dd></div>
  <div><dt>Fees · funding and swap</dt><dd>214.60 · 18.40</dd></div>
</div></section>
</main>
${tabbar('stats')}` }));

add('calendar', 'Statistics', 'Calendar heat map', page({ title: 'Calendar', body: `${statsHead('c')}
<main class="content">
<section class="card" style="padding:14px 12px">
  <div class="spread" style="padding:0 4px 10px"><button class="icon-btn" aria-label="Previous month" style="margin:0">${ic('left')}</button><div style="text-align:center"><div style="font-weight:600">September 2026</div><div class="num">${money(MONTH_TOTAL)}</div></div><button class="icon-btn" aria-label="Next month" style="margin:0">${ic('right')}</button></div>
  ${calendar()}
  <p class="caption" style="margin-top:10px;padding:0 4px">Days cut at 00:00 Athens. Cells rounded to whole USD; tap a day for exact figures.</p>
</section>
<div class="day-h"><span>Mon 28 Sep · 3 trades</span><span class="num">${money(616.10, { arrow: false })}</span></div>
<div class="list">${RECENT.slice(1).map((r) => tradeRow({ ...r, meta: '' })).join('')}</div>
</main>
${tabbar('stats')}` }));

add('stats-drilldown', 'Statistics', 'A figure opened: formula, included and excluded trades', page({ title: 'Expectancy', body: `${navbar({ back: 'Statistics', title: 'Expectancy', right: badge('real') })}
<main class="content">
<section class="card"><div class="hero-label">September · trades with a known stop</div><div class="hero gain">+0.21R</div><p class="sub">Your average result per trade, counted in R.</p></section>
<section class="card"><div class="card-h"><h3>The calculation</h3><a class="link" href="#">${ic('book', 'sm')}</a></div>
<div class="formula">Sum of R ÷ trades<br><b>7.38R ÷ 35 = +0.21R</b></div>
<p class="caption" style="margin:10px 0 6px">Same trades, second way:</p>
<div class="formula">45.7% wins × 1.53R<br>${MINUS} 54.3% losses × 0.90R<br><b>= +0.21R</b></div></section>
<div class="section-h"><h2>Included · 35</h2><span class="caption">sum 7.38R</span></div>
<div class="list">${RECENT.map((r) => tradeRow({ ...r, meta: r.meta })).join('')}<a class="row" href="#" style="min-height:48px"><span></span><span class="link">Show all 35</span><span></span></a></div>
<div class="section-h"><h2>Left out · 12</h2></div>
<div class="list">
  <div class="set-row"><span class="lbl">R missing, no stop<small>GBP/USD 23 Sep, ETH/USD 11 Sep, AAPL 3 Sep</small></span><span class="val">3${ic('right', 'sm')}</span></div>
  <div class="set-row"><span class="lbl">Held out<small>MSFT 24 Sep, question open</small></span><span class="val">1${ic('right', 'sm')}</span></div>
  <div class="set-row"><span class="lbl">Open<small>SOL/USD, USD/JPY</small></span><span class="val">2${ic('right', 'sm')}</span></div>
  <div class="set-row"><span class="lbl">Other mode ${badge('paper')}<small>Paper trades never mix with real</small></span><span class="val">6${ic('right', 'sm')}</span></div>
</div>
</main>
${tabbar('stats')}` }));

// Learn popover over the stats overview
add('learn', 'Statistics', 'Learn popover on a figure', page({ title: 'Learn: expectancy', body: `${statsHead('o')}
<main class="content"><section class="card"><div class="card-h"><h3>Figures</h3></div><div class="kv">
  <div><dt style="color:var(--accent);font-weight:600">Expectancy ${ic('info', 'info-dot')}</dt><dd class="gain">+0.21R · +33.81</dd></div><div><dt>Win rate</dt><dd>47.4% · 18 of 38</dd></div><div><dt>Average win</dt><dd>+241.29 · +1.53R</dd></div></div></section>
<section class="card" style="height:260px"></section></main>
${tabbar('stats')}
<div class="scrim" style="background:rgb(0 0 0 / 0.18)"></div>
<div class="popover" role="dialog" aria-label="Expectancy explained" style="top:calc(var(--safe-top) + 232px);--arrow:48px">
  <div class="spread"><span class="tag info">${ic('book', 'xs')}Learn</span><button class="icon-btn" aria-label="Close" style="margin:-8px -10px">${ic('x')}</button></div>
  <h3 style="margin:0;font:700 20px/26px var(--font-display)">Expectancy</h3>
  <p style="font-size:15px;line-height:22px">What you made or lost per trade on average, counted in R. <b>R</b> is what you planned to risk on a trade: the distance from entry to stop, times the size.</p>
  <div class="formula" style="font-size:14px;line-height:21px">Your number: <b class="gain">+0.21R</b> over 35 trades. On average each trade returned about a fifth of the amount you risked on it.</div>
  <p class="caption">This describes your past trades. It says nothing about the next one.</p>
  <div class="btn-row"><button class="btn plain">What is R?</button><button class="btn primary">See the calculation</button></div>
</div>` }));

// ---------- COMPARE paper vs real ----------
add('compare', 'Review', 'Your paper and real figures', page({ title: 'Your paper and real figures', body: `${navbar({ back: 'Review', title: 'Paper and real figures' })}
<main class="content">
<p class="sub" style="padding:0 4px">Your own measures in both modes, Aug to Sep 2026. Each figure opens to its trades.</p>
<section class="card"><div class="cmp">
  <span></span><span class="h" style="color:var(--paper)">${badge('paper')}</span><span class="h">${badge('real')}</span>
  <span class="k">Followed your plan</span><span class="v">92%<small>22 of 24</small></span><span class="v">71%<small>44 of 62</small></span>
  <span class="k">Risk per trade, median</span><span class="v">0.8%<small>of equity</small></span><span class="v">1.3%<small>of equity</small></span>
  <span class="k">Trades per trading day</span><span class="v">1.6<small>15 days</small></span><span class="v">2.9<small>21 days</small></span>
  <span class="k">Opened within 30 min of a losing close</span><span class="v">4%<small>1 of 24</small></span><span class="v">16%<small>10 of 62</small></span>
</div></section>
<p class="caption" style="padding:0 4px">30 minutes is a placeholder you set, not a recommendation. Paper leaves out real fills, emotions and often costs.</p>
</main>
${tabbar('review')}` }));

// ---------- REVIEW (agent) ----------
add('review', 'Review', 'Weekly review with linked trades (on-device model)', page({ title: 'Review', body: `${topbar({ title: 'Review', mode: 'real' })}
<main class="content">
<div class="spread wrap"><button class="chip sm" aria-pressed="true">${ic('calendar', 'sm')}21–27 Sep</button><span class="engine">${ic('chip', 'sm')}On-device model</span></div>
<section class="card"><div class="card-h"><h3>Process and outcome</h3><span class="caption">10 closed trades</span></div>
<div class="pv-grid">
  <div><span class="caption">Followed plan</span><b class="num" style="font-size:18px">7 trades</b><span class="num gain" style="font-weight:600">avg +0.92R</span></div>
  <div><span class="caption">Off plan</span><b class="num" style="font-size:18px">3 trades</b><span class="num loss" style="font-weight:600">avg ${MINUS}0.35R</span></div>
</div>
<p class="caption" style="margin-top:8px">R missing on 1 · 1 open trade not reviewed</p></section>
<section class="card"><div class="card-h"><h3>Review questions</h3><a class="link" href="#">Paper and real</a></div>
<div class="pattern"><h4><span class="tag warn">n 2</span>Entries soon after a losing close</h4>
<p class="sub" style="color:var(--text)">2 of 10 trades opened within 30 minutes of a losing close, with risk 1.8 times your median risk.</p>
<div class="hstack wrap"><a class="trade-link" href="#">EUR/USD · 22 Sep</a><a class="trade-link" href="#">TSLA · 24 Sep</a></div>
<p class="ask">What was going on before these two trades?</p></div>
<div class="pattern"><h4><span class="tag warn">n 2</span>Stops moved away from entry</h4>
<p class="sub" style="color:var(--text)">Your plan says: “The stop only moves toward profit.” On 2 trades it moved the other way; they closed at ${MINUS}1.40R on average.</p>
<div class="hstack wrap"><a class="trade-link" href="#">AMD · 21 Sep</a><a class="trade-link" href="#">ETH/USD · 25 Sep</a></div>
<p class="ask">What made you move them?</p></div>
<div class="pattern"><h4><span class="tag warn">n 1</span>Opened outside the hours you set</h4>
<p class="sub" style="color:var(--text)">1 trade opened at 23:12. Your plan’s hours are 15:30 to 22:00 Athens.</p>
<div class="hstack wrap"><a class="trade-link" href="#">ETH/USD · 26 Sep</a></div>
<p class="ask">What was different about that evening?</p></div>
</section>
<section class="card"><div class="card-h"><h3>Checked, nothing found</h3></div><p class="sub">Plan rules not followed on other trades, days with more trades than your median, position size rising, holding time of winners and losers, entries after the daily loss limit.</p></section>
<p class="caption" style="padding:0 4px">About your past trades only. 30 minutes is a placeholder you set, not a recommendation. Every number in the text was checked against the computed one.</p>
</main>
${tabbar('review')}` }));

add('review-fallback', 'Review', 'Fallback: model unavailable, review by rules, no pattern found', page({ title: 'Review by rules', body: `${topbar({ title: 'Review', mode: 'paper', paper: true })}
<main class="content">
<div class="banner neutral" style="grid-template-columns:auto 1fr">${ic('chip')}<div class="body"><b style="color:var(--text)">The on-device model can’t run here</b>This browser lacks what the model needs. Rules wrote this review; nothing is missing from the figures. <a class="link" href="#">AI settings</a></div></div>
<div class="spread wrap"><button class="chip sm" aria-pressed="true">${ic('calendar', 'sm')}14–20 Sep</button><span class="engine">${ic('sliders', 'sm')}Written by rules, no model available</span></div>
<section class="card paper"><div class="card-h"><h3>Process and outcome</h3>${badge('paper')}</div>
<div class="pv-grid"><div><span class="caption">Followed plan</span><b class="num" style="font-size:18px">4 trades</b><span class="num gain" style="font-weight:600">avg +0.40R</span></div><div><span class="caption">Off plan</span><b class="num" style="font-size:18px">0 trades</b><span class="caption">nothing to compare</span></div></div>
<p class="caption" style="margin-top:8px">Small sample: 4 trades.</p></section>
<section class="card empty" style="padding:20px 16px">
  <div class="art" style="width:56px;height:56px;border-radius:16px">${ic('search', 'lg')}</div>
  <h2 style="font-size:19px;line-height:24px">No pattern found</h2>
  <p class="sub">Checked 7 patterns on 4 trades:</p>
  <p class="sub" style="color:var(--text)">plan rules not followed, entries soon after a losing close, days with more trades than your median, position size rising, stops moved or missing, holding time of winners and losers, trades outside the hours you set.</p>
</section>
</main>
${tabbar('review')}` }));

// ---------- SETTINGS, AI, DATA, ABOUT ----------
const sRow = (icon, color, lbl, val, sub = '') => `<a class="set-row" href="#" style="color:inherit;text-decoration:none"><span class="ic" style="background:${color}">${ic(icon)}</span><span class="lbl">${lbl}${sub ? `<small>${sub}</small>` : ''}</span><span class="val">${val}${ic('right', 'sm')}</span></a>`;
add('settings', 'Settings', 'Settings', page({ title: 'Settings', body: `${navbar({ back: 'Home', title: 'Settings' })}
<main class="content">
<div class="group-h">General</div>
<div class="list">${sRow('globe', 'var(--accent)', 'Language', 'English')}${sRow('moon', 'var(--real)', 'Appearance', 'System')}${sRow('clock', 'var(--text-3)', 'Your time zone', 'Athens', 'Days, hours and weekdays use it')}${sRow('calendar', 'var(--text-3)', 'A day starts at', '00:00')}</div>
<div class="group-h">Broker accounts</div>
<div class="list">${sRow('file', 'var(--real)', 'IBKR', 'USD', 'Real · stocks · start 8,000.00')}${sRow('file', 'var(--real)', 'Kraken', 'USD', 'Real · crypto · start 2,500.00')}${sRow('file', 'var(--real)', 'MT4 forex', 'USD', 'Real · forex · start 2,000.00')}${sRow('paper', 'var(--paper)', 'Paper account', 'EUR', 'Pretend start 10,000.00')}${sRow('scale', 'var(--text-3)', 'Display currency', 'Real USD · Paper EUR')}</div>
<div class="group-h">Plan and checks</div>
<div class="list">${sRow('target', 'var(--gain)', 'My plan', '6 rules')}${sRow('sliders', 'var(--attention)', 'Review thresholds', '', 'Placeholders you set, not recommendations')}${sRow('neq', 'var(--attention)', 'Broker check tolerance', '0.01 a trade, max 1.00')}${sRow('info', 'var(--text-3)', 'Small-sample note below', '30 trades')}</div>
<div class="group-h">AI</div>
<div class="list">${sRow('chip', 'var(--accent)', 'Engine', 'On-device')}${sRow('key', 'var(--text-3)', 'Your own key', 'Not set')}</div>
<div class="group-h">Data</div>
<div class="list">${sRow('database', 'var(--gain)', 'Export and backup', '', 'Last export 12 Sep')}${sRow('info', 'var(--text-3)', 'About', 'v1.0.0')}</div>
</main>
${tabbar('home')}` }));

add('settings-ai', 'Settings', 'AI engine: model downloading', page({ title: 'AI engine', body: `${navbar({ back: 'Settings', title: 'AI engine' })}
<main class="content">
<p class="sub" style="padding:0 4px">AI words the reviews and reads free text. It never produces a number: every figure comes from code.</p>
<div class="list">
  <div class="set-row" style="min-height:64px"><span class="radio"></span><span class="lbl">Rules only<small>Works on every device, offline</small></span></div>
  <div class="set-row" style="min-height:64px;align-items:flex-start;padding-top:14px;padding-bottom:14px"><span class="radio on"></span><span class="lbl">On-device model<small>Runs on this phone. Nothing leaves it.</small>
    <span style="display:grid;gap:6px;margin-top:10px"><span class="spread"><span class="caption num" style="color:var(--text)">Downloading · 412 of 830 MB</span><span class="caption num">50%</span></span><span class="progress"><i style="width:50%"></i></span><span class="caption">Rules write reviews until it is ready, and write every Greek review for now.</span></span></span></div>
  <div class="set-row" style="min-height:64px"><span class="radio"></span><span class="lbl">Your own key<small>Anthropic or an OpenAI-compatible service</small></span><span class="val">Not set${ic('right', 'sm')}</span></div>
</div>
<div class="banner info" style="grid-template-columns:auto 1fr">${ic('lock')}<div class="body sub" style="color:var(--text-2)">A key stays on this phone and is never exported. Before you turn one on, this screen lists what would be sent and says the service applies its own terms.</div></div>
<button class="btn plain block">Pause download</button>
</main>
${tabbar('home')}` }));

add('data', 'Settings', 'Data: storage refused, export done', page({ title: 'Export and backup', body: `${navbar({ back: 'Settings', title: 'Export and backup' })}
<main class="content">
<div class="banner attention" style="grid-template-columns:auto 1fr">${ic('alert')}<div class="body"><b style="color:var(--attention)">Storage is not protected</b>The browser did not grant lasting storage, so it may clear this app’s data when the phone runs low on space. Export a backup regularly. <a class="link" href="#">Ask again</a></div></div>
<section class="card"><div class="card-h"><h3>Export everything</h3></div>
<p class="sub">214 trades, 3 broker accounts with their cash movements, 1 plan, 6 import reports and 18 screenshots in one file. Your own key is left out.</p>
<button class="btn primary block" style="margin-top:12px">${ic('export', 'sm')}Export</button></section>
<section class="card"><div class="card-h"><h3>Restore from a file</h3></div><p class="sub">Adds a previous export to this device. Older export versions are read too.</p>
<button class="btn plain block" style="margin-top:12px">${ic('import', 'sm')}Choose a file</button></section>
<div class="list"><div class="set-row"><span class="lbl">Remind me to export<small>After this many new trades</small></span><span class="val">50${ic('right', 'sm')}</span></div></div>
</main>
<div class="toast" role="status">${ic('checkc')}<span>Exported <b>trading-journal-2026-09-29.json</b> · 2.4 MB</span><a class="link" href="#">Share</a></div>
${tabbar('home')}` }));

add('about', 'Settings', 'About: the one-page explanation (approved wording)', page({ title: 'About', body: `${navbar({ back: 'Settings', title: 'About' })}
<main class="content">
<section class="card" style="display:grid;grid-template-columns:auto 1fr;gap:14px;align-items:center">
  <div style="width:56px;height:56px;border-radius:14px;overflow:hidden">${iconSvg(56)}</div>
  <div><h2 style="margin:0;font:700 20px/26px var(--font-display)">Trading Journal</h2><p class="caption">Version 1.0.0 · MIT licence · Ion Vovos / Nexa Systems</p></div>
</section>
<section class="card vstack" style="gap:10px"><h3>What this app is</h3>
<p class="sub" style="color:var(--text)">A journal and review tool. It analyses the trades you enter or import against the rules you set.</p>
<h3 style="margin-top:4px">What it is not</h3>
<p class="sub" style="color:var(--text)">It gives no investment advice and no recommendation about any financial instrument or crypto-asset, does not recommend brokers, exchanges or platforms, and does not predict prices. It is not tax or legal advice. Figures describe your past trades and say nothing certain about future ones. Trading can lose money, including more than you put in when leverage is used. Every decision is yours. Its numbers are only as good as the data you enter; check them against your broker’s statements. The software is provided free, as is, under the licence in the repository.</p></section>
<section class="card vstack" style="gap:10px"><h3>How the numbers are made</h3>
<p class="sub">Code computes every figure from your trades and is tested against worked examples. AI only words reviews and reads typed sentences. <a class="link" href="#">The 18 definitions</a></p>
<h3 style="margin-top:4px">The broker check</h3>
<p class="sub">After an import you can type your broker’s own figure. The journal compares, holds unclear trades out of your statistics until you answer, and names the trades that may explain a difference.</p></section>
<section class="card vstack" style="gap:10px"><h3>Your data</h3>
<p class="sub">Trades, plans, screenshots and settings are stored only on this device. Nothing is sent to the developer. No account, no analytics, no advertising, no tracking cookies.</p>
<p class="sub">GitHub Pages hosts the app’s files and may log your IP address in ordinary server logs. The on-device model downloads from cdn.jsdelivr.net and huggingface.co, which see that request.</p>
<p class="sub">With your own key, the review facts go only to the service you typed, under its own terms. Export saves everything to one file; clearing browser data or losing the phone loses the journal.</p></section>
<a class="card spread" href="#"><span class="hstack">${ic('code')}<span>Code and problem reports</span></span><span class="caption">github.com/ionvovos/trading-journal</span></a>
</main>
${tabbar('home')}` }));

// ---------- PLAN ----------
add('plan', 'Log', 'Plan editor: example plan, your numbers', page({ title: 'My plan', cls: 'app has-actions', body: `${navbar({ back: 'Home', title: 'My plan', paper: true, right: badge('paper') })}
<main class="content">
<div class="banner neutral" style="grid-template-columns:auto 1fr">${ic('info')}<div class="body"><b style="color:var(--text)">An example, yours to change</b>Nothing here is recommended. Rules you leave empty are not checked.</div></div>
<div class="group-h">Checklist before a trade</div>
<div class="list">
  <div class="set-row"><span class="check on">${ic('check')}</span><span class="lbl">The setup is on my list</span>${ic('more', 'sm')}</div>
  <div class="set-row"><span class="check on">${ic('check')}</span><span class="lbl">Stop decided before I enter</span>${ic('more', 'sm')}</div>
  <div class="set-row"><span class="check on">${ic('check')}</span><span class="lbl">I am calm, not chasing a loss</span>${ic('more', 'sm')}</div>
  <a class="set-row link" href="#">${ic('plus', 'sm')}<span class="lbl" style="color:var(--accent)">Add an item</span></a>
</div>
<div class="group-h">Rules the app checks</div>
<section class="card" style="display:grid;gap:14px">
  <div class="field"><label>My setups</label><div class="chips" style="margin:0;padding:2px 0"><button class="chip" aria-pressed="true">Breakout</button><button class="chip" aria-pressed="true">Pullback</button><button class="chip">${ic('plus', 'sm')}Add</button></div></div>
  <div class="grid2"><div class="field"><label>Hours from</label><div class="input select">15:30${ic('down', 'sm')}</div></div><div class="field"><label>to</label><div class="input select">22:00${ic('down', 'sm')}</div></div></div>
  <div class="grid2"><div class="field"><label>Risk per trade</label><div class="input"><span class="ph">your number</span><span class="unit">%</span></div></div><div class="field"><label>Daily loss limit</label><div class="input"><span class="ph">your number</span><span class="unit">%</span></div></div></div>
  <div class="field"><label>Most trades a day</label><div class="input"><span class="ph">your number</span></div></div>
  <p class="caption">Percent of the account’s equity at entry. Paper uses your pretend starting balance, 10,000.00 EUR.</p>
</section>
</main>
<div class="actions"><button class="btn primary lg block">Save plan</button></div>` }));

// ---------- app icon (inline for onboarding and about) ----------
function iconSvg(size) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 512 512" aria-hidden="true"><defs><linearGradient id="ig${size}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b62e0"/><stop offset="1" stop-color="#2140a8"/></linearGradient></defs><rect width="512" height="512" fill="url(#ig${size})"/><path d="M96 352h320M96 272h320M96 192h320" stroke="#fff" stroke-opacity=".14" stroke-width="10"/><path d="M128 290l80 70 176-196" fill="none" stroke="#fff" stroke-width="44" stroke-linecap="round" stroke-linejoin="round"/><circle cx="384" cy="164" r="30" fill="#fff"/></svg>`;
}

writeFileSync(join(root, 'tools', 'screens.json'), `${JSON.stringify(SCREENS, null, 2)}\n`);
console.log(`${SCREENS.length} mockups written`);
