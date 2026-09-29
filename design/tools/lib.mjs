// Shared helpers for the L2d mockups: icons, number formatting, page shell, charts, and the sample dataset.
// Every figure a mockup shows is computed here from the sample trades, so totals on different screens agree.

// ---------- icons (24px grid, stroke) ----------
export const P = {
  home: '<path d="M4 10.5L12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-6h-6v6H5.5A1.5 1.5 0 0 1 4 19v-8.5z"/>',
  journal: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  stats: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  review: '<path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1z"/><path d="M16 5h1.5A1.5 1.5 0 0 1 19 6.5v13a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5v-13A1.5 1.5 0 0 1 6.5 5H8"/><path d="M9 13l2 2 4-4.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  left: '<path d="M15 5l-7 7 7 7"/>',
  down: '<path d="M6 9.5l6 6 6-6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  import: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
  export: '<path d="M12 16V4M7 8.5l5-5 5 5M5 20h14"/>',
  wifioff: '<path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 4.2-2.4M12 20h.01M14.8 10.6A10 10 0 0 1 19 12.9M2 9.3a15 15 0 0 1 4.3-2.7M10.7 5.1A15 15 0 0 1 22 9.3"/>',
  chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l8.5-8.5M16 7l2.5 2.5M14 9l2 2"/>',
  shield: '<path d="M12 3l7.5 3v5.5c0 4.5-3.2 8.3-7.5 9.5-4.3-1.2-7.5-5-7.5-9.5V6L12 3z"/><path d="M9 12l2 2 4-4"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
  question: '<circle cx="12" cy="12" r="8.5"/><path d="M9.8 9.5a2.3 2.3 0 0 1 4.4.9c0 1.6-2.2 2-2.2 3.3M12 16.8h.01"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  more: '<circle cx="5.5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18.5" cy="12" r="1.2"/>',
  alert: '<path d="M12 4l9 16H3l9-16z"/><path d="M12 10v4.5M12 17.5h.01"/>',
  checkc: '<circle cx="12" cy="12" r="8.5"/><path d="M8.3 12.3l2.4 2.4 5-5.2"/>',
  skip: '<path d="M5 6l8 6-8 6V6zM17 6v12"/>',
  neq: '<path d="M5 9.5h14M5 14.5h14M15 5L9 19"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 16l-5-5-8.5 8.5"/>',
  pencil: '<path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5 4 20zM13.5 7l3 3"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5z"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.4-5.7M20 4v5h-5"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15z"/><path d="M4 20.5A1.5 1.5 0 0 0 5.5 22H20M8 7.5h8"/>',
  scale: '<path d="M12 4v16M7 20h10M5 7h14M5 7l-3 6a3 3 0 0 0 6 0L5 7zM19 7l-3 6a3 3 0 0 0 6 0l-3-6z"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
  file: '<path d="M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8L14 3.5z"/><path d="M14 3.5V8h4.5M9 13h6M9 16.5h4"/>',
  database: '<ellipse cx="12" cy="6" rx="7.5" ry="2.8"/><path d="M4.5 6v12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V6M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>',
  code: '<path d="M8.5 7L3.5 12l5 5M15.5 7l5 5-5 5"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"/>',
  stock: '<path d="M6 20V9M6 9h0M10 20V5M14 20v-8M18 20v-5"/><path d="M4.5 20h15"/>',
  crypto: '<path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9L12 3z"/><path d="M9.5 8.5h3.8a1.7 1.7 0 0 1 0 3.5H9.5h4.3a1.8 1.8 0 0 1 0 3.5H9.5v-7zM11 7v1.5M11 15.5V17"/>',
  fx: '<path d="M4 8.5h13l-3.5-3.5M20 15.5H7l3.5 3.5"/>',
  hand: '<path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V11M11 10.5V5a1.5 1.5 0 0 1 3 0v6M14 10.5V6.5a1.5 1.5 0 0 1 3 0V14c0 3.6-2.4 6.5-6 6.5-2.4 0-3.6-1-5-3l-2.3-3.6a1.4 1.4 0 0 1 2.2-1.7L8 14"/>',
  paper: '<path d="M6 3.5h8.5L18 7v13.5H6z"/><path d="M14.5 3.5V7H18M9 11h6M9 14.5h6M9 18h3"/>',
  arrowr: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  send: '<path d="M5 12h13M13 6.5l5.5 5.5-5.5 5.5"/>',
  share: '<path d="M12 15V3M7 8l5-5 5 5M5 13v6.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V13"/>',
};
export const ic = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[n]}</svg>`;
const TRI_UP = '<svg class="tri" viewBox="0 0 10 10" aria-hidden="true"><path d="M5 1.2L9.3 8.6H.7z" fill="currentColor"/></svg>';
const TRI_DN = '<svg class="tri" viewBox="0 0 10 10" aria-hidden="true"><path d="M5 8.8L.7 1.4h8.6z" fill="currentColor"/></svg>';
const FLAT = '<svg class="tri" viewBox="0 0 10 10" aria-hidden="true"><path d="M1 5h8" stroke="currentColor" stroke-width="2"/></svg>';

// ---------- numbers ----------
export const MINUS = '−';
export function fmt(v, lang = 'en', dp = 2) {
  return new Intl.NumberFormat(lang === 'el' ? 'el-GR' : 'en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp, useGrouping: 'always' }).format(Math.abs(v));
}
export const signed = (v, lang, dp = 2) => (v > 0 ? '+' : v < 0 ? MINUS : '') + fmt(v, lang, dp);
// Money with sign, arrow and colour: colour is never the only signal.
export function money(v, { lang = 'en', dp = 2, arrow = true, cls = '' } = {}) {
  const tone = v > 0 ? 'gain' : v < 0 ? 'loss' : 'flat';
  const a = arrow ? (v > 0 ? TRI_UP : v < 0 ? TRI_DN : FLAT) : '';
  const word = v > 0 ? 'gain' : v < 0 ? 'loss' : 'no change';
  return `<span class="delta ${tone} ${cls}"><span class="sr">${word} </span>${a}${signed(v, lang, dp)}</span>`;
}
export const R = (v, lang = 'en') => (v == null ? '<span class="muted">R unknown</span>' : `${signed(v, lang)}R`);
export const rCls = (v) => (v == null ? 'muted' : v > 0 ? 'gain' : v < 0 ? 'loss' : 'flat');

// ---------- shell ----------
const STATUS = `<div class="statusbar" aria-hidden="true"><span>9:41</span><span class="sb-icons">
<svg viewBox="0 0 18 11"><rect x="0" y="7" width="3" height="4" rx="1"/><rect x="5" y="5" width="3" height="6" rx="1"/><rect x="10" y="2.5" width="3" height="8.5" rx="1"/><rect x="15" y="0" width="3" height="11" rx="1"/></svg>
<svg viewBox="0 0 16 11"><path d="M8 2.2c2.3 0 4.4.9 6 2.4l1.3-1.4A10.4 10.4 0 0 0 8 .2 10.4 10.4 0 0 0 .7 3.2L2 4.6a8.4 8.4 0 0 1 6-2.4zm0 3.4c1.4 0 2.6.5 3.6 1.4L13 5.6A7 7 0 0 0 8 3.6a7 7 0 0 0-5 2l1.4 1.4c1-.9 2.2-1.4 3.6-1.4zm0 3.3c.5 0 1 .2 1.3.5L8 10.8 6.7 9.4c.3-.3.8-.5 1.3-.5z"/></svg>
<svg viewBox="0 0 27 12"><rect x=".5" y=".5" width="23" height="11" rx="3" fill="none" stroke="currentColor" opacity=".45"/><rect x="2" y="2" width="17" height="8" rx="1.6"/><rect x="24.5" y="4" width="1.8" height="4" rx=".9" opacity=".45"/></svg>
</span></div>`;
const DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
<pattern id="hatch-loss" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" style="fill:var(--loss-soft)"/><line x1="0" y1="0" x2="0" y2="5" class="hatch-loss-line"/></pattern>
</defs></svg>`;

