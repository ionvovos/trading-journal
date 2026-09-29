import { el } from '../dom.js';
import { icon } from './icons.js';

// kind: primary | secondary | plain | ghost | danger. size: md (44 px) | lg (52 px, the screen's main action).
export function button({ label, kind = 'primary', size = 'md', block = false, iconName, onClick, type = 'button', disabled = false, ariaLabel, ...rest } = {}) {
  return el('button', {
    type, disabled, 'aria-label': ariaLabel, onClick,
    class: ['btn', kind === 'danger' ? 'danger-btn' : kind, size === 'lg' && 'lg', block && 'block', rest.class],
  }, iconName ? icon(iconName, 'sm') : null, label);
}

// A small inline button (the (i) explain button, the R chip) gets a 44 px hit area through the .hit class.
export function iconButton({ iconName, label, onClick, small = false, filled = false, cls = '' }) {
  return el('button', { type: 'button', class: ['icon-btn', filled && 'filled', small && 'info-btn hit', cls], 'aria-label': label, onClick }, icon(iconName, small ? 'info-dot' : ''));
}
