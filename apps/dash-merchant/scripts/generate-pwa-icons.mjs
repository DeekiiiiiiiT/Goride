/**
 * Rasterize Partner PWA icons from SVG sources (requires sharp).
 * Run: pnpm --filter @roam/dash-merchant icons:generate
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const iconsDir = join(root, 'public', 'icons');
const publicDir = join(root, 'public');

mkdirSync(iconsDir, { recursive: true });

const anySvg = readFileSync(join(iconsDir, 'icon.svg'));
const maskableSvg = readFileSync(join(iconsDir, 'icon-maskable.svg'));

async function writePng(svgBuffer, outPath, size) {
  await sharp(svgBuffer).resize(size, size).png().toFile(outPath);
  console.log('wrote', outPath);
}

await writePng(anySvg, join(iconsDir, 'icon-192.png'), 192);
await writePng(anySvg, join(iconsDir, 'icon-512.png'), 512);
await writePng(maskableSvg, join(iconsDir, 'icon-maskable-512.png'), 512);
await writePng(anySvg, join(publicDir, 'favicon-32.png'), 32);
await writePng(anySvg, join(publicDir, 'apple-touch-icon.png'), 180);

writeFileSync(join(publicDir, 'favicon.ico'), readFileSync(join(publicDir, 'favicon-32.png')));
console.log('done');