export function page({ title, lang = 'en', body, cls = 'app' }) {
  return `<!doctype html>
<html lang="${lang}" class="mock">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>${title}</title>
<link rel="icon" href="../icons/icon.svg" type="image/svg+xml">
<link rel="stylesheet" href="../tokens.css">
<link rel="stylesheet" href="../components.css">
</head>
<body>
${DEFS}
${STATUS}
<div class="${cls}">
${body}
</div>
<div class="homebar" aria-hidden="true"></div>
</body>
</html>
`;
}

const T = {
  en: { home: 'Home', journal: 'Journal', log: 'Log trade', stats: 'Stats', review: 'Review', real: 'Real', paper: 'Paper', mode: 'Mode' },
  el: { home: 'Αρχική', journal: 'Συναλλαγές', log: 'Νέα συναλλαγή', stats: 'Στατιστικά', review: 'Ανασκόπηση', real: 'Πραγματικό', paper: 'Εικονικό', mode: 'Λειτουργία' },
};
export const t = (lang, k) => T[lang][k];

export function tabbar(current, lang = 'en') {
  const tab = (id, icon) => `<a class="tab" href="#" ${current === id ? 'aria-current="page"' : ''}>${ic(icon)}<span>${t(lang, id)}</span></a>`;
  return `<nav class="tabbar" aria-label="Main">${tab('home', 'home')}${tab('journal', 'journal')}<a class="tab tab-log" href="#" aria-label="${t(lang, 'log')}"><span>${ic('plus')}</span></a>${tab('stats', 'stats')}${tab('review', 'review')}</nav>`;
}
export function modeSwitch(mode = 'real', lang = 'en') {
  return `<div class="mode-switch" role="group" aria-label="${t(lang, 'mode')}">
<button class="real" aria-pressed="${mode === 'real'}"><span class="dot"></span>${t(lang, 'real')}</button>
<button class="paper" aria-pressed="${mode === 'paper'}"><span class="dot ring"></span>${t(lang, 'paper')}</button></div>`;
}
export const badge = (mode, lang = 'en') => `<span class="badge ${mode}">${mode === 'real' ? '<span class="dot"></span>' : '<span class="dot ring"></span>'}${t(lang, mode)}</span>`;

