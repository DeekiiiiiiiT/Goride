import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const batchPath = process.argv[2];
if (!batchPath) {
  console.error('Usage: node import-stitch-html-batch.mjs <batch-module.mjs>');
  process.exit(1);
}

const outDir = path.join(root, 'docs/stitch/roam-plug/html');
fs.mkdirSync(outDir, { recursive: true });

const mod = await import(pathToFileURL(path.resolve(batchPath)).href);
const entries = mod.default ?? mod.entries;
if (!Array.isArray(entries)) {
  console.error('Batch module must export default array or entries array');
  process.exit(1);
}

for (const { filename, html } of entries) {
  if (!filename || !html?.trim()) {
    console.error(`Invalid entry: ${filename}`);
    process.exit(1);
  }
  fs.writeFileSync(path.join(outDir, filename), html, 'utf8');
  console.log(`Wrote ${filename} (${html.length}b)`);
}

function pathToFileURL(p) {
  const resolved = path.resolve(p);
  return new URL(`file:///${resolved.replace(/\\/g, '/')}`);
}
