#!/usr/bin/env node
/** Merge MCP replay-fingerprint batch JSON files into prod-migration-md5-fingerprints.json */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

const root = join(dirname(import.meta.dirname));
const batches = process.argv.slice(2);
if (!batches.length) {
  console.error('Usage: node scripts/merge-fingerprint-batches.mjs batch1.json ...');
  process.exit(1);
}
const merged = [];
for (const b of batches) {
  merged.push(...JSON.parse(readFileSync(b, 'utf8')));
}
writeFileSync(
  join(root, 'scripts', 'prod-migration-md5-fingerprints.json'),
  `${JSON.stringify(merged, null, 2)}\n`,
  'utf8',
);
console.log(`Wrote ${merged.length} fingerprints`);
