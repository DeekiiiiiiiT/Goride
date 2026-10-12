/**
 * procurement_events stores the event time in `at`, not `created_at`.
 * A select of the wrong name fails quietly and the buyer desk loses the claimer.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('..', import.meta.url)));
const routes = readFileSync(join(ROOT, 'supabase/functions/delivery/inHouse/routes.ts'), 'utf8');
const migration = readFileSync(join(ROOT, 'supabase/migrations/20261011120000_in_house_procurement.sql'), 'utf8');

const lookups = [...routes.matchAll(/from\("procurement_events"\)[\s\S]{0,180}?\.select\("([^"]+)"\)/g)];
const bad = lookups.filter((match) => match[1].split(',').map((part) => part.trim()).includes('created_at'));
if (!lookups.length) {
  console.error('[check-procurement-event-column] no procurement_events selects found');
  process.exit(1);
}
if (bad.length) {
  console.error('[check-procurement-event-column] event lookups still select created_at:\n' + bad.map((match) => match[1]).join('\n'));
  process.exit(1);
}

const table = migration.slice(migration.indexOf('CREATE TABLE IF NOT EXISTS delivery.procurement_events'));
if (!/^\s*at timestamptz/m.test(table.slice(0, 800))) {
  console.error('[check-procurement-event-column] procurement_events is missing column at');
  process.exit(1);
}

console.log('[check-procurement-event-column] ok');
