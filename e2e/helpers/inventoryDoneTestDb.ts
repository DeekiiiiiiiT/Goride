import { execSync } from 'node:child_process';

export const INV_DONE_ORG = 'f6010000-0000-4000-8000-000000000099';

const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const dbContainer = process.env.SUPABASE_DB_CONTAINER || 'supabase_db_Goride';

function psqlOnPath() {
  try {
    execSync('psql --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/** Run a read-only SQL query; returns trimmed stdout rows (tab-separated). */
export function queryInventoryDb(sql: string): string {
  const escaped = sql.replace(/"/g, '\\"');
  if (psqlOnPath()) {
    return execSync(`psql "${dbUrl}" -tA -v ON_ERROR_STOP=1 -c "${escaped}"`, { encoding: 'utf8' }).trim();
  }
  return execSync(
    `docker exec ${dbContainer} psql -U postgres -d postgres -tA -v ON_ERROR_STOP=1 -c "${escaped}"`,
    { encoding: 'utf8' },
  ).trim();
}

export function execInventoryDb(sql: string) {
  const escaped = sql.replace(/"/g, '\\"');
  if (psqlOnPath()) {
    execSync(`psql "${dbUrl}" -v ON_ERROR_STOP=1 -c "${escaped}"`, { stdio: 'inherit' });
    return;
  }
  execSync(`docker exec ${dbContainer} psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "${escaped}"`, {
    stdio: 'inherit',
  });
}

export function movementCount(org: string, movementType?: string): number {
  const filter = movementType
    ? ` AND upper(type) = upper('${movementType.replace(/'/g, "''")}')`
    : '';
  const raw = queryInventoryDb(
    `SELECT count(*)::text FROM fleet.inv_movement WHERE organization_id = '${org}'${filter}`,
  );
  return Number(raw) || 0;
}

export function balanceQty(org: string, sku: string, locationCode = 'MAIN'): number {
  const raw = queryInventoryDb(`
    SELECT coalesce(sum(b.on_hand), 0)::text
    FROM fleet.inv_balance b
    JOIN fleet.inv_item i ON i.id = b.item_id AND i.organization_id = b.organization_id
    JOIN fleet.inv_location l ON l.id = b.location_id AND l.organization_id = b.organization_id
    WHERE b.organization_id = '${org}' AND i.sku = '${sku.replace(/'/g, "''")}'
      AND lower(l.code) = lower('${locationCode.replace(/'/g, "''")}')
  `);
  return Number(raw) || 0;
}

export function stockValueJmd(org: string, sku: string): number {
  const raw = queryInventoryDb(`
    SELECT coalesce(sum(b.value), 0)::text
    FROM fleet.inv_balance b
    JOIN fleet.inv_item i ON i.id = b.item_id AND i.organization_id = b.organization_id
    WHERE b.organization_id = '${org}' AND i.sku = '${sku.replace(/'/g, "''")}'
  `);
  return Number(raw) || 0;
}

export function itemId(org: string, sku: string): string {
  return queryInventoryDb(`
    SELECT id::text FROM fleet.inv_item
    WHERE organization_id = '${org}' AND sku = '${sku.replace(/'/g, "''")}' LIMIT 1
  `);
}

export function latestMovementId(org: string, movementType: string): string {
  return queryInventoryDb(`
    SELECT id::text FROM fleet.inv_movement
    WHERE organization_id = '${org}' AND upper(type) = upper('${movementType.replace(/'/g, "''")}')
    ORDER BY created_at DESC LIMIT 1
  `);
}

export function movementQtySum(org: string, movementType: string): number {
  const raw = queryInventoryDb(`
    SELECT coalesce(sum(qty), 0)::text FROM fleet.inv_movement
    WHERE organization_id = '${org}' AND upper(type) = upper('${movementType.replace(/'/g, "''")}')
  `);
  return Number(raw) || 0;
}

export function driverReportCount(org: string, issue = 'missing'): number {
  const raw = queryInventoryDb(`
    SELECT count(*)::text FROM fleet.inv_driver_report
    WHERE organization_id = '${org}' AND lower(issue) = lower('${issue.replace(/'/g, "''")}')
  `);
  return Number(raw) || 0;
}

export function approvalStatusForItem(org: string, sku: string): string {
  return queryInventoryDb(`
    SELECT coalesce(a.status, '') FROM fleet.inv_approval a
    JOIN fleet.inv_movement m ON m.id = a.subject_id AND a.subject_type = 'write_off'
    JOIN fleet.inv_ledger l ON l.movement_id = m.id
    JOIN fleet.inv_item i ON i.id = l.item_id AND i.organization_id = a.organization_id
    WHERE a.organization_id = '${org}' AND i.sku = '${sku.replace(/'/g, "''")}'
    ORDER BY a.created_at DESC LIMIT 1
  `);
}

export function roadClearanceBlockCount(org: string, vehicleId: string): number {
  const raw = queryInventoryDb(`
    SELECT count(*)::text FROM fleet.v_inv_kit_compliance
    WHERE organization_id = '${org}' AND vehicle_id = '${vehicleId.replace(/'/g, "''")}'
      AND blocks_road_clearance = true AND line_status IN ('missing', 'short', 'damaged')
  `);
  return Number(raw) || 0;
}

export function zzTestItemCount(): number {
  const raw = queryInventoryDb(`SELECT count(*)::text FROM fleet.inv_item WHERE sku ILIKE 'ZZ-TEST-%'`);
  return Number(raw) || 0;
}

export function kitComplianceDailyCount(org: string): number {
  const raw = queryInventoryDb(
    `SELECT count(*)::text FROM fleet.inv_kit_compliance_daily WHERE organization_id = '${org}'`,
  );
  return Number(raw) || 0;
}

export function kitTemplateLineCount(org: string): number {
  const raw = queryInventoryDb(`
    SELECT count(*)::text FROM fleet.kit_template_line ktl
    JOIN fleet.kit_template_version ktv ON ktv.id = ktl.version_id AND ktv.organization_id = ktl.organization_id
    WHERE ktl.organization_id = '${org}' AND ktv.status = 'production'
  `);
  return Number(raw) || 0;
}

export function vestComplianceMissingCount(org: string, vehicleId: string): number {
  const raw = queryInventoryDb(`
    SELECT count(*)::text FROM fleet.v_inv_kit_compliance
    WHERE organization_id = '${org}' AND vehicle_id = '${vehicleId.replace(/'/g, "''")}'
      AND sku = 'ZZ-TEST-VEST' AND line_status IN ('missing', 'short')
  `);
  return Number(raw) || 0;
}

export function approvalIdForItem(org: string, sku: string): string {
  return queryInventoryDb(`
    SELECT a.id::text FROM fleet.inv_approval a
    JOIN fleet.inv_movement m ON m.id = a.subject_id AND a.subject_type = 'write_off'
    JOIN fleet.inv_ledger l ON l.movement_id = m.id
    JOIN fleet.inv_item i ON i.id = l.item_id AND i.organization_id = a.organization_id
    WHERE a.organization_id = '${org}' AND i.sku = '${sku.replace(/'/g, "''")}'
    ORDER BY a.created_at DESC LIMIT 1
  `);
}

export function latestIntegrityAlertId(org: string): string {
  return queryInventoryDb(`
    SELECT id::text FROM fleet.inv_alert
    WHERE organization_id = '${org}' AND type = 'integrity'
    ORDER BY created_at DESC LIMIT 1
  `);
}

export const INV_DONE_DT09_OFFER_ID = 'b6010009-0000-4000-8000-000000000901';

export function assertInventoryDoneTestClean() {
  execSync('node scripts/seed-inventory-done-tests.mjs assert-clean', {
    cwd: process.cwd(),
    stdio: 'inherit',
  });
}
