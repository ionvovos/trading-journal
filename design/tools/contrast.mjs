// Prints WCAG contrast ratios for the main token pairs in both themes, read from design/tokens.css.
// Run: node design/tools/contrast.mjs   (exit 1 if a text pair is under 4.5 or a chart pair under 3)
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'tokens.css'), 'utf8');
const block = (re) => Object.fromEntries([...css.match(re)[1].matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
const light = block(/^:root \{([\s\S]*?)\n\}/m);
const dark = block(/:root\[data-theme="dark"\] \{([\s\S]*?)\n\}/);

const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// [foreground, background, minimum, use]
const PAIRS = [
  ['text', 'bg', 4.5, 'body text on app background'],
  ['text', 'surface', 4.5, 'body text on card'],
  ['text-2', 'surface', 4.5, 'secondary text on card'],
  ['text-2', 'bg', 4.5, 'secondary text on background'],
  ['text-3', 'surface', 4.5, 'captions, axis labels on card'],
  ['text-3', 'bg', 4.5, 'captions on background'],
  ['text-3', 'surface-2', 4.5, 'placeholder in input'],
  ['accent', 'surface', 4.5, 'link and accent text on card'],
  ['accent', 'bg', 4.5, 'accent text on background'],
  ['on-accent', 'accent', 4.5, 'primary button label'],
  ['accent', 'accent-soft', 4.5, 'selected chip, reconciled chip'],
  ['gain', 'surface', 4.5, 'gain figure on card'],
  ['gain', 'gain-soft', 4.5, 'gain figure on gain tint (calendar)'],
  ['loss', 'surface', 4.5, 'loss figure on card'],
  ['loss', 'loss-soft', 4.5, 'loss figure on loss tint (calendar)'],
  ['paper', 'surface', 4.5, 'paper label on card'],
  ['paper', 'paper-soft', 4.5, 'paper badge'],
  ['real', 'real-soft', 4.5, 'real badge'],
  ['attention', 'attention-soft', 4.5, 'difference-open banner'],
  ['attention', 'surface', 4.5, 'attention text on card'],
  ['text-2', 'muted-soft', 4.5, 'skipped / not-asked chip'],
  ['gain-chart', 'surface', 3, 'gain bars (chart mark)'],
  ['loss-chart', 'surface', 3, 'loss bars (chart mark)'],
  ['chart-equity', 'surface', 3, 'equity line'],
  ['chart-dd', 'surface', 3, 'drawdown line'],
  ['control-line', 'surface', 3, 'input, toggle and checkbox outline (WCAG 1.4.11)'],
  ['control-line', 'surface-2', 3, 'selected segment outline against its track'],
];

let fail = 0;
const rows = [];
for (const [fg, bg, min, use] of PAIRS) {
  const l = ratio(light[fg], light[bg]);
  const d = ratio(dark[fg], dark[bg]);
  const ok = l >= min && d >= min;
  if (!ok) fail += 1;
  rows.push(`| \`--${fg}\` on \`--${bg}\` | ${use} | ${l.toFixed(2)} | ${d.toFixed(2)} | ${min} | ${ok ? 'pass' : 'FAIL'} |`);
}
console.log('| Pair | Use | Light | Dark | Min | Result |\n|---|---|---|---|---|---|');
console.log(rows.join('\n'));
console.log(`\n${PAIRS.length - fail}/${PAIRS.length} pairs pass`);
process.exit(fail ? 1 : 0);
