import { el } from '../dom.js';
import { icon } from './icons.js';
import { delta, toneOf } from './figure.js';
import { t } from '../../i18n/i18n.js';

const MARKET = { stock: ['stock', 'market.stock'], crypto: ['crypto', 'market.crypto'], forex: ['fx', 'market.forex'] };

export const marketMark = (market) => {
  const [cls, key] = MARKET[market] ?? MARKET.stock;
  return el('span', { class: ['mk', cls], role: 'img', 'aria-label': t(key) }, icon(market === 'forex' ? 'fx' : market === 'crypto' ? 'crypto' : 'stock'));
};

// listRow: 56 px minimum; market mark, title with inline tags, meta line, trailing money over R. Held-out rows get an attention
// gradient, paper rows a 3 px violet edge. `money` is { text, value } already formatted; `r` is text or null (R unknown).
export function listRow({ market, title, tags = [], meta, money, r, rTone, held = false, paper = false, href, onClick, leading, trailing, cls = '' }) {
  const main = el('div', { class: 'main' }, el('span', { class: 't' }, title, ...tags), meta ? el('span', { class: 'd' }, meta) : null);
  const end = trailing ?? el('div', { class: 'end' },
    money ? el('span', { class: 'm' }, delta(money.text, toneOf(money.value))) : null,
    r !== undefined ? el('span', { class: ['rr', rTone] }, r ?? t('figure.rUnknown')) : null);
  const tag = href || onClick ? 'a' : 'div';
  const attrs = { class: ['row', held && 'held', paper && 'paper-row', cls] };
  if (tag === 'a') { attrs.href = href ?? '#'; if (onClick) attrs.onClick = (e) => { e.preventDefault(); onClick(e); }; }
  return el(tag, attrs, leading ?? (market ? marketMark(market) : null), main, end);
}
