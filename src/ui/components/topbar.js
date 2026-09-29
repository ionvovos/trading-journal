import { el } from '../dom.js';
import { icon } from './icons.js';
import { t } from '../../i18n/i18n.js';

// Top bar. It pads itself with the top safe area and is opaque, so scrolled content never shows under the clock (G7).
// home: mode switch + gear. detail: back button + centred title. paper mode hatches the whole bar (R2).
export function topbar({ mode, left, title, back, right, paper = false }) {
  const bar = el('header', { class: ['topbar', paper && 'paper-mode'] });
  if (back) bar.append(el('button', { type: 'button', class: 'back', onClick: back.onClick }, icon('left'), back.label));
  if (left) bar.append(left);
  if (title) bar.append(el('h1', { class: back ? 'title-sm' : null }, title));
  else bar.append(el('span', { class: 'spacer' }));
  bar.append(right ?? (back ? el('span', { class: 'back-slot' }) : null));
  bar.dataset.mode = mode ?? '';
  return bar;
}

export const gearButton = (onClick) => el('button', { type: 'button', class: 'icon-btn', 'aria-label': t('nav.settings'), onClick }, icon('gear'));
