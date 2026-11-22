#!/usr/bin/env node
/**
 * One-command fuel Round 1 test runner (local Supabase only).
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const isWin = process.platform === 'win32';
const npx = isWin ? 'npx.cmd' : 'npx';
const argv = process.argv.slice(2);
const keepDb = argv.includes('--keep-db');

const results = [];

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

function assertLocalDatabaseUrl() {
  let host = '';
  try {
    host = new URL(DATABASE_URL.replace(/^postgresql:/, 'http:')).hostname;
  } catch {
    console.error('run-fuel-tests: invalid DATABASE_URL');
    process.exit(1);
  }
  const ok =
    host === '127.0.0.1' || host === 'localhost' || host === 'host.docker.internal';
  if (!ok) {
    console.error(`run-fuel-tests: refuse non-local DATABASE_URL host: ${host}`);
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

function fuelSqlFiles() {
  const dir = join(root, 'supabase/tests');
  return readdirSync(dir)
    .filter((f) => f.startsWith('fuel_') && f.endsWith('_test.sql'))
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

for (const file of fuelSqlFiles()) {
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

console.log('\n--- fuel test summary ---');
for (const r of results) {
  console.log(`${r.ok ? 'ok ' : 'FAIL'} ${r.name}${r.detail ? ` (${r.detail})` : ''}`);
}

const failed = results.filter((r) => !r.ok);
if (failed.length) {
  process.exit(1);
}

console.log('\nLocal Supabase database left running.');