/**
 * Rasterize PWA icons from SVG sources (requires sharp).
 * Run: node scripts/generate-pwa-icons.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const iconsDir = join(root, 'public', 'icons');
const publicDir = join(root, 'public');

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

// ICO-compatible 32px PNG copy for <link rel="icon">
writeFileSync(join(publicDir, 'favicon.ico'), readFileSync(join(publicDir, 'favicon-32.png')));
console.log('done');
