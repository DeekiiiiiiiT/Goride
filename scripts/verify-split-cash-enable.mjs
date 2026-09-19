/**
 * Pre-enable gate for statement-derived split cash (audit §11 / enable plan Phase 1).
 * Vitest alone cannot see type errors (esbuild strips types) — this script always runs tsc filters too.
 *
 * Usage: pnpm verify:split-cash-enable
 * Exit 0 only when all checks pass.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Fleet tsc baseline from audit §11 — do not drive to zero in this gate. */
const FLEET_TSC_BASELINE_MAX = 502;

function run(label, cmd, args) {
  console.log(`\n── ${label} ──`);
  const r = spawnSync(cmd, args, {
    cwd: root,
    encoding: 'utf8',
    shell: true,
  });
  const out = `${r.stdout || ''}\n${r.stderr || ''}`.trim();
  if (out) console.log(out);
  return { code: r.status ?? 1, out };
}

function fail(msg) {
  console.error(`\nFAIL: ${msg}`);
  process.exit(1);
}

// 1) fuel-core vitest (includes applySplitCashMatchToTx + drift tests)
{
  const r = run('fuel-core vitest', 'pnpm', ['--filter', '@roam/fuel-core', 'test']);
  if (r.code !== 0) fail('fuel-core vitest failed');
}

// 2) roam-shared fuel matcher
{
  const r = run('roam-shared fuel vitest', 'pnpm', [
    '--filter',
    '@roam/roam-shared',
    'exec',
    'vitest',
    'run',
    'src/fuel',
  ]);
  if (r.code !== 0) fail('roam-shared fuel vitest failed');
}

// 3) Deno split-fill / opt-in / odometer
{
  const denoTests = [
    'supabase/functions/_fleet-server/fuel_split_fill_gate.test.ts',
    'supabase/functions/_fleet-server/enterprise_modules_opt_in.test.ts',
    'supabase/functions/_fleet-server/odometer_ledger_collapse.test.ts',
  ].filter((f) => existsSync(path.join(root, f)));

  if (denoTests.length === 0) {
    fail('No Deno test files found for split/opt-in/odometer');
  }

  const r = run('deno test (split/opt-in/odo)', 'deno', [
    'test',
    '--no-check',
    '--allow-read',
    '--allow-env',
    ...denoTests,
  ]);
  if (r.code !== 0) fail('Deno split/opt-in/odometer tests failed');
}

// 4) Fleet tsc — baseline + zero SplitCash-related errors
{
  console.log('\n── fleet tsc (baseline + SplitCash filter) ──');
  const r = spawnSync(
    'pnpm',
    ['--filter', '@roam/fleet', 'exec', 'tsc', '--noEmit', '-p', 'tsconfig.json'],
    { cwd: root, encoding: 'utf8', shell: true },
  );
  const out = `${r.stdout || ''}\n${r.stderr || ''}`;
  const errors = out.split(/\r?\n/).filter((l) => l.includes('error TS'));
  const splitCash = errors.filter((l) =>
    /SplitCashTxPatch|fuelSplitCashLifecycle|FuelManagement\.tsx.*1413|applySplitCashMatchToTx/i.test(
      l.replace(/\\/g, '/'),
    ),
  );

  console.log(`Fleet tsc errors: ${errors.length} (baseline max ${FLEET_TSC_BASELINE_MAX})`);
  if (splitCash.length) {
    console.error('SplitCash-related tsc errors:');
    for (const l of splitCash) console.error(l);
    fail(`${splitCash.length} SplitCash type error(s)`);
  }
  if (errors.length > FLEET_TSC_BASELINE_MAX) {
    fail(
      `Fleet tsc error count ${errors.length} exceeds baseline ${FLEET_TSC_BASELINE_MAX}`,
    );
  }
  console.log('SplitCash type filter: 0 errors');
}

// 5) Fuel money spine (existing gate) — includes fuel-core
{
  const r = run('typecheck-fuel-money fleet', 'node', [
    'scripts/typecheck-fuel-money.mjs',
    'fleet',
  ]);
  if (r.code !== 0) fail('typecheck-fuel-money fleet failed');
}

console.log(
  '\n✅ verify-split-cash-enable: all gates passed — ready for Phase 3 walkthrough / ops enable',
);
process.exit(0);