export const MK = { stock: ['stock', 'Stock'], crypto: ['crypto', 'Crypto'], fx: ['fx', 'Forex'] };
export const mk = (m) => `<span class="mk ${m}" aria-label="${MK[m][1]}">${ic(m === 'stock' ? 'stock' : m === 'crypto' ? 'crypto' : 'fx')}</span>`;

// ---------- sample data (real mode, September 2026, USD, declared zone Europe/Athens) ----------
// One row per closed trade. Every figure a mockup shows is computed from these rows (G15); build-mockups asserts the totals.
export const START = 12500;
// day, entry, exit (Athens), instrument, market, account, setup, side, size, net USD, R (null = no stop), followed plan, pips (forex)
const ROWS = [
  [1, '11:20', '15:40', 'EUR/USD', 'fx', 'MT4 forex', 'Pullback', 'Long', '0.50 lot', 130.40, 1.63, true, 26.8],
  [1, '17:05', '20:30', 'NVDA', 'stock', 'IBKR', 'Breakout', 'Long', '30 shares', 82.00, 0.62, true],
  [2, '16:48', '21:10', 'MSFT', 'stock', 'IBKR', 'Breakout', 'Long', '25 shares', 96.10, null, false],
  [3, '18:12', '22:40', 'AAPL', 'stock', 'IBKR', 'Range fade', 'Short', '40 shares', -84.30, -0.84, true],
  [4, '04:15', '08:50', 'USD/JPY', 'fx', 'MT4 forex', null, 'Long', '0.40 lot', -27.50, -0.55, false, -9.3],
  [4, '10:30', '20:05', 'BTC/USD', 'crypto', 'Kraken', 'Breakout', 'Long', '0.08 BTC', 176.30, 1.41, true],
  [7, '14:02', '19:44', 'ETH/USD', 'crypto', 'Kraken', 'Pullback', 'Long', '0.8 ETH', 61.20, 0.49, true],
  [8, '12:30', '16:10', 'GBP/USD', 'fx', 'MT4 forex', 'Range fade', 'Short', '0.30 lot', -44.60, -0.45, true, -13.9],
  [8, '16:41', '21:55', 'AMD', 'stock', 'IBKR', 'Pullback', 'Long', '60 shares', 140.20, 1.12, true],
  [9, '17:20', '19:05', 'TSLA', 'stock', 'IBKR', 'Breakout', 'Long', '12 shares', -40.20, -0.32, true],
  [10, '15:10', '18:20', 'EUR/USD', 'fx', 'MT4 forex', 'Pullback', 'Long', '0.40 lot', 77.90, 0.78, true, 20.2],
  [11, '22:40', '23:55', 'ETH/USD', 'crypto', 'Kraken', 'Range fade', 'Short', '0.6 ETH', -12.30, null, false],
  [12, '11:05', '17:30', 'SOL/USD', 'crypto', 'Kraken', 'Breakout', 'Long', '18 SOL', 72.20, 0.60, true],
  [14, '16:35', '18:02', 'NVDA', 'stock', 'IBKR', 'Breakout', 'Long', '35 shares', -118.00, -0.98, true],
  [14, '18:30', '20:15', 'EUR/USD', 'fx', 'MT4 forex', 'Breakout', 'Long', '0.60 lot', -96.60, -0.97, true, -15.4],
  [15, '17:00', '19:30', 'AAPL', 'stock', 'IBKR', 'Pullback', 'Long', '45 shares', -112.50, -0.90, true],
  [15, '20:10', '23:40', 'BTC/USD', 'crypto', 'Kraken', 'Range fade', 'Short', '0.06 BTC', -75.80, -0.63, true],
  [16, '16:52', '22:10', 'MSFT', 'stock', 'IBKR', 'Pullback', 'Long', '20 shares', 42.10, 0.35, true],
  [17, '16:34', '17:20', 'AMD', 'stock', 'IBKR', 'Breakout', 'Long', '70 shares', -98.40, -1.23, true],
  [17, '17:45', '20:30', 'USD/JPY', 'fx', 'MT4 forex', 'Range fade', 'Short', '0.50 lot', -61.20, -0.87, false, -17.3],
  [17, '21:10', '23:30', 'ETH/USD', 'crypto', 'Kraken', 'Breakout', 'Long', '1.0 ETH', -77.30, -0.77, false],
  [18, '16:31', '16:58', 'AAPL', 'stock', 'IBKR', null, 'Long', '60 shares', -72.40, -1.81, false],
  [18, '17:20', '19:40', 'GBP/USD', 'fx', 'MT4 forex', 'Pullback', 'Long', '0.40 lot', -49.00, -0.49, true, -11.5],
  [19, '12:15', '18:40', 'BTC/USD', 'crypto', 'Kraken', 'Breakout', 'Long', '0.07 BTC', -123.20, -1.03, true],
  [21, '12:05', '16:20', 'ETH/USD', 'crypto', 'Kraken', 'Breakout', 'Long', '1.1 ETH', 275.00, 1.72, true],
  [21, '16:45', '22:40', 'AMD', 'stock', 'IBKR', 'Pullback', 'Long', '50 shares', -86.60, -1.08, false],
  [22, '16:38', '17:05', 'AMD', 'stock', 'IBKR', 'Pullback', 'Long', '60 shares', -30.00, -0.30, true],
  [22, '17:22', '21:40', 'EUR/USD', 'fx', 'MT4 forex', 'Pullback', 'Long', '1.20 lot', 172.70, 1.44, false, 15.0],
  [23, '20:15', '22:50', 'GBP/USD', 'fx', 'MT4 forex', null, 'Short', '0.30 lot', 96.30, null, false, 33.0],
  [24, '15:05', '16:40', 'SOL/USD', 'crypto', 'Kraken', 'Range fade', 'Short', '20 SOL', -40.00, -0.50, true],
  [24, '17:02', '22:30', 'TSLA', 'stock', 'IBKR', 'Breakout', 'Long', '30 shares', 250.50, 1.67, false],
  [25, '10:20', '13:05', 'ETH/USD', 'crypto', 'Kraken', 'Pullback', 'Long', '1.2 ETH', -105.40, -1.72, false],
  [25, '16:40', '22:45', 'AAPL', 'stock', 'IBKR', 'Breakout', 'Long', '80 shares', 370.20, 3.08, true],
  [26, '23:12', '23:58', 'ETH/USD', 'crypto', 'Kraken', 'Breakout', 'Long', '1.2 ETH', 98.20, 1.36, false],
  [28, '11:05', '16:20', 'EUR/USD', 'fx', 'MT4 forex', 'Breakout', 'Long', '1.00 lot', 326.12, 1.09, true, 33.0],
  [28, '17:41', '21:05', 'NVDA', 'stock', 'IBKR', 'Range fade', 'Short', '20 shares', 120.00, 2.00, true],
  [28, '13:30', '22:15', 'BTC/USD', 'crypto', 'Kraken', 'Pullback', 'Long', '0.05 BTC', 169.98, 2.79, true],
  [29, '17:05', '19:02', 'AAPL', 'stock', 'IBKR', 'Breakout', 'Long', '50 shares', -117.50, -0.94, true],
];
const cents = (v) => Math.round(v * 100);
const mins = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const weekday = (d) => WD[(d + 0) % 7]; // 1 Sep 2026 is a Tuesday: day 1 -> index 1
export const TRADES = ROWS.map(([day, entry, exit, sym, m, acct, setup, side, size, net, r, followed, pips], i) => ({
  id: i + 1, day, entry, exit, sym, m, acct, setup, side, size, net, r, followed, pips: pips ?? null,
  hour: Number(entry.slice(0, 2)), wd: weekday(day), hold: mins(exit) - mins(entry),
})).sort((a, b) => a.day - b.day || mins(a.exit) - mins(b.exit));

