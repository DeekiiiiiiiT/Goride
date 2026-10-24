#!/usr/bin/env node
/**
 * Fail if an app grows its own handwritten list of Jamaica places.
 * Dominion is the only copy. Fare-key helpers may stay.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['node_modules', 'dist', '.git', 'coverage']);
const NEEDLES = [
  'export const JAMAICA_COUNTIES',
  'bounds: { minLat',
  'function circleOutline',
];

function walk(dir, hits) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walk(full, hits);
      continue;
    }
    if (!/\.(ts|tsx|js|mjs)$/.test(ent.name)) continue;
    const text = fs.readFileSync(full, 'utf8');
    for (const needle of NEEDLES) {
      if (text.includes(needle)) hits.push(`${path.relative(ROOT, full)}: ${needle}`);
    }
  }
}

const hits = [];
for (const dir of ['apps', 'packages', 'supabase/functions']) {
  walk(path.join(ROOT, dir), hits);
}
if (hits.length) {
  console.error('Hard-coded Jamaica place list found. Read places from Dominion instead.');
  for (const hit of hits) console.error(hit);
  process.exit(1);
}
console.log('No hard-coded Jamaica place lists.');
