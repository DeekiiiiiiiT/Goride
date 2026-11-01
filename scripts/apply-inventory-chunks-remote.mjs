/**
 * Apply inventory SQL chunks to linked Supabase project via Management API.
 * Requires: SUPABASE_ACCESS_TOKEN (from `supabase login`), project ref csfllzzastacofsvcdsc
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

const projectRef = process.env.SUPABASE_PROJECT_REF || 'csfllzzastacofsvcdsc';
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error('Set SUPABASE_ACCESS_TOKEN (supabase login / dashboard access token)');
  process.exit(1);
}

const dir = join(dirname(import.meta.dirname), 'supabase', 'migrations_archive');
const files = [
  '20261101143100_fleet_inventory_phase0.sql',
  '20261101143200_fleet_inventory_engine_schema.sql',
  '20261101143300_fleet_inventory_engine_rpcs.sql',
  '20261101143400_fleet_inventory_data_migration.sql',
  '20261101143500_fleet_inventory_maintenance_consume.sql',
  '20261101143600_fleet_inventory_engine_rpcs_ext.sql',
].map((f) => join(dir, f));

for (const [i, file] of files.entries()) {
  const query = readFileSync(file, 'utf8');
  const name = file.split(/[/\\]/).pop().replace(/\.sql$/, '');
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  const body = await res.text();
  if (!res.ok) {
    console.error(`FAIL ${name}:`, body);
    process.exit(1);
  }
  console.log(`OK ${i + 1}/${files.length} ${name}`);
}

console.log('Done');
