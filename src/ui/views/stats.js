// Statistics (#/stats/overview, #/stats/buckets; design/mockups stats, stats-buckets). Every figure comes from src/stats and opens to
// the trades behind it. The period is one calendar month or all time, always shown; the mode label is always shown (AC-P3.7).
// Buckets are in a fixed neutral order with no highlight and no best or worst (AC-B1.4). Percent of drawdown counts deposits and
// withdrawals and says so (G21).
import { el, mount } from '../dom.js';
import { t } from '../../i18n/i18n.js';
import { loadModel } from '../../storage/model.js';
import { computeStats, defaultMonth, monthPeriod, pointIndex } from '../../storage/statsModel.js';
import { sectionHead } from '../../storage/viewkit.js';
import { binR } from '../charts/histogram.js';
import { startOfLocalDate } from '../../core/time.js';

// Peak and trough positions on the equity curve for the shaded drawdown band, or undefined when there is no drawdown to mark.
function ddMarks(s, pts) {
  const dd = s.drawdown;
  if (!dd || !dd.maxMinor) return undefined;
  const peakIndex = dd.peak?.index ?? pointIndex(s.curve, dd.peak);
  const troughIndex = dd.trough?.index ?? pointIndex(s.curve, dd.trough);
  return peakIndex != null && troughIndex != null && troughIndex > peakIndex && troughIndex < pts.length ? { peakIndex, troughIndex } : undefined;
}

const TABS = ['overview', 'buckets'];
const BUCKETS = ['market', 'account', 'weekday', 'session', 'hour', 'instrument'];
const WEEKDAYS = { en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], el: ['Δευ', 'Τρί', 'Τετ', 'Πέμ', 'Παρ', 'Σάβ', 'Κυρ'] };

export const shiftMonth = (month, n) => { const [y, m] = month.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };

// Pure: label and meta line of one bucket row.
export function bucketRow(b, { label, fmt, ccy }) {
  const won = b.winRate === null || b.winRate === undefined ? '–' : fmt.pct(b.winRate * 100, 0);
  const r = b.rKnown ? t('stats.bucket.r', { r: fmt.r(b.expectancyR ?? 0), n: b.rKnown }) : t('stats.bucket.noR');
  return { label, value: b.netMinor, valueText: fmt.money(b.netMinor, ccy), meta: t('stats.bucket.meta', { n: b.n, won, r }), n: b.n, key: b.key };
}

export function bucketLabel(dim, key, ctx, accounts) {
  if (dim === 'setup') return key === null || key === undefined ? t('journal.noSetup') : key;
  if (dim === 'market') return t(`market.${key}`);
  if (dim === 'account') return accounts.get(key)?.name ?? key;
  if (dim === 'weekday') return WEEKDAYS[ctx.lang === 'el' ? 'el' : 'en'][Number(key) - 1];
  if (dim === 'session') return t(`stats.session.${key}`);
  if (dim === 'hour') return `${String(key).padStart(2, '0')}:00`;
  return String(key);
}

