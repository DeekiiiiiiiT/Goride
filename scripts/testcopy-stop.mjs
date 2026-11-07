#!/usr/bin/env node
/** Stop test-copy apps, edge function serve, and local Supabase. */
import { readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const isWin = process.platform === 'win32';
const npx = isWin ? 'npx.cmd' : 'npx';
const stateFile = join(root, '.testcopy', 'pids.json');

const WATCH_PORTS = [3000, 3001, 4173, 5173, 5180, 5181, 5182, 5183];

function killPid(pid) {
  if (!pid) return;
  try {
    if (isWin) {
      spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', shell: true });
    } else {
      process.kill(pid, 'SIGTERM');
    }
  } catch {
    /* ignore */
  }
}

function killByPort(port) {
  if (isWin) {
    spawnSync('npx', ['--yes', 'kill-port', String(port)], { cwd: root, stdio: 'ignore', shell: true });
  } else {
    spawnSync('fuser', ['-k', `${port}/tcp`], { stdio: 'ignore' });
  }
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

function portsInUse() {
  const busy = [];
  for (const port of WATCH_PORTS) {
    if (isWin) {
      const r = spawnSync(
        'powershell',
        [
          '-NoProfile',
          '-Command',
          `(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count`,
        ],
        { encoding: 'utf8', shell: true },
      );
      const n = Number(String(r.stdout || '').trim());
      if (n > 0) busy.push(port);
    } else {
      const r = spawnSync('lsof', ['-i', `:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
      if (r.status === 0 && r.stdout.trim()) busy.push(port);
    }
  }
  return busy;
}

try {
  const raw = readFileSync(stateFile, 'utf8');
  const state = JSON.parse(raw);
  for (const entry of state.children || []) {
    killPid(entry.pid);
  }
} catch {
  /* no state file */
}

for (const port of [5180, 5181, 5182, 5183]) {
  killByPort(port);
}
killFunctionsServe();

spawnSync(npx, ['supabase', 'stop'], { cwd: root, stdio: 'inherit', shell: isWin });

try {
  rmSync(join(root, '.testcopy'), { recursive: true, force: true });
} catch {
  /* ignore */
}

const busy = portsInUse();
if (busy.length) {
  console.error(`Ports still listening: ${busy.join(', ')}`);
  process.exit(1);
}
console.log('Test copy stopped. Ports 3000, 3001, 4173, 5173, 5180–5183 are free.');