// Forex session of the entry, per architecture §3.2 S12 (Athens is UTC+3, London UTC+1, New York UTC-4 in September)
function session(t) {
  if (t.m === 'crypto') return 'No session (crypto)';
  const a = mins(t.entry);
  if (t.m === 'stock') return a >= mins('16:30') && a < mins('23:00') ? 'US regular' : 'US outside regular';
  const lon = a >= mins('10:00') && a < mins('19:00');
  const ny = a >= mins('15:00') || a < mins('00:00');
  if (lon && a >= mins('15:00')) return 'London and New York';
  if (lon) return 'London';
  if (ny) return 'New York';
  if (a >= mins('03:00') && a < mins('12:00')) return 'Tokyo';
  return 'Sydney';
}
const SESSION_ORDER = ['London and New York', 'London', 'New York', 'Tokyo', 'Sydney', 'US regular', 'US outside regular', 'No session (crypto)'];

const r2 = (v) => Math.round(v * 100) / 100;
function summarise(ts) {
  const n = ts.length;
  const net = ts.reduce((s, t) => s + cents(t.net), 0) / 100;
  const wins = ts.filter((t) => t.net > 0), losses = ts.filter((t) => t.net < 0);
  const rk = ts.filter((t) => t.r != null);
  const sumR = r2(rk.reduce((s, t) => s + t.r, 0));
  const winsR = rk.filter((t) => t.r > 0), lossR = rk.filter((t) => t.r < 0);
  return {
    n, net, wins: wins.length, losses: losses.length, even: n - wins.length - losses.length,
    winRate: n ? (wins.length / n) * 100 : 0, rk: rk.length, sumR, expR: rk.length ? sumR / rk.length : null,
    expCur: n ? net / n : 0,
    avgWin: wins.length ? wins.reduce((s, t) => s + t.net, 0) / wins.length : 0,
    avgLoss: losses.length ? -losses.reduce((s, t) => s + t.net, 0) / losses.length : 0,
    avgWinR: winsR.length ? winsR.reduce((s, t) => s + t.r, 0) / winsR.length : 0,
    avgLossR: lossR.length ? -lossR.reduce((s, t) => s + t.r, 0) / lossR.length : 0,
    winRShare: rk.length ? (winsR.length / rk.length) * 100 : 0,
    pf: losses.length ? wins.reduce((s, t) => s + t.net, 0) / -losses.reduce((s, t) => s + t.net, 0) : null,
    ids: ts.map((t) => t.id),
  };
}
function group(key, order) {
  const keys = order ?? [...new Set(TRADES.map(key))].sort((a, b) => (a === null) - (b === null) || String(a).localeCompare(String(b)));
  return keys.filter((k) => TRADES.some((t) => key(t) === k)).map((k) => ({ key: k ?? 'No setup', ...summarise(TRADES.filter((t) => key(t) === k)) }));
}
function streaks() {
  let w = 0, l = 0, bw = 0, bl = 0;
  for (const t of TRADES) { if (t.net > 0) { w += 1; l = 0; } else if (t.net < 0) { l += 1; w = 0; } bw = Math.max(bw, w); bl = Math.max(bl, l); }
  return { wins: bw, losses: bl };
}
const avgMin = (ts) => ts.reduce((s, t) => s + t.hold, 0) / ts.length;
export const S = {
  ...summarise(TRADES),
  setups: group((t) => t.setup),
  markets: group((t) => ({ stock: 'Stocks', crypto: 'Crypto', fx: 'Forex' })[t.m]),
  accounts: group((t) => t.acct),
  weekdays: group((t) => t.wd, WD),
  hours: group((t) => t.hour, Array.from({ length: 24 }, (_, i) => i)),
  sessions: group(session, SESSION_ORDER),
  streaks: streaks(),
  followed: summarise(TRADES.filter((t) => t.followed)),
  offPlan: summarise(TRADES.filter((t) => !t.followed)),
  holdWin: avgMin(TRADES.filter((t) => t.net > 0)), holdLoss: avgMin(TRADES.filter((t) => t.net < 0)),
  pips: ['EUR/USD', 'GBP/USD', 'USD/JPY'].map((p) => ({ pair: p, n: TRADES.filter((t) => t.sym === p).length, pips: r2(TRADES.filter((t) => t.sym === p).reduce((s, t) => s + t.pips, 0)) })),
};
export const week = (a, b) => TRADES.filter((t) => t.day >= a && t.day <= b);
export const summary = summarise;

