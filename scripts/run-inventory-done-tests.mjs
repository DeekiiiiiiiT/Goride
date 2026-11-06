#!/usr/bin/env node
/**
 * One-command inventory done-tests (local Supabase only).
 * Order: start DB → reset → bootstrap → inventory reset → restart functions → build apps →
 * previews → Playwright (18 specs + postflight) → assert-clean → stop everything.
 */
import { spawn, spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const isWin = process.platform === 'win32';
const pnpm = isWin ? 'pnpm.cmd' : 'pnpm';
const npx = isWin ? 'npx.cmd' : 'npx';

/** Windows: long repo paths break `supabase functions serve` (ENAMETOOLONG). */
const SUBST_DRIVE = 'Z:';
let workRoot = root;
let substMapped = false;

function mapSubstIfNeeded() {
  if (!isWin) return;
  const check = spawnSync('subst', [], { encoding: 'utf8', shell: true });
  const substOut = check.stdout || '';
  if (substOut.includes(`${SUBST_DRIVE}`)) {
    workRoot = `${SUBST_DRIVE}\\`;
    return;
  }
  const map = spawnSync('subst', [SUBST_DRIVE, root], { shell: true });
  if (map.status !== 0) {
    console.error('run-inventory-done-tests: subst failed — map Z: to the repo or use a shorter path');
    process.exit(1);
  }
  workRoot = `${SUBST_DRIVE}\\`;
  substMapped = true;
}

function unmapSubstIfNeeded() {
  if (!substMapped) return;
  spawnSync('subst', [SUBST_DRIVE, '/d'], { shell: true, stdio: 'ignore' });
  substMapped = false;
}

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const FLEET_BASE_URL = process.env.FLEET_BASE_URL || 'http://127.0.0.1:3000';
const DRIVER_BASE_URL = process.env.DRIVER_BASE_URL || 'http://127.0.0.1:5174';
const SUPABASE_START_EXCLUDE =
  'realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,logflare,vector,supavisor';

const children = [];

function assertLocalDatabaseUrl() {
  let host = '';
  try {
    host = new URL(DATABASE_URL.replace(/^postgresql:/, 'http:')).hostname;
  } catch {
    console.error('run-inventory-done-tests: invalid DATABASE_URL');
    process.exit(1);
  }
  const ok = host === '127.0.0.1' || host === 'localhost' || host === 'host.docker.internal';
  if (!ok) {
    console.error(`run-inventory-done-tests: refuse non-local DATABASE_URL host: ${host}`);
    process.exit(1);
  }
}

function run(cmd, args, opts = {}) {
  const { env: extraEnv, ...rest } = opts;
  console.error(`\n>>> ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, {
    cwd: workRoot,
    stdio: 'inherit',
    shell: isWin,
    ...rest,
    env: { ...process.env, DATABASE_URL, ...extraEnv },
  });
  if (r.status !== 0) {
    throw new Error(`Command failed (${r.status}): ${cmd} ${args.join(' ')}`);
  }
}

function spawnBg(label, cmd, args, env = {}) {
  console.error(`\n>>> [bg ${label}] ${cmd} ${args.join(' ')}`);
  const child = spawn(cmd, args, {
    cwd: workRoot,
    stdio: 'ignore',
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
      if (isWin) {
        spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', shell: true });
      } else {
        process.kill(-child.pid, 'SIGTERM');
      }
    } catch {
      try {
        child.kill('SIGKILL');
      } catch {
        /* ignore */
      }
    }
  }
  children.length = 0;
}

function killFunctionsServe() {
  if (isWin) {
    spawnSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -match 'supabase functions serve' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
      ],
      { stdio: 'ignore', shell: true },
    );
  } else {
    spawnSync('pkill', ['-f', 'supabase functions serve'], { stdio: 'ignore' });
  }
}

async function waitForHttp(url, timeoutMs = 180_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.status === 503) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      if (res.ok || res.status === 404 || res.status === 401 || res.status === 405) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timeout waiting for ${url}`);
}

async function main() {
  assertLocalDatabaseUrl();
  mapSubstIfNeeded();

  run('npx', ['supabase', 'start', '-x', SUPABASE_START_EXCLUDE]);
  run('npx', ['supabase', 'db', 'reset']);
  run('node', ['scripts/bootstrap-inventory-local-db.mjs'], {
    env: { INVENTORY_TEST_ORG_ID: process.env.INVENTORY_TEST_ORG_ID || 'test-org-inv' },
  });
  run('node', ['scripts/seed-inventory-done-tests.mjs', 'reset']);

  killFunctionsServe();
  spawnBg('fleet-core', npx, ['supabase', 'functions', 'serve', 'fleet-core', '--no-verify-jwt']);
  spawnBg('delivery', npx, ['supabase', 'functions', 'serve', 'delivery', '--no-verify-jwt']);
  await new Promise((r) => setTimeout(r, 8000));
  await waitForHttp('http://127.0.0.1:54321/functions/v1/fleet-core');

  run('node', ['scripts/build-inventory-e2e-previews.mjs']);

  spawnBg('fleet-preview', pnpm, [
    '--filter',
    '@roam/fleet',
    'exec',
    'vite',
    'preview',
    '--host',
    '127.0.0.1',
    '--port',
    '3000',
  ]);
  spawnBg('driver-preview', pnpm, [
    '--filter',
    '@roam/driver',
    'exec',
    'vite',
    'preview',
    '--host',
    '127.0.0.1',
    '--port',
    '5174',
  ]);
  await waitForHttp(`${FLEET_BASE_URL}/`);
  await waitForHttp(`${DRIVER_BASE_URL}/`);

  const pwInstallArgs =
    process.env.CI === 'true' || process.env.CI === '1'
      ? ['playwright', 'install', '--with-deps', 'chromium']
      : ['playwright', 'install', 'chromium'];
  run(npx, pwInstallArgs);

  const e2eEnv = {
    INVENTORY_E2E: '1',
    INVENTORY_E2E_SUPABASE_PROJECT_REF: process.env.INVENTORY_E2E_SUPABASE_PROJECT_REF || 'Goride',
    FLEET_BASE_URL,
    DRIVER_BASE_URL,
    CI: process.env.CI || '',
  };

  const specDir = join(workRoot, 'e2e');
  const specFiles = readdirSync(specDir)
    .filter((f) => /^inventory-done-test-.+\.spec\.ts$/.test(f))
    .sort()
    .map((f) => join('e2e', f).replace(/\\/g, '/'));

  run(
    'node',
    ['node_modules/@playwright/test/cli.js', 'test', '--project=inventory', ...specFiles],
    { env: e2eEnv },
  );

  run('node', ['scripts/seed-inventory-done-tests.mjs', 'assert-clean']);
  console.log('run-inventory-done-tests: ok');
}

main()
  .catch((err) => {
    console.error(err.message || err);
    process.exitCode = 1;
  })
  .finally(() => {
    killChildren();
    killFunctionsServe();
    unmapSubstIfNeeded();
  });
