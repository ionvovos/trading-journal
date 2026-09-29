// Learn (#/learn/:term, design/mockups learn, learn-r, learn-drawdown). A plain-language entry for a term the app shows, with a worked
// example (example numbers only) and, when the figure's numbers are passed in the route state, the user's own formula (AC-P6.2, A5).
// It describes past trades only and carries no advice (AC-P6.3). #/learn/all lists every term.
import { el, mount, t } from '../../review/viewkit.js';
import { entries, entryFor, explain, EXAMPLE_ONLY_TEXT } from '../../learn/index.js';

export async function render(root, ctx, params = {}) {
  const lang = ctx.lang;
  const entry = params.term && params.term !== 'all' ? entryFor(params.term, lang) : null;
  const state = params.state ?? {};
  const back = () => (state.from ? ctx.navigate(state.from) : globalThis.history?.length > 1 ? globalThis.history.back() : ctx.navigate('#/home'));
  const bar = ctx.ui.topbar({ mode: ctx.mode, paper: ctx.mode === 'paper', title: t('learnview.tag'), back: { label: t('learnview.back'), onClick: back } });

  if (!entry) {
    const all = entries(lang).filter((e) => e.id !== 'CFD');
    mount(root, el('div', { class: 'app-s3' }, bar, el('main', { class: 'content' },
      params.term && params.term !== 'all' ? ctx.ui.stateBanner({ kind: 'neutral', iconName: 'info', body: t('learnview.notFound') }) : null,
      el('div', { class: 'list' }, ...all.map((e) => el('a', { class: 'set-row', href: `#/learn/${e.slug}` }, el('span', { class: 'lbl' }, e.title), el('span', { class: 'val' }, ctx.ui.icon('right', 'sm'))))))));
    return () => mount(root);
  }

  const figure = state.figure ? explain(state.figure, state.explain ?? {}, lang) : null;
  const related = entries(lang).filter((e) => e.id !== entry.id && (entry.related ?? []).includes(e.id));
  const src = entry.source;
  mount(root, el('div', { class: 'app-s3' }, bar, el('main', { class: 'content' },
    el('section', { class: 'card vstack learn-card' },
      el('span', { class: 'tag info' }, t('learnview.tag')),
      el('h2', null, entry.title),
      el('p', { class: 'plain' }, entry.plain),
      entry.steps?.length ? el('div', { class: 'formula' }, ...entry.steps.flatMap((s, i) => [i ? el('br') : null, s])) : null,
      entry.steps?.length ? el('p', { class: 'caption' }, EXAMPLE_ONLY_TEXT[lang]) : null,
      figure?.formulaWithNumbers ? el('div', { class: 'vstack tight' }, el('div', { class: 'caption strong' }, t('learnview.yourNumber')), el('div', { class: 'formula' }, figure.formulaWithNumbers)) : null,
      el('p', { class: 'caption' }, t('learnview.pastOnly')),
      state.figure ? ctx.ui.button({ label: t('learnview.calc'), kind: 'secondary', block: true, onClick: () => ctx.navigate(`#/drill/${state.drill ?? state.figure}`) }) : null),
    figure && (figure.includedIds.length || figure.excluded.length) ? el('section', { class: 'card vstack' },
      figure.includedIds.length ? [el('div', { class: 'caption strong' }, t('learnview.included')), el('div', { class: 'hstack wrap' }, ...figure.includedIds.map((id) => el('a', { class: 'trade-link', href: `#/trade/${id}` }, id)))] : null,
      figure.excluded.length ? [el('div', { class: 'caption strong' }, t('learnview.excluded')), el('p', { class: 'sub' }, figure.excluded.map((x) => `${x.id}: ${x.reason}`).join(', '))] : null) : null,
    related.length ? el('section', { class: 'card vstack' }, el('div', { class: 'caption strong' }, t('learnview.related')), el('div', { class: 'hstack wrap' }, ...related.map((e) => el('a', { class: 'chip sm', href: `#/learn/${e.slug}` }, e.title)))) : null,
    el('p', { class: 'caption pad-x' }, src?.tag === 'H' ? t('learnview.sourceOwn') : src?.url ? [`${t('learnview.source')}: `, el('a', { class: 'link', href: src.url, target: '_blank', rel: 'noopener noreferrer' }, new URL(src.url).host)] : ''),
    el('a', { class: 'btn plain block', href: '#/learn/all' }, t('learnview.all')))));
  return () => mount(root);
}
