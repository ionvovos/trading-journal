// Home: the dashboard (design/mockups dashboard, dashboard-paper, dashboard-el, empty, loading, offline).
// Real mode: broker-check banner, net P&L, equity curve, expectancy, win rate, max drawdown, broker check per account and period
// (PICK K3: "not reconciled" stays visible until answered or skipped), recent trades. Paper mode: no broker check (AC-P4.4),
// small-sample note, followed plan, paper trades. No trades: what to do next, never an empty chart (AC-U1.2).
//
// Data comes from ctx.data.getSummary(ctx) (S2). Fields read (all optional, an absent one shows an en dash, never a guess):
//   netMinor, currency, closed, periodLabel, curve (array of { t, v } or { points: [{ t, equityMinor }] }),
//   expectancy { r: { value, n, rMissing } }, winRate { value 0..1, wins, n }, drawdown { maxMinor, maxPct 0..1, peakIndex, troughIndex },
//   followed { followed, marked }, counts { open, heldOut, excluded },
//   reconcileStates [{ accountId, accountName, period: { label }, state, differenceMinor, toleranceMinor, explainCount }],
//   recent [{ id, market, instrument, side, sizeText, setup, closeTime, netMinor, r, pips }].
import { el, mount } from '../dom.js';
import { t } from '../../i18n/i18n.js';
import { toneOf } from '../components/figure.js';

const DASH = '–';
const isReal = (mode) => mode === 'real';

// Pure: turns whatever getSummary returned into exactly what the screen needs. Tested without a DOM.
export function buildHomeModel(summary, { mode, fmt, ccy, now = new Date() }) {
  const s = summary ?? {};
  const currency = s.currency ?? ccy;
  const digits = fmt.minorDigits(currency);
  const rawCurve = Array.isArray(s.curve) ? s.curve : s.curve?.points ?? [];
  const points = rawCurve.map((p) => ({ t: p.t, v: p.v ?? (p.equityMinor ?? 0) / 10 ** digits }));
  const closed = s.closed ?? s.counts?.closed ?? s.winRate?.n ?? Math.max(0, points.length - 1);
  const dd = s.drawdown ?? null;
  const ddFraction = dd?.maxPct ?? null;
  const exp = s.expectancy?.r ?? null;
  const win = s.winRate ?? null;
  const counts = s.counts ?? {};
  const states = (s.reconcileStates ?? []).map((x) => ({ ...x, state: x.state ?? 'not_asked' }));
  const open = states.filter((x) => x.state === 'difference');
  return {
    mode, currency, closed, empty: closed === 0 && !(counts.open > 0),
    netMinor: s.netMinor ?? 0,
    period: s.periodLabel ?? fmt.date(now.toISOString(), { style: 'monthLong' }),
    points: points.length >= 2 ? points : [],
    counts: { open: counts.open ?? 0, heldOut: counts.heldOut ?? 0, excluded: counts.excluded ?? 0 },
    expectancy: exp ? { value: exp.value, n: exp.n, rMissing: exp.rMissing ?? 0 } : null,
    smallSample: Boolean(s.expectancy?.smallSample) || (s.smallSampleMin ? closed < s.smallSampleMin : false),
    winRate: win ? { value: win.value === undefined || win.value === null ? null : win.value * 100, wins: win.wins, n: win.n } : null,
    drawdown: dd ? { maxMinor: dd.maxMinor, pct: ddFraction === null ? null : ddFraction * 100, peakIndex: dd.peakIndex, troughIndex: dd.troughIndex, note: dd.note } : null,
    followed: s.followed ? { followed: s.followed.followed, marked: s.followed.marked } : null,
    states, differences: open,
    recent: (s.recent ?? []).slice(0, 3),
  };
}

const topbarFor = (ctx, { offline }) => ctx.ui.topbar({
  mode: ctx.mode, paper: ctx.mode === 'paper',
  left: ctx.ui.modeSwitch({ mode: ctx.mode, onChange: (m) => ctx.setMode(m) }),
  right: el('div', { class: 'top-actions' },
    offline ? el('span', { class: 'pill-offline' }, ctx.ui.icon('wifioff', 'sm'), t('home.offline.pill')) : null,
    ctx.ui.gearButton(() => ctx.navigate('#/settings'))),
});

