import { el } from '../dom.js';
import { icon } from './icons.js';

// kind: attention | neutral | danger | info. Icon, bold first line, body, optional chevron (when href or onClick is given).
export function stateBanner({ kind = 'info', iconName = 'info', title, body, href, onClick, role }) {
  const tag = href || onClick ? 'a' : 'div';
  const attrs = { class: ['banner', kind], role: role ?? (kind === 'danger' ? 'alert' : null) };
  if (tag === 'a') { attrs.href = href ?? '#'; if (onClick) attrs.onClick = (e) => { e.preventDefault(); onClick(e); }; }
  return el(tag, attrs,
    icon(iconName),
    el('div', { class: 'body' }, title ? el('b', null, title) : null, body),
    tag === 'a' ? icon('right', 'chev') : el('span', { class: 'spacer' }));
}
