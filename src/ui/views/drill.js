// Drill-down (#/drill/:figure; design/mockups stats-drilldown, AC-A5.1, AC-A5.2): a figure with its formula in words and this
// person's numbers, the trades included (they sum to the headline) and the trades left out with the reason for each.
import { el, mount } from '../dom.js';
import { t, has } from '../../i18n/i18n.js';
import { loadModel } from '../../storage/model.js';
import { computeStats, defaultMonth, monthPeriod } from '../../storage/statsModel.js';
import { detailBar, sectionHead, sizeText, sideText } from '../../storage/viewkit.js';

// Figure slug (the route, the learn entry) -> statistics figure id (architecture section 3.2).
export const FIGURES = {
  expectancy: 'S9', 'win-rate': 'S4', 'avg-win': 'S5', 'avg-loss': 'S5', 'profit-factor': 'S6', drawdown: 'S11', 'rule-following': 'S16',
  streaks: 'S15', fees: 'S14', 'holding-time': 'S18', pips: 'S17', r: 'S8',
};

// Pure: the headline of a figure from the computed statistics.
export function headline(slug, s, fmt, ccy) {
  const digits = fmt.minorDigits(ccy);
  const m = (v) => fmt.money(Math.round(v * 10 ** digits), ccy);
  switch (slug) {
    case 'expectancy': return s.expectancy?.r?.value == null ? null : { text: fmt.r(s.expectancy.r.value), tone: s.expectancy.r.value > 0 ? 'gain' : s.expectancy.r.value < 0 ? 'loss' : 'flat', sub: t('drill.sub.expectancy') };
    case 'win-rate': return s.winRate?.value == null ? null : { text: fmt.pct(s.winRate.value * 100), tone: 'flat', sub: t('drill.sub.winRate', { a: s.winRate.wins, b: s.winRate.n }) };
    case 'avg-win': return s.avgWinLoss?.nWin ? { text: m(s.avgWinLoss.avgWin), tone: 'gain', sub: t('drill.sub.avgWin') } : null;
    case 'avg-loss': return s.avgWinLoss?.nLoss ? { text: fmt.moneyPlain(Math.round(s.avgWinLoss.avgLoss * 10 ** digits), ccy), tone: 'loss', sub: t('drill.sub.avgLoss') } : null;
    case 'profit-factor': return s.profitFactor?.value == null ? { text: t(`stats.pf.${s.profitFactor?.reason ?? 'no_trades'}`), tone: 'flat', sub: t('drill.sub.profitFactor') } : { text: fmt.num(s.profitFactor.value, 2), tone: 'flat', sub: t('drill.sub.profitFactor') };
    case 'drawdown': return s.drawdown?.maxMinor ? { text: fmt.money(-Math.abs(s.drawdown.maxMinor), ccy), tone: 'loss', sub: t('drill.sub.drawdown') } : null;
    case 'rule-following': return s.ruleFollowing?.marked ? { text: fmt.pct(s.ruleFollowing.value * 100), tone: 'flat', sub: t('drill.sub.ruleFollowing', { a: s.ruleFollowing.followed, b: s.ruleFollowing.marked }) } : null;
    case 'streaks': return s.streaks ? { text: t('stats.streaks.value', { w: s.streaks.longestWin, l: s.streaks.longestLoss }), tone: 'flat', sub: t('drill.sub.streaks') } : null;
    case 'fees': return s.feeTotals ? { text: fmt.moneyPlain(Math.abs(s.feeTotals.feesMinor), ccy), tone: 'loss', sub: t('drill.sub.fees', { x: fmt.moneyPlain(Math.abs(s.feeTotals.fundingMinor), ccy) }) } : null;
    case 'holding-time': return s.holding?.winners?.n || s.holding?.losers?.n ? { text: `${s.holding.winners?.n ? fmt.duration(s.holding.winners.avgSeconds) : '–'} · ${s.holding.losers?.n ? fmt.duration(s.holding.losers.avgSeconds) : '–'}`, tone: 'flat', sub: t('drill.sub.holding') } : null;
    default: return null;
  }
}

