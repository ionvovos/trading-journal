// V2 repair G5/G7/G13: finds text that is cut off (scrollWidth > clientWidth on a clipping element, or an ellipsis) and text boxes that overlap
// their siblings, on the seeded week, at 390x844 and 360x800, English and Greek. Exit 1 when anything is found.
//   node e2e/clip-probe.mjs [routes...]      (run outside the Bash sandbox)
import { launch } from './lib/cdp.mjs';

const routes = process.argv.slice(2).length ? process.argv.slice(2) : ['#/home', '#/journal', '#/stats/overview', '#/stats/buckets', '#/calendar', '#/review', '#/trade/new', '#/plan', '#/settings', '#/accounts'];
const b = await launch({});
const findings = [];
const PROBE = `(() => {
  const out = [];
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  for (const e of document.querySelectorAll('h1, h2, h3, .tag, .chip, .btn, .t, .lbl, .val, label, input, .pv, dt, dd, .engine, .pill')) {
    if (!vis(e)) continue;
    const s = getComputedStyle(e);
    const clips = ['hidden', 'clip', 'auto'].includes(s.overflowX) || s.textOverflow === 'ellipsis';
    if (e.tagName === 'INPUT') { if (e.type !== 'hidden' && e.scrollWidth > e.clientWidth + 1 && e.value) out.push(['input value cut', e.value.slice(0, 30), e.scrollWidth, e.clientWidth]); continue; }
    if (clips && e.scrollWidth > e.clientWidth + 1) out.push(['text cut', (e.innerText || '').trim().slice(0, 40), e.scrollWidth, e.clientWidth, e.className]);
  }
  // header title against its neighbours
  const bar = document.querySelector('.topbar');
  if (bar) {
    const kids = [...bar.children].filter(vis).map((k) => [k, k.getBoundingClientRect()]);
    for (let i = 0; i < kids.length; i += 1) for (let j = i + 1; j < kids.length; j += 1) {
      const a = kids[i][1]; const c = kids[j][1];
      if (a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1) out.push(['topbar overlap', (kids[i][0].innerText || kids[i][0].className).slice(0, 20), (kids[j][0].innerText || kids[j][0].className).slice(0, 20)]);
    }
    const h1 = bar.querySelector('h1');
    if (h1 && h1.scrollWidth > h1.clientWidth + 1) out.push(['title wider than its box', h1.innerText, h1.scrollWidth, h1.clientWidth]);
  }
  // SVG text against SVG text
  const texts = [...document.querySelectorAll('svg text')].filter(vis).map((t) => [t, t.getBoundingClientRect()]);
  for (let i = 0; i < texts.length; i += 1) for (let j = i + 1; j < texts.length; j += 1) {
    const a = texts[i][1]; const c = texts[j][1];
    if (a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1) out.push(['svg text overlap', texts[i][0].textContent, texts[j][0].textContent]);
  }
  return out;
})()`;
for (const lang of ['en', 'el']) {
  for (const [w, h] of [[390, 844], [360, 800]]) {
    await b.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
    for (const route of routes) {
      await b.load(`${b.base}/tests/review/harness/harness.html?route=${encodeURIComponent(route)}&week=stocks&lang=${lang}`, 500);
      await b.until('window.__ready === true', 15000);
      await new Promise((r) => setTimeout(r, 300));
      const r = await b.ev(PROBE);
      for (const f of r) findings.push(`${lang} ${w}x${h} ${route}: ${f.join(' | ')}`);
    }
  }
}
await b.close();
console.log(findings.length ? findings.join('\n') : 'no clipped text, no overlap');
console.log(`${findings.length} findings`);
process.exit(findings.length ? 1 : 0);
