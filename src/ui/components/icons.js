// Icon set: 24 px grid, 1.8 px stroke, round caps, drawn inline (copied from the L2d design tools, which drew every mockup icon).
// Markup here is code-authored and static; user text never reaches it.
import { staticSvg } from '../dom.js';

const P = {
  home: '<path d="M4 10.5L12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-6h-6v6H5.5A1.5 1.5 0 0 1 4 19v-8.5z"/>',
  journal: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  stats: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  review: '<path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1z"/><path d="M16 5h1.5A1.5 1.5 0 0 1 19 6.5v13a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5v-13A1.5 1.5 0 0 1 6.5 5H8"/><path d="M9 13l2 2 4-4.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  left: '<path d="M15 5l-7 7 7 7"/>',
  down: '<path d="M6 9.5l6 6 6-6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  import: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
  export: '<path d="M12 16V4M7 8.5l5-5 5 5M5 20h14"/>',
  wifioff: '<path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 4.2-2.4M12 20h.01M14.8 10.6A10 10 0 0 1 19 12.9M2 9.3a15 15 0 0 1 4.3-2.7M10.7 5.1A15 15 0 0 1 22 9.3"/>',
  chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l8.5-8.5M16 7l2.5 2.5M14 9l2 2"/>',
  shield: '<path d="M12 3l7.5 3v5.5c0 4.5-3.2 8.3-7.5 9.5-4.3-1.2-7.5-5-7.5-9.5V6L12 3z"/><path d="M9 12l2 2 4-4"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
  question: '<circle cx="12" cy="12" r="8.5"/><path d="M9.8 9.5a2.3 2.3 0 0 1 4.4.9c0 1.6-2.2 2-2.2 3.3M12 16.8h.01"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  more: '<circle cx="5.5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18.5" cy="12" r="1.2"/>',
  alert: '<path d="M12 4l9 16H3l9-16z"/><path d="M12 10v4.5M12 17.5h.01"/>',
  checkc: '<circle cx="12" cy="12" r="8.5"/><path d="M8.3 12.3l2.4 2.4 5-5.2"/>',
  skip: '<path d="M5 6l8 6-8 6V6zM17 6v12"/>',
  neq: '<path d="M5 9.5h14M5 14.5h14M15 5L9 19"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 16l-5-5-8.5 8.5"/>',
  pencil: '<path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5 4 20zM13.5 7l3 3"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5z"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.4-5.7M20 4v5h-5"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15z"/><path d="M4 20.5A1.5 1.5 0 0 0 5.5 22H20M8 7.5h8"/>',
  scale: '<path d="M12 4v16M7 20h10M5 7h14M5 7l-3 6a3 3 0 0 0 6 0L5 7zM19 7l-3 6a3 3 0 0 0 6 0l-3-6z"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
  file: '<path d="M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8L14 3.5z"/><path d="M14 3.5V8h4.5M9 13h6M9 16.5h4"/>',
  database: '<ellipse cx="12" cy="6" rx="7.5" ry="2.8"/><path d="M4.5 6v12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V6M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>',
  code: '<path d="M8.5 7L3.5 12l5 5M15.5 7l5 5-5 5"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"/>',
  stock: '<path d="M6 20V9M6 9h0M10 20V5M14 20v-8M18 20v-5"/><path d="M4.5 20h15"/>',
  crypto: '<path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9L12 3z"/><path d="M9.5 8.5h3.8a1.7 1.7 0 0 1 0 3.5H9.5h4.3a1.8 1.8 0 0 1 0 3.5H9.5v-7zM11 7v1.5M11 15.5V17"/>',
  fx: '<path d="M4 8.5h13l-3.5-3.5M20 15.5H7l3.5 3.5"/>',
  hand: '<path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V11M11 10.5V5a1.5 1.5 0 0 1 3 0v6M14 10.5V6.5a1.5 1.5 0 0 1 3 0V14c0 3.6-2.4 6.5-6 6.5-2.4 0-3.6-1-5-3l-2.3-3.6a1.4 1.4 0 0 1 2.2-1.7L8 14"/>',
  paper: '<path d="M6 3.5h8.5L18 7v13.5H6z"/><path d="M14.5 3.5V7H18M9 11h6M9 14.5h6M9 18h3"/>',
  arrowr: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  send: '<path d="M5 12h13M13 6.5l5.5 5.5-5.5 5.5"/>',
  share: '<path d="M12 15V3M7 8l5-5 5 5M5 13v6.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V13"/>',
};

const NS_OPEN = (cls) => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">`;

// icon("gear", "sm") -> <svg class="i sm">
export function icon(name, cls = "") {
  const inner = P[name];
  if (!inner) throw new Error(`unknown icon: ${name}`);
  return staticSvg(`${NS_OPEN(cls)}${inner}</svg>`);
}

export const ICON_NAMES = Object.keys(P);

const TRI = {
  up: '<path d="M5 1.2L9.3 8.6H.7z" fill="currentColor"/>',
  down: '<path d="M5 8.8L.7 1.4h8.6z" fill="currentColor"/>',
  flat: '<path d="M1 5h8" stroke="currentColor" stroke-width="2"/>',
};
// The arrow that rides with every money figure: colour is never the only signal.
export const triangle = (dir) => staticSvg(`<svg class="tri" viewBox="0 0 10 10" aria-hidden="true" focusable="false">${TRI[dir]}</svg>`);

// The app icon (design/icons/icon.svg), drawn for the first-run and About screens.
export function logo(size = 64) {
  return staticSvg(`<svg width="${size}" height="${size}" viewBox="0 0 512 512" aria-hidden="true" focusable="false"><defs><linearGradient id="ig${size}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b62e0"/><stop offset="1" stop-color="#2140a8"/></linearGradient></defs><rect width="512" height="512" fill="url(#ig${size})"/><path d="M96 352h320M96 272h320M96 192h320" stroke="#fff" stroke-opacity=".14" stroke-width="10"/><path d="M128 290l80 70 176-196" fill="none" stroke="#fff" stroke-width="44" stroke-linecap="round" stroke-linejoin="round"/><circle cx="384" cy="164" r="30" fill="#fff"/></svg>`);
}