// Pure: the formula of a figure in words with this person's numbers, one line each (AC-A5.1).
export function formulaLines(slug, ex, s, fmt, ccy) {
  const p = ex.params || {};
  const m = (minor) => fmt.money(minor, ccy);
  const mp = (minor) => fmt.moneyPlain(Math.abs(minor), ccy);
  const digits = fmt.minorDigits(ccy);
  const moneyOf = (name) => (p.money || []).find((x) => x.name === name)?.totalMinor ?? 0;
  switch (slug) {
    case 'win-rate': return [t('drill.f.S4', { wins: p.wins, n: p.n, pct: fmt.pct((p.value ?? 0) * 100) })];
    case 'avg-win': return [t('drill.f.S5win', { sum: m(moneyOf('wins')), n: p.nWin, avg: m(Math.round((p.avgWin ?? 0) * 10 ** digits)) })];
    case 'avg-loss': return [t('drill.f.S5loss', { sum: mp(moneyOf('losses')), n: p.nLoss, avg: mp(Math.round((p.avgLoss ?? 0) * 10 ** digits)) })];
    case 'profit-factor': return p.value == null ? [t('drill.f.S6none')] : [t('drill.f.S6', { wins: m(moneyOf('wins')), losses: mp(moneyOf('losses')), pf: fmt.num(p.value, 2) })];
    case 'expectancy': {
      const r = p.r || {};
      const sum = (p.rValues || []).reduce((a, x) => a + x.r, 0);
      const a = s.avgWinLoss;
      const lines = [t('drill.f.S9a', { sum: fmt.r(sum), n: r.n, value: r.value == null ? '–' : fmt.r(r.value) })];
      if (r.n && a) lines.push(t('drill.f.S9b', { win: fmt.pct((a.nWinR / r.n) * 100), avgWin: fmt.r(a.avgWinR ?? 0), loss: fmt.pct((a.nLossR / r.n) * 100), avgLoss: fmt.num(a.avgLossR ?? 0, 2) + 'R', value: r.value == null ? '–' : fmt.r(r.value) }));
      return lines;
    }
    case 'drawdown': return p.maxMinor ? [t('drill.f.S11', { peak: fmt.moneyPlain(p.peak.equityMinor, ccy), peakDate: fmt.date(p.peak.t), trough: fmt.moneyPlain(p.trough.equityMinor, ccy), troughDate: fmt.date(p.trough.t), amount: mp(p.maxMinor) }), p.note === 'includes_cash' ? t('drill.f.S11cash') : null].filter(Boolean) : [];
    case 'fees': return [t('drill.f.S14', { fees: mp(p.feesMinor ?? 0), funding: mp(p.fundingMinor ?? 0) })];
    case 'streaks': return [t('drill.f.S15', { w: p.longestWin, l: p.longestLoss })];
    case 'rule-following': return [t('drill.f.S16', { followed: p.followed, marked: p.marked, pct: fmt.pct((p.value ?? 0) * 100) })];
    case 'pips': return (p.byPair || []).map((x) => t('drill.f.S17', { pair: x.instrument, pips: fmt.pips(x.pips), n: x.n }));
    case 'holding-time': return [t('drill.f.S18', { w: p.winners?.n ? fmt.duration(p.winners.avgSeconds) : '–', nw: p.winners?.n ?? 0, l: p.losers?.n ? fmt.duration(p.losers.avgSeconds) : '–', nl: p.losers?.n ?? 0 })];
    default: return [];
  }
}

