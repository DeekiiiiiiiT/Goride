#!/usr/bin/env node
/**
 * Fast checks before a push — the same checks CI runs, in ~1 minute instead of ~20.
 *
 *   pnpm check            → checks for what changed since origin/main
 *   pnpm check --all      → every check
 *
 * Runs automatically on `git push` (hook in .githooks/pre-push, switched on by `pnpm install`).
 * Only checks that need no database or internet are here; the click-through done-tests still run in CI.
 */
import { execSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const all = process.argv.includes('--all');

function changedFiles() {
  try {
    execSync('git fetch -q origin main', { stdio: 'ignore' });
  } catch {
    /* offline: compare with the last known origin/main */
  }
  try {
    const out = execSync('git diff --name-only origin/main...HEAD', { encoding: 'utf8' });
    return out.split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    return null; // no origin/main → run everything
  }
}

const files = all ? null : changedFiles();
const touched = (re) => files == null || files.some((f) => re.test(f));

/** Inventory Deno test files, read from CI so the two lists never drift. */
function inventoryDenoFiles() {
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
  const start = ci.indexOf('- name: Deno test fleet inventory engine');
  const block = ci.slice(start, ci.indexOf('- name:', start + 10));
  return [...block.matchAll(/(supabase\/functions\/_fleet-server\/\S+\.test\.ts)/g)].map((m) => m[1]);
}

const INVENTORY = /(components\/inventory\/|components\/car-kit\/|_fleet-server\/inventory|delivery\/inventory|e2e\/.*inventory|scripts\/.*inventory|packages\/auth-client\/src\/permissions)/;
const RECON = /(_fleet-server\/(recon_|evaluate_run_mirror|week_close)|packages\/finance-core\/src\/(evaluateRun|reconSources|closeBlockerSteps)|supabase\/tests\/week_recon_|apps\/fleet\/src\/components\/fleet-financials\/recon\/)/;
const MIGRATIONS = /^supabase\/migrations\//;
const EDGE = /^supabase\/functions\//;

const checks = [
  { name: 'Migration SQL (names, dates, syntax)', when: touched(MIGRATIONS), cmd: 'node scripts/validate-migration-sql.mjs' },
  { name: 'Migration files are UTF-8', when: touched(MIGRATIONS), cmd: 'node scripts/assert-migrations-utf8.mjs' },
  { name: 'New functions locked from anon', when: touched(MIGRATIONS), cmd: 'node scripts/assert-public-fn-revoke-anon.mjs' },
  { name: 'Server route list up to date', when: touched(EDGE), cmd: 'node scripts/edge-route-manifest.mjs --all --check' },
  { name: 'No duplicate server files', when: touched(EDGE), cmd: 'node scripts/check-fleet-edge-duplicates.mjs' },
  { name: 'Inventory: no fake text / dead buttons', when: touched(INVENTORY), cmd: 'node scripts/assert-inventory-gap-audit.mjs' },
  { name: 'Inventory: Fleet TypeScript', when: touched(INVENTORY), cmd: 'node scripts/typecheck-fleet-inventory.mjs' },
  { name: 'Inventory: driver car-kit TypeScript', when: touched(INVENTORY), cmd: 'node scripts/typecheck-driver-car-kit.mjs' },
  {
    name: 'Inventory: screen helper tests',
    when: touched(INVENTORY),
    cmd: 'pnpm --filter @roam/fleet exec vitest run src/components/inventory/inventoryCompletion.test.ts',
  },
  {
    name: 'Inventory: server engine tests',
    when: touched(INVENTORY),
    cmd: `deno test --allow-read --allow-env --allow-net=127.0.0.1:54321 --no-check ${inventoryDenoFiles().join(' ')}`,
  },
  {
    name: 'Week Reconciliation: one truth, mirrors and reads-are-reads',
    when: touched(RECON),
    cmd: 'deno test --allow-read supabase/functions/_fleet-server/recon_desk_shape.test.ts supabase/functions/_fleet-server/recon_publish_timing.test.ts supabase/functions/_fleet-server/recon_reads_are_reads.test.ts supabase/functions/_fleet-server/recon_data_checks_codemap.test.ts supabase/functions/_fleet-server/recon_week_change.test.ts supabase/functions/_fleet-server/recon_approval_state.test.ts supabase/functions/_fleet-server/recon_approvals.test.ts supabase/functions/_fleet-server/recon_alert_rules.test.ts supabase/functions/_fleet-server/recon_permissions.test.ts supabase/functions/_fleet-server/recon_alerts.test.ts supabase/functions/_fleet-server/recon_desk_reads.test.ts supabase/functions/_fleet-server/team_staff_alert_phone.test.ts supabase/functions/_fleet-server/recon_activity.test.ts supabase/functions/_fleet-server/recon_close_workflow_wake.test.ts supabase/functions/_fleet-server/recon_alerts_while_paused.test.ts supabase/functions/_fleet-server/upload_routes_company.test.ts supabase/functions/_fleet-server/recon_sources_mirror.drift.test.ts supabase/functions/_fleet-server/evaluate_run_mirror.drift.test.ts',
  },
  { name: 'Week Reconciliation: page reads run no engines', when: touched(RECON), cmd: 'node scripts/assert-no-engine-on-edge-read.mjs' },
  { name: 'Week Reconciliation: screens read the saved desk', when: touched(RECON), cmd: 'node scripts/assert-recon-desk-reads-saved.mjs' },
  { name: 'Week Reconciliation: week-version check is in the lane bundles', when: touched(/(supabase\/functions\/(fleet-toll|fleet-fuel|fleet-pay)\/|recon_week_version_guard)/), cmd: 'node scripts/assert-recon-week-guard-bundled.mjs' },
];

const toRun = checks.filter((c) => c.when);
if (toRun.length === 0) {
  console.log('check-before-push: nothing to check for these changes. OK.');
  process.exit(0);
}

console.log(`check-before-push: ${toRun.length} check(s)${files ? ` for ${files.length} changed file(s)` : ''}\n`);
const started = Date.now();
const failed = [];
for (const c of toRun) {
  const t = Date.now();
  const r = spawnSync(c.cmd, { shell: true, encoding: 'utf8', env: { ...process.env, FORCE_COLOR: '0' } });
  const secs = ((Date.now() - t) / 1000).toFixed(0);
  if (r.status === 0) {
    console.log(`  ✓ ${c.name} (${secs}s)`);
  } else {
    console.log(`  ✗ ${c.name} (${secs}s)`);
    failed.push({ ...c, output: `${r.stdout ?? ''}${r.stderr ?? ''}` });
  }
}

const total = ((Date.now() - started) / 1000).toFixed(0);
if (failed.length) {
  console.log(`\n${failed.length} check(s) FAILED (${total}s). Details:\n`);
  for (const f of failed) {
    console.log(`──── ${f.name} ────\n$ ${f.cmd.length > 160 ? `${f.cmd.slice(0, 160)}…` : f.cmd}`);
    console.log(f.output.trim().split('\n').slice(-40).join('\n'));
    console.log('');
  }
  console.log('Push stopped. Fix the above (or ask Claude/Cursor to), then push again.');
  process.exit(1);
}
console.log(`\nAll ${toRun.length} checks passed (${total}s).`);
