#!/usr/bin/env node
/**
 * Start local Supabase, edge functions, and the four test-copy apps (ports 5180–5183).
 * Stop with: pnpm testcopy:stop
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
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
  console.error('Serving edge functions (fleet-core, fleet-ops, driver, explorer)…');
  spawnBg('functions', npx, [
    'supabase',
    'functions',
    'serve',
    'fleet-core',
    'fleet-ops',
    'driver',
    'explorer',
    '--no-verify-jwt',
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
