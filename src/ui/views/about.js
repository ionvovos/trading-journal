// About (design/mockups about, about-el). P10: the lawyer's first-run sentence and About text verbatim in the user's language,
// how the numbers are made (links to the S1-S18 definitions), the broker check, the data facts of legal-review section 5,
// the licence, and where the code lives. Opens offline: everything here ships in the app shell.
import { el, mount } from '../dom.js';
import { t } from '../../i18n/i18n.js';
import { FIRST_RUN, aboutBlocks, MODEL_HOSTS, REPO, APP_VERSION } from '../../about/text.js';

export function render(root, ctx) {
  const { ui } = ctx;
  const [is, not] = aboutBlocks(ctx.lang);
  const back = ctx.settings.get('firstRunDone')
    ? { label: t('settings.title'), onClick: () => ctx.navigate('#/settings') }
    : { label: t('first.back'), onClick: () => ctx.navigate('#/home') };
  mount(root,
    ui.topbar({ back, title: t('about.title') }),
    el('main', { class: 'content' },
      el('section', { class: 'card about-head' },
        el('div', { class: 'app-logo sm' }, ui.logo(56)),
        el('div', null, el('h2', null, t('about.name')), el('p', { class: 'caption' }, t('about.version', { v: APP_VERSION })))),
      el('section', { class: 'card stack legal' }, el('h3', null, t('about.oneSentence')), el('p', { class: 'sub' }, FIRST_RUN[ctx.lang])),
      el('section', { class: 'card stack legal' },
        el('h3', null, is.title), el('p', { class: 'sub' }, is.body),
        el('h3', { class: 'next' }, not.title), el('p', { class: 'sub' }, not.body)),
      el('section', { class: 'card stack' },
        el('h3', null, t('about.numbers.title')), el('p', { class: 'sub muted' }, t('about.numbers.body')),
        ui.button({ label: t('about.numbers.link'), kind: 'ghost', class: 'start', onClick: () => ctx.navigate('#/learn/definitions') }),
        el('h3', { class: 'next' }, t('about.check.title')), el('p', { class: 'sub muted' }, t('about.check.body'))),
      el('section', { class: 'card stack' },
        el('h3', null, t('about.data.title')),
        el('p', { class: 'sub muted' }, t('about.data.local')),
        el('p', { class: 'sub muted' }, t('about.data.hosts', { hosts: MODEL_HOSTS.slice(0, -1).join(', '), last: MODEL_HOSTS[MODEL_HOSTS.length - 1] })),
        el('p', { class: 'sub muted' }, t('about.data.ownKey')),
        el('p', { class: 'sub muted' }, t('about.data.delete'))),
      el('a', { class: 'card link-card', href: `https://${REPO}`, rel: 'noopener', target: '_blank' },
        el('span', { class: 'hstack' }, ui.icon('code'), t('about.code')), el('span', { class: 'caption' }, REPO))));
  return null;
}
