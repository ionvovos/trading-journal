import { el, focusables } from '../dom.js';
import { t } from '../../i18n/i18n.js';
import { modeBadge } from './modeBadge.js';

// Bottom sheet: grabber, header (Cancel / title / mode badge), scrolling body, opaque footer with the main action above the home
// indicator, over a 38% scrim. Escape and a scrim tap close it, focus stays inside while open and returns to the opener.
export function sheet({ title, body, footer, mode, onClose, cancelLabel, host = document.getElementById('overlay') } = {}) {
  const opener = document.activeElement;
  const scrim = el('div', { class: 'scrim', onClick: () => close() });
  const head = el('div', { class: 'sheet-h' },
    el('button', { type: 'button', class: 'btn ghost', onClick: () => close() }, cancelLabel ?? t('sheet.cancel')),
    el('h2', { id: 'sheet-title' }, title),
    mode ? modeBadge(mode) : el('span', { class: 'back-slot' }));
  const bodyEl = el('div', { class: 'sheet-body' }, body);
  const node = el('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'sheet-title' },
    el('div', { class: 'grabber' }), head, bodyEl, footer ? el('div', { class: 'sheet-foot' }, footer) : null);
  let closed = false;
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    const f = focusables(node);
    if (!f.length) return;
    const first = f[0]; const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  function close(result) {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    scrim.remove(); node.remove();
    opener?.focus?.();
    onClose?.(result);
  }
  document.addEventListener('keydown', onKey);
  host.append(scrim, node);
  (focusables(bodyEl)[0] ?? focusables(node)[0])?.focus();
  return { close, el: node, body: bodyEl };
}
