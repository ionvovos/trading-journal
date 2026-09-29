// L4 helpers for scripted user flows on the real index.html: labelled fields, taps by visible text, page text, page probes.
// Run scripts that use it outside the Bash sandbox (Chrome needs a local port and a profile socket).
import { launch, sleep } from './cdp.mjs';

export { sleep };

export async function open({ width = 390, height = 844, theme = 'light', lang = null } = {}) {
  const b = await launch();
  await b.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: true });
  await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }, { name: 'prefers-reduced-motion', value: 'reduce' }] });
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: "window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + (e.blockedURI || '')));" });
  const q = (s) => JSON.stringify(s);
  const f = {
    b,
    text: () => b.ev('document.querySelector("#app")?.innerText ?? document.body.innerText'),
    overlay: () => b.ev('document.querySelector("#overlay")?.innerText ?? ""'),
    hash: () => b.ev('location.hash'),
    go: async (hash, wait = 500) => { await b.ev(`location.hash = ${q(hash)}`); await sleep(wait); },
    // set a labelled field (label text contains `label`, case-insensitive) with native events; the last match wins when `last` is set
    fill: (label, value, { nth = 0 } = {}) => b.ev(`(() => {
      const want = ${q(label.toLowerCase())};
      const all = [...document.querySelectorAll('#overlay label, #app label')];
      const exact = all.filter((l) => l.textContent.trim().toLowerCase() === want);
      const labs = exact.length ? exact : all.filter((l) => l.textContent.trim().toLowerCase().includes(want));
      const l = labs[${nth}]; if (!l) return 'no field: ' + want;
      const i = document.getElementById(l.getAttribute('for')) || l.querySelector('input,textarea'); if (!i) return 'no input';
      const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(i), 'value').set; set.call(i, ${q(String(value))});
      i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); return 'ok'; })()`),
    // click the first visible clickable whose text includes `text`
    tap: (text, { sel = 'button, a, .btn, .chip, .opt, .row, .set-row, .choice, .tab, [role=button], summary', nth = 0, overlayFirst = true, exact = false } = {}) => b.ev(`(() => {
      const want = ${q(text.toLowerCase())};
      const hit = (e) => { const s = (e.innerText || e.textContent || '').trim().toLowerCase(); const a = (e.getAttribute('aria-label') || '').toLowerCase(); return ${exact} ? s === want || a === want : s.includes(want) || a.includes(want); };
      const pool = (root) => [...root.querySelectorAll(${q(sel)})].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !e.disabled && hit(e); });
      const ov = document.getElementById('overlay'); const a = ${overlayFirst} && ov ? pool(ov) : [];
      const list = a.length ? a : pool(document);
      const e = list[${nth}]; if (!e) return false; e.click(); return true; })()`),
    tapSel: (selector, nth = 0) => b.ev(`(() => { const e = [...document.querySelectorAll(${q(selector)})].filter((x) => x.getBoundingClientRect().width > 0)[${nth}]; if (!e) return false; e.click(); return true; })()`),
    tile: (label) => b.ev(`(() => { const t = [...document.querySelectorAll('.tile, #app dl > div, #app .kv > div')].find((x) => (x.querySelector('.k, dt')?.textContent.trim().toLowerCase() ?? '').startsWith(${q(label.toLowerCase())})); const v = t?.querySelector('button.v, button.link-val'); if (!v) return false; v.click(); return true; })()`),
    has: (text) => b.ev(`((document.querySelector('#app')?.innerText ?? '') + ' ' + (document.querySelector('#overlay')?.innerText ?? '')).toLowerCase().includes(${q(text.toLowerCase())})`),
    waitText: (text, ms = 6000) => b.until(`((document.querySelector('#app')?.innerText ?? '') + ' ' + (document.querySelector('#overlay')?.innerText ?? '')).toLowerCase().includes(${q(text.toLowerCase())})`, ms),
    close: () => b.close(),
  };
  return f;
}

