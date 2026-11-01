#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = join(dirname(import.meta.dirname));
const base = process.argv[2];
const files = process.argv.slice(3);
if (!base || !files.length) {
  console.error('Usage: node scripts/merge-mcp-prod-export.mjs <agent-tools-dir> <file1> ...');
  process.exit(1);
}

const paths = files.map((f) => join(base, f));
const run = spawnSync(
  process.execPath,
  [join(root, 'scripts', 'import-mcp-export-payload.mjs'), ...paths],
  { encoding: 'utf8', maxBuffer: 1024 * 1024 * 200 },
);
if (run.status !== 0) {
  console.error(run.stderr || run.stdout);
  process.exit(run.status ?? 1);
}
const out = join(root, 'scripts', 'tmp-migrations', 'prod-export.json');
writeFileSync(out, run.stdout, 'utf8');
const n = JSON.parse(run.stdout).length;
console.log(`Wrote ${out} (${n} rows)`);
