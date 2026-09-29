import { el } from '../dom.js';
import { icon } from './icons.js';

let seq = 0;

// A labelled text input: label 12/600 above, 48 px input, unit suffix, help, error or warning line. The label wraps the input,
// so a tap on the label focuses it. Returns the wrapper; `.input` is the <input>.
export function field({ label, value = '', unit, help, error, warning, placeholder, inputmode, type = 'text', name, onInput, onChange, maxlength, autocomplete = 'off', required = false } = {}) {
  const id = `f${seq += 1}`;
  const input = el('input', { id, type, name, value, placeholder, inputmode, maxlength, autocomplete, spellcheck: 'false', required, 'aria-invalid': error ? 'true' : null, 'aria-describedby': error || help || warning ? `${id}-m` : null, class: 'bare', onInput: (e) => onInput?.(e.target.value, e), onChange: (e) => onChange?.(e.target.value, e) });
  const box = el('div', { class: ['input', error && 'err', warning && 'warn'] }, input, unit ? el('span', { class: 'unit' }, unit) : null);
  const message = error
    ? el('div', { class: 'err-msg', id: `${id}-m`, role: 'alert' }, icon('alert', 'sm'), error)
    : warning
      ? el('div', { class: 'warn-msg', id: `${id}-m` }, icon('alert', 'sm'), warning)
      : help ? el('div', { class: 'help', id: `${id}-m` }, help) : null;
  const wrap = el('div', { class: 'field' }, el('label', { for: id }, label), box, message);
  wrap.input = input;
  return wrap;
}
