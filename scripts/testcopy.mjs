#!/usr/bin/env node
/**
 * Start local Supabase, edge functions, and the four test-copy apps (ports 5180–5183).
 * Stop with: pnpm testcopy:stop
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const isWin = process.platform === 'win32';
const pnpm = isWin ? 'pnpm.cmd' : 'pnpm';
const npx = isWin ? 'npx.cmd' : 'npx';
const stateDir = join(root, '.testcopy');
const stateFile = join(stateDir, 'pids.json');

const SUPABASE_START_EXCLUDE =
  'realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,logflare,vector,supavisor';

const APP_COMMANDS = [
  { label: 'dominion', filter: '@roam/admin', port: 5180 },
  { label: 'fleet', filter: '@roam/fleet', port: 5181 },
  { label: 'driver', filter: '@roam/driver', port: 5182 },
  { label: 'plug', filter: '@roam/plug', port: 5183 },
];

/**
 * Vehicle pictures on the test copy: when the owner's git-ignored .env.local has these keys,
 * the served functions get them, so certificate reading (Gemini) and AI pictures (Gemini + R2) work locally.
 * Without them the test copy behaves as before. Values are never printed.
 */
const PASS_THROUGH_KEYS = [
  'GEMINI_API_KEY',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_PUBLIC_BASE_URL',
  'R2_BUCKET_PUBLIC',
  'R2_BUCKET_PRIVATE',
];

function ownerKeysFromEnvLocal() {
  const file = join(root, '.env.local');
  if (!existsSync(file)) return [];
  const lines = [];
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = raw.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && PASS_THROUGH_KEYS.includes(m[1]) && m[2].trim()) lines.push(`${m[1]}=${m[2].trim()}`);
  }
  return lines;
}

/** The local database's cron key, so its pg_cron calls (e.g. the vehicle picture worker) are accepted by the served functions. */
function localCronSecretLine() {
  const r = spawnSync(
    'docker',
    ['exec', 'supabase_db_Goride', 'psql', '-U', 'postgres', '-d', 'postgres', '-Atc',
      "select value from private.fleet_ops_secrets where name = 'fleet_cron_secret'"],
    { encoding: 'utf8' },
  );
  const v = (r.stdout || '').trim();
  return r.status === 0 && v.length >= 8 ? [`FLEET_CRON_SECRET=${v}`] : [];
}

const children = [];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: isWin });
  if (r.status !== 0) {
    fail(`testcopy failed while running ${cmd} ${args.join(' ')}.`);
  }
}

function spawnBg(label, cmd, args) {
  const child = spawn(cmd, args, {
    cwd: root,
    stdio: 'ignore',
    shell: isWin,
    detached: !isWin,
  });
  children.push({ label, pid: child.pid, cmd, args });
  return child;
}

async function waitForHttp(url, timeoutMs = 240_000) {
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
  fail(`testcopy timed out waiting for ${url}.`);
}

function saveState() {
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(
    stateFile,
    JSON.stringify({ startedAt: new Date().toISOString(), children }, null, 2),
    'utf8',
  );
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

async function main() {
  console.error('Starting local Supabase (test copy)…');
  run(npx, ['supabase', 'start', '-x', SUPABASE_START_EXCLUDE]);
  await waitForHttp('http://127.0.0.1:54321/rest/v1/');

  killFunctionsServe();
  // Local-only secrets the edge functions refuse to start without (test values, never real ones).
  mkdirSync(stateDir, { recursive: true });
  const functionsEnvFile = join(stateDir, 'functions.env');
  const ownerKeys = ownerKeysFromEnvLocal();
  writeFileSync(
    functionsEnvFile,
    [
      'PLUG_USER_HASH_PEPPER=testcopy-local-only-pepper',
      // parts-sourcing-drain refuses every call without its secret; the e2e drains with this test value.
      'PARTS_SOURCING_DRAIN_SECRET=testcopy-local-drain-secret',
      ...localCronSecretLine(),
      ...ownerKeys,
    ].join('\n') + '\n',
    'utf8',
  );
  if (ownerKeys.length) {
    console.error(`Using ${ownerKeys.map((l) => l.split('=')[0]).join(', ')} from .env.local (vehicle pictures).`);
  }
  console.error('Serving edge functions (fleet-core, fleet-ops, driver, explorer, platform-catalog, parts-sourcing-drain)…');
  spawnBg('functions', npx, [
    'supabase',
    'functions',
    'serve',
    'fleet-core',
    'fleet-ops',
    'driver',
    'explorer',
    'platform-catalog',
    'parts-sourcing-drain',
    '--no-verify-jwt',
    '--env-file',
    functionsEnvFile,
  ]);
  await new Promise((r) => setTimeout(r, 8000));
  await waitForHttp('http://127.0.0.1:54321/functions/v1/fleet-core');

  for (const app of APP_COMMANDS) {
    console.error(`Starting ${app.label} on http://127.0.0.1:${app.port}…`);
    spawnBg(app.label, pnpm, ['--filter', app.filter, 'run', 'dev:testcopy']);
  }

  saveState();

  for (const app of APP_COMMANDS) {
    await waitForHttp(`http://127.0.0.1:${app.port}/`);
  }

  console.log('\nTest copy is running.');
  console.log('  Dominion  http://127.0.0.1:5180');
  console.log('  RoamFleet http://127.0.0.1:5181');
  console.log('  Driver    http://127.0.0.1:5182');
  console.log('  Plug      http://127.0.0.1:5183');
  console.log('\nStop everything: pnpm testcopy:stop\n');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