// Day totals (calendar) and counts, derived from the rows
export const DAYS = [...new Set(TRADES.map((t) => t.day))].map((d) => [d, TRADES.filter((t) => t.day === d).reduce((s, t) => s + cents(t.net), 0) / 100, TRADES.filter((t) => t.day === d).length]);
export const MONTH_TOTAL = S.net;
export const N_CLOSED = S.n;
// One equity point per closed trade, in close order (S10)
export function equityPoints() {
  const pts = [{ v: START, day: 1 }];
  let eq = cents(START);
  for (const t of TRADES) { eq += cents(t.net); pts.push({ v: eq / 100, day: t.day }); }
  return pts;
}

// Cash movements of the real accounts in September (day, amount): the same rows as the `cash` mockup.
export const CASH = [[3, 500], [12, 250], [20, -300]];
// S11 (architecture §3.2): amounts and dates from the trades-only curve; percents divide by equity including
// deposits and withdrawals from the curve start up to that point, E(t).
export function ddStats(pts, cash = CASH) {
  const E = (p) => p.v + cash.filter(([d]) => d <= p.day).reduce((s, [, a]) => s + a, 0);
  let peak = pts[0], best = { dd: 0 };
  for (const p of pts) {
    if (p.v > peak.v) peak = p;
    const dd = p.v - peak.v;
    if (dd < best.dd) best = { dd, peak, trough: p };
  }
  const last = pts[pts.length - 1];
  const maxPeak = pts.reduce((a, b) => (b.v > a.v ? b : a));
  const rec = pts.find((p) => p.day > best.trough.day && p.v >= best.peak.v);
  const current = last.v - maxPeak.v;
  return {
    dd: best.dd, peak: best.peak, trough: best.trough, recovery: rec, current, last,
    ePeak: E(best.peak), eTrough: E(best.trough),
    pct: (best.dd / E(best.peak)) * 100, recoveryGain: (-best.dd / E(best.trough)) * 100, currentPct: (current / E(maxPeak)) * 100,
    includesCash: cash.some(([d]) => d >= pts[0].day && d <= last.day),
  };
}
// R distribution in 0.5R bins, from the trades with a known R
const BIN_EDGES = [-Infinity, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5, 3, Infinity];
export const RBINS = BIN_EDGES.slice(0, -1).map((lo, i) => [lo, BIN_EDGES[i + 1], TRADES.filter((t) => t.r != null && t.r >= lo && t.r < BIN_EDGES[i + 1]).length, i < 4 ? -1 : 1]);

