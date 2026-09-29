// V2 repair G1: a fixed action bar must be reachable by a finger. For each route with a fixed bar, at 390x844 and 360x800, scroll to the end and
// hit-test the centre of the primary button with elementFromPoint (element.click() cannot see a covering tab bar).
//   node e2e/tap-points.mjs        (run outside the Bash sandbox; exit 1 on a failed check)
import { launch } from './lib/cdp.mjs';

const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, ok: Boolean(cond), detail: cond ? '' : String(detail).slice(0, 300) });
const b = await launch({});
const ROUTES = [['#/plan', '.actions .btn'], ['#/sentence', '.actions .btn']];
for (const [w, h] of [[390, 844], [360, 800]]) {
  await b.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
  for (const [route, sel] of ROUTES) {
    await b.load(`${b.base}/tests/review/harness/harness.html?route=${encodeURIComponent(route)}&week=stocks&lang=en`, 600);
    await b.until('window.__ready === true', 15000);
    const r = await b.ev(`(() => {
      window.scrollTo(0, document.body.scrollHeight); document.querySelector('main, .content')?.scrollTo?.(0, 1e6);
      const btn = document.querySelector(${JSON.stringify(sel)});
      if (!btn) return { missing: true };
      const box = btn.getBoundingClientRect();
      const x = box.left + box.width / 2; const y = box.top + box.height / 2;
      const hit = document.elementFromPoint(x, y);
      const tab = document.querySelector('.tabbar');
      const corners = [[x, box.top + 8], [x, box.bottom - 8], [box.left + box.width * 0.25, y], [box.left + box.width * 0.75, y]].map(([cx, cy]) => btn.contains(document.elementFromPoint(cx, cy)));
      return { centre: btn.contains(hit), corners, tabbar: !!tab, bottom: Math.round(box.bottom), vh: innerHeight };
    })()`);
    ok(`${route} at ${w}x${h}: the primary button is hit at its centre, top and bottom edge and quarter points, and no tab bar is on the page`, !r.missing && r.centre && r.corners.every(Boolean) && !r.tabbar && r.bottom <= r.vh, JSON.stringify(r));
  }
}
await b.close();
for (const x of checks) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.name}${x.detail ? `  [${x.detail}]` : ''}`);
process.exit(checks.every((x) => x.ok) ? 0 : 1);
