// The paper-versus-real comparison page (#/review/compare, design/mockups compare). Loaded by src/ui/views/review.js. The figures come
// from stats.compareModes (loaded on demand, like the other data views); nothing is computed here. It appears only when both modes have
// closed trades in the period, otherwise it names the mode that lacks them (AC-P4.6).
import { el, mount, t, periodFor, detailBar } from './viewkit.js';
import { buildCompare } from './compare.js';
import { loadModel, statsCtxFor } from '../storage/model.js';
import { loadStats } from '../storage/viewkit.js';
import { localParts } from '../core/time.js';

const KINDS = ['last30', 'last7', 'week', 'all'];

export async function renderCompare(root, ctx) {
  let disposed = false;
  let kind = 'last30';
  const model = await loadModel(ctx.store);
  const tradeById = new Map(model.trades.map((x) => [x.id, x]));
  let stats = null;
  try { stats = await loadStats(); } catch { stats = null; }
  const lossWindowMin = Number(ctx.settings.get('lossWindowMin') ?? 30) || 30;

  const compute = () => {
    const period = periodFor(kind, { tz: ctx.tz, localDate: (iso, tz) => localParts(iso, tz).date }) ?? {};
    const ctxFor = (mode) => statsCtxFor(ctx, model, { mode, accountIds: 'all', displayCurrency: ctx.settings.get(`displayCurrency.${mode}`) || 'USD' });
    const result = stats.compareModes(model.trades, { from: period.from, to: period.to, lossWindowMin }, { real: ctxFor('real'), paper: ctxFor('paper') });
    return buildCompare(result, { t, fmt: ctx.fmt, lossWindowMin });
  };

  const links = (ids) => (ids.length
    ? el('div', { class: 'hstack wrap' }, ...ids.map((id) => {
      const tr = tradeById.get(id);
      return el('a', { class: 'trade-link', href: `#/trade/${id}` }, t('review.ui.link', { instrument: tr?.instrument ?? id, date: tr?.closeTime ? ctx.fmt.date(tr.closeTime, { zone: ctx.tz }) : '' }));
    }))
    : el('p', { class: 'caption' }, t('compare.sheet.none')));

  const open = (row) => {
    const body = el('div', { class: 'vstack' }, ...['paper', 'real'].flatMap((mode) => [
      el('div', { class: 'spread' }, ctx.ui.modeBadge(mode), el('span', { class: 'caption num' }, row[mode].value)),
      links(row[mode].tradeIds),
    ]));
    ctx.ui.sheet({ title: row.label, body, cancelLabel: t('sheet.close') });
  };

  const cellNode = (row, mode) => {
    const c = row[mode];
    const inner = [c.value, c.sub ? el('small', null, c.sub) : null];
    return c.tradeIds.length
      ? el('button', { type: 'button', class: 'v cmp-cell', onClick: () => open(row) }, ...inner)
      : el('span', { class: 'v' }, ...inner);
  };

  function paint() {
    if (disposed) return;
    let content;
    if (!stats?.compareModes) content = [ctx.ui.stateBanner({ kind: 'neutral', iconName: 'info', body: t('compare.unavailable') })];
    else {
      const m = compute();
      content = m.missing
        ? [ctx.ui.stateBanner({ kind: 'attention', iconName: 'info', body: m.message })]
        : [
          el('section', { class: 'card' }, el('div', { class: 'cmp' },
            el('span'), el('span', { class: 'h' }, ctx.ui.modeBadge('paper')), el('span', { class: 'h' }, ctx.ui.modeBadge('real')),
            ...m.rows.flatMap((row) => [el('span', { class: 'k' }, row.label), cellNode(row, 'paper'), cellNode(row, 'real')]))),
          el('p', { class: 'caption pad-x' }, t('compare.note', { min: lossWindowMin })),
        ];
    }
    queueMicrotask(() => root.querySelector('.chips [aria-pressed="true"]')?.scrollIntoView?.({ inline: 'center', block: 'nearest' }));
    mount(root, el('div', { class: 'app-s3' },
      detailBar(ctx, { title: t('compare.bar'), backHash: '#/review', backLabel: t('review.ui.title'), right: el('span', { class: 'back-slot' }) }),
      el('main', { class: 'content' },
        el('h1', { class: 'page-h small' }, t('compare.title')),
        el('p', { class: 'sub pad-x' }, t('compare.intro')),
        el('div', { class: 'chips', role: 'group', 'aria-label': t('review.ui.period.label') }, ...KINDS.map((k) => el('button', { type: 'button', class: 'chip sm', 'aria-pressed': String(k === kind), onClick: () => { kind = k; paint(); } }, ctx.ui.icon('calendar', 'sm'), t(`review.ui.period.${k}`)))),
        ...content)));
  }
  paint();
  return () => { disposed = true; mount(root); };
}
