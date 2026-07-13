/**
 * Persist fuel-policy cutovers once per browser session.
 */

import { api } from '../services/api';
import { fuelService } from '../services/fuelService';
import { migrateVehiclePoliciesToDrivers } from './fuelPolicyAssignment';
import { migrateFuelScenarioIdOntoVersions } from './fuelPolicyVersion';

const VEHICLE_CUTOVER_FLAG = 'roam_fuel_policy_driver_cutover_v1';
const VERSION_DRIVER_CUTOVER_FLAG = 'roam_fuel_policy_version_drivers_v1';

export async function runFuelPolicyDriverCutoverOnce(): Promise<number> {
  if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(VEHICLE_CUTOVER_FLAG)) {
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
    sessionStorage.setItem(VEHICLE_CUTOVER_FLAG, '1');
  }
  return saved;
}

/** Move legacy driver.fuelScenarioId onto covering version.driverIds. */
export async function runFuelPolicyVersionDriverCutoverOnce(): Promise<number> {
  if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(VERSION_DRIVER_CUTOVER_FLAG)) {
    return 0;
  }

  const [scenarios, drivers] = await Promise.all([
    fuelService.getFuelScenarios().catch(() => []),
    api.getDrivers().catch(() => []),
  ]);

  const before = new Map(
    (scenarios || []).map((s) => [
      s.id,
      JSON.stringify((s.versions || []).map((v) => [v.id, ...(v.driverIds || [])])),
    ]),
  );
  const migrated = migrateFuelScenarioIdOntoVersions(scenarios || [], drivers || []);
  let saved = 0;
  for (const s of migrated) {
    const prevSig = before.get(s.id);
    const nextSig = JSON.stringify((s.versions || []).map((v) => [v.id, ...(v.driverIds || [])]));
    if (prevSig === nextSig) continue;
    try {
      await fuelService.saveFuelScenario(s);
      saved++;
    } catch (e) {
      console.error('[fuelPolicyCutover] failed to save scenario', s.id, e);
    }
  }

  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(VERSION_DRIVER_CUTOVER_FLAG, '1');
  }
  return saved;
}
