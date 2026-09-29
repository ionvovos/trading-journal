// Journal (#/journal, design/mockups journal): what needs the person first (held-out trades, open trades, trades with no stop),
// then closed trades by day with net money and R. Filters: account, market, setup, result, plan. Money and R come from src/stats.
import { el, mount } from '../dom.js';
import { t } from '../../i18n/i18n.js';
import { loadModel, statsCtxFor } from '../../storage/model.js';
import { loadStats, sectionHead, sizeText, sideText, groupByDay, dayLabel, toDisplayMinor, pickSheet } from '../../storage/viewkit.js';
import { tradeStatus } from '../../core/trade.js';

const RESULTS = ['win', 'loss', 'even'];
const PLAN = ['followed', 'off', 'unmarked'];

// Pure: which trades a set of filters keeps. `netOf(trade)` gives net minor or null.
export function applyFilters(trades, f, netOf) {
  return trades.filter((tr) => {
    if (f.account !== 'all' && tr.accountId !== f.account) return false;
    if (f.market !== 'all' && tr.market !== f.market) return false;
    if (f.setup !== 'all' && (f.setup === '' ? tr.setup : tr.setup !== f.setup)) return false;
    if (f.result !== 'all') {
      const n = netOf(tr);
      if (n === null || n === undefined) return false;
      if (f.result === 'win' && !(n > 0)) return false;
      if (f.result === 'loss' && !(n < 0)) return false;
      if (f.result === 'even' && n !== 0) return false;
    }
    if (f.plan !== 'all') {
      const followed = tr.plan?.followed;
      if (f.plan === 'followed' && followed !== true) return false;
      if (f.plan === 'off' && followed !== false) return false;
      if (f.plan === 'unmarked' && (followed === true || followed === false)) return false;
    }
    return true;
  });
}

// Pure: the "needs you" groups. held by import, open trades, closed or open trades with no stop (grouped by import).
export function needsYou(trades, accountsById) {
  const held = trades.filter((tr) => tradeStatus(tr) === 'held' && !tr.excluded);
  const open = trades.filter((tr) => tradeStatus(tr) === 'open');
  const noStop = trades.filter((tr) => tradeStatus(tr) !== 'held' && !tr.excluded && !tr.initialStop);
  const groups = new Map();
  for (const tr of noStop) {
    const k = tr.importId || `manual:${tr.accountId}`;
    if (!groups.has(k)) groups.set(k, { key: k, importId: tr.importId, accountId: tr.accountId, trades: [] });
    groups.get(k).trades.push(tr);
  }
  return { held, open, noStop: [...groups.values()].filter((g) => g.trades.length > 0), accountsById };
}

