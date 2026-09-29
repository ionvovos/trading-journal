import { el } from '../dom.js';
import { t } from '../../i18n/i18n.js';

const dot = (mode) => el('span', { class: ['dot', mode === 'paper' && 'ring'] });

// The badge: real is an ink pill with a solid dot, paper a violet hatched pill with a ring dot, each with the word (R2).
export const modeBadge = (mode) => el('span', { class: ['badge', mode] }, dot(mode), t(`mode.${mode}`));

// Real / Paper switch for the top bar.
export function modeSwitch({ mode, onChange }) {
  const btn = (m) => el('button', { type: 'button', class: m, 'aria-pressed': String(mode === m), onClick: () => onChange?.(m) }, dot(m), t(`mode.${m}`));
  return el('div', { class: 'mode-switch', role: 'group', 'aria-label': t('mode.label') }, btn('real'), btn('paper'));
}

// A small tag naming the broker account on rows and figures (paper accounts get the paper tag).
export const accountBadge = ({ name, mode = 'real' }) => el('span', { class: ['tag', mode === 'paper' && 'info'] }, name);
