/**
 * Dominion Stitch contract.
 * A pulled row must have its HTML file.
 * A row marked Built must name a React file whose first line is the Stitch marker.
 * Run: node scripts/stitch-contract.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..', 'docs', 'stitch', 'dominion-redesign');
const readmePath = join(root, 'README.md');
const readme = readFileSync(readmePath, 'utf8');
let failed = false;

const rows = readme.split('\n').filter((line) => line.startsWith('| D') || line.startsWith('| S'));
if (rows.length === 0) {
  console.error('Dominion Stitch README has no screen rows');
  process.exit(1);
}

for (const row of rows) {
  const cells = row.split('|').map((cell) => cell.trim().replace(/^`|`$/g, '')).filter(Boolean);
  if (cells.length < 6) continue;
  const [num, , stitchId, htmlFile, , reactFile, status] = cells;
  if (htmlFile && htmlFile !== '—') {
    const path = join(root, htmlFile);
    if (!existsSync(path)) {
      console.error(`${num} is missing ${htmlFile}`);
      failed = true;
    }
  }
  if (String(status).startsWith('Built')) {
    if (!reactFile || reactFile === '—') {
      console.error(`${num} is built but has no React file`);
      failed = true;
      continue;
    }
    const reactPath = join(import.meta.dirname, '..', reactFile);
    if (!existsSync(reactPath)) {
      console.error(`${num} React file is missing: ${reactFile}`);
      failed = true;
      continue;
    }
    const first = readFileSync(reactPath, 'utf8').split('\n')[0] || '';
    const marker = `// Stitch: dominion-redesign/${stitchId}`;
    if (!first.includes(marker)) {
      console.error(`${reactFile} is missing ${marker}`);
      failed = true;
    }
  }
}

if (failed) process.exit(1);
console.log('OK — Dominion Stitch contract');
