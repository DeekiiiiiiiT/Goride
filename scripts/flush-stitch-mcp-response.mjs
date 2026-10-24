import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [responsePath, screenId, filename] = process.argv.slice(2);
if (!responsePath || !screenId || !filename) {
  console.error(
    'Usage: node flush-stitch-mcp-response.mjs <response.json> <screenId> <filename>',
  );
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(responsePath, 'utf8'));
const html = payload.html;
if (!html || !String(html).trim()) {
  console.error(`No html in ${responsePath}`);
  process.exit(1);
}

const outDir = path.join(root, 'docs/stitch/roam-plug/html');
const cacheDir = path.join(root, 'docs/stitch/roam-plug/.cache');
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(cacheDir, { recursive: true });

fs.writeFileSync(path.join(outDir, filename), html, 'utf8');
fs.writeFileSync(
  path.join(cacheDir, `${screenId}.json`),
  JSON.stringify({ filename, html }),
  'utf8',
);
console.log(`OK ${filename} (${html.length}b)`);
