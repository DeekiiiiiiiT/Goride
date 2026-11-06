import { execInventoryDb, queryInventoryDb } from './inventoryDoneTestDb';

const FLAG_NAMES = [
  'fleet_inventory_phase0_security',
  'fleet_inventory_phase1_engine',
  'fleet_inventory_phase2_stock',
  'fleet_inventory_phase3_kits',
  'fleet_inventory_phase4_assets',
  'fleet_inventory_phase5_maintenance',
  'fleet_inventory_phase6_purchasing',
  'fleet_inventory_phase7_counts',
  'fleet_inventory_phase8_telematics',
  'inv_road_clearance_gate',
] as const;

export type InventoryFlagSnapshot = Record<string, boolean>;

export function readInventoryFlagSnapshot(): InventoryFlagSnapshot {
  const names = FLAG_NAMES.map((n) => `'${n}'`).join(',');
  const raw = queryInventoryDb(
    `SELECT name || '|' || CASE WHEN enabled THEN '1' ELSE '0' END FROM public.platform_feature_flags WHERE name IN (${names}) ORDER BY name`,
  );
  const snap: InventoryFlagSnapshot = {};
  for (const line of raw.split('\n').filter(Boolean)) {
    const [name, val] = line.split('|');
    if (name) snap[name] = val === '1';
  }
  return snap;
}

export function restoreInventoryFlagSnapshot(snapshot: InventoryFlagSnapshot) {
  for (const name of FLAG_NAMES) {
    const enabled = snapshot[name];
    if (enabled === undefined) continue;
    execInventoryDb(
      `UPDATE public.platform_feature_flags SET enabled = ${enabled ? 'true' : 'false'} WHERE name = '${name}'`,
    );
  }
}

export async function withInventoryFlagGuard<T>(fn: () => Promise<T>): Promise<T> {
  const snapshot = readInventoryFlagSnapshot();
  try {
    return await fn();
  } finally {
    restoreInventoryFlagSnapshot(snapshot);
  }
}
