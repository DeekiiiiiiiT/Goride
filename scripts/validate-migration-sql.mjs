/**
 * CI guard: migration SQL must not reference trip_id on tables without that column,
 * and must not reuse the same YYYYMMDDHHMMSS version prefix (silent apply loss).
 * Run: node scripts/validate-migration-sql.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = join(import.meta.dirname, '..', 'supabase', 'migrations');
const NO_TRIP_ID_TABLES = ['fleet.fuel_entries', 'fleet.expense_journal'];
const VERSION_PREFIX = /^(\d{14})_/;

const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
let failed = false;

/** Same timestamp prefix → only one migration applies; reject collisions (GoRide period table miss). */
const byPrefix = new Map();
for (const file of files) {
  const m = VERSION_PREFIX.exec(file);
  if (!m) continue;
  const list = byPrefix.get(m[1]) || [];
  list.push(file);
  byPrefix.set(m[1], list);
}
for (const [prefix, list] of byPrefix) {
  if (list.length > 1) {
    console.error(
      `duplicate migration version prefix ${prefix}: ${list.join(', ')}`,
    );
    failed = true;
  }
}

for (const file of files) {
  const text = readFileSync(join(MIGRATIONS, file), 'utf8');
  for (const table of NO_TRIP_ID_TABLES) {
    const alias = table.includes('fuel') ? 'fe' : 'ej';
    const pattern = new RegExp(
      `UPDATE\\s+${table.replace('.', '\\.')}\\s+${alias}[\\s\\S]*?\\.trip_id`,
      'i',
    );
    if (pattern.test(text)) {
      console.error(`${file}: invalid trip_id reference on ${table}`);
      failed = true;
    }
  }
}

if (failed) process.exit(1);
console.log('OK — migration SQL validated (trip_id + unique version prefixes)');
