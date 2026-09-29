// L4: side-by-side sheets for the visual comparison. For each screen: design (left) and built (right), light then dark, first page,
// at 390x844 (one sheet) and 360x800 (one sheet). Output e2e/out/L4/pairs/<screen>-<w>x<h>.png. Run outside the Bash sandbox.
//   node e2e/pairs.mjs [screen ...]
import { mkdirSync, readdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, sleep } from './lib/cdp.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'out', 'L4', 'pairs');
mkdirSync(outDir, { recursive: true });
const built = new Set(readdirSync(join(here, 'out', 'L4')).filter((f) => f.endsWith('-p1.png')));
const designs = new Set(readdirSync(join(here, '..', 'design', 'screens')));
const names = [...new Set([...built].map((f) => f.replace(/-(390x844|360x800)-(light|dark)-p1\.png$/, '')))].filter((n) => designs.has(`${n}-390x844-light-p1.png`) || true);
const only = process.argv.slice(2);
const b = await launch();
for (const name of names) {
  if (only.length && !only.includes(name)) continue;
  for (const size of ['390x844', '360x800']) {
    const [w, h] = size.split('x').map(Number);
    const cell = (label, src) => `<figure><figcaption>${label}</figcaption>${src ? `<img src="${src}">` : '<div class="none">no file</div>'}</figure>`;
    const dn = (theme) => (designs.has(`${name}-${size}-${theme}-p1.png`) ? `/design/screens/${name}-${size}-${theme}-p1.png` : null);
    const bl = (theme) => (built.has(`${name}-${size}-${theme}-p1.png`) ? `/e2e/out/L4/${name}-${size}-${theme}-p1.png` : null);
    const html = `<!doctype html><meta charset=utf-8><style>body{margin:0;background:#888;font:12px sans-serif;display:flex;gap:8px;padding:8px;width:${(w / 2) * 4 + 40}px}figure{margin:0}figcaption{color:#fff;padding:2px}img{width:${w / 2}px;display:block}.none{width:${w / 2}px;height:200px;background:#444;color:#fff}</style>${cell('design light', dn('light'))}${cell('built light', bl('light'))}${cell('design dark', dn('dark'))}${cell('built dark', bl('dark'))}`;
    writeFileSync(join(here, 'out', 'L4', '_pair.html'), html);
    await b.send('Emulation.setDeviceMetricsOverride', { width: (w / 2) * 4 + 40, height: h / 2 + 40, deviceScaleFactor: 1, mobile: false });
    await b.load(`${b.base}/e2e/out/L4/_pair.html`, 500);
    const shot = await b.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(outDir, `${name}-${size}.png`), Buffer.from(shot.result.data, 'base64'));
  }
}
try { unlinkSync(join(here, 'out', 'L4', '_pair.html')); } catch { /* none */ }
await b.close();
console.log(`pairs written to ${outDir}`);