function skeleton() {
  const row = () => el('div', { class: 'row' }, el('div', { class: 'sk mk-sk' }), el('div', { class: 'main' }, el('div', { class: 'sk l60' }, ), el('div', { class: 'sk l40' })), el('div', { class: 'sk l56' }));
  return [
    el('section', { class: 'card' },
      el('div', { class: 'sk w46' }), el('div', { class: 'sk w64' }), el('div', { class: 'sk w52' }), el('div', { class: 'sk chart-sk' }),
      el('div', { class: 'grid3 hero-chart' }, el('div', { class: 'sk tile-sk' }), el('div', { class: 'sk tile-sk' }), el('div', { class: 'sk tile-sk' }))),
    el('p', { class: 'caption center-note' }, t('home.loading')),
    el('div', { class: 'list' }, row(), row(), row()),
  ];
}

const sectionHead = (title, link) => el('div', { class: 'section-h' }, el('h2', null, title), link ? el('a', { href: link.href }, link.text) : null);

const infoButton = (ctx, term) => () => ctx.navigate(`#/learn/${term}`);

function smallSampleBanner(ctx, m) {
  const limit = ctx.settings.get('smallSampleMin') ?? 30;
  if (m.mode !== 'paper' || !m.closed || m.closed >= limit) return null;
  const b = ctx.ui.stateBanner({ kind: 'neutral', iconName: 'info', title: t('home.small.title', { n: m.closed }), body: t('home.small.body', { n: limit }) });
  b.classList.add('compact');
  return b;
}

function reviewCard(ctx, m) {
  if (m.mode !== 'paper' || m.closed < 5) return null;
  return el('a', { class: 'card review-card', href: '#/review' },
    el('span', { class: 'mk accent' }, ctx.ui.icon('review')),
    el('div', null, el('h3', null, t('home.review.here')), el('p', { class: 'sub' }, t('home.review.body', { n: m.closed }))),
    ctx.ui.icon('right', 'chev'));
}

function heroCard(ctx, m) {
  const { fmt, ui } = ctx;
  const paper = m.mode === 'paper';
  const tone = toneOf(m.netMinor);
  const counts = [t(paper ? 'home.counts.closedPaper' : 'home.counts.closed', { n: m.closed })];
  if (m.counts.heldOut) counts.push(t('home.counts.held', { n: m.counts.heldOut }));
  if (m.counts.open) counts.push(t('home.counts.open', { n: m.counts.open }));
  const exp = m.expectancy;
  const win = m.winRate;
  const dd = m.drawdown;
  const tilesRow = [
    ui.figure({
      labelKey: 'figure.expectancy', value: exp && exp.value !== null ? fmt.r(exp.value) : DASH, tone: exp && exp.value !== null ? toneOf(exp.value) : undefined,
      n: exp ? t('figure.n', { n: exp.n }) : undefined, note: exp?.rMissing ? t('figure.noR', { n: exp.rMissing }) : undefined,
      onInfo: infoButton(ctx, 'expectancy'), onOpen: () => ctx.navigate('#/drill/expectancy'),
    }),
    paper && m.followed
      ? ui.figure({ labelKey: 'figure.followed', value: t('figure.ofN', { a: m.followed.followed, b: m.followed.marked }), n: m.followed.marked ? fmt.pct((m.followed.followed / m.followed.marked) * 100, 0) : undefined, onOpen: () => ctx.navigate('#/drill/rule-following') })
      : null,
    ui.figure({
      labelKey: 'figure.winRate', value: win && win.value !== null ? fmt.pct(win.value) : DASH,
      n: win ? t('figure.wins', { a: win.wins, b: win.n }) : undefined, onInfo: infoButton(ctx, 'win-rate'), onOpen: () => ctx.navigate('#/drill/win-rate'),
    }),
    !paper || !m.followed
      ? ui.figure({
        labelKey: 'figure.drawdown', value: dd && dd.pct !== null ? fmt.pct(-dd.pct) : DASH, tone: dd && dd.pct ? 'loss' : undefined,
        n: dd && dd.maxMinor !== undefined ? fmt.money(-Math.abs(dd.maxMinor), m.currency) : undefined, note: dd ? t('figure.inclDeposits') : undefined,
        onInfo: infoButton(ctx, 'drawdown'), onOpen: () => ctx.navigate('#/drill/drawdown'),
      })
      : null,
  ].filter(Boolean);
  return el('section', { class: ['card', 'hero-card', paper && 'paper'], 'aria-label': t('home.net') },
    el('div', { class: 'hero-label' }, t('home.netIn', { period: m.period }), ui.modeBadge(m.mode)),
    ui.hero({ text: fmt.money(m.netMinor, m.currency), tone, ccy: m.currency }),
    el('div', { class: 'sub num' }, counts.join(' · ')),
    m.points.length ? el('div', { class: 'hero-chart' }, ui.lineChart({ points: m.points, fmt, ariaLabel: t('home.chart.label'), height: 116 })) : null,
    ui.tiles(...tilesRow));
}

