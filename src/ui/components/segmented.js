import { el } from '../dom.js';

// A segmented control: options [{ value, label }]. Selected segment has a 1 px control-line outline, so selection never rests on text colour.
export function segmented({ options, value, onChange, ariaLabel, cls = '' }) {
  const wrap = el('div', { class: ['seg', cls], role: 'group', 'aria-label': ariaLabel });
  const buttons = options.map((o) => el('button', {
    type: 'button', 'aria-pressed': String(o.value === value), 'data-value': o.value, lang: o.lang,
    onClick: () => { for (const b of buttons) b.setAttribute('aria-pressed', String(b === buttons[options.indexOf(o)])); onChange?.(o.value); },
  }, o.label));
  wrap.append(...buttons);
  return wrap;
}