export async function render(root, ctx) {
  const stats = await loadStats().catch(() => null);
  let disposed = false;
  const f = { account: ctx.accountFilter === 'all' ? 'all' : ctx.accountFilter, market: 'all', setup: 'all', result: 'all', plan: 'all' };

  async function paint() {
    const model = await loadModel(ctx.store);
    if (disposed) return;
    const { fmt, ui } = ctx;
    const accounts = new Map(model.accounts.map((a) => [a.id, a]));
    const mine = model.trades.filter((tr) => tr.mode === ctx.mode);
    const sctx = statsCtxFor(ctx, model, { accountIds: 'all' });
    const displayCcy = ctx.displayCurrency();
    const netCache = new Map();
    const netOf = (tr) => {
      if (!netCache.has(tr.id)) {
        let net = null;
        try { net = stats ? (tr.entryUnknown ? tr.broker?.netMinor : stats.tradeMoney(tr, sctx)?.netMinor) ?? null : null; } catch { net = null; }
        netCache.set(tr.id, net === null ? null : toDisplayMinor(net, accounts.get(tr.accountId), displayCcy));
      }
      return netCache.get(tr.id);
    };
    const shown = applyFilters(mine, f, netOf);
    const need = needsYou(shown, accounts);
    const closed = shown.filter((tr) => tradeStatus(tr) === 'closed' && !tr.excluded);
    const excluded = shown.filter((tr) => tr.excluded);

    const chip = (key, label, on, open) => el('button', { type: 'button', class: 'chip', 'aria-pressed': String(on), onClick: open }, label, ui.icon('down', 'sm'));
    const setups = [...new Set(mine.map((x) => x.setup).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const choose = async (title, key, options) => { const v = await pickSheet(ctx, { title, value: f[key], options }); if (v !== undefined) { f[key] = v; paint(); } };
    const chips = el('div', { class: 'chips', role: 'toolbar', 'aria-label': t('journal.filters') },
      chip('account', f.account === 'all' ? t('journal.f.accounts') : accounts.get(f.account)?.name ?? '', f.account !== 'all', () => choose(t('journal.f.accounts'), 'account', [{ value: 'all', label: t('journal.f.accounts') }, ...model.accounts.filter((a) => a.mode === ctx.mode).map((a) => ({ value: a.id, label: a.name }))])),
      chip('market', f.market === 'all' ? t('journal.f.markets') : t(`market.${f.market}`), f.market !== 'all', () => choose(t('journal.f.markets'), 'market', [{ value: 'all', label: t('journal.f.markets') }, ...['stock', 'crypto', 'forex'].map((m) => ({ value: m, label: t(`market.${m}`) }))])),
      chip('setup', f.setup === 'all' ? t('journal.f.setup') : f.setup === '' ? t('journal.noSetup') : f.setup, f.setup !== 'all', () => choose(t('journal.f.setup'), 'setup', [{ value: 'all', label: t('journal.f.setupAll') }, ...setups.map((s) => ({ value: s, label: s })), { value: '', label: t('journal.noSetup') }])),
      chip('result', f.result === 'all' ? t('journal.f.result') : t(`journal.result.${f.result}`), f.result !== 'all', () => choose(t('journal.f.result'), 'result', [{ value: 'all', label: t('journal.f.resultAll') }, ...RESULTS.map((r) => ({ value: r, label: t(`journal.result.${r}`) }))])),
      chip('plan', f.plan === 'all' ? t('journal.f.plan') : t(`journal.plan.${f.plan}`), f.plan !== 'all', () => choose(t('journal.f.plan'), 'plan', [{ value: 'all', label: t('journal.f.planAll') }, ...PLAN.map((p) => ({ value: p, label: t(`journal.plan.${p}`) }))])));

    const linkBtn = (label, href) => el('a', { class: 'link accent-link', href }, label);
    const needRows = [];
    for (const tr of need.held) {
      needRows.push(ui.listRow({ market: tr.market, title: tr.instrument, tags: [el('span', { class: 'tag warn' }, t('journal.heldOut'))], meta: `${sideText(tr)} ${sizeText(tr, fmt)} · ${t(`journal.hold.${tr.holds[0]}`)}`, held: true, href: tr.importId ? `#/import/${tr.importId}` : `#/trade/${tr.id}`, trailing: linkBtn(t('journal.answer'), tr.importId ? `#/import/${tr.importId}` : `#/trade/${tr.id}`) }));
    }
    for (const tr of need.open) {
      needRows.push(ui.listRow({ market: tr.market, title: tr.instrument, tags: [el('span', { class: 'tag' }, t('journal.open'))], meta: [`${sideText(tr)} ${sizeText(tr, fmt)}`, tr.setup].filter(Boolean).join(' · '), href: `#/trade/${tr.id}`, trailing: linkBtn(t('journal.addExit'), `#/trade/${tr.id}`) }));
    }
    for (const g of need.noStop) {
      const acct = accounts.get(g.accountId);
      needRows.push(ui.listRow({ market: g.trades[0].market, title: t('journal.noStopCount', { n: g.trades.length }), tags: [el('span', { class: 'tag warn' }, t('journal.noStop'))], meta: g.importId ? t('journal.fromImport', { account: acct?.name ?? '' }) : t('journal.rUnknown'), href: '#/stops', trailing: linkBtn(t('journal.addStops'), '#/stops') }));
    }

    const days = groupByDay(closed, ctx);
    const rowFor = (tr) => {
      const net = netOf(tr);
      const r = stats && !tr.entryUnknown ? stats.rMultiple(tr) : null;
      const pips = stats && tr.market === 'forex' ? stats.pips?.(tr) : null;
      const bits = [`${sideText(tr)} ${sizeText(tr, fmt)}`, pips ? t('journal.pips', { n: fmt.pips(pips.resultPips) }) : null, tr.setup, tr.stopSource === 'file_at_close' ? null : null, fmt.time(tr.closeTime)].filter(Boolean);
      const tags = [tr.plan?.followed === false ? el('span', { class: 'tag off' }, t('journal.offPlan')) : null, tr.excluded ? el('span', { class: 'tag' }, t('journal.excluded')) : null].filter(Boolean);
      return ui.listRow({ market: tr.market, title: tr.instrument, tags, meta: bits.join(' · '), money: net === null ? null : { text: fmt.money(net, displayCcy), value: net }, r: r === null || r === undefined ? null : fmt.r(r), rTone: r ? (r > 0 ? 'gain' : r < 0 ? 'loss' : 'flat') : 'muted', paper: ctx.mode === 'paper', href: `#/trade/${tr.id}` });
    };
    const dayBlocks = days.flatMap((d) => {
      const total = d.trades.reduce((s, x) => s + (netOf(x) ?? 0), 0);
      return [el('div', { class: 'day-h' }, el('span', null, dayLabel(d.date, ctx)), el('span', { class: 'num' }, ui.delta(fmt.money(total, displayCcy), total > 0 ? 'gain' : total < 0 ? 'loss' : 'flat'))), el('div', { class: 'list' }, ...d.trades.map(rowFor))];
    });

    const bar = ui.topbar({ mode: ctx.mode, paper: ctx.mode === 'paper', title: t('nav.journal'), left: ui.modeSwitch({ mode: ctx.mode, onChange: (m) => ctx.setMode(m) }),
      right: el('div', { class: 'top-actions' }, ui.iconButton({ iconName: 'import', label: t('journal.import'), onClick: () => ctx.navigate('#/import') })) });
    mount(root, bar, el('main', { class: 'content' },
      chips,
      needRows.length ? [sectionHead(t('journal.needsYou'), null), el('div', { class: 'list' }, ...needRows)] : null,
      dayBlocks.length ? dayBlocks : (needRows.length ? null : ui.emptyState({ iconName: 'journal', title: mine.length ? t('journal.noMatch.title') : t('journal.empty.title'), body: mine.length ? t('journal.noMatch.body') : t('journal.empty.body'),
        children: mine.length ? [] : [el('div', { class: 'action-stack' }, ui.button({ label: t('journal.empty.log'), size: 'lg', block: true, onClick: () => ctx.navigate('#/trade/new') }), ui.button({ label: t('journal.empty.import'), kind: 'plain', block: true, onClick: () => ctx.navigate('#/import') }))] })),
      excluded.length ? el('p', { class: 'caption center-note' }, t('journal.excludedNote', { n: excluded.length })) : null));
  }
  await paint();
  const offA = ctx.bus.on('trades-changed', paint);
  const offB = ctx.bus.on('account-filter-changed', paint);
  return () => { disposed = true; offA(); offB(); };
}
