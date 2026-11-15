#!/usr/bin/env node
/**
 * Service items (May need) — every done-test in one command (plan T1). Local copy only.
 *
 *   pnpm test:service-items           → everything
 *   pnpm test:service-items --no-e2e  → skip the Playwright click-throughs
 *
 * Needs Docker Desktop open. Uses the test copy (ports 5180–5183) if it's already running;
 * otherwise starts it and stops it again at the end. Screenshots go to the git-ignored test-results/.
 */
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const isWin = process.platform === 'win32';
const pnpm = isWin ? 'pnpm.cmd' : 'pnpm';
const noE2e = process.argv.includes('--no-e2e');
const DB = 'supabase_db_Goride';
const ADMIN = 'http://127.0.0.1:5180';
const FLEET = 'http://127.0.0.1:5181';

const SQL_TESTS = [
  'service_items_checks',
  'service_items_db_test',
  'service_items_save_db_test',
  'service_items_part_source_db_test',
  'service_items_completion_db_test',
  'maintenance_discount_checks',
  'maintenance_discount_db_test',
  'engine_sections_used_ids_test',
  'powertrain_checks',
  'powertrain_db_test',
  'powertrain_schedule_db_test',
];

const results = [];

function step(name, cmd, args, opts = {}) {
  console.error(`\n>>> ${name}`);
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: isWin, ...opts, env: { ...process.env, ...opts.env } });
  const ok = r.status === 0;
  results.push({ name, ok });
  return ok;
}

function quiet(cmd, args) {
  return spawnSync(cmd, args, { cwd: root, encoding: 'utf8', shell: isWin });
}

async function up(url) {
  try {
    const res = await fetch(url);
    return res.ok;
  } catch {
    return false;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const docker = quiet('docker', ['inspect', '-f', '{{.State.Running}}', DB]);
  let startedCopy = null;
  const copyRunning = (await up(FLEET)) && (await up(ADMIN));
  if (!copyRunning) {
    if (docker.status !== 0 && quiet('docker', ['info']).status !== 0) {
      console.error('run-service-items-tests: open Docker Desktop first.');
      process.exit(1);
    }
    console.error('\n>>> starting the test copy (pnpm testcopy)…');
    startedCopy = spawn(pnpm, ['testcopy'], { cwd: root, shell: isWin, stdio: 'ignore', detached: !isWin });
    for (let i = 0; i < 120 && !((await up(FLEET)) && (await up(ADMIN))); i++) await sleep(5000);
    if (!((await up(FLEET)) && (await up(ADMIN)))) {
      console.error('run-service-items-tests: the test copy did not start.');
      process.exit(1);
    }
  }

  try {
    step('supabase migration up', 'npx', ['supabase', 'migration', 'up', '--include-all']);
    step('build fleet-ops bundle', 'node', ['scripts/build-edge-bundle.mjs', 'fleet-ops']);
    step('build fleet-core bundle', 'node', ['scripts/build-edge-bundle.mjs', 'fleet-core']);

    const tmp = mkdtempSync(join(tmpdir(), 'si-sql-'));
    for (const t of SQL_TESTS) {
      const local = join(tmp, `${t}.sql`);
      copyFileSync(join(root, 'supabase', 'tests', `${t}.sql`), local);
      if (quiet('docker', ['cp', local, `${DB}:/tmp/${t}.sql`]).status !== 0) {
        results.push({ name: `SQL ${t}`, ok: false });
        continue;
      }
      step(`SQL ${t}`, 'docker', ['exec', DB, 'psql', '-U', 'postgres', '-d', 'postgres', '-q', '-v', 'ON_ERROR_STOP=1', '-f', `/tmp/${t}.sql`], {
        env: { MSYS_NO_PATHCONV: '1' },
      });
    }

    step('server tests (Deno)', 'deno', [
      'test', '--no-check', '--allow-read', '--allow-env',
      'supabase/functions/_fleet-server/service_items_*.test.ts',
      'supabase/functions/_fleet-server/maintenance_*.test.ts',
      'supabase/functions/_fleet-server/parts_finder.test.ts',
      'supabase/functions/_fleet-server/canonical_from_ops*.test.ts',
      'supabase/functions/_fleet-server/ledger_*.test.ts',
      'supabase/functions/_fleet-server/unified_ledger*.test.ts',
    ]);
    step('Fleet unit tests', pnpm, ['--filter', 'fleet', 'exec', 'vitest', 'run', 'src/components/vehicles/maintenance-logging']);
    step('Dominion unit tests', pnpm, ['--filter', 'admin', 'exec', 'vitest', 'run', 'src/components/admin/maintenance-master/jobs']);

    if (!noE2e) {
      const pw = ['node_modules/@playwright/test/cli.js', 'test', '--reporter=list', '--retries=0'];
      const env = { ADMIN_BASE_URL: ADMIN, FLEET_BASE_URL: FLEET };
      step('Fleet click-through (service items + log service)', 'node', [...pw, 'e2e/fleet-service-items.spec.ts', 'e2e/fleet-maintenance-log-service.spec.ts', '--project=fleet'], { env });
      step('Dominion click-through (service items)', 'node', [...pw, 'e2e/dominion-service-items.spec.ts', '--project=dominion-admin'], { env });
    }
  } finally {
    if (startedCopy) {
      console.error('\n>>> stopping the test copy');
      quiet(pnpm, ['testcopy:stop']);
    }
  }

  console.error('\n==== Service items done-tests ====');
  for (const r of results) console.error(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}`);
  const failed = results.filter((r) => !r.ok).length;
  console.error(failed ? `\n${failed} failed.` : '\nAll passed.');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
