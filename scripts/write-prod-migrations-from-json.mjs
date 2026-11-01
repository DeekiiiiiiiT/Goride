#!/usr/bin/env node
/**
 * Write migration files from JSON array: [{ version, body }, ...]
 * UTF-8 without BOM. Used after fetching from supabase_migrations.schema_migrations.
 */
import { writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const root = join(dirname(import.meta.dirname));
const migrationsDir = join(root, 'supabase', 'migrations');

const raw = JSON.parse(await import('node:fs/promises').then((fs) => fs.readFile(process.argv[2], 'utf8')));
const input = Array.isArray(raw?.payload) ? raw.payload : raw;
const byPrefix = new Map();
for (const f of readdirSync(migrationsDir)) {
  const m = /^(\d{14})_/.exec(f);
  if (m) byPrefix.set(m[1], f);
}

for (const { version, body } of input) {
  const name = byPrefix.get(version);
  if (!name) {
    console.error(`No file for version ${version}`);
    process.exit(1);
  }
  if (!body || typeof body !== 'string') {
    console.error(`Empty body for ${version}`);
    process.exit(1);
  }
  const trimmed = body.trimEnd();
  if (!trimmed.endsWith(';')) {
    console.error(`${version}: body does not end with semicolon`);
    process.exit(1);
  }
  writeFileSync(join(migrationsDir, name), `${trimmed}\n`, 'utf8');
  console.log(`Wrote ${name} (${Buffer.byteLength(trimmed, 'utf8')} bytes)`);
}
