/**
 * Persist vehicle→driver fuel policy cutover once per browser session.
 */

import { api } from '../services/api';
import { migrateVehiclePoliciesToDrivers } from './fuelPolicyAssignment';

const CUTOVER_FLAG = 'roam_fuel_policy_driver_cutover_v1';

export async function runFuelPolicyDriverCutoverOnce(): Promise<number> {
  if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(CUTOVER_FLAG)) {
    return 0;
  }

  const [vehicles, drivers] = await Promise.all([
    api.getVehicles().catch(() => []),
    api.getDrivers().catch(() => []),
  ]);

  const toSave = migrateVehiclePoliciesToDrivers(vehicles || [], drivers || []);
  let saved = 0;
  for (const d of toSave) {
    try {
      await api.saveDriver(d);
      saved++;
    } catch (e) {
      console.error('[fuelPolicyCutover] failed to save driver', d.id, e);
    }
  }

  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(CUTOVER_FLAG, '1');
  }
  return saved;
}
