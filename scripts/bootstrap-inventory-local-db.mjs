#!/usr/bin/env node
/** Apply archived monolithic inventory migrations after `supabase db reset` (R5-06 local bootstrap). */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = join(dirname(import.meta.dirname));
const archive = join(root, 'supabase', 'migrations_archive');
const files = readdirSync(archive)
  .filter((f) => /^20261101143\d00_fleet_inventory/.test(f))
  .sort();

if (!files.length) {
  console.error('No archived fleet inventory migrations found');
  process.exit(1);
}

const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

for (const file of files) {
  const sql = readFileSync(join(archive, file), 'utf8');
  const r = spawnSync('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-c', sql], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (r.status !== 0) {
    console.error(`Failed applying ${file}`);
    process.exit(r.status ?? 1);
  }
  console.log(`Applied ${file}`);
}

// R5 follow-up migrations from supabase/migrations
const follow = [
  '20261101165324_fleet_inventory_r5_verify_chain.sql',
  '20261101165346_fleet_inventory_r5_data_migration_a.sql',
  '20261101165352_fleet_inventory_r5_data_migration_b.sql',
  '20261101165415_fleet_inventory_r5_data_migration_c.sql',
  '20261101171948_fleet_inventory_engine_rpcs_ext.sql',
  '20261101171958_fleet_inv_public_bridge.sql',
];
for (const file of follow) {
  const path = join(root, 'supabase', 'migrations', file);
  const sql = readFileSync(path, 'utf8');
  const r = spawnSync('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-c', sql], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (r.status !== 0) {
    console.error(`Failed applying ${file}`);
    process.exit(r.status ?? 1);
  }
  console.log(`Applied ${file}`);
}

const testOrg = process.env.INVENTORY_TEST_ORG_ID || 'test-org-inv';
const seed = `
INSERT INTO fleet.inv_settings (organization_id) VALUES ('${testOrg}')
ON CONFLICT (organization_id) DO NOTHING;
`;
const seedRun = spawnSync('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-c', seed], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (seedRun.status !== 0) process.exit(seedRun.status ?? 1);

console.log('Inventory local bootstrap complete');
