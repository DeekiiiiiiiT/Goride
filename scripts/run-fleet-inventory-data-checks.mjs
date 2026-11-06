#!/usr/bin/env node
/** CI + local: kit version SQL tests and fleet inventory integrity gate (audit D-5). */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const dbContainer = process.env.SUPABASE_DB_CONTAINER || 'supabase_db_Goride';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sqlDir = join(root, 'scripts', 'sql');
const kitTest = join(sqlDir, 'fleet_inventory_kit_versions_test.sql');
const vehicleRelinkTest = join(sqlDir, 'fleet_inventory_vehicle_inv_location_relink_test.sql');
const integrity = join(sqlDir, 'fleet_inventory_integrity_checks.sql');
const psqlOpts = { shell: false };

function psqlOnPath() {
  const probe = spawnSync('psql', ['--version'], { encoding: 'utf8', ...psqlOpts });
  return !probe.error && probe.status === 0;
}

function runPsqlArgs(args, { capture = false, input = null } = {}) {
  const stdio = capture ? ['pipe', 'pipe', 'pipe'] : 'inherit';
  if (psqlOnPath()) {
    return spawnSync('psql', [dbUrl, ...args], {
      encoding: 'utf8',
      stdio: input != null ? ['pipe', capture ? 'pipe' : 'inherit', capture ? 'pipe' : 'inherit'] : stdio,
      input,
      ...psqlOpts,
    });
  }

  const docker = spawnSync('docker', ['inspect', '-f', '{{.State.Running}}', dbContainer], {
    encoding: 'utf8',
  });
  if (docker.status !== 0 || docker.stdout?.trim() !== 'true') {
    console.error(
      'run-fleet-inventory-data-checks: psql not on PATH and Docker container not running:',
      dbContainer,
    );
    process.exit(1);
  }

  return spawnSync(
    'docker',
    ['exec', '-i', dbContainer, 'psql', '-U', 'postgres', '-d', 'postgres', ...args],
    {
      encoding: 'utf8',
      stdio: input != null ? ['pipe', capture ? 'pipe' : 'inherit', capture ? 'pipe' : 'inherit'] : stdio,
      input,
    },
  );
}

function runSqlFile(filePath, psqlArgs, capture) {
  const sql = readFileSync(filePath, 'utf8');
  if (psqlOnPath()) {
    return runPsqlArgs(['-v', 'ON_ERROR_STOP=1', ...psqlArgs, '-f', filePath], { capture });
  }
  return runPsqlArgs(['-v', 'ON_ERROR_STOP=1', ...psqlArgs, '-f', '-'], { capture, input: sql });
}

console.log('Fleet inventory data checks: kit versions test…');
const kit = runSqlFile(kitTest, [], false);
if (kit.status !== 0) {
  if (kit.stderr) process.stderr.write(kit.stderr);
  process.exit(kit.status ?? 1);
}

console.log('Fleet inventory data checks: vehicle inv_location relink…');
const relink = runSqlFile(vehicleRelinkTest, [], false);
if (relink.status !== 0) {
  if (relink.stderr) process.stderr.write(relink.stderr);
  process.exit(relink.status ?? 1);
}

console.log('Fleet inventory data checks: integrity…');
const gate = runSqlFile(integrity, ['-tA'], true);
if (gate.status !== 0) {
  if (gate.stderr) process.stderr.write(gate.stderr);
  process.exit(gate.status ?? 1);
}

const rows = (gate.stdout || '').trim();
if (rows) {
  console.error('Fleet inventory integrity checks returned rows (expected 0):');
  console.error(rows);
  process.exit(1);
}

console.log('Fleet inventory data checks: ok');
