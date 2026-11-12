import { execSync } from 'node:child_process';

export const MD_DISC_ORG = 'd6010000-0000-4000-8000-000000000088';
export const MD_DISC_VEHICLE_ID = 'md-disc-veh-001';
export const MD_DISC_PLATE = 'MD-DISC-001';
export const MD_DISC_OWNER_EMAIL = 'md-disc-done-owner@local.test';
export const MD_DISC_OWNER_ID = 'd6010001-0000-4000-8000-000000000001';

const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const dbContainer = process.env.SUPABASE_DB_CONTAINER || 'supabase_db_Goride';

/** CR-09: the done-test helper only ever talks to a local database. */
export function assertLocalDbUrl(url: string): void {
  let host = '';
  try {
    host = new URL(url).hostname.replace(/^\[|\]$/g, '');
  } catch {
    host = '';
  }
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
    throw new Error(`maintenance discount done-tests: refusing non-local DATABASE_URL (host "${host || '?'}")`);
  }
}

function psqlOnPath() {
  try {
    execSync('psql --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function psqlCommand(flags: string): string {
  assertLocalDbUrl(dbUrl);
  return psqlOnPath()
    ? `psql "${dbUrl}" ${flags} -v ON_ERROR_STOP=1 -f -`
    : `docker exec -i ${dbContainer} psql -U postgres -d postgres ${flags} -v ON_ERROR_STOP=1 -f -`;
}

export function queryMaintenanceDiscountDb(sql: string): string {
  return execSync(psqlCommand('-tA'), { input: sql, encoding: 'utf8' }).trim();
}

export function applyMaintenanceDiscountDoneSeed() {
  execSync('node scripts/seed-maintenance-discount-done-tests.mjs seed', {
    cwd: process.cwd(),
    stdio: 'inherit',
  });
}

export function teardownMaintenanceDiscountDone() {
  execSync('node scripts/seed-maintenance-discount-done-tests.mjs teardown', {
    cwd: process.cwd(),
    stdio: 'inherit',
  });
}

export function latestSavedServiceTotals(vehicleId = MD_DISC_VEHICLE_ID): {
  total_cost: number;
  discount_amount: number;
  record_cost: number | null;
} {
  const line = queryMaintenanceDiscountDb(`
    SELECT
      coalesce(wo.total_cost, 0)::text || '|' ||
      coalesce(wo.discount_amount, 0)::text || '|' ||
      coalesce(mr.cost, 0)::text
    FROM public.maintenance_work_orders wo
    LEFT JOIN public.maintenance_records mr ON mr.id = wo.maintenance_record_id
    WHERE wo.organization_id = '${MD_DISC_ORG}'
      AND wo.vehicle_id = '${vehicleId.replace(/'/g, "''")}'
      AND wo.status = 'completed'
      AND wo.voided_at IS NULL
    ORDER BY wo.closed_at DESC NULLS LAST, wo.created_at DESC
    LIMIT 1
  `);
  if (!line) {
    return { total_cost: 0, discount_amount: 0, record_cost: null };
  }
  const [total, discount, record] = line.split('|');
  return {
    total_cost: Number(total) || 0,
    discount_amount: Number(discount) || 0,
    record_cost: Number(record) || 0,
  };
}
