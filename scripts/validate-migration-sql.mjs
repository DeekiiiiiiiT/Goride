/**
 * CI guard: migration SQL must not reference trip_id on tables without that column.
 * Run: node scripts/validate-migration-sql.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = join(import.meta.dirname, '..', 'supabase', 'migrations');
const NO_TRIP_ID_TABLES = ['fleet.fuel_entries', 'fleet.expense_journal'];

const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
let failed = false;

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
console.log('OK — migration SQL trip_id references validated');
