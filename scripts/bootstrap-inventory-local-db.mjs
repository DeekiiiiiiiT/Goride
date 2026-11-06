#!/usr/bin/env node
/** Seed test org for CI inventory Deno tests after full `supabase db reset` replay. */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const testOrg = process.env.INVENTORY_TEST_ORG_ID || 'test-org-inv';

const dbContainer = process.env.SUPABASE_DB_CONTAINER || 'supabase_db_Goride';

function psqlOnPath() {
  const probe = spawnSync('psql', ['--version'], { encoding: 'utf8', shell: false });
  return !probe.error && probe.status === 0;
}

function runPsqlArgs(args, { capture = false, input = null } = {}) {
  const stdio = capture ? ['pipe', 'pipe', 'pipe'] : 'inherit';
  if (psqlOnPath()) {
    return spawnSync('psql', [dbUrl, ...args], {
      encoding: 'utf8',
      stdio: input != null ? ['pipe', capture ? 'pipe' : 'inherit', capture ? 'pipe' : 'inherit'] : stdio,
      input,
      shell: false,
    });
  }
  const docker = spawnSync('docker', ['inspect', '-f', '{{.State.Running}}', dbContainer], {
    encoding: 'utf8',
  });
  if (docker.status !== 0 || docker.stdout?.trim() !== 'true') {
    console.error(
      'bootstrap-inventory-local-db: psql not on PATH and Docker container not running:',
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

const check = runPsqlArgs(['-tAc', "select to_regclass('fleet.inv_settings') is not null"], { capture: true });
if (check.status !== 0 || check.stdout?.trim() !== 't') {
  console.error('fleet.inv_settings missing — run supabase db reset before bootstrap');
  process.exit(1);
}

const seed = `
INSERT INTO fleet.inv_settings (organization_id) VALUES ('${testOrg}')
ON CONFLICT (organization_id) DO NOTHING;
`;
const seedRun = runPsqlArgs(['-v', 'ON_ERROR_STOP=1', '-c', seed]);
if (seedRun.status !== 0) process.exit(seedRun.status ?? 1);

const seedFile = join(dirname(fileURLToPath(import.meta.url)), '..', 'e2e', 'fixtures', 'inventory-seed.sql');
const seedSql = psqlOnPath()
  ? spawnSync('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-v', `seed_org=${testOrg}`, '-f', seedFile], {
      stdio: 'inherit',
      shell: false,
    })
  : runPsqlArgs(['-v', 'ON_ERROR_STOP=1', '-v', `seed_org=${testOrg}`, '-f', '-'], {
      input: readFileSync(seedFile, 'utf8'),
    });
if (seedSql.status !== 0) {
  console.warn('inventory-seed.sql skipped or failed (tables may be empty until migration catch-up)');
}

console.log(`Inventory local bootstrap complete (org ${testOrg})`);
