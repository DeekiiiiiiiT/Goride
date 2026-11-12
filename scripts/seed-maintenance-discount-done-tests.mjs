#!/usr/bin/env node
/** Apply maintenance discount done-test SQL fixtures (local / testcopy DB only). */
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const dbContainer = process.env.SUPABASE_DB_CONTAINER || 'supabase_db_Goride';
const fixtures = join(root, 'e2e', 'fixtures');

const mode = process.argv[2] || 'seed';

// CR-09: never seed or tear down anything but a local database.
function assertLocalDbUrl(url) {
  let host = '';
  try {
    host = new URL(url).hostname.replace(/^\[|\]$/g, '');
  } catch {
    host = '';
  }
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
    console.error(`seed-maintenance-discount-done-tests: refusing non-local DATABASE_URL (host "${host || '?'}")`);
    process.exit(1);
  }
}
assertLocalDbUrl(dbUrl);

function psqlOnPath() {
  const probe = spawnSync('psql', ['--version'], { encoding: 'utf8', shell: false });
  return !probe.error && probe.status === 0;
}

function runSqlFile(filePath) {
  if (!existsSync(filePath)) {
    console.error(`Missing SQL file: ${filePath}`);
    process.exit(1);
  }
  if (psqlOnPath()) {
    const r = spawnSync('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-f', filePath], {
      encoding: 'utf8',
      stdio: 'inherit',
      shell: false,
    });
    if (r.status !== 0) process.exit(r.status ?? 1);
    return;
  }
  const docker = spawnSync('docker', ['inspect', '-f', '{{.State.Running}}', dbContainer], { encoding: 'utf8' });
  if (docker.status !== 0 || docker.stdout?.trim() !== 'true') {
    console.error('seed-maintenance-discount-done-tests: need psql or running', dbContainer);
    process.exit(1);
  }
  const sql = readFileSync(filePath, 'utf8');
  const r = spawnSync(
    'docker',
    ['exec', '-i', dbContainer, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', '-'],
    { encoding: 'utf8', stdio: ['pipe', 'inherit', 'inherit'], input: sql },
  );
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (mode === 'teardown') {
  runSqlFile(join(fixtures, 'maintenance-discount-done-test-teardown.sql'));
  console.log('maintenance discount done-test teardown: ok');
  process.exit(0);
}

if (mode === 'seed') {
  runSqlFile(join(fixtures, 'maintenance-discount-done-test-seed.sql'));
  console.log('maintenance discount done-test seed: ok');
  process.exit(0);
}

console.error('Usage: node scripts/seed-maintenance-discount-done-tests.mjs seed|teardown');
process.exit(1);
