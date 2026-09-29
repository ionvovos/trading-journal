import { el } from '../dom.js';
import { icon } from './icons.js';

// Never an empty chart (AC-U1.2): a tinted art tile, a title, one sentence, then the caller's steps and actions.
export function emptyState({ iconName = 'paper', title, body, paper = false, children = [] }) {
  return el('section', { class: ['card', paper && 'paper', 'empty'] },
    el('div', { class: ['art', paper && 'paper'] }, icon(iconName, 'lg')),
    el('h2', null, title),
    body ? el('p', { class: 'sub' }, body) : null,
    ...children);
}
