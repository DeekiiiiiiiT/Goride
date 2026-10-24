import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [id, filename] = process.argv.slice(2);
if (!id || !filename) {
  console.error('Usage: node write-stitch-cache-entry.mjs <screenId> <filename>');
  process.exit(1);
}

const html = fs.readFileSync(0, 'utf8');
const cacheDir = path.join(root, 'docs/stitch/roam-plug/.cache');
const outDir = path.join(root, 'docs/stitch/roam-plug/html');
fs.mkdirSync(cacheDir, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

fs.writeFileSync(path.join(cacheDir, `${id}.json`), JSON.stringify({ filename, html }), 'utf8');
fs.writeFileSync(path.join(outDir, filename), html, 'utf8');
console.log(`OK ${filename} (${html.length}b)`);
