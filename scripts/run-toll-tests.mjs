#!/usr/bin/env node
/**
 * One-command toll v2 test runner (local Supabase only).
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const isWin = process.platform === 'win32';
const npx = isWin ? 'npx.cmd' : 'npx';
const pnpm = isWin ? 'pnpm.cmd' : 'pnpm';
const deno = isWin ? 'deno.exe' : 'deno';

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const argv = process.argv.slice(2);
const keepDb = argv.includes('--keep-db');

const results = [];

function assertLocalDatabaseUrl() {
  let host = '';
  try {
    host = new URL(DATABASE_URL.replace(/^postgresql:/, 'http:')).hostname;
  } catch {
    console.error('run-toll-tests: invalid DATABASE_URL');
    process.exit(1);
  }
  const ok =
    host === '127.0.0.1' || host === 'localhost' || host === 'host.docker.internal';
  if (!ok) {
    console.error(`run-toll-tests: refuse non-local DATABASE_URL host: ${host}`);
    process.exit(1);
  }
}

function runStep(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
    console.log(`ok  ${name}`);
  } catch (e) {
    results.push({ name, ok: false, detail: e.message });
    console.error(`FAIL ${name}: ${e.message}`);
  }
}

function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: 'inherit',
    shell: isWin,
    ...opts,
  });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} exited ${r.status}`);
  }
}

function dockerDbContainer() {
  const r = spawnSync(
    'docker',
    ['ps', '--format', '{{.Names}}'],
    { encoding: 'utf8', shell: isWin },
  );
  const name = (r.stdout || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .find((s) => s.startsWith('supabase_db_'));
  if (!name) throw new Error('no supabase_db_* container running');
  return name;
}

function tollSqlFiles() {
  const dir = join(root, 'supabase/tests');
  return readdirSync(dir)
    .filter((f) => f.startsWith('toll_v2_') && f.endsWith('.sql'))
    .filter((f) => f !== 'toll_v2_r0_live_look.sql')
    .sort();
}

assertLocalDatabaseUrl();

runStep('docker available', () => {
  sh('docker', ['info'], { stdio: 'pipe' });
});

runStep('supabase start', () => {
  sh(npx, ['supabase', 'start']);
});

if (!keepDb) {
  runStep('supabase db reset --no-seed', () => {
    sh(npx, ['supabase', 'db', 'reset', '--no-seed']);
  });
}

const db = dockerDbContainer();

for (const file of tollSqlFiles()) {
  const label = `sql ${file}`;
  runStep(label, () => {
    const remote = `/tmp/${file}`;
    sh('docker', ['cp', join(root, 'supabase/tests', file), `${db}:${remote}`]);
    sh('docker', [
      'exec',
      db,
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-f',
      remote,
    ]);
  });
}

runStep('toll-concurrency-test', () => {
  sh('node', [join(root, 'scripts/toll-concurrency-test.mjs')]);
});

runStep('@roam/toll-core vitest', () => {
  sh(pnpm, ['--filter', '@roam/toll-core', 'test']);
});

runStep('deno toll edge tests', () => {
  sh(deno, [
    'test',
    '--allow-read',
    '--allow-env',
    join(root, 'supabase/functions/_fleet-server/toll_v2_command_errors.test.ts'),
    join(root, 'supabase/functions/_fleet-server/toll_seal_before_pay.test.ts'),
  ]);
});

console.log('\n--- toll test summary ---');
for (const r of results) {
  console.log(`${r.ok ? 'ok ' : 'FAIL'} ${r.name}${r.detail ? ` (${r.detail})` : ''}`);
}

const failed = results.filter((r) => !r.ok);
if (failed.length) {
  process.exit(1);
}

console.log('\nLocal Supabase database left running.');
