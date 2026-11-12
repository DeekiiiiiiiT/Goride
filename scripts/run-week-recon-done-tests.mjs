#!/usr/bin/env node
/**
 * One-command Week Reconciliation done-tests (LOCAL Supabase only, Docker must be open).
 * Order: start DB → reset (all migrations, incl. the 9 Week Reconciliation ones) → seed
 * (SQL users + driver weeks, then the real server code creates and publishes every week) →
 * build edge bundles → serve functions → build Fleet → preview → Playwright → stop everything.
 *
 * Usage:
 *   pnpm test:week-recon            → all done-tests
 *   pnpm test:week-recon 02 16      → only done-tests 02 and 16
 *   --keep-db                       → leave the local database running afterwards
 *   --hold                          → set up, then keep everything running (no tests) until
 *                                     node_modules/.cache/week-recon-stop exists; then stop all
 *
 * Fleet preview runs on port 3100 (3000 is often taken on this machine).
 */
import { execSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, openSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const isWin = process.platform === 'win32';
const pnpm = isWin ? 'pnpm.cmd' : 'pnpm';
const npx = isWin ? 'npx.cmd' : 'npx';

const argv = process.argv.slice(2);
const keepDb = argv.includes('--keep-db');
const hold = argv.includes('--hold');
const picks = argv.filter((a) => !a.startsWith('--')).map((a) => a.toLowerCase().replace(/^0?(\d)$/, '0$1'));

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const FLEET_PORT = process.env.WEEK_RECON_FLEET_PORT || '3100';
const FLEET_BASE_URL = `http://127.0.0.1:${FLEET_PORT}`;
const SUPABASE_START_EXCLUDE = 'realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,logflare,vector,supavisor';
const DB_CONTAINER = process.env.SUPABASE_DB_CONTAINER || 'supabase_db_Goride';
const FUNCTIONS = ['fleet-core', 'fleet-toll', 'fleet-fuel', 'fleet-pay', 'fleet-claims'];
// Every bundle is rebuilt from source: a stale committed bundle hid the week-version check (Rev 24).
const BUNDLED = ['fleet-core', 'fleet-toll', 'fleet-fuel', 'fleet-pay', 'fleet-claims'];
const FUNCTIONS_LOG = join(root, 'functions-serve-week-recon.log');

const children = [];

function assertLocalDatabaseUrl() {
  const host = new URL(DATABASE_URL.replace(/^postgresql:/, 'http:')).hostname;
  if (!['127.0.0.1', 'localhost', 'host.docker.internal'].includes(host)) {
    console.error(`run-week-recon-done-tests: refuse non-local DATABASE_URL host: ${host}`);
    process.exit(1);
  }
}

function run(cmd, args, opts = {}) {
  const { env: extraEnv, input, ...rest } = opts;
  console.error(`\n>>> ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: input != null ? ['pipe', 'inherit', 'inherit'] : 'inherit',
    input,
    shell: isWin,
    ...rest,
    env: { ...process.env, DATABASE_URL, ...extraEnv },
  });
  if (r.status !== 0) throw new Error(`Command failed (${r.status}): ${cmd} ${args.join(' ')}`);
}

function psqlOnPath() {
  const probe = spawnSync('psql', ['--version'], { encoding: 'utf8', shell: false });
  return !probe.error && probe.status === 0;
}

/** SQL goes in on stdin, never on the command line (Windows cuts multi-line -c). */
function runSqlFile(file) {
  const sql = readFileSync(file, 'utf8');
  if (psqlOnPath()) run('psql', [DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-f', '-'], { input: sql, shell: false });
  else run('docker', ['exec', '-i', DB_CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', '-'], { input: sql, shell: false });
}

function supabaseStatus() {
  const out = execSync('npx supabase status -o json', { cwd: root, encoding: 'utf8', env: { ...process.env, CI: '1', NO_COLOR: '1' } });
  const st = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1));
  const apiUrl = String(st.API_URL || 'http://127.0.0.1:54321').replace(/\/$/, '');
  if (!st.ANON_KEY || !st.SERVICE_ROLE_KEY) throw new Error('supabase status: missing ANON_KEY / SERVICE_ROLE_KEY');
  return { apiUrl, anonKey: st.ANON_KEY, serviceKey: st.SERVICE_ROLE_KEY };
}

function spawnBg(label, cmd, args, env = {}, logFile = null) {
  console.error(`\n>>> [bg ${label}] ${cmd} ${args.join(' ')}`);
  const out = logFile ? openSync(logFile, 'w') : null;
  const child = spawn(cmd, args, {
    cwd: root,
    stdio: out != null ? ['ignore', out, out] : 'ignore',
    shell: isWin,
    detached: !isWin,
    env: { ...process.env, DATABASE_URL, ...env },
  });
  children.push(child);
  return child;
}

function killChildren() {
  for (const child of children) {
    try {
      if (isWin) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', shell: true });
      else process.kill(-child.pid, 'SIGTERM');
    } catch {
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
    }
  }
  children.length = 0;
}

function killFunctionsServe() {
  if (isWin) {
    spawnSync('powershell', ['-NoProfile', '-Command',
      "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -match 'supabase functions serve' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
    ], { stdio: 'ignore', shell: true });
  } else {
    spawnSync('pkill', ['-f', 'supabase functions serve'], { stdio: 'ignore' });
  }
}

function dumpFunctionsLog() {
  if (!existsSync(FUNCTIONS_LOG)) return;
  console.error('\n--- last lines of `supabase functions serve` ---');
  console.error(readFileSync(FUNCTIONS_LOG, 'utf8').split(/\r?\n/).slice(-80).join('\n'));
}

async function waitFor(check, label, timeoutMs = 180_000) {
  const start = Date.now();
  let last = 'no response';
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await check();
      if (r === true) return;
      last = String(r);
    } catch (e) {
      last = String(e);
    }
    await new Promise((res) => setTimeout(res, 1000));
  }
  throw new Error(`Timeout waiting for ${label} (last: ${last})`);
}

async function main() {
  assertLocalDatabaseUrl();
  const started = Date.now();

  run(npx, ['supabase', 'start', '-x', SUPABASE_START_EXCLUDE]);
  run(npx, ['supabase', 'db', 'reset']);
  const { apiUrl, anonKey, serviceKey } = supabaseStatus();

  runSqlFile(join(root, 'e2e', 'fixtures', 'week-recon-done-test-seed.sql'));
  run('deno', ['run', '--allow-env', '--allow-net', '--allow-read', '--allow-write', '--no-check', 'scripts/seed-week-recon-done-tests.ts'], {
    env: { SUPABASE_URL: apiUrl, SUPABASE_SERVICE_ROLE_KEY: serviceKey },
    shell: false,
  });

  for (const fn of BUNDLED) run('node', ['scripts/build-edge-bundle.mjs', fn]);
  killFunctionsServe();
  spawnBg('functions', npx, ['supabase', 'functions', 'serve', ...FUNCTIONS, '--no-verify-jwt'], {}, FUNCTIONS_LOG);
  for (const fn of FUNCTIONS) {
    await waitFor(async () => {
      const res = await fetch(`${apiUrl}/functions/v1/${fn}`);
      const text = await res.text();
      return res.status !== 503 && !/Function not found/i.test(text) ? true : `${res.status} ${text.slice(0, 200)}`;
    }, `edge function ${fn}`);
  }

  run(pnpm, ['--filter', '@roam/fleet', 'build'], {
    env: { VITE_SUPABASE_URL: apiUrl, VITE_SUPABASE_ANON_KEY: anonKey, VITE_SUPABASE_PROJECT_ID: 'Goride' },
  });
  spawnBg('fleet-preview', pnpm, ['--filter', '@roam/fleet', 'exec', 'vite', 'preview', '--host', '127.0.0.1', '--port', FLEET_PORT, '--strictPort']);
  await waitFor(async () => ((await fetch(`${FLEET_BASE_URL}/`)).ok ? true : 'not ready'), 'Fleet preview');

  if (hold) {
    const stopFile = join(root, 'node_modules', '.cache', 'week-recon-stop');
    if (existsSync(stopFile)) unlinkSync(stopFile);
    console.error(`
>>> HOLD: everything is running (Fleet ${FLEET_BASE_URL}, API ${apiUrl}). Create ${stopFile} to stop.`);
    await waitFor(async () => (existsSync(stopFile) ? true : 'holding'), 'stop file', 4 * 60 * 60 * 1000);
    unlinkSync(stopFile);
    return;
  }

  run(npx, ['playwright', 'install', 'chromium']);

  const specFiles = readdirSync(join(root, 'e2e'))
    .filter((f) => /^week-recon-done-test-.+\.spec\.ts$/.test(f))
    .filter((f) => !picks.length || picks.some((p) => f.startsWith(`week-recon-done-test-${p}`)))
    .sort()
    .map((f) => `e2e/${f}`);
  if (!specFiles.length) throw new Error(`No done-test matches "${picks.join(' ')}"`);
  // Phase 2 = the approval done-tests (8a, 8b, 8d, 8e): they close weeks, so they run last,
  // on weeks brought to "ready to close" by the app's own calls, with the calculator running.
  // 03 (Uber upload → "received") also needs the calculator running.
  const isApproval = (f) => /week-recon-done-test-(03|05|06|08[abde]|09t|09b|13)\.spec\.ts$/.test(f);
  const phase1 = specFiles.filter((f) => !isApproval(f));
  const phase2 = specFiles.filter(isApproval);
  console.error(`\n>>> setup done in ${Math.round((Date.now() - started) / 1000)}s; running ${specFiles.length} test file(s)`);

  const e2eEnv = {
    WEEK_RECON_E2E: '1',
    FLEET_BASE_URL,
    WEEK_RECON_SUPABASE_URL: apiUrl,
    WEEK_RECON_ANON_KEY: anonKey,
    WEEK_RECON_SERVICE_KEY: serviceKey,
    CI: process.env.CI || '',
  };
  let failed = null;
  if (phase1.length) {
    try {
      run('node', ['node_modules/@playwright/test/cli.js', 'test', '--project=week-recon', ...phase1], { env: e2eEnv });
    } catch (e) {
      failed = e;
    }
  }
  if (phase2.length) {
    // A close waits for the latest nightly check to report no differences; live runs one every
    // night, a fresh copy has none. Run one to its end first.
    run('deno', ['run', '--allow-env', '--allow-net', '--allow-read', '--no-check', 'scripts/recon-worker-local.ts', '--nightly'], {
      env: { SUPABASE_URL: apiUrl, SUPABASE_SERVICE_ROLE_KEY: serviceKey },
      shell: false,
    });
    run('node', ['scripts/seed-week-recon-closable.mjs'], { env: { SUPABASE_URL: apiUrl, SUPABASE_ANON_KEY: anonKey } });
    spawnBg('calculator', 'deno', ['run', '--allow-env', '--allow-net', '--allow-read', '--no-check', 'scripts/recon-worker-local.ts', '--loop'], {
      SUPABASE_URL: apiUrl,
      SUPABASE_SERVICE_ROLE_KEY: serviceKey,
    });
    run('node', ['node_modules/@playwright/test/cli.js', 'test', '--project=week-recon', ...phase2], { env: e2eEnv });
  }
  if (failed) throw failed;
  console.log('run-week-recon-done-tests: ok');
}

main()
  .catch((err) => {
    console.error(err.message || err);
    dumpFunctionsLog();
    process.exitCode = 1;
  })
  .finally(() => {
    killChildren();
    killFunctionsServe();
    if (!keepDb && !process.env.CI) {
      spawnSync(npx, ['supabase', 'stop'], { cwd: root, stdio: 'inherit', shell: isWin });
    }
  });