function brokerCheck(ctx, m) {
  if (!m.states.length) return [];
  const { ui, fmt } = ctx;
  const row = (x) => {
    const bits = [x.period?.label ?? ''];
    if (x.state === 'difference' && x.differenceMinor !== undefined) bits.push(fmt.money(x.differenceMinor, m.currency));
    if (x.state === 'reconciled' && x.toleranceMinor !== undefined) bits.push(t('home.within', { x: fmt.moneyPlain(x.toleranceMinor, m.currency) }));
    return el('a', { class: 'row status-row', href: `#/reconcile/${x.accountId}${x.period?.query ? `?${x.period.query}` : ''}` },
      el('div', { class: 'main' }, el('span', { class: 't' }, x.accountName ?? x.accountId), el('span', { class: 'd' }, bits.filter(Boolean).join(' · '))),
      el('div', { class: 'end' }, ui.statusChip(x.state)));
  };
  return [sectionHead(t('home.brokerCheck'), { href: '#/accounts', text: t('home.allPeriods') }), el('div', { class: 'list' }, ...m.states.map(row))];
}

function recentList(ctx, m) {
  if (!m.recent.length) return [];
  const { ui, fmt } = ctx;
  const paper = m.mode === 'paper';
  const rows = m.recent.map((x) => {
    const bits = [[x.side ? t(`label.side.${x.side}`) : null, x.sizeText].filter(Boolean).join(' '), x.pips !== undefined && x.pips !== null ? t('home.pips', { n: fmt.pips(x.pips) }) : null, x.setup ?? null, x.closeTime ? fmt.date(x.closeTime) : null].filter(Boolean);
    return ui.listRow({
      market: x.market, title: x.instrument, meta: bits.join(' · '),
      money: { text: fmt.money(x.netMinor, m.currency), value: x.netMinor },
      r: x.r === null || x.r === undefined ? null : fmt.r(x.r), rTone: x.r ? toneOf(x.r) : 'muted', paper, href: `#/trade/${x.id}`,
    });
  });
  return [
    sectionHead(paper ? t('home.paperTrades') : t('home.recent'), { href: '#/journal', text: paper ? t('home.seeAll') : t('home.seeAll') }),
    el('div', { class: 'list' }, ...rows),
  ];
}

function paperNote(ctx) {
  return ctx.ui.stateBanner({ kind: 'neutral', iconName: 'book', body: [t('home.paper.limits'), ' ', el('button', { type: 'button', class: 'link', onClick: () => ctx.navigate('#/learn/paper-trading') }, t('home.paper.read'))] });
}

function emptyView(ctx, m, hasPaperAccount) {
  const { ui } = ctx;
  const paper = m.mode === 'paper';
  const step = (n, title, sub, { done, href, right } = {}) => {
    const tag = href ? 'a' : 'div';
    return el(tag, { class: ['step', done && 'done'], href }, el('span', { class: 'n' }, done ? ui.icon('check', 'sm') : String(n)),
      el('div', null, el('div', { class: ['step-title', !href && !done && 'muted'] }, title), el('div', { class: 'caption num' }, sub)),
      right ?? (href ? ui.icon('right', 'chev') : null));
  };
  if (paper) {
    return [
      ui.emptyState({
        iconName: 'paper', paper: true, title: t('empty.paper.title'), body: t('empty.paper.body'),
      }),
      el('section', { class: 'card' }, el('div', { class: 'step-list' },
        step(1, t('empty.step.balance'), hasPaperAccount ? ctx.fmt.moneyPlain(hasPaperAccount.startMinor ?? 0, hasPaperAccount.ccy ?? 'EUR') + ` ${hasPaperAccount.ccy ?? 'EUR'}` : t('empty.step.balanceSub'), { done: Boolean(hasPaperAccount), href: '#/accounts' }),
        step(2, t('empty.step.plan'), t('empty.step.planSub'), { href: '#/plan' }),
        step(3, t('empty.step.log'), t('empty.step.logSub'), { href: '#/trade/new' }),
        step(4, t('empty.step.review'), t('empty.step.reviewSub'), { right: el('span', { class: 'caption num' }, t('empty.step.reviewCount', { n: 0 })) }))),
      el('div', { class: 'action-stack' },
        ui.button({ label: t('empty.paper.plan'), kind: 'primary', size: 'lg', block: true, onClick: () => ctx.navigate('#/plan') }),
        ui.button({ label: t('empty.paper.log'), kind: 'plain', size: 'lg', block: true, onClick: () => ctx.navigate('#/trade/new') }),
        ui.button({ label: t('empty.paper.import'), kind: 'ghost', block: true, onClick: () => ctx.navigate('#/import') })),
    ];
  }
  return [
    ui.emptyState({ iconName: 'import', title: t('empty.real.title'), body: t('empty.real.body') }),
    el('section', { class: 'card' }, el('div', { class: 'step-list' },
      step(1, t('empty.real.step1'), t('empty.real.step1Sub'), { href: '#/import' }),
      step(2, t('empty.real.step2'), t('empty.real.step2Sub'), { href: '#/trade/new' }),
      step(3, t('empty.step.plan'), t('empty.step.planSub'), { href: '#/plan' }),
      step(4, t('empty.real.step4'), t('empty.real.step4Sub'), {}))),
    el('div', { class: 'action-stack' },
      ui.button({ label: t('empty.real.import'), kind: 'primary', size: 'lg', block: true, onClick: () => ctx.navigate('#/import') }),
      ui.button({ label: t('empty.real.log'), kind: 'plain', size: 'lg', block: true, onClick: () => ctx.navigate('#/trade/new') }),
      ui.button({ label: t('empty.real.paper'), kind: 'ghost', block: true, onClick: () => ctx.setMode('paper') })),
  ];
}

