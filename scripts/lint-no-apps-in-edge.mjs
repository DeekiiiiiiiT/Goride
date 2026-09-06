/**
 * Guard: supabase/functions must not import from apps/.
 *
 * Edge and fleet share logic via packages/ (e.g. finance-core), not apps/fleet.
 * Allowlist is intentionally empty — every hit fails until migrated.
 *
 * Run: node scripts/lint-no-apps-in-edge.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const EDGE_ROOT = join(ROOT, 'supabase/functions');

/** Absolute or repo-relative paths allowed to keep apps/ imports during migration. */
const ALLOWLIST = new Set([
  // Pre-existing edge↔apps imports outside settlements program — migrate later.
  'supabase/functions/_fleet-server/index.tsx',
  'supabase/functions/_fleet-server/canonical_from_ops.ts',
  'supabase/functions/_fleet-server/toll_settlement.ts',
  'supabase/functions/_fleet-server/unlinked_shortfall_eligibility.ts',
  'supabase/functions/_fleet-server/toll_controller.tsx',
  'supabase/functions/_fleet-server/platform_vendor_routes.ts',
  'supabase/functions/_fleet-server/dispute_refund_controller.tsx',
  'supabase/functions/_fleet-server/canonical_vehicle_odometer.ts',
  'supabase/functions/_fleet-server/toll_period_bucket.ts',
  'supabase/functions/_fleet-server/ledger_money_aggregate.ts',
  'supabase/functions/_fleet-server/expense_hub_routes.ts',
  'supabase/functions/_fleet-server/toll_period_controller.tsx',
  'supabase/functions/_fleet-server/maintenance_schedule_engine.ts',
  'supabase/functions/_fleet-server/maintenance_routes.ts',
  'supabase/functions/_fleet-server/pending_vehicle_catalog_routes.ts',
  'supabase/functions/_fleet-server/vehicle_catalog_resolve.ts',
  'supabase/functions/_fleet-server/vehicle_catalog_gate.ts',
]);

const IMPORT_APPS_RE =
  /(?:from\s+['"]|import\s*\(\s*['"])(?:\.\.\/)*apps\//g;

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.deno') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, files);
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(name)) files.push(p);
  }
  return files;
}

function isAllowlisted(file) {
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  return ALLOWLIST.has(file) || ALLOWLIST.has(rel);
}

const hits = [];
for (const file of walk(EDGE_ROOT)) {
  if (isAllowlisted(file)) continue;
  const text = readFileSync(file, 'utf8');
  const matches = text.match(IMPORT_APPS_RE);
  if (matches?.length) {
    hits.push({ file: relative(ROOT, file).replace(/\\/g, '/'), count: matches.length });
  }
}

if (hits.length) {
  console.error('Edge imports from apps/ are forbidden (allowlist empty):');
  for (const h of hits) console.error(`  ${h.count}× ${h.file}`);
  console.error('\nMove shared code into packages/ and import from there.');
  process.exit(1);
}

console.log('OK — no apps/ imports under supabase/functions');
