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

/** Intentional sort anchors already on main (see docs/ci-red-root-cause.md). */
const GRANDFATHERED_FUTURE_PREFIXES = new Set([
  '20261105020000',
  '20261105030000',
]);

function parseMigrationPrefixUtc(prefix) {
  return Date.UTC(
    Number(prefix.slice(0, 4)),
    Number(prefix.slice(4, 6)) - 1,
    Number(prefix.slice(6, 8)),
    Number(prefix.slice(8, 10)),
    Number(prefix.slice(10, 12)),
    Number(prefix.slice(12, 14)),
  );
}

const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
let failed = false;

const futureSlackMs = 5 * 60 * 1000;
const nowUtc = Date.now() + futureSlackMs;
for (const file of files) {
  const m = VERSION_PREFIX.exec(file);
  if (!m) continue;
  if (GRANDFATHERED_FUTURE_PREFIXES.has(m[1])) continue;
  if (parseMigrationPrefixUtc(m[1]) > nowUtc) {
    console.error(
      `${file}: migration timestamp is in the future (use \`supabase migration new <name>\`)`,
    );
    failed = true;
  }
}

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
  const trimmed = text.replace(/\s+$/, '');
  const withoutLineComments = trimmed.replace(/^\s*--[^\n]*\n/gm, '').trim();
  if (withoutLineComments.length > 0) {
    const endsOk =
      /;\s*$/.test(withoutLineComments) ||
      /END\s*\$\$;\s*$/i.test(withoutLineComments);
    if (!endsOk) {
      console.error(
        `${file}: migration SQL does not end on a complete statement (possible byte-split truncation)`,
      );
      failed = true;
    }
  }
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

/** Equal-size consecutive chunks often mean a script was split by bytes, not statements. */
const inventorySchemaChunks = files
  .filter((f) => /_fleet_inventory_engine_schema_\d+\.sql$/.test(f))
  .map((f) => ({ file: f, size: readFileSync(join(MIGRATIONS, f), 'utf8').length }))
  .sort((a, b) => a.file.localeCompare(b.file));
const sizeCounts = new Map();
for (const { size } of inventorySchemaChunks) {
  sizeCounts.set(size, (sizeCounts.get(size) || 0) + 1);
}
for (const [size, count] of sizeCounts) {
  if (count >= 3 && size > 4000) {
    console.error(
      `${count} fleet_inventory_engine_schema_* files share ${size} bytes — check for byte-split migrations (see docs/ci-red-root-cause.md)`,
    );
    failed = true;
  }
}

if (failed) process.exit(1);
console.log(
  'OK — migration SQL validated (trip_id + unique version prefixes + migration dates)',
);
