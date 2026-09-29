// Shared helpers of the data views (journal, trade, stats, import ...). They build DOM through S1's `el` and `ctx.ui`,
// so nothing here touches innerHTML: user text reaches the page as text nodes only.
import { el, mount } from '../ui/dom.js';
import { t } from '../i18n/i18n.js';
import { minorDigits, roundMinor } from '../core/money.js';
import { localParts } from '../core/time.js';
import * as D from '../core/decimal.js';
import { sumSize, tradeStatus } from '../core/trade.js';

let statsPromise = null;
// The statistics engine (src/stats, pure). Loaded on first use so a view that only lists rows starts fast.
export const loadStats = () => (statsPromise ||= import('../stats/index.js'));

export const nowIso = () => new Date().toISOString();

export function detailBar(ctx, { title, backHash, backLabel, right } = {}) {
  return ctx.ui.topbar({
    mode: ctx.mode, paper: ctx.mode === 'paper', title,
    back: { label: backLabel ?? t('data.back'), onClick: () => ctx.navigate(backHash ?? '#/home') },
    right,
  });
}

export const sectionHead = (title, link) => el('div', { class: 'section-h' }, el('h2', null, title), link ? el('a', { href: link.href }, link.text) : null);

// Display-currency minor units of a base-currency trade amount (each rounded trade value converts once, architecture 3.1).
export function toDisplayMinor(netMinor, account, displayCcy) {
  if (netMinor === null || netMinor === undefined) return null;
  if (!account || account.baseCurrency === displayCcy) return netMinor;
  const major = netMinor / 10 ** minorDigits(account.baseCurrency);
  return roundMinor(major * (account.toDisplayRate ?? 1), minorDigits(displayCcy));
}

// "50 shares", "0.05 BTC", "1.00 lots" from the entry size of a trade.
export function sizeText(trade, fmt) {
  const size = sumSize(trade.legs, 'entry');
  const n = D.toNumber(size);
  if (trade.market === 'forex') return t('unit.lots', { n: fmt.num(n, n % 1 ? 2 : 2) });
  if (trade.market === 'crypto') return `${fmt.num(n, Math.min(8, Math.max(0, D.decimalsOf(size))))} ${trade.instrument.split(/[/-]/)[0]}`;
  return t('unit.shares', { n });
}

export const sideText = (trade) => t(`label.side.${trade.side}`);

export function closeDay(trade, ctx) {
  const t0 = trade.closeTime;
  if (!t0) return null;
  return trade.closeDayOverride || localParts(t0, ctx.tz, Number(ctx.settings.get('dayCutoffHour') || 0)).date;
}

// Group closed trades by close day, newest first: [{ date, trades }].
export function groupByDay(trades, ctx) {
  const days = new Map();
  for (const tr of trades) {
    const d = closeDay(tr, ctx);
    if (!d) continue;
    if (!days.has(d)) days.set(d, []);
    days.get(d).push(tr);
  }
  return [...days.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([date, list]) => ({ date, trades: list.sort((a, b) => (a.closeTime < b.closeTime ? 1 : -1)) }));
}

export function dayLabel(date, ctx) {
  const iso = `${date}T12:00:00Z`;
  const wd = new Date(iso).getUTCDay();
  const names = ctx.lang === 'el' ? ['Κυρ', 'Δευ', 'Τρί', 'Τετ', 'Πέμ', 'Παρ', 'Σάβ'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const p = ctx.fmt.parts(iso, 'UTC');
  return `${names[wd]} ${ctx.fmt.date(iso, { zone: 'UTC' })}${p.y !== new Date().getUTCFullYear() ? ` ${p.y}` : ''}`;
}

// Bottom sheet listing choices; resolves with the chosen value or undefined when closed.
export function pickSheet(ctx, { title, options, value }) {
  return new Promise((resolve) => {
    let handle = null;
    const list = el('div', { class: 'choice-list' }, ...options.map((o) => el('button', {
      type: 'button', class: 'choice', 'aria-pressed': String(o.value === value), onClick: () => { handle.close(); resolve(o.value); },
    }, el('span', { class: 'lbl' }, o.label), o.hint ? el('span', { class: 'caption' }, o.hint) : null)));
    handle = ctx.ui.sheet({ title, body: list, onClose: () => resolve(undefined) });
  });
}

// A confirm sheet: resolves true when the main action is taken.
export function confirmSheet(ctx, { title, body, confirmLabel, danger = false, requireWord = null }) {
  return new Promise((resolve) => {
    let done = false;
    let handle = null;
    const finish = (v) => { if (done) return; done = true; handle?.close(); resolve(v); };
    let typed = '';
    const go = ctx.ui.button({ label: confirmLabel, kind: danger ? 'danger' : 'primary', size: 'lg', block: true, disabled: Boolean(requireWord), onClick: () => finish(true) });
    const parts = [el('p', { class: 'sub' }, body)];
    if (requireWord) {
      const input = ctx.ui.field({
        label: t('data.delete.typeLabel', { word: requireWord }), onInput: (v) => { typed = v.trim(); go.disabled = typed !== requireWord; },
      });
      parts.push(input);
    }
    handle = ctx.ui.sheet({ title, body: el('div', { class: 'vstack' }, ...parts), footer: go, onClose: () => { if (!done) { done = true; resolve(false); } } });
  });
}

export function downloadText(name, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return { size: blob.size };
}

export const byteText = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`);

// Status of a trade for the journal: held / open / closed, and whether R can be known (a stop is set).
export const statusOf = tradeStatus;

// A page body: replaces the children of the view root with a top bar and a content column.
export function page(root, bar, ...content) {
  mount(root, bar, el('main', { class: 'content' }, ...content));
}

export function toastMsg(ctx, text, iconName = 'check') {
  try { ctx.ui.toast({ text, iconName }); } catch { /* the toast host is missing in a test mount */ }
}
