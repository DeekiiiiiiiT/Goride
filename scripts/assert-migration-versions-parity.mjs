#!/usr/bin/env node
/**
 * Fail CI when repo migration versions and linked production drift (audit R20-03).
 * Compares supabase/migrations/*.sql prefixes to `supabase migration list --linked -o json`.
 *
 * Env: SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF (default csfllzzastacofsvcdsc)
 * Skip linked check when SKIP_LINKED_MIGRATION_PARITY=1 (local dev without token).
 */
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { MIGRATION_SYNC_SKIP_VERSIONS } from './migration-md5-normalize.mjs';

const root = join(dirname(import.meta.dirname));
const migrationsDir = join(root, 'supabase', 'migrations');

function repoVersions() {
  const set = new Set();
  for (const f of readdirSync(migrationsDir).filter((x) => x.endsWith('.sql'))) {
    const m = /^(\d{14})_/.exec(f);
    if (!m) continue;
    if (MIGRATION_SYNC_SKIP_VERSIONS.has(m[1])) continue;
    set.add(m[1]);
  }
  return set;
}

function linkedVersions() {
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  const projectRef = process.env.SUPABASE_PROJECT_REF?.trim() || 'csfllzzastacofsvcdsc';
  if (!token) {
    if (process.env.SKIP_LINKED_MIGRATION_PARITY === '1') {
      console.log('SKIP — no SUPABASE_ACCESS_TOKEN (SKIP_LINKED_MIGRATION_PARITY=1)');
      process.exit(0);
    }
    console.error('Missing SUPABASE_ACCESS_TOKEN for linked migration parity check.');
    process.exit(1);
  }
  const out = execFileSync(
    'npx',
    ['supabase@2.99.0', 'migration', 'list', '--linked', '-o', 'json', '--project-ref', projectRef],
    {
      cwd: root,
      env: { ...process.env, SUPABASE_ACCESS_TOKEN: token },
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
    },
  );
  const data = JSON.parse(out.replace(/^\uFEFF/, '').trim());
  const rows = data.migrations ?? data;
  const set = new Set();
  for (const row of rows) {
    const local = String(row.local ?? '').trim();
    const remote = String(row.remote ?? '').trim();
    const version = local || remote;
    if (!/^\d{14}$/.test(version)) continue;
    if (MIGRATION_SYNC_SKIP_VERSIONS.has(version)) continue;
    set.add(version);
  }
  return set;
}

const repo = repoVersions();
const linked = linkedVersions();

const missingInRepo = [...linked].filter((v) => !repo.has(v));
const missingInProd = [...repo].filter((v) => !linked.has(v));

if (missingInRepo.length) {
  console.error('Linked production versions missing from repo:', missingInRepo.join(', '));
}
if (missingInProd.length) {
  console.error('Repo migration versions not applied on linked project:', missingInProd.join(', '));
}

if (missingInRepo.length || missingInProd.length) {
  process.exit(1);
}

console.log(`OK — ${repo.size} migration version(s) match linked production list.`);
process.exit(0);
