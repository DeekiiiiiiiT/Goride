#!/usr/bin/env node
/** Print versions whose repo MD5 differs from scripts/prod-migration-md5-fingerprints.json */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import {
  migrationBodyMd5,
  versionInSyncRange,
  MIGRATION_SYNC_SKIP_VERSIONS,
} from './migration-md5-normalize.mjs';

const root = join(dirname(import.meta.dirname));
const migrationsDir = join(root, 'supabase', 'migrations');
const rows = JSON.parse(
  readFileSync(join(root, 'scripts', 'prod-migration-md5-fingerprints.json'), 'utf8'),
);

const byPrefix = new Map();
for (const f of readdirSync(migrationsDir).filter((x) => x.endsWith('.sql'))) {
  const m = /^(\d{14})_/.exec(f);
  if (m) byPrefix.set(m[1], f);
}

const need = [];
for (const row of rows) {
  const { version, prod_md5: prodMd5 } = row;
  if (!versionInSyncRange(version)) continue;
  if (MIGRATION_SYNC_SKIP_VERSIONS.has(version)) continue;
  if (prodMd5 == null) continue;
  const file = byPrefix.get(version);
  if (!file) continue;
  const repoMd5 = migrationBodyMd5(readFileSync(join(migrationsDir, file), 'utf8'));
  if (repoMd5 !== prodMd5) need.push(version);
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(need));
} else {
  console.log(need.length);
  for (const v of need) console.log(v);
}