export async function render(root, ctx, params = {}) {
  const tab = TABS.includes(params.tab) ? params.tab : 'overview';
  let disposed = false;
  let month = null;
  let allTime = false;

  async function paint() {
    const model = await loadModel(ctx.store);
    if (disposed) return;
    const { fmt, ui } = ctx;
    if (!month) month = defaultMonth(model.trades.filter((x) => x.mode === ctx.mode), ctx);
    const period = allTime ? null : monthPeriod(month);
    let s;
    try { s = await computeStats(ctx, model, { period }); } catch (e) { console.error('stats failed', e); s = null; }
    if (disposed) return;
    const ccy = ctx.displayCurrency();
    const digits = fmt.minorDigits(ccy);
    const bar = ui.topbar({ mode: ctx.mode, paper: ctx.mode === 'paper', title: t('nav.stats'), left: ui.modeSwitch({ mode: ctx.mode, onChange: (m) => ctx.setMode(m) }), right: el('div', { class: 'top-actions' }, ui.iconButton({ iconName: 'calendar', label: t('stats.calendar'), onClick: () => ctx.navigate('#/calendar') })) });
    const periodBar = el('div', { class: 'spread period-bar' },
      allTime ? el('span', null) : ui.iconButton({ iconName: 'left', label: t('stats.period.prev'), onClick: () => { month = shiftMonth(month, -1); paint(); } }),
      el('button', { type: 'button', class: 'chip', 'aria-pressed': String(allTime), onClick: () => { allTime = !allTime; paint(); } }, allTime ? t('stats.period.all') : fmt.date(`${month}-15T12:00:00Z`, { style: 'monthYear', zone: 'UTC' }), ' ', ui.icon('down', 'sm')),
      allTime ? el('span', null) : ui.iconButton({ iconName: 'right', label: t('stats.period.next'), onClick: () => { month = shiftMonth(month, 1); paint(); } }));
    const tabs = ui.segmented({ ariaLabel: t('stats.tabs'), value: tab, options: TABS.map((x) => ({ value: x, label: t(`stats.tab.${x}`) })), onChange: (v) => ctx.navigate(`#/stats/${v}`) });
    if (!s) { mount(root, bar, el('main', { class: 'content' }, tabs, ui.stateBanner({ kind: 'danger', iconName: 'alert', title: t('home.error.title'), body: t('home.error.body') }))); return; }

    const banner = el('div', { class: 'vstack tight' },
      el('div', { class: 'spread' }, ui.modeBadge(ctx.mode), el('span', { class: 'caption num' }, [t('home.counts.closed', { n: s.included.length }), s.counts.heldOut ? t('home.counts.held', { n: s.counts.heldOut }) : null, s.counts.open ? t('home.counts.open', { n: s.counts.open }) : null, s.counts.excluded ? t('stats.excluded', { n: s.counts.excluded }) : null].filter(Boolean).join(' · '))));
    const rateBanners = s.needsRate.map((n) => ui.stateBanner({ kind: 'attention', iconName: 'alert', title: t('stats.needsRate.title'), body: t('stats.needsRate.body', n), href: '#/accounts' }));
    const smallSample = s.included.length > 0 && s.included.length < s.sctx.smallSampleMin ? ui.stateBanner({ kind: 'neutral', iconName: 'info', title: t('home.small.title', { n: s.included.length }), body: t('home.small.body', { n: s.sctx.smallSampleMin }) }) : null;

    let body;
    if (!s.included.length) body = [ui.emptyState({ iconName: 'stats', paper: ctx.mode === 'paper', title: t('stats.empty.title'), body: t('stats.empty.body') })];
    else if (tab === 'buckets') {
      const rows = (dim) => s.stats.buckets(s.included, dim, s.sctx).map((b) => bucketRow(b, { label: bucketLabel(dim, b.key, ctx, s.accounts), fmt, ccy }));
      const sections = BUCKETS.map((dim) => {
        const list = rows(dim);
        if (!list.length) return null;
        const id = `bk-${dim}`;
        return el('section', { class: 'card', id }, el('div', { class: 'card-h' }, el('h3', null, t(`stats.by.${dim}`)), el('span', { class: 'caption' }, t(`stats.order.${dim}`, { tz: ctx.tz }))), ui.barList({ rows: list, fmt, ccy, compact: dim === 'hour', ariaLabel: t(`stats.by.${dim}`) }));
      }).filter(Boolean);
      const jump = el('div', { class: 'chips', role: 'toolbar', 'aria-label': t('stats.jump') }, ...BUCKETS.map((dim) => el('button', { type: 'button', class: 'chip sm', onClick: () => document.getElementById(`bk-${dim}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, t(`stats.jump.${dim}`))));
      body = [jump, ...sections, el('p', { class: 'caption' }, t('stats.buckets.note'))];
    } else {
      const startT = s.curve.points[1]?.t ? (period ? startOfLocalDate(period.from, ctx.tz) : s.curve.points[1].t) : null;
      const pts = s.curve.points.map((p, i) => ({ v: p.equityMinor / 10 ** digits, t: i === 0 ? startT : p.t }));
      const dd = s.drawdown;
      const ddPct = (v) => (v === null || v === undefined ? null : fmt.pct(v * 100));
      const eqCard = pts.length >= 2 && pts[0].t ? el('section', { class: 'card' },
        el('div', { class: 'card-h' }, el('h3', null, t('stats.equity.title')), el('span', { class: 'caption num' }, t('stats.equity.start', { x: fmt.moneyPlain(s.curve.points[0].equityMinor, ccy) }))),
        // one x axis, under the drawdown panel; the equity chart carries the shaded drawdown band with its peak and low markers (V2 G4)
        ui.lineChart({ points: pts, fmt, ariaLabel: t('stats.equity.title'), showX: false, drawdown: ddMarks(s, pts) }),
        ui.underwaterChart({ points: pts, fmt, ariaLabel: t('stats.underwater') }),
        el('div', { class: 'legend' }, el('span', null, el('i', { class: 'sw eq' }), t('stats.legend.equity')), el('span', null, el('i', { class: 'sw dd' }), t('stats.legend.below'))),
        dd && dd.maxMinor ? el('div', { class: 'kv' },
          el('div', null, el('dt', null, t('figure.drawdown'), ui.iconButton({ iconName: 'info', label: t('figure.explain', { name: t('figure.drawdown') }), small: true, onClick: () => ctx.navigate('#/learn/drawdown') })), el('dd', null, ui.delta(fmt.money(-Math.abs(dd.maxMinor), ccy), 'loss'), dd.maxPct !== null && dd.maxPct !== undefined ? ` · ${ddPct(-dd.maxPct)}` : '')),
          dd.peak && dd.trough ? el('div', null, el('dt', null, t('stats.dd.span')), el('dd', null, `${fmt.date(dd.peak.t)} → ${fmt.date(dd.trough.t)}`)) : null,
          el('div', null, el('dt', null, t('stats.dd.recovered')), el('dd', null, dd.recovery ? `${fmt.date(dd.recovery.t)}${dd.recoveryGainPct != null ? ` · ${t('stats.dd.needed', { x: fmt.pctSigned(dd.recoveryGainPct * 100) })}` : ''}` : t('stats.dd.notRecovered'))),
          dd.currentMinor ? el('div', null, el('dt', null, t('stats.dd.now')), el('dd', null, ui.delta(fmt.money(-Math.abs(dd.currentMinor), ccy), 'loss'), dd.currentPct != null ? ` · ${ddPct(-dd.currentPct)}` : '')) : null) : null,
        el('p', { class: 'caption' }, dd?.note === 'includes_cash' ? t('stats.dd.noteCash') : t('stats.dd.note'))) : null;

      const rs = s.included.filter((tr) => !tr.entryUnknown).map((tr) => s.stats.rMultiple(tr, s.sctx)).filter((r) => r !== null && r !== undefined);
      const mean = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 0;
      const rCard = rs.length ? el('section', { class: 'card' }, el('div', { class: 'card-h' }, el('h3', null, t('stats.r.title')), el('span', { class: 'caption' }, t('stats.r.count', { a: rs.length, b: s.rMissing }))),
        ui.histogram({ counts: binR(rs), mean, meanText: t('stats.r.mean', { x: fmt.r(mean) }), fmt, ariaLabel: t('stats.r.title') }),
        el('div', { class: 'legend' }, el('span', null, el('i', { class: 'sw gain' }), t('stats.r.above')), el('span', null, el('i', { class: 'sw loss' }), t('stats.r.below')))) : null;

      const setupRows = s.stats.buckets(s.included, 'setup', s.sctx).map((b) => bucketRow(b, { label: bucketLabel('setup', b.key, ctx, s.accounts), fmt, ccy }));
      const setupCard = setupRows.length ? el('section', { class: 'card' }, el('div', { class: 'card-h' }, el('h3', null, t('stats.by.setup')), el('span', { class: 'caption' }, t('stats.order.setup'))), ui.barList({ rows: setupRows, fmt, ccy, ariaLabel: t('stats.by.setup') })) : null;

      const drill = (id) => () => ctx.navigate(`#/drill/${id}`);
      const kvRow = (label, value, id, info) => el('div', null, el('dt', null, label, info ? ui.iconButton({ iconName: 'info', label: t('figure.explain', { name: label }), small: true, onClick: () => ctx.navigate(`#/learn/${info}`) }) : null),
        el('dd', null, id ? el('button', { type: 'button', class: 'link-val', onClick: drill(id) }, value) : value));
      const ex = s.expectancy;
      const wr = s.winRate;
      const aw = s.avgWinLoss;
      const pf = s.profitFactor;
      const hold = s.holding;
      const st = s.streaks;
      const fees = s.feeTotals;
      const rf = s.ruleFollowing;
      const figures = el('section', { class: 'card' }, el('div', { class: 'card-h' }, el('h3', null, t('stats.figures')), el('span', { class: 'caption' }, t('stats.figures.tap'))),
        el('div', { class: 'kv' },
          kvRow(t('figure.expectancy'), ex?.r?.value != null ? `${fmt.r(ex.r.value)}${ex.money ? ` · ${fmt.money(ex.money.valueMinor, ccy)}` : ''}` : '–', 'expectancy', 'expectancy'),
          kvRow(t('figure.winRate'), wr?.value != null ? `${fmt.pct(wr.value * 100)} · ${t('figure.wins', { a: wr.wins, b: wr.n })}` : '–', 'win-rate', 'win-rate'),
          kvRow(t('stats.breakEven'), String(wr?.breakEven ?? 0), 'win-rate'),
          kvRow(t('stats.avgWin'), aw?.nWin ? `${fmt.money(Math.round(aw.avgWin * 10 ** digits), ccy)}${aw.nWinR ? ` · ${fmt.r(aw.avgWinR)}` : ''}` : '–', 'avg-win'),
          kvRow(t('stats.avgLoss'), aw?.nLoss ? `${fmt.moneyPlain(Math.round(aw.avgLoss * 10 ** digits), ccy)}${aw.nLossR ? ` · ${fmt.num(aw.avgLossR, 2)}R` : ''}` : '–', 'avg-loss'),
          kvRow(t('stats.profitFactor'), pf?.value != null ? fmt.num(pf.value, 2) : t(`stats.pf.${pf?.reason ?? 'no_trades'}`), 'profit-factor'),
          rf && rf.marked ? kvRow(t('figure.followed'), `${t('figure.ofN', { a: rf.followed, b: rf.marked })} · ${fmt.pct(rf.value * 100)}`, 'rule-following') : null,
          hold && (hold.winners?.n || hold.losers?.n) ? kvRow(t('stats.holding'), `${hold.winners?.n ? fmt.duration(hold.winners.avgSeconds) : '–'} · ${hold.losers?.n ? fmt.duration(hold.losers.avgSeconds) : '–'}`, 'holding-time') : null,
          st ? kvRow(t('stats.streaks'), t('stats.streaks.value', { w: st.longestWin, l: st.longestLoss }), 'streaks') : null,
          ...(s.pipsByPair || []).map((p) => kvRow(t('stats.pips', { pair: p.instrument, n: p.n }), fmt.pips(p.pips), 'pips')),
          fees ? kvRow(t('stats.fees'), `${fmt.moneyPlain(Math.abs(fees.feesMinor), ccy)} · ${fmt.moneyPlain(Math.abs(fees.fundingMinor), ccy)}`, 'fees') : null));
      body = [eqCard, rCard, setupCard, figures];
    }

    mount(root, bar, el('main', { class: 'content' }, tabs, periodBar, banner, ...rateBanners, smallSample, ...body));
    void pointIndex;
  }
  await paint();
  const offs = [ctx.bus.on('trades-changed', paint), ctx.bus.on('account-filter-changed', paint)];
  return () => { disposed = true; offs.forEach((o) => o()); };
}
