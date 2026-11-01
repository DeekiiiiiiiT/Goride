#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

const root = join(dirname(import.meta.dirname));
const tmp = join(root, 'scripts', 'tmp-migrations');
const migrationsDir = join(root, 'supabase', 'migrations');

const map = [
  ['20261101163300', '20261101163300_fleet_inventory_engine_schema_1.sql'],
  ['20261101163316', '20261101163316_fleet_inventory_engine_schema_2.sql'],
  ['20261101163329', '20261101163329_fleet_inventory_engine_schema_3.sql'],
  ['20261101163332', '20261101163332_fleet_inventory_engine_schema_4.sql'],
  ['20261101163335', '20261101163335_fleet_inventory_engine_schema_5.sql'],
  ['20261101163357', '20261101163357_fleet_inventory_engine_schema_6.sql'],
  ['20261101163402', '20261101163402_fleet_inventory_engine_schema_7.sql'],
  ['20261101163408', '20261101163408_fleet_inventory_engine_schema_8.sql'],
  ['20261101163616', '20261101163616_fleet_inventory_engine_rpcs_4.sql'],
];

for (const [version, filename] of map) {
  const body = readFileSync(join(tmp, `${version}.sql`), 'utf8').trimEnd();
  if (!body.endsWith(';')) {
    console.error(`${version}: does not end with semicolon`);
    process.exit(1);
  }
  writeFileSync(join(migrationsDir, filename), `${body}\n`, 'utf8');
  console.log(`Wrote ${filename} (${Buffer.byteLength(body, 'utf8')} bytes)`);
}
