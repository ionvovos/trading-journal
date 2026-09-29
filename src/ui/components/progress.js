import { el } from '../dom.js';

// 6 px bar, accent fill, count label ("1,264 of 2,011 rows"). update(done, total) moves it.
export function progress({ done = 0, total = 1, label }) {
  const bar = el('i');
  const text = el('div', { class: 'caption num' }, label ?? '');
  const wrap = el('div', { class: 'progress-wrap' }, el('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total) }, bar), text);
  const set = (d, tt = total, l = label) => {
    bar.style.width = `${tt ? Math.min(100, (d / tt) * 100) : 0}%`;
    wrap.firstChild.setAttribute('aria-valuenow', String(d));
    wrap.firstChild.setAttribute('aria-valuemax', String(tt));
    text.textContent = l ?? '';
  };
  set(done, total, label);
  wrap.update = set;
  return wrap;
}
