#!/usr/bin/env node
/**
 * Compare repo migration files to production MD5 fingerprints.
 * Usage: node scripts/compare-migration-md5-to-prod.mjs [path-to-prod-md5.json]
 *
 * prod-md5.json: [{ "version": "20261029140000", "prod_md5": "..." }, ...]
 * Versions in MIGRATION_SYNC_SKIP_VERSIONS are excluded from comparison.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import {
  migrationBodyMd5,
  versionInSyncRange,
  MIGRATION_SYNC_SKIP_VERSIONS,
} from './migration-md5-normalize.mjs';

const root = join(dirname(import.meta.dirname));
const migrationsDir = join(root, 'supabase', 'migrations');
const fingerprintPath =
  process.argv[2] || join(root, 'scripts', 'prod-migration-md5-fingerprints.json');

const rows = JSON.parse(readFileSync(fingerprintPath, 'utf8'));
const prodByVersion = new Map();
for (const row of rows) {
  if (row.prod_md5 != null) prodByVersion.set(row.version, row.prod_md5);
}

const byPrefix = new Map();
for (const f of readdirSync(migrationsDir).filter((x) => x.endsWith('.sql'))) {
  const m = /^(\d{14})_/.exec(f);
  if (m) byPrefix.set(m[1], f);
}

const mismatches = [];
const missingProd = [];
const missingRepo = [];

for (const [version, prodMd5] of prodByVersion) {
  if (!versionInSyncRange(version)) continue;
  if (MIGRATION_SYNC_SKIP_VERSIONS.has(version)) continue;
  const file = byPrefix.get(version);
  if (!file) {
    missingRepo.push(version);
    continue;
  }
  const repoMd5 = migrationBodyMd5(readFileSync(join(migrationsDir, file), 'utf8'));
  if (repoMd5 !== prodMd5) {
    mismatches.push({ version, file, repoMd5, prodMd5 });
  }
}

for (const version of MIGRATION_SYNC_SKIP_VERSIONS) {
  if (!byPrefix.has(version)) missingRepo.push(version);
}

if (missingRepo.length) {
  console.error('Repo missing migration file for version(s):', missingRepo.join(', '));
}

if (missingProd.length) {
  console.error('No prod fingerprint for:', missingProd.join(', '));
}

if (mismatches.length) {
  console.error(`${mismatches.length} migration(s) differ from production (normalized MD5):`);
  for (const m of mismatches) {
    console.error(`  ${m.version} ${m.file}`);
    console.error(`    repo: ${m.repoMd5}`);
    console.error(`    prod: ${m.prodMd5}`);
  }
  process.exit(1);
}

const compared = [...prodByVersion.keys()].filter(
  (v) => versionInSyncRange(v) && !MIGRATION_SYNC_SKIP_VERSIONS.has(v),
).length;
console.log(
  `OK — ${compared} migration(s) in range match production MD5 (${MIGRATION_SYNC_SKIP_VERSIONS.size} skipped).`,
);
