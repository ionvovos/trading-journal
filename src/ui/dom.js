// DOM helpers. User text goes in through textContent only (CSP forbids inline styles and the app never builds markup from data).
const SVG_NS = 'http://www.w3.org/2000/svg';

function apply(node, attrs) {
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.setAttribute('class', Array.isArray(v) ? v.filter(Boolean).join(' ') : v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style') Object.assign(node.style, v); // an object of CSS properties: CSSOM, allowed under style-src 'self'
    else node.setAttribute(k, v === true ? '' : String(v));
  }
}

function append(node, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue; // never stringify null into the page
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  apply(node, attrs);
  append(node, children);
  return node;
}

export function svg(tag, attrs, ...children) {
  const node = document.createElementNS(SVG_NS, tag);
  apply(node, attrs);
  append(node, children);
  return node;
}

// Replace a node's children; nulls and false are dropped, not printed.
export function mount(parent, ...children) {
  parent.replaceChildren();
  append(parent, children);
  return parent;
}

export const fragment = (...children) => {
  const f = document.createDocumentFragment();
  append(f, children);
  return f;
};

// Static, code-authored SVG markup only (icons); never user text.
export function staticSvg(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup;
  return t.content.firstElementChild;
}

// Focusable elements inside a container, for the sheet's focus trap.
export const focusables = (root) => [...root.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