// ---------- charts (viewBox width 296 = content width at 360 px, so text never renders below 11 px) ----------
const W = 296;
const kfmt = (v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`);

const niceStep = (range) => [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000].find((st) => range / st <= 3) ?? 10000;
export function equityChart(pts, { h = 120, marks = false, lang = 'en', noX = false, xl = [[1, '1 Sep'], [8, '8'], [15, '15'], [22, '22'], [29, '29']] } = {}) {
  const pw = W - 42, top = 14, ph = h - top - (noX ? 4 : 18);
  const vs = pts.map((p) => p.v);
  const step = niceStep(Math.max(...vs) - Math.min(...vs));
  const lo = Math.floor(Math.min(...vs) / step) * step, hi = Math.ceil(Math.max(...vs) / step) * step;
  const x = (i) => (i / (pts.length - 1)) * pw;
  const y = (v) => top + ph - ((v - lo) / (hi - lo)) * ph;
  const lbl = (v) => (step >= 100 ? kfmt(v) : fmt(v, lang, 0)).replace('.', lang === 'el' ? ',' : '.');
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  let g = '';
  for (let v = lo; v <= hi + 1e-9; v += step) g += `<line class="grid" x1="0" x2="${W}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text x="${W}" y="${(y(v) - 4).toFixed(1)}" text-anchor="end">${lbl(v)}</text>`;
  let xs = '';
  if (!noX) for (const [d, l] of xl) {
    const i = Math.max(0, pts.findIndex((p) => p.day >= d));
    xs += `<text x="${x(i).toFixed(1)}" y="${h - 2}" text-anchor="${i === 0 ? 'start' : 'middle'}">${l}</text>`;
  }
  let m = '';
  if (marks) {
    const s = ddStats(pts);
    const pi = pts.indexOf(s.peak), ti = pts.indexOf(s.trough);
    m = `<rect class="band" x="${x(pi).toFixed(1)}" y="${top}" width="${(x(ti) - x(pi)).toFixed(1)}" height="${ph}"/>
<line class="ddmark" x1="${x(ti).toFixed(1)}" x2="${x(ti).toFixed(1)}" y1="${y(s.peak.v).toFixed(1)}" y2="${y(s.trough.v).toFixed(1)}"/>
<circle class="peak" cx="${x(pi).toFixed(1)}" cy="${y(s.peak.v).toFixed(1)}" r="3.5"/><circle class="peak" style="stroke:var(--chart-dd)" cx="${x(ti).toFixed(1)}" cy="${y(s.trough.v).toFixed(1)}" r="3.5"/>
<text class="lbl-loss" x="${((x(pi) + x(ti)) / 2).toFixed(1)}" y="${top + 12}" text-anchor="middle">${MINUS}${fmt(-s.pct, lang, 1)}%</text>`;
  }
  const last = pts.length - 1;
  return `<svg class="chart" viewBox="0 0 ${W} ${h}" role="img" aria-label="Equity curve, one point per closed trade">
${g}<path class="eq-fill" d="${line}L${x(last).toFixed(1)},${top + ph}L0,${top + ph}Z"/>${m}<path class="eq" d="${line}"/>
<circle cx="${x(last).toFixed(1)}" cy="${y(pts[last].v).toFixed(1)}" r="4" style="fill:var(--chart-equity);stroke:var(--surface);stroke-width:2"/>${xs}</svg>`;
}