export async function render(root, ctx, params) {
  const slug = params.figure;
  let disposed = false;
  let showAll = false;
  async function paint() {
    const model = await loadModel(ctx.store);
    if (disposed) return;
    const { fmt, ui } = ctx;
    const ccy = ctx.displayCurrency();
    const bar = detailBar(ctx, { title: has(`figure.${slug}`) ? t(`figure.${slug}`) : t(`drill.name.${slug}`), backHash: '#/stats/overview', backLabel: t('nav.stats') });
    const figureId = FIGURES[slug];
    if (!figureId) { mount(root, bar, el('main', { class: 'content' }, ui.emptyState({ iconName: 'search', title: t('drill.unknown.title'), body: t('drill.unknown.body') }))); return; }
    const month = defaultMonth(model.trades.filter((x) => x.mode === ctx.mode), ctx);
    const period = ctx.settings.get('statsPeriod') === 'all' ? null : monthPeriod(month);
    let s = null; let ex = null;
    try {
      s = await computeStats(ctx, model, { period });
      ex = s.stats.explain(figureId, s.set, s.sctx);
    } catch (e) { console.error('drill failed', e); }
    if (disposed) return;
    if (!s || !ex) { mount(root, bar, el('main', { class: 'content' }, ui.stateBanner({ kind: 'danger', iconName: 'alert', title: t('home.error.title'), body: t('home.error.body') }))); return; }
    const byId = new Map(model.trades.map((tr) => [tr.id, tr]));
    const head = headline(slug, s, fmt, ccy);
    const includedTrades = (ex.includedIds || []).map((id) => byId.get(id)).filter(Boolean);
    const rowFor = (tr) => {
      const net = s.displayNet(tr);
      const r = tr.entryUnknown ? null : s.stats.rMultiple(tr, s.sctx);
      return ui.listRow({ market: tr.market, title: tr.instrument, meta: [`${sideText(tr)} ${sizeText(tr, fmt)}`, tr.setup, tr.closeTime ? fmt.date(tr.closeTime) : null].filter(Boolean).join(' · '), money: net === null || net === undefined ? null : { text: fmt.money(net, ccy), value: net }, r: r == null ? null : fmt.r(r), rTone: r ? (r > 0 ? 'gain' : 'loss') : 'muted', paper: ctx.mode === 'paper', href: `#/trade/${tr.id}` });
    };
    const shown = showAll ? includedTrades : includedTrades.slice(0, 4);
    const leftOut = new Map();
    for (const e of ex.excluded || []) {
      if (!leftOut.has(e.reason)) leftOut.set(e.reason, []);
      leftOut.get(e.reason).push(byId.get(e.id));
    }
    const lines = formulaLines(slug, ex, s, fmt, ccy);
    const formulaNode = lines.length ? lines.map((l) => el('div', null, l)) : [t('drill.formula.generic', { name: has(`figure.${slug}`) ? t(`figure.${slug}`) : slug })];
    mount(root, bar, el('main', { class: 'content' },
      el('section', { class: 'card' }, el('div', { class: 'hero-label' }, `${period ? fmt.date(`${month}-15T12:00:00Z`, { style: 'monthLong', zone: 'UTC' }) : t('stats.period.all')} · ${t('drill.trades', { n: includedTrades.length })}`, ui.modeBadge(ctx.mode)),
        head ? [el('div', { class: ['hero', head.tone] }, head.text), el('p', { class: 'sub' }, head.sub)] : el('p', { class: 'sub' }, t('drill.noValue'))),
      el('section', { class: 'card' }, el('div', { class: 'card-h' }, el('h3', null, t('drill.calc')), ui.iconButton({ iconName: 'info', label: t('figure.explain', { name: slug }), onClick: () => ctx.navigate(`#/learn/${slug}`) })),
        el('div', { class: 'formula' }, ...formulaNode)),
      sectionHead(t('drill.included', { n: includedTrades.length })),
      el('div', { class: 'list' }, ...shown.map(rowFor), includedTrades.length > 4 && !showAll ? ui.button({ label: t('drill.showAll', { n: includedTrades.length }), kind: 'ghost', block: true, onClick: () => { showAll = true; paint(); } }) : null),
      leftOut.size ? [sectionHead(t('drill.leftOut', { n: [...leftOut.values()].reduce((a, l) => a + l.length, 0) })), el('div', { class: 'list' }, ...[...leftOut.entries()].map(([reason, list]) => el('div', { class: 'set-row' }, el('span', { class: 'lbl' }, has(`drill.reason.${reason}`) ? t(`drill.reason.${reason}`) : reason, el('small', null, list.filter(Boolean).slice(0, 4).map((x) => x.instrument).join(', '))), el('span', { class: 'val' }, String(list.length)))))] : null));
  }
  await paint();
  const offs = [ctx.bus.on('trades-changed', paint), ctx.bus.on('account-filter-changed', paint)];
  return () => { disposed = true; offs.forEach((o) => o()); };
}
