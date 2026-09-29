import { el } from '../dom.js';
import { t } from '../../i18n/i18n.js';
import { icon, triangle } from './icons.js';

const TONE = { gain: 'up', loss: 'down', flat: 'flat' };
export const toneOf = (v) => (v > 0 ? 'gain' : v < 0 ? 'loss' : 'flat');

// A money figure: sign, arrow and colour together. `text` is already formatted with its sign; the screen-reader word says gain or loss.
export function delta(text, tone) {
  const word = tone === 'gain' ? t('a11y.gain') : tone === 'loss' ? t('a11y.loss') : t('a11y.flat');
  return el('span', { class: ['delta', tone] }, el('span', { class: 'sr' }, `${word} `), triangle(TONE[tone]), text);
}

// Hero: the big net figure with its currency code beside it.
export function hero({ text, tone, ccy }) {
  return el('div', { class: 'hero' }, delta(text, tone), ccy ? el('span', { class: 'cur' }, ccy) : null);
}

// figure({ labelKey, value, n, note, tone, onOpen, onInfo }): one tile of the hairline grid: label with (i), value 17/600, n line.
// Tapping the value opens the drill-down (A5); the (i) opens the learn entry (P6).
export function figure({ labelKey, label, value, n, note, tone, onOpen, onInfo }) {
  const name = label ?? t(labelKey);
  const valueNode = el(onOpen ? 'button' : 'span', { class: ['v', tone], type: onOpen ? 'button' : null, onClick: onOpen }, value);
  return el('div', { class: 'tile' },
    el('span', { class: 'k' }, name,
      onInfo ? el('button', { type: 'button', class: 'icon-btn hit info-btn', 'aria-label': t('figure.explain', { name }), onClick: onInfo }, icon('info', 'info-dot')) : null),
    valueNode,
    (n || note) ? el('span', { class: 'n' }, n ?? '', n && note ? el('br') : null, note ?? '') : null);
}

export const tiles = (...items) => el('div', { class: 'tiles' }, ...items);
