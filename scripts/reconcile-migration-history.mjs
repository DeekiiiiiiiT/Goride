/**
 * Parse supabase migration list JSON and print repair commands.
 * Usage:
 *   npx supabase@latest migration list -o json > migration-list.json
 *   node scripts/reconcile-migration-history.mjs migration-list.json
 */
import { readFileSync } from 'node:fs';

const path = process.argv[2] || 'migration-list.json';
const buf = readFileSync(path);
// PowerShell `> file.json` writes UTF-16 LE BOM — detect and decode.
const raw =
  buf[0] === 0xff && buf[1] === 0xfe
    ? buf.toString('utf16le').replace(/^\uFEFF/, '').trim()
    : buf.toString('utf8').replace(/^\uFEFF/, '').trim();
const data = JSON.parse(raw);
const rows = data.migrations ?? data;

const remoteOnly = [];
const localOnly = [];

for (const row of rows) {
  const local = (row.local ?? '').trim();
  const remote = (row.remote ?? '').trim();
  if (remote && !local) remoteOnly.push(remote);
  if (local && !remote) localOnly.push(local);
}

const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

console.log(`Remote-only (dashboard ghosts): ${remoteOnly.length}`);
console.log(`Local-only (repo not on remote): ${localOnly.length}`);
console.log('');

if (remoteOnly.length) {
  console.log('# Step 1 — ignore dashboard-only IDs (does NOT undo schema):');
  for (const batch of chunk(remoteOnly, 80)) {
    console.log(
      `npx supabase@latest migration repair --status reverted ${batch.join(' ')}`,
    );
  }
  console.log('');
}

if (localOnly.length) {
  console.log('# Step 2 — mark repo migrations already live on staging as applied:');
  console.log('# Review first: many Aug migrations may need db push instead of repair.');
  for (const batch of chunk(localOnly, 80)) {
    console.log(
      `npx supabase@latest migration repair --status applied ${batch.join(' ')}`,
    );
  }
  console.log('');
}

console.log('# Step 3 — push anything still missing:');
console.log('npx supabase@latest db push');
