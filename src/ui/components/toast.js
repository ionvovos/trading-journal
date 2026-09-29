import { el } from '../dom.js';
import { icon } from './icons.js';

// Inverted surface above the tab bar: icon, text, one action. Replaces the previous toast; dismisses itself after `ms`.
let timer = null;
export function toast({ text, iconName = 'checkc', action, onAction, ms = 4000, host = document.getElementById('overlay') }) {
  clearTimeout(timer);
  host.querySelector('.toast')?.remove();
  const node = el('div', { class: 'toast', role: 'status' },
    icon(iconName, 'sm'), el('span', null, text),
    action ? el('button', { type: 'button', class: 'link', onClick: () => { onAction?.(); node.remove(); } }, action) : null);
  host.append(node);
  timer = setTimeout(() => node.remove(), ms);
  return { close: () => { clearTimeout(timer); node.remove(); } };
}
export const clearToasts = (host = document.getElementById('overlay')) => host.querySelector('.toast')?.remove();
