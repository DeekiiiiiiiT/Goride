#!/usr/bin/env node
/** Seed test org for CI inventory Deno tests after full `supabase db reset` replay. */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const testOrg = process.env.INVENTORY_TEST_ORG_ID || 'test-org-inv';

const check = spawnSync(
  'psql',
  [dbUrl, '-tAc', "select to_regclass('fleet.inv_settings') is not null"],
  { encoding: 'utf8', shell: process.platform === 'win32' },
);
if (check.status !== 0 || check.stdout?.trim() !== 't') {
  console.error('fleet.inv_settings missing — run supabase db reset before bootstrap');
  process.exit(1);
}

const seed = `
INSERT INTO fleet.inv_settings (organization_id) VALUES ('${testOrg}')
ON CONFLICT (organization_id) DO NOTHING;
`;
const seedRun = spawnSync('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-c', seed], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (seedRun.status !== 0) process.exit(seedRun.status ?? 1);

const seedFile = join(dirname(fileURLToPath(import.meta.url)), '..', 'e2e', 'fixtures', 'inventory-seed.sql');
const seedSql = spawnSync(
  'psql',
  [dbUrl, '-v', 'ON_ERROR_STOP=1', '-v', `seed_org=${testOrg}`, '-f', seedFile],
  { stdio: 'inherit', shell: process.platform === 'win32' },
);
if (seedSql.status !== 0) {
  console.warn('inventory-seed.sql skipped or failed (tables may be empty until migration catch-up)');
}

console.log(`Inventory local bootstrap complete (org ${testOrg})`);
