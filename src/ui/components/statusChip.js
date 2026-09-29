import { el } from '../dom.js';
import { icon } from './icons.js';
import { t } from '../../i18n/i18n.js';

// The four broker-check states (R3), each with its own icon and word: never colour alone.
const STATES = {
  reconciled: { cls: 'ok', icon: 'checkc', key: 'status.reconciled' },
  difference: { cls: 'open', icon: 'neq', key: 'status.difference' },
  skipped: { cls: 'skip', icon: 'skip', key: 'status.skipped' },
  not_asked: { cls: 'ask', icon: 'question', key: 'status.notAsked' },
};
export const RECONCILE_STATES = Object.keys(STATES);
export function statusChip(state) {
  const s = STATES[state] ?? STATES.not_asked;
  return el('span', { class: ['status', s.cls] }, icon(s.icon, 'sm'), t(s.key));
}