// Probes for one rendered page: horizontal overflow, clipped text, elements past the viewport, targets under 44 px, native controls,
// "NaN/undefined/null" text (AC-D2.1, AC-D2.2, AC-D4.1). Same rules as e2e/lib/shoot-s1.mjs.
export const PROBE = `(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const leaves = [...document.querySelectorAll('#app *, #overlay *')].filter((e) => e.children.length === 0 && e.textContent.trim() && !e.closest('.sr') && !e.closest('svg'));
  const clipped = leaves.filter((e) => { const s = getComputedStyle(e); return e.scrollWidth > e.clientWidth + 1 && s.overflow !== 'visible' && !e.closest('.chips'); }).map((e) => e.textContent.trim().slice(0, 40));
  const small = leaves.filter((e) => vis(e) && parseFloat(getComputedStyle(e).fontSize) < 10.5).map((e) => e.textContent.trim().slice(0, 30));
  const targets = [...document.querySelectorAll('#app a, #app button, #overlay a, #overlay button')].filter((e) => vis(e) && !e.disabled && !e.closest('.row, .set-row, .step, .choice')).filter((e) => {
    const r = e.getBoundingClientRect(); const a = getComputedStyle(e, '::after');
    const pad = a.content !== 'none' && a.position === 'absolute' ? Math.max(0, -parseFloat(a.top) || 0) + Math.max(0, -parseFloat(a.bottom) || 0) : 0;
    return r.height + pad < 43.5;
  }).map((e) => (e.textContent.trim() || e.getAttribute('aria-label') || e.className).slice(0, 24) + ':' + Math.round(e.getBoundingClientRect().height));
  const native = [...document.querySelectorAll('select, input[type=date], input[type=datetime-local], input[type=time], input[type=checkbox], input[type=radio], input[type=file]')].filter((e) => vis(e) && !e.classList.contains('sr') && !e.closest('.sr')).map((e) => e.tagName + ':' + (e.type || ''));
  const bad = leaves.filter((e) => /(^|[^A-Za-z])(null|undefined|NaN)([^A-Za-z]|$)/.test(e.textContent)).map((e) => e.textContent.trim().slice(0, 40));
  const clippedByAncestor = (e) => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o !== 'visible') return true; } return false; };
  const offscreen = [...document.querySelectorAll('#app *, #overlay *')].filter((e) => vis(e) && !e.closest('.sr')).filter((e) => { const r = e.getBoundingClientRect(); return (r.right > innerWidth + 1 || r.left < -1) && !clippedByAncestor(e); }).map((e) => (e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className || e.tagName).toString().slice(0, 30));
  return { overflowX: document.documentElement.scrollWidth - innerWidth, clipped, small, targets, native, bad, offscreen, title: document.title };
})()`;

// choose a file in the page's <input type=file> through the DevTools protocol
export async function upload(f, absPath) {
  const { result: { root } } = await f.b.send('DOM.getDocument', { depth: 1 });
  const { result: { nodeId } } = await f.b.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type=file]' });
  if (!nodeId) throw new Error('no file input on the page');
  await f.b.send('DOM.setFileInputFiles', { files: [absPath], nodeId });
}

// Answer every open question on an import record page with a safe option (the first that needs no typed value), timing each
// answer. Fields an option needs are filled with 1 (a date field with 2026-01-01). Returns [{ label, ms, changed }].
export async function answerAll(f, { limit = 20, timeout = 30000 } = {}) {
  const times = [];
  for (let i = 0; i < limit; i += 1) {
    const n = await f.b.ev("document.querySelectorAll('section.q').length");
    if (!n) break;
    const qn = await f.b.ev("document.querySelector('section.q .qn')?.textContent ?? ''");
    const label = await f.b.ev(`(() => {
      const q = document.querySelector('section.q'); const opts = [...q.querySelectorAll('.opt:not(.off)')];
      const pick = opts.find((o) => !/^(type|enter|attach)/i.test(o.innerText.trim())) || opts[0]; pick.click(); return pick.innerText.split(String.fromCharCode(10))[0]; })()`);
    await sleep(150);
    await f.b.ev(`(() => { for (const inp of document.querySelectorAll('section.q .field input')) {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(inp, inp.placeholder === 'YYYY-MM-DD' ? '2026-01-01' : '1'); inp.dispatchEvent(new Event('input', { bubbles: true })); } })()`);
    const t0 = Date.now();
    await f.b.ev(`(() => { const b = [...document.querySelector('section.q').querySelectorAll('button')].filter((x) => !x.classList.contains('opt')).pop(); b?.click(); })()`);
    const changed = await f.b.until(`document.querySelectorAll('section.q').length < ${n} || (document.querySelector('section.q .qn')?.textContent ?? '') !== ${JSON.stringify(qn)}`, timeout);
    times.push({ label, ms: Date.now() - t0, changed });
    await sleep(200);
  }
  return times;
}
