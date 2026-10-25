#!/usr/bin/env node
/**
 * The statement summary must not load every organisation when no org is selected.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const route = path.join(root, 'supabase/functions/_fleet-server/ledger_query_summary_routes.ts');
const src = fs.readFileSync(route, 'utf8');
const start = src.indexOf('ledger/statement-summary');
const slice = src.slice(start, start + 1800);
const failures = [];
if (!slice.includes('requireAuth({ requireOrg: true })')) {
  failures.push('statement-summary must use requireAuth({ requireOrg: true })');
}
if (!slice.includes('ORG_REQUIRED')) {
  failures.push('statement-summary must refuse a request with no organisation');
}
if (!slice.includes('organizationId')) {
  failures.push('statement-summary must pass an organisation into the builder');
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('statement-summary org scope ok');
