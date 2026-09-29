// Review (#/review, #/review/:id; design/mockups review, review-fallback). Weekly and on demand: process versus outcome, then each pattern
// the code found, titled by the behaviour, with n, the trades behind it, and an open question (P5). The engine that wrote the text and
// its state are shown on every review (AC-P5.7, AC-P9.3). Nothing here is advice: figures come from code, sentences from fixed
// templates or a model whose text passed the guard (src/review/run.js).
import { el, mount, t, periodFor, capLinks } from '../../review/viewkit.js';
import { loadModel } from '../../storage/model.js';
import { runReview } from '../../review/run.js';
import { renderKey } from '../../review/templates.js';
import { enginesFor, loadAiSettings } from '../../ai/index.js';
import { localParts } from '../../core/time.js';

const KINDS = ['last7', 'week', 'last30', 'all'];
const THRESHOLD_UNIT = { entry_after_loss: (v) => `${v} min`, size_rising: (v) => `${v}×`, no_setup_share: (v) => `${v}%` };

const reasonKey = (note) => (note && note.startsWith('failed') ? 'failed' : note);

export async function render(root, ctx, params = {}) {
  if (params.id === 'compare') return (await import('../../review/compareView.js')).renderCompare(root, ctx);
  let disposed = false;
  let review = null;
  let kind = 'last7';
  let running = false;
  let aiState = { engine: 'rules', state: 'ready', reason: null, progress: null };
  const off = ctx.bus.on('ai-state', (e) => { aiState = { ...aiState, ...e }; if (!disposed && !running) paint(); });

  const model = await loadModel(ctx.store);
  const tradeById = new Map(model.trades.map((x) => [x.id, x]));
  const aiSettings = await loadAiSettings(ctx.store);

  if (params.id) review = await ctx.store.reviews.get(params.id).catch(() => null);
  else {
    const all = await ctx.store.reviews.getAll().catch(() => []);
    review = all.filter((r) => r.mode === ctx.mode).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0] ?? null;
  }
  if (review?.period?.kind) kind = review.period.kind;

  const localDate = (iso, tz) => localParts(iso, tz).date;

  async function run() {
    running = true;
    paint();
    try {
      const settings = ctx.settings.all ? ctx.settings.all() : {};
      const engines = enginesFor(ctx);
      const engine = await engines.resolve(aiSettings, ctx.lang);
      const period = periodFor(kind, { tz: ctx.tz, localDate });
      const result = await runReview({
        trades: model.trades, cash: model.cash, accounts: model.accounts, plans: model.plans, mode: ctx.mode, period, lang: ctx.lang, tz: ctx.tz, now: new Date(),
        settings: { ...settings, tz: ctx.tz, smallSampleMin: Number(ctx.settings.get('smallSampleMin') ?? 30), dayCutoffHour: Number(ctx.settings.get('dayCutoffHour') ?? 0) },
      }, { engine, bus: ctx.bus, fmt: ctx.fmt });
      review = { ...result, period: { ...(period ?? {}), kind } };
      await ctx.store.reviews.put(review);
    } finally {
      running = false;
    }
    if (!disposed) paint();
  }

  const dateOf = (id) => {
    const tr = tradeById.get(id);
    return tr?.closeTime ? ctx.fmt.date(tr.closeTime, { zone: ctx.tz }) : '';
  };
  const links = (all) => {
    const { shown, more } = capLinks(all);
    return el('div', { class: 'hstack wrap' }, ...shown.map((id) => {
      const tr = tradeById.get(id);
      return el('a', { class: 'trade-link', href: `#/trade/${id}` }, t('review.ui.link', { instrument: tr?.instrument ?? id, date: dateOf(id) }));
    }), more ? el('span', { class: 'caption' }, t('review.ui.more', { n: more })) : null);
  };

  const engineChip = () => {
    if (!review) return null;
    const rules = review.engine === 'rules';
    const label = rules ? (review.engineNote === 'no_model' ? t('review.ui.engine.rules') : t('review.ui.engine.rulesChosen')) : t(`review.ui.engine.${review.engine}`);
    return el('span', { class: 'engine', 'data-engine': review.engine }, ctx.ui.icon(rules ? 'sliders' : 'chip', 'sm'), label);
  };

  const banners = () => {
    const out = [];
    if (aiState.state === 'downloading') out.push(ctx.ui.stateBanner({ kind: 'neutral', iconName: 'chip', title: t('review.ui.model.downloading.title'), body: t('review.ui.model.downloading.body') }));
    else if (aiSettings['ai.device.consent'] === 'yes' && aiSettings['ai.engine'] !== 'rules' && review && review.engine === 'rules' && aiState.state === 'unavailable' && aiState.reason && aiState.reason !== 'no_model_set_up') {
      const key = `review.ui.model.unavailable.${aiState.reason}`;
      out.push(ctx.ui.stateBanner({ kind: 'neutral', iconName: 'chip', title: t('review.ui.model.unavailable.title'), body: t(key) }));
    }
    if (review && review.engineNote && review.engineNote !== 'no_model' && review.engine === 'rules') {
      const k = `review.ui.note.${reasonKey(review.engineNote)}`;
      out.push(el('p', { class: 'caption pad-x' }, t(k)));
    }
    if (review && review.lang !== ctx.lang) out.push(ctx.ui.stateBanner({ kind: 'attention', iconName: 'info', body: t('review.ui.langMismatch', { lang: t(`review.ui.lang.${review.lang}`) }) }));
    return out;
  };

  const processCard = () => {
    const p = review.processOutcome;
    const f = ctx.fmt;
    const side = (label, g) => el('div', null,
      el('span', { class: 'caption' }, label),
      el('b', { class: 'num big' }, t('review.ui.trades', { n: g.n })),
      g.n === 0 ? el('span', { class: 'caption' }, t('review.ui.process.nothing'))
        : g.avgR === null ? el('span', { class: 'caption' }, '–')
          : el('span', { class: ['num', g.avgR >= 0 ? 'gain' : 'loss', 'strong'] }, g.rKnown < g.n ? t('review.ui.avgOver', { r: f.r(g.avgR, 2), k: g.rKnown }) : t('review.ui.avg', { r: f.r(g.avgR, 2) })));
    return el('section', { class: ['card', ctx.mode === 'paper' && 'paper'] },
      el('div', { class: 'card-h' }, el('h3', null, t('review.ui.process.h')), el('span', { class: 'caption' }, t('review.ui.closed', { n: review.counted }))),
      el('div', { class: 'pv-grid' }, side(t('review.ui.process.followed'), p.followed), side(t('review.ui.process.off'), p.offPlan)),
      p.unmarked.n ? el('p', { class: 'caption top-gap' }, renderKey('process.unmarked', { n: p.unmarked.n }, review.lang).text) : null,
      review.lines.left ? el('p', { class: 'caption top-gap' }, review.lines.left) : null,
      review.small.isSmall ? el('p', { class: 'caption' }, renderKey('small', { n: review.small.n }, review.lang).text) : null);
  };

  const findingBlock = (fnd) => {
    const th = fnd.threshold;
    const unit = th?.from === 'placeholder' && THRESHOLD_UNIT[fnd.pattern] ? THRESHOLD_UNIT[fnd.pattern](th.value) : null;
    return el('div', { class: 'pattern', id: `finding-${fnd.id}` },
      el('h4', null, el('span', { class: 'tag warn' }, t('review.ui.n', { n: fnd.n })), t(fnd.titleKey)),
      el('p', { class: 'sub text' }, fnd.text),
      links(fnd.tradeIds),
      fnd.question ? el('p', { class: 'ask' }, fnd.question) : null,
      th?.from === 'placeholder' ? el('p', { class: 'caption' }, unit ? `${unit} · ${t('review.ui.placeholder')}` : t('review.ui.placeholder')) : null);
  };

  const questionsCard = () => {
    if (review.noPattern) {
      return el('section', { class: 'card empty pad-card' },
        el('div', { class: 'art' }, ctx.ui.icon('search', 'lg')),
        el('h2', null, t('review.ui.none.title')),
        el('p', { class: 'sub' }, t('review.ui.none.body', { k: review.checked.length, n: review.counted })),
        el('p', { class: 'sub text' }, review.checked.map((p) => t(`review.ui.title.${p}`)).join(', ')));
    }
    return el('section', { class: 'card' },
      el('div', { class: 'card-h' }, el('h3', null, t('review.ui.questions.h'))),
      ...review.findings.map(findingBlock));
  };

  const checkedCard = () => {
    const found = new Set(review.findings.map((x) => x.pattern));
    const rest = review.checked.filter((p) => !found.has(p));
    if (review.noPattern || !rest.length) return null;
    return el('section', { class: 'card' },
      el('div', { class: 'card-h' }, el('h3', null, t('review.ui.checked.h')), el('span', { class: 'caption' }, t('review.ui.checked.count', { k: rest.length, total: review.checked.length }))),
      el('p', { class: 'sub' }, `${rest.map((p) => t(`review.ui.title.${p}`)).join(', ')}.`));
  };

  const optionalCard = () => {
    const o = review.optional;
    if (!o || !review.counted) return null;
    const f = ctx.fmt;
    const mark = (v) => (v === true ? t('review.ui.largest.followed') : v === false ? t('review.ui.largest.off') : t('review.ui.largest.unmarked'));
    const list = (rows) => rows.map((r) => el('a', { class: 'set-row', href: `#/trade/${r.id}` },
      el('span', { class: 'lbl' }, `${r.instrument} · ${dateOf(r.id)}`, el('small', null, mark(r.planFollowed))),
      el('span', { class: 'val num' }, f.money(r.netMinor, model.accounts.find((a) => a.id === tradeById.get(r.id)?.accountId)?.baseCurrency ?? 'USD'))));
    return el('section', { class: 'card vstack' },
      el('div', { class: 'card-h' }, el('h3', null, t('review.ui.optional.h'))),
      o.largest.wins.length || o.largest.losses.length ? [el('div', { class: 'caption strong' }, t('review.ui.largest.h')),
        o.largest.wins.length ? el('div', { class: 'list' }, el('div', { class: 'group-h' }, t('review.ui.largest.wins')), ...list(o.largest.wins)) : null,
        o.largest.losses.length ? el('div', { class: 'list' }, el('div', { class: 'group-h' }, t('review.ui.largest.losses')), ...list(o.largest.losses)) : null] : null,
      o.monthsByCount.length ? [el('div', { class: 'caption strong' }, t('review.ui.months.h')),
        el('dl', { class: 'kv' }, ...o.monthsByCount.map((m) => el('div', null, el('dt', null, f.date(`${m.month}-15T12:00:00Z`, { style: 'monthYear' })), el('dd', null, t('review.ui.months.row', { n: m.n, r: f.r(m.netR, 1), k: m.rKnown }))))) ] : null,
      o.lossSequence.n ? [el('div', { class: 'caption strong' }, t('review.ui.seq.h')), el('p', { class: 'sub' }, t('review.ui.seq.body', { n: o.lossSequence.n, min: o.lossSequence.windowMin })), links(o.lossSequence.tradeIds)] : null);
  };

  function paint() {
    if (disposed) return;
    const chips = el('div', { class: 'spread wrap' },
      el('div', { class: 'chips', role: 'group', 'aria-label': t('review.ui.period.label') }, ...KINDS.map((k) => el('button', { type: 'button', class: 'chip sm', 'aria-pressed': String(k === kind), onClick: () => { kind = k; paint(); } }, ctx.ui.icon('calendar', 'sm'), t(`review.ui.period.${k}`)))),
      engineChip());
    const body = [chips, ...(review ? banners() : [])];
    if (running) body.push(el('section', { class: 'card' }, ctx.ui.progress({ done: 1, total: 3, label: t('review.ui.running') })));
    else if (!review) {
      body.push(ctx.ui.emptyState({ iconName: 'review', paper: ctx.mode === 'paper', title: t('review.ui.new.title'), body: t('review.ui.new.body'), children: [ctx.ui.button({ label: t('review.ui.run'), size: 'lg', block: true, onClick: run })] }));
    } else if (!review.counted) {
      body.push(ctx.ui.emptyState({ iconName: 'review', paper: ctx.mode === 'paper', title: t('review.ui.empty.title'), body: t('review.ui.empty.body'), children: [ctx.ui.button({ label: t('review.ui.rerun'), size: 'lg', block: true, onClick: run })] }));
    } else {
      body.push(processCard(), questionsCard(), checkedCard(), optionalCard(), el('p', { class: 'caption pad-x' }, t('review.ui.footer')),
        ctx.ui.button({ label: t('review.ui.rerun'), kind: 'secondary', block: true, onClick: run }));
    }
    body.push(el('a', { class: 'btn plain block', href: '#/review/compare' }, t('compare.link')), el('a', { class: 'btn plain block', href: '#/settings/ai' }, t('review.ui.settings')), el('a', { class: 'btn plain block', href: '#/plan' }, t('review.ui.plan')));
    queueMicrotask(() => root.querySelector('.chips [aria-pressed="true"]')?.scrollIntoView?.({ inline: 'center', block: 'nearest' }));
    mount(root, el('div', { class: 'app-s3' },
      ctx.ui.topbar({ mode: ctx.mode, paper: ctx.mode === 'paper', left: ctx.ui.modeSwitch({ mode: ctx.mode, onChange: (m) => ctx.setMode(m) }), right: el('span', { class: 'spacer' }) }),
      el('main', { class: 'content' }, el('h1', { class: 'page-h' }, t('review.ui.title')), ...body.filter(Boolean).flat())));
  }
  paint();
  return () => { disposed = true; off?.(); mount(root); };
}
