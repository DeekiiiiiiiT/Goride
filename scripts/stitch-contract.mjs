/**
 * Dominion Stitch contract.
 * A Ported, Final, Built, or Live row must have its HTML file and a React file that contains the Stitch marker.
 * Every Stitch id in the README must be listed in screens.json (except Superseded rows).
 * Run: node scripts/stitch-contract.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..', 'docs', 'stitch', 'dominion-redesign');
const readmePath = join(root, 'README.md');
const screensPath = join(root, 'screens.json');
const readme = readFileSync(readmePath, 'utf8');
let failed = false;

const screens = JSON.parse(readFileSync(screensPath, 'utf8'));
const knownIds = new Set(Array.isArray(screens.ids) ? screens.ids : []);
if (knownIds.size === 0) {
  console.error('screens.json has no ids');
  process.exit(1);
}

const rows = readme.split('\n').filter((line) => line.startsWith('| D') || line.startsWith('| S'));
if (rows.length === 0) {
  console.error('Dominion Stitch README has no screen rows');
  process.exit(1);
}

function cell(value) {
  return String(value || '').replace(/^`|`$/g, '').trim();
}

for (const row of rows) {
  const cells = row.split('|').map((part) => part.trim()).filter(Boolean);
  if (cells.length < 6) continue;
  const [num, , stitchIdRaw, htmlRaw, , reactRaw, statusRaw] = cells;
  const stitchId = cell(stitchIdRaw);
  const htmlFile = cell(htmlRaw);
  const reactFile = cell(reactRaw);
  const status = cell(statusRaw);
  const checked =
    status.startsWith('Ported') ||
    status.startsWith('Final') ||
    status.startsWith('Built') ||
    status.startsWith('Live');
  const superseded = status.startsWith('Superseded');

  if (stitchId && stitchId !== '—' && !superseded) {
    if (!knownIds.has(stitchId)) {
      console.error(`${num} Stitch id ${stitchId} is not in screens.json`);
      failed = true;
    }
  }

  if (!checked) continue;

  if (!htmlFile || htmlFile === '—') {
    console.error(`${num} is ${status.split('.')[0]} but has no HTML file`);
    failed = true;
  } else if (!existsSync(join(root, htmlFile))) {
    console.error(`${num} is missing ${htmlFile}`);
    failed = true;
  }

  if (!reactFile || reactFile === '—') {
    console.error(`${num} is ${status.split('.')[0]} but has no React file`);
    failed = true;
    continue;
  }
  const reactPath = join(import.meta.dirname, '..', reactFile);
  if (!existsSync(reactPath)) {
    console.error(`${num} React file is missing: ${reactFile}`);
    failed = true;
    continue;
  }
  const source = readFileSync(reactPath, 'utf8');
  const marker = `// Stitch: dominion-redesign/${stitchId}`;
  if (!stitchId || stitchId === '—' || !source.includes(marker)) {
    console.error(`${reactFile} is missing ${marker}`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log('OK — Dominion Stitch contract');
