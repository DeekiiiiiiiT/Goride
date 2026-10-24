import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [screenId, filename] = process.argv.slice(2);
if (!screenId || !filename) {
  console.error('Usage: node write-stitch-html-from-stdin.mjs <screenId> <filename> < html');
  process.exit(1);
}

const html = fs.readFileSync(0, 'utf8');
if (!html.trim()) {
  console.error('Empty stdin html');
  process.exit(1);
}

const cacheDir = path.join(root, 'docs/stitch/roam-plug/.cache');
const outDir = path.join(root, 'docs/stitch/roam-plug/html');
fs.mkdirSync(cacheDir, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

fs.writeFileSync(path.join(outDir, filename), html, 'utf8');
fs.writeFileSync(
  path.join(cacheDir, `${screenId}.json`),
  JSON.stringify({ filename, html }),
  'utf8',
);
console.log(`OK ${filename} (${html.length}b)`);