function banners(ctx, m, { offline }) {
  const { ui } = ctx;
  const out = [];
  if (ctx.storage.refused) out.push(ui.stateBanner({ kind: 'attention', iconName: 'alert', title: t('home.storage.title'), body: t('home.storage.body'), href: '#/settings/data' }));
  if (offline) out.push(ui.stateBanner({ kind: 'neutral', iconName: 'wifioff', title: t('home.offline.title'), body: t('home.offline.body') }));
  if (isReal(m.mode)) {
    const d = m.differences[0];
    if (d) {
      const more = d.differenceMinor === undefined ? '' : t(d.differenceMinor >= 0 ? 'home.diff.more' : 'home.diff.less', { x: ctx.fmt.moneyPlain(Math.abs(d.differenceMinor), m.currency) });
      const may = d.explainCount ? ` ${t('home.diff.explain', { n: d.explainCount })}` : '';
      out.push(ui.stateBanner({ kind: 'attention', iconName: 'neq', title: t('home.diff.title', { account: d.accountName ?? d.accountId, period: d.period?.month ?? d.period?.label ?? '' }), body: `${more}${may}`, href: `#/reconcile/${d.accountId}` }));
    }
  }
  return out;
}

export async function render(root, ctx) {
  const view = el('div', { class: 'app-home' });
  let disposed = false;
  const online = () => paint();
  window.addEventListener('online', online);
  window.addEventListener('offline', online);
  const off = ctx.bus.on('trades-changed', () => paint());

  async function paint() {
    if (disposed) return;
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    const bar = topbarFor(ctx, { offline });
    const content = el('main', { class: 'content', 'aria-busy': 'true' }, ...skeleton());
    mount(view, bar, content);
    let summary; let failed = false;
    try { summary = await ctx.data?.getSummary?.(ctx); } catch (e) { console.error('getSummary failed', e); failed = true; }
    if (disposed) return;
    const m = buildHomeModel(summary, { mode: ctx.mode, fmt: ctx.fmt, ccy: ctx.displayCurrency() });
    let paperAccount = null;
    if (m.empty && m.mode === 'paper') {
      try { const a = (await ctx.store.accounts.getAll()).find((x) => x.mode === 'paper'); if (a) paperAccount = { startMinor: Math.round(Number(a.startBalance) * 10 ** ctx.fmt.minorDigits(a.baseCurrency)), ccy: a.baseCurrency }; } catch { /* no accounts yet */ }
    }
    const kids = [...banners(ctx, m, { offline }), ...(summary?.needsRate ?? []).map((n) => ctx.ui.stateBanner({ kind: 'attention', iconName: 'alert', title: t('stats.needsRate.title'), body: t('stats.needsRate.body', n), href: '#/accounts' }))];
    if (failed) kids.push(ctx.ui.stateBanner({ kind: 'danger', iconName: 'alert', title: t('home.error.title'), body: t('home.error.body') }));
    if (m.empty) kids.push(...emptyView(ctx, m, paperAccount));
    else {
      kids.push(heroCard(ctx, m), reviewCard(ctx, m));
      if (isReal(m.mode)) kids.push(...brokerCheck(ctx, m));
      kids.push(...recentList(ctx, m));
      if (!isReal(m.mode)) kids.push(paperNote(ctx));
    }
    mount(view, bar, el('main', { class: 'content' }, ...kids));
  }

  mount(root, view);
  await paint();
  return () => { disposed = true; off(); window.removeEventListener('online', online); window.removeEventListener('offline', online); };
}

