// Writes design/index.html: every mockup with its light and dark screenshot, grouped, plus the 360 px key screens.
// Run after shoot.mjs: node design/tools/contact-sheet.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const screens = JSON.parse(readFileSync(join(root, 'tools', 'screens.json'), 'utf8'));
const KEY = ['dashboard', 'log-trade', 'reconcile-difference', 'stats', 'dashboard-el'];
const groups = [...new Set(screens.map((s) => s.group))];
const shot = (n, w, h, t) => `screens/${n}-${w}x${h}-${t}.png`;
const img = (src, alt) => (existsSync(join(root, src)) ? `<a href="${src}"><img src="${src}" alt="${alt}" loading="lazy" width="195" height="422"></a>` : `<span class="missing">missing ${src}</span>`);

const tile = (s, w = 390, h = 844) => `<figure><div class="pair">${img(shot(s.name, w, h, 'light'), `${s.title}, light`)}${img(shot(s.name, w, h, 'dark'), `${s.title}, dark`)}</div>
<figcaption><a href="mockups/${s.name}.html">${s.name}</a><span>${s.title}</span></figcaption></figure>`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Trading Journal design</title>
<link rel="icon" href="icons/icon.svg" type="image/svg+xml">
<link rel="stylesheet" href="tokens.css">
<style>
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.45 var(--font); }
main { max-width: 1240px; margin: 0 auto; padding: 32px 16px 64px; }
h1 { font: 700 28px/34px var(--font-display); margin: 0 0 6px; letter-spacing: -0.01em; }
h2 { font: 600 19px/24px var(--font-display); margin: 36px 0 12px; }
p { margin: 0; color: var(--text-2); max-width: 70ch; }
a { color: var(--accent); text-decoration: none; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 20px; }
figure { margin: 0; background: var(--surface); border-radius: 16px; box-shadow: var(--e1); padding: 12px; }
.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.pair img { width: 100%; height: auto; border-radius: 10px; display: block; box-shadow: 0 0 0 1px var(--line); }
figcaption { display: grid; gap: 2px; margin-top: 10px; font-size: 13px; }
figcaption a { font-weight: 600; font-family: var(--font-mono); font-size: 12.5px; }
figcaption span { color: var(--text-2); }
.swatches { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
.sw { border-radius: 12px; padding: 10px 12px; font-size: 12px; box-shadow: var(--e1); font-variant-numeric: tabular-nums; }
.missing { font-size: 12px; color: var(--loss); }
.links { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 12px; font-size: 14px; }
</style>
</head>
<body>
<main>
<h1>Trading Journal: design contact sheet</h1>
<p>${screens.length} mockups, each at 390x844 in light and dark; the five key screens also at 360x800. Tap a screenshot for full size, or the name for the live HTML mockup. The design system is in <code>docs/design.md</code> and <code>tokens.css</code>.</p>
<div class="links"><a href="tokens.css">tokens.css</a><a href="components.css">components.css</a><a href="icons/icon.svg">app icon</a></div>
<h2>Colour tokens (follow your system theme)</h2>
<div class="swatches">
${[['accent', 'on-accent', 'Accent'], ['gain-soft', 'gain', '+ Gain'], ['loss-soft', 'loss', '− Loss'], ['paper-soft', 'paper', 'Paper'], ['real-soft', 'real', 'Real'], ['attention-soft', 'attention', 'Difference open'], ['ok-soft', 'ok', 'Reconciled'], ['surface', 'text', 'Surface / text']].map(([bg, fg, l]) => `<div class="sw" style="background:var(--${bg});color:var(--${fg})"><b>${l}</b><br>--${bg} / --${fg}</div>`).join('')}
</div>
${groups.map((g) => `<h2>${g}</h2><div class="grid">${screens.filter((s) => s.group === g).map((s) => tile(s)).join('')}</div>`).join('\n')}
<h2>Key screens at 360x800</h2>
<div class="grid">${screens.filter((s) => KEY.includes(s.name)).map((s) => tile(s, 360, 800)).join('')}</div>
<h2>App icon</h2>
<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(120px,1fr))">${['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon-180.png'].map((f) => `<figure><img src="icons/${f}" alt="${f}" style="width:100%;height:auto;border-radius:12px"><figcaption><span>${f}</span></figcaption></figure>`).join('')}</div>
</main>
</body>
</html>
`;
writeFileSync(join(root, 'index.html'), html);
console.log('wrote design/index.html');
