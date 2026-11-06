#!/usr/bin/env node
/** Apply inventory done-test SQL fixtures (local Supabase only). */
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const dbContainer = process.env.SUPABASE_DB_CONTAINER || 'supabase_db_Goride';
const fixtures = join(root, 'e2e', 'fixtures');

const mode = process.argv[2] || 'seed';
const scenario = process.argv.find((a) => a.startsWith('--scenario='))?.split('=')[1];

/** Baseline inventory flags after reset (local done-test suite). */
export const INVENTORY_DONE_TEST_FLAG_BASELINE = {
  fleet_inventory_phase0_security: true,
  fleet_inventory_phase1_engine: true,
  fleet_inventory_phase2_stock: true,
  fleet_inventory_phase3_kits: true,
  fleet_inventory_phase4_assets: false,
  fleet_inventory_phase5_maintenance: false,
  fleet_inventory_phase6_purchasing: false,
  fleet_inventory_phase7_counts: false,
  fleet_inventory_phase8_telematics: false,
  inv_road_clearance_gate: true,
};

function psqlOnPath() {
  const probe = spawnSync('psql', ['--version'], { encoding: 'utf8', shell: false });
  return !probe.error && probe.status === 0;
}

function runSqlFile(filePath) {
  if (!existsSync(filePath)) {
    console.error(`Missing SQL file: ${filePath}`);
    process.exit(1);
  }
  const sql = readFileSync(filePath, 'utf8');
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
    console.error('seed-inventory-done-tests: need psql or running', dbContainer);
    process.exit(1);
  }
  const r = spawnSync(
    'docker',
    ['exec', '-i', dbContainer, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', '-'],
    { encoding: 'utf8', stdio: ['pipe', 'inherit', 'inherit'], input: sql },
  );
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function querySql(sql) {
  if (psqlOnPath()) {
    const r = spawnSync('psql', [dbUrl, '-tA', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
      encoding: 'utf8',
      shell: false,
    });
    if (r.status !== 0) {
      console.error(r.stderr || r.stdout);
      process.exit(r.status ?? 1);
    }
    return (r.stdout || '').trim();
  }
  const docker = spawnSync('docker', ['inspect', '-f', '{{.State.Running}}', dbContainer], { encoding: 'utf8' });
  if (docker.status !== 0 || docker.stdout?.trim() !== 'true') {
    console.error('seed-inventory-done-tests: need psql or running', dbContainer);
    process.exit(1);
  }
  const r = spawnSync(
    'docker',
    ['exec', '-i', dbContainer, 'psql', '-U', 'postgres', '-d', 'postgres', '-tA', '-v', 'ON_ERROR_STOP=1', '-c', sql],
    { encoding: 'utf8', shell: false },
  );
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    process.exit(r.status ?? 1);
  }
  return (r.stdout || '').trim();
}

function assertClean() {
  const zzCount = querySql(`SELECT count(*)::text FROM fleet.inv_item WHERE sku ILIKE 'ZZ-TEST-%'`);
  if (zzCount !== '0') {
    console.error(`assert-clean FAIL: ${zzCount} ZZ-TEST-* item row(s) remain`);
    process.exit(1);
  }

  const names = Object.keys(INVENTORY_DONE_TEST_FLAG_BASELINE)
    .map((n) => `'${n.replace(/'/g, "''")}'`)
    .join(',');
  const rows = querySql(
    `SELECT name || '=' || CASE WHEN enabled THEN 't' ELSE 'f' END FROM public.platform_feature_flags WHERE name IN (${names}) ORDER BY name`,
  );
  const got = {};
  for (const line of rows.split('\n').filter(Boolean)) {
    const [name, val] = line.split('=');
    got[name] = val === 't';
  }
  const diffs = [];
  for (const [name, expected] of Object.entries(INVENTORY_DONE_TEST_FLAG_BASELINE)) {
    if (got[name] !== expected) {
      diffs.push(`${name}: expected ${expected}, got ${got[name] ?? 'missing'}`);
    }
  }
  if (diffs.length) {
    console.error('assert-clean FAIL: platform_feature_flags drift:\n' + diffs.join('\n'));
    process.exit(1);
  }
  console.log('inventory done-test assert-clean: ok (0 ZZ-TEST rows, flags match baseline)');
}

if (mode === 'reset') {
  runSqlFile(join(fixtures, 'inventory-done-test-reset.sql'));
  runSqlFile(join(fixtures, 'inventory-done-test-teardown.sql'));
  console.log('inventory done-test reset: ok');
  process.exit(0);
}

if (mode === 'assert-clean') {
  assertClean();
  process.exit(0);
}

if (mode === 'teardown') {
  runSqlFile(join(fixtures, 'inventory-done-test-teardown.sql'));
  const orgItems = querySql(
    `SELECT count(*)::text FROM fleet.inv_item WHERE organization_id = 'f6010000-0000-4000-8000-000000000099'`,
  );
  if (orgItems !== '0') {
    console.error(`inventory done-test teardown FAIL: ${orgItems} inv_item row(s) remain for test org`);
    process.exit(1);
  }
  console.log('inventory done-test teardown: ok');
  process.exit(0);
}

if (mode === 'seed') {
  runSqlFile(join(fixtures, 'inventory-done-test-seed.sql'));
  if (scenario) {
    const scenarioFile = join(fixtures, 'inventory-done-test-scenarios', `${scenario}.sql`);
    if (existsSync(scenarioFile)) runSqlFile(scenarioFile);
  }
  console.log('inventory done-test seed: ok');
  process.exit(0);
}

console.error('Usage: node scripts/seed-inventory-done-tests.mjs seed|teardown|reset|assert-clean [--scenario=dt01]');
process.exit(1);
