#!/usr/bin/env node
/**
 * Guard: every delivery edge path that sets courier_id must also set courier_fleet_id.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = join(process.cwd(), 'supabase/functions/delivery');
const files = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith('.ts')) files.push(p);
  }
}
walk(root);

const violations = [];

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  if (!text.includes('courier_id')) continue;

  const updateBlocks = text.match(/\.update\(\{[^}]*courier_id[^}]*\}/gs) ?? [];
  for (const block of updateBlocks) {
    if (
      block.includes('courier_fleet_id') ||
      block.includes('courier_id: null') ||
      block.includes('courierAssignmentFields') ||
      block.includes('...assignment')
    ) {
      continue;
    }
    violations.push({ file, block: block.slice(0, 120) });
  }
}

if (violations.length) {
  console.error('courier_id updates missing courier_fleet_id:\n');
  for (const v of violations) {
    console.error(`  ${v.file}\n    ${v.block}...\n`);
  }
  process.exit(1);
}

console.log('check-courier-fleet-stamp: OK');
