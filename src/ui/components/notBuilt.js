import { el, mount } from '../dom.js';
import { t } from '../../i18n/i18n.js';
import { icon } from './icons.js';
import { topbar } from './topbar.js';

// Shown while a route's view module has not landed (S2 and S3 build theirs in parallel). A designed state, never a blank screen.
export function render(root, ctx, { name, error } = {}) {
  mount(root,
    topbar({ back: { label: t('nav.home'), onClick: () => ctx.navigate('#/home') }, title: '' }),
    el('main', { class: 'content' }, el('section', { class: 'card not-built' },
      icon('sparkle', 'lg'), el('h2', null, t('notBuilt.title')),
      el('p', { class: 'sub' }, t('notBuilt.body', { name })),
      error ? el('p', { class: 'caption' }, String(error.message ?? error)) : null)));
  return null;
}
