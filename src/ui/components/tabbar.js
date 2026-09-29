import { el } from '../dom.js';
import { icon } from './icons.js';
import { t } from '../../i18n/i18n.js';
import { TABS, LOG_HASH } from '../routes.js';

// Bottom tab bar: Home, Journal, centre Log button (48 px accent square), Stats, Review. 56 px plus the bottom safe area, 96% opaque.
export function tabbar({ current }) {
  const tab = (x) => el('a', { class: 'tab', href: x.hash, 'aria-current': current === x.id ? 'page' : null }, icon(x.icon), el('span', null, t(x.labelKey)));
  return el('nav', { class: 'tabbar', 'aria-label': t('nav.label') },
    tab(TABS[0]), tab(TABS[1]),
    el('a', { class: 'tab tab-log', href: LOG_HASH, 'aria-label': t('nav.log') }, el('span', null, icon('plus'))),
    tab(TABS[2]), tab(TABS[3]));
}
