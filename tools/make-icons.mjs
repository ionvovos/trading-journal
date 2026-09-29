// Copies the icons L2d drew (design/icons/, rendered by design/tools/icons.mjs) into icons/, where the manifest and index.html
// read them. Run: node tools/make-icons.mjs
import { copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const name of ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon-180.png', 'icon.svg']) {
  copyFileSync(join(root, 'design', 'icons', name), join(root, 'icons', name));
  console.log(`icons/${name}`);
}