export function drawdownChart(pts, { h = 78, lang = 'en' } = {}) {
  const pw = W - 42, ph = h - 18;
  let peak = -Infinity;
  const dd = pts.map((p) => { peak = Math.max(peak, p.v); return p.v - peak; });
  const lo = Math.floor(Math.min(...dd) / 500) * 500;
  const x = (i) => (i / (pts.length - 1)) * pw;
  const y = (v) => (v / lo) * ph;
  const area = `M0,0${dd.map((v, i) => `L${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')}L${pw},0Z`;
  let g = '';
  for (let v = 0; v >= lo; v -= 500) g += `<line class="${v ? 'grid' : 'zero'}" x1="0" x2="${pw}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text x="${W}" y="${(y(v) + (v ? -4 : 12)).toFixed(1)}" text-anchor="end">${v ? MINUS + fmt(v, lang, 0) : '0'}</text>`;
  const ti = dd.indexOf(Math.min(...dd));
  return `<svg class="chart" viewBox="0 0 ${W} ${h}" role="img" aria-label="Drawdown from the running peak">
${g}<path class="dd" d="${area}"/><text class="lbl-loss" x="${(x(ti) + 8).toFixed(1)}" y="${(y(dd[ti]) + 2).toFixed(1)}">${MINUS}${fmt(dd[ti], lang)}</text>
<text x="0" y="${h - 2}">1 Sep</text><text x="${pw}" y="${h - 2}" text-anchor="end">29</text></svg>`;
}

export function rHistogram({ h = 146, mean = S.expR, lang = 'en' } = {}) {
  const pw = W, top = 34, ph = h - top - 22;
  const max = Math.max(...RBINS.map((b) => b[2]));
  const bw = pw / RBINS.length;
  const xr = (r) => ((r + 2) / 5.5) * pw; // -2 .. 3.5
  const mx = xr(mean);
  let bars = '', counts = '';
  RBINS.forEach(([, , n, sign], i) => {
    const bh = (n / max) * ph;
    bars += `<rect class="${sign < 0 ? 'lossbar' : 'gainbar'}" x="${(i * bw + 2).toFixed(1)}" y="${(top + ph - bh).toFixed(1)}" width="${(bw - 4).toFixed(1)}" height="${bh.toFixed(1)}" rx="2"/>`;
    counts += `<text class="halo" x="${(i * bw + bw / 2).toFixed(1)}" y="${(top + ph - bh - 4).toFixed(1)}" text-anchor="middle">${n}</text>`;
  });
  let xs = '';
  for (const r of [-2, -1, 0, 1, 2, 3]) xs += `<text x="${xr(r).toFixed(1)}" y="${h - 2}" text-anchor="${r === -2 ? 'start' : 'middle'}">${r > 0 ? '+' : r < 0 ? MINUS : ''}${Math.abs(r)}R</text>`;
  // The average label sits in its own top row; counts carry a surface-coloured halo so the dashed line never runs through a digit.
  return `<svg class="chart" viewBox="0 0 ${W} ${h}" role="img" aria-label="Distribution of R-multiples">
<line class="zero" x1="${xr(0)}" x2="${xr(0)}" y1="${top - 4}" y2="${top + ph}"/>${bars}
<line x1="0" x2="${pw}" y1="${top + ph}" y2="${top + ph}" class="zero"/>
${counts}<line x1="${mx.toFixed(1)}" x2="${mx.toFixed(1)}" y1="14" y2="${top - 8}" style="stroke:var(--chart-equity);stroke-width:1.6"/><path d="M${(mx - 4).toFixed(1)},${top - 9}L${(mx + 4).toFixed(1)},${top - 9}L${mx.toFixed(1)},${top - 3}Z" style="fill:var(--chart-equity)"/><path d="M${(mx - 4).toFixed(1)},${top + ph + 7}L${(mx + 4).toFixed(1)},${top + ph + 7}L${mx.toFixed(1)},${top + ph + 1}Z" style="fill:var(--chart-equity)"/>
<text class="hl" x="${(mx + 5).toFixed(1)}" y="11" style="fill:var(--chart-equity)">average ${signed(mean, lang)}R</text>${xs}</svg>`;
}

export function calendar({ lang = 'en', sel = 28 } = {}) {
  const map = Object.fromEntries(DAYS.map((d) => [d[0], d[1]]));
  const head = (lang === 'el' ? ['Δε', 'Τρ', 'Τε', 'Πε', 'Πα', 'Σα', 'Κυ', 'Εβδ.'] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Week']).map((h) => `<div class="h">${h}</div>`).join('');
  const lvl = (v) => { const a = Math.abs(v); const k = a < 90 ? 1 : a < 200 ? 2 : 3; return (v > 0 ? 'g' : 'l') + k; };
  const short = (v) => (Math.abs(v) >= 1000 ? `${v > 0 ? '+' : MINUS}${(Math.abs(v) / 1000).toFixed(1)}k` : `${v > 0 ? '+' : MINUS}${Math.round(Math.abs(v))}`);
  let cells = '';
  let day = 1 - 1; // Mon 31 Aug is the first cell
  for (let w = 0; w < 5; w += 1) {
    let wk = 0;
    for (let c = 0; c < 7; c += 1) {
      const d = day + w * 7 + c;
      if (d < 1 || d > 30) { cells += `<div class="c out"><span class="dn">${d < 1 ? 31 : d - 30}</span></div>`; continue; }
      const v = map[d];
      if (v == null) { cells += `<div class="c none${d === 29 ? ' today' : ''}"><span class="dn">${d}</span></div>`; continue; }
      wk += cents(v);
      cells += `<div class="c ${lvl(v)}${d === sel ? ' sel' : ''}${d === 29 ? ' today' : ''}"><span class="dn">${d}</span><span class="pv">${short(v)}</span></div>`;
    }
    const wv = wk / 100;
    cells += `<div class="wk ${wv > 0 ? 'gain' : 'loss'}">${short(wv)}</div>`;
  }
  return `<div class="cal" role="grid" aria-label="September 2026 by day">${head}${cells}</div>`;
}

export function candleShot() {
  // A user's own chart screenshot, drawn as an SVG placeholder.
  const c = [[40, 44, 36, 42], [42, 47, 41, 46], [46, 48, 40, 41], [41, 43, 34, 35], [35, 38, 30, 31], [31, 36, 29, 34], [34, 35, 26, 27], [27, 30, 24, 29], [29, 33, 28, 32], [32, 33, 22, 23], [23, 26, 20, 21], [21, 25, 19, 24]];
  let s = '';
  c.forEach(([o, hi, lo, cl], i) => {
    const x = 18 + i * 22, up = cl < o;
    s += `<line x1="${x}" x2="${x}" y1="${hi * 2}" y2="${lo * 2}" stroke="${up ? '#13a06d' : '#d9434f'}" stroke-width="1.2"/><rect x="${x - 6}" y="${Math.min(o, cl) * 2}" width="12" height="${Math.max(2, Math.abs(o - cl) * 2)}" fill="${up ? '#13a06d' : '#d9434f'}" rx="1"/>`;
  });
  return `<svg viewBox="0 0 296 120" style="display:block;width:100%;height:auto;background:#101418" role="img" aria-label="Screenshot of the trade chart">
<g transform="translate(0,-30) scale(1,1)">${s}</g>
<line x1="0" x2="296" y1="28" y2="28" stroke="#d9434f" stroke-dasharray="4 3" stroke-width="1"/><text x="292" y="24" text-anchor="end" fill="#e8a2a8" font-size="11" font-family="-apple-system,sans-serif">stop 121.20</text>
<line x1="0" x2="296" y1="46" y2="46" stroke="#7d9bff" stroke-dasharray="4 3" stroke-width="1"/><text x="292" y="58" text-anchor="end" fill="#a9bcff" font-size="11" font-family="-apple-system,sans-serif">entry 118.20</text></svg>`;
}
