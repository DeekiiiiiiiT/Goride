#!/usr/bin/env node
/**
 * Write supabase/migrations/* from production export JSON.
 * Input: [{ "version": "...", "b64": "..." }] or [{ "version", "body" }]
 * Skips MIGRATION_SYNC_SKIP_VERSIONS. Optional --dry-run.
 *
 * Usage:
 *   node scripts/decode-prod-b64-export.mjs export.txt   # -> tmp-migrations/
 *   node scripts/sync-migration-bodies-from-prod-export.mjs scripts/tmp-migrations/prod-export.json
 *   node scripts/apply-tmp-migration-bodies.mjs            # all tmp/*.sql -> migrations
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { MIGRATION_SYNC_SKIP_VERSIONS } from './migration-md5-normalize.mjs';

const dryRun = process.argv.includes('--dry-run');
const args = process.argv.filter((a) => a !== '--dry-run');
const inputPath = args[2];

const root = join(dirname(import.meta.dirname));
const migrationsDir = join(root, 'supabase', 'migrations');
const tmpDir = join(root, 'scripts', 'tmp-migrations');

const byPrefix = new Map();
for (const f of readdirSync(migrationsDir).filter((x) => x.endsWith('.sql'))) {
  const m = /^(\d{14})_/.exec(f);
  if (m) byPrefix.set(m[1], f);
}

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

function writeBody(version, body) {
  if (MIGRATION_SYNC_SKIP_VERSIONS.has(version)) {
    console.log(`Skip ${version} (placeholder prod row)`);
    return;
  }
  const name = byPrefix.get(version);
  if (!name) {
    console.error(`No repo file for version ${version}`);
    process.exit(1);
  }
  if (!body || !String(body).trim()) {
    console.error(`Empty body for ${version}`);
    process.exit(1);
  }
  const trimmed = body.trimEnd();
  if (!bodyEndsOk(trimmed)) {
    console.warn(`${version}: prod body has no trailing semicolon (matches schema_migrations)`);
  }
  const out = `${trimmed}\n`;
  if (dryRun) {
    console.log(`[dry-run] Would write ${name} (${Buffer.byteLength(trimmed, 'utf8')} bytes)`);
    return;
  }
  writeFileSync(join(migrationsDir, name), out, 'utf8');
  console.log(`Wrote ${name} (${Buffer.byteLength(trimmed, 'utf8')} bytes)`);
}

if (inputPath) {
  const raw = JSON.parse(readFileSync(inputPath, 'utf8'));
  const rows = Array.isArray(raw?.payload) ? raw.payload : raw;
  for (const row of rows) {
    let body = row.body;
    if (!body && row.b64) {
      body = Buffer.from(String(row.b64).replace(/\s+/g, ''), 'base64').toString('utf8');
    }
    if (!body) {
      console.error(`Empty body for ${row.version}`);
      process.exit(1);
    }
    writeBody(row.version, body);
  }
} else {
  console.error('Usage: node scripts/sync-migration-bodies-from-prod-export.mjs <export.json> [--dry-run]');
  process.exit(1);
}
