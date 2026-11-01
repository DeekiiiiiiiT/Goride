#!/usr/bin/env node
/**
 * Copy scripts/tmp-migrations/<version>.sql into supabase/migrations/<matching file>.
 * Skips MIGRATION_SYNC_SKIP_VERSIONS. Optional --dry-run.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { MIGRATION_SYNC_SKIP_VERSIONS } from './migration-md5-normalize.mjs';

function bodyEndsOk(trimmed) {
  const withoutLineComments = trimmed.replace(/^\s*--[^\n]*\n/gm, '').trim();
  if (withoutLineComments.length === 0) return false;
  return (
    /;\s*$/.test(withoutLineComments) ||
    /END\s*\$\$;\s*$/i.test(withoutLineComments) ||
    /\$\$\s*$/i.test(withoutLineComments) ||
    /END\s*\$\w*\$\s*$/i.test(withoutLineComments)
  );
}

const dryRun = process.argv.includes('--dry-run');
const root = join(dirname(import.meta.dirname));
const tmp = join(root, 'scripts', 'tmp-migrations');
const migrationsDir = join(root, 'supabase', 'migrations');

const byPrefix = new Map();
for (const f of readdirSync(migrationsDir).filter((x) => x.endsWith('.sql'))) {
  const m = /^(\d{14})_/.exec(f);
  if (m) byPrefix.set(m[1], f);
}

const tmpFiles = readdirSync(tmp).filter((f) => /^\d{14}\.sql$/.test(f));
if (!tmpFiles.length) {
  console.error('No scripts/tmp-migrations/<version>.sql files found');
  process.exit(1);
}

for (const tf of tmpFiles.sort()) {
  const version = tf.replace(/\.sql$/, '');
  if (MIGRATION_SYNC_SKIP_VERSIONS.has(version)) {
    console.log(`Skip ${version}`);
    continue;
  }
  const filename = byPrefix.get(version);
  if (!filename) {
    console.error(`No migration file for version ${version}`);
    process.exit(1);
  }
  const body = readFileSync(join(tmp, tf), 'utf8').trimEnd();
  if (!bodyEndsOk(body)) {
    console.error(`${version}: does not end on a complete statement`);
    process.exit(1);
  }
  if (dryRun) {
    console.log(`[dry-run] Would write ${filename}`);
    continue;
  }
  writeFileSync(join(migrationsDir, filename), `${body}\n`, 'utf8');
  console.log(`Wrote ${filename} (${Buffer.byteLength(body, 'utf8')} bytes)`);
}
