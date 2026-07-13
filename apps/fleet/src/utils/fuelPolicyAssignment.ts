import type { FuelScenario } from '../types/fuel';
import { normalizeScenarioVersions } from './fuelPolicyVersion';

export type PolicyDriver = {
  id: string;
  fuelScenarioId?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  assignedVehicleId?: string;
};

/** Unique drivers listed on any version of this policy (Schedule membership). */
export function driversForPolicy(scenario: FuelScenario, drivers: PolicyDriver[]): PolicyDriver[] {
  const n = normalizeScenarioVersions(scenario);
  const ids = new Set<string>();
  for (const v of n.versions || []) {
    for (const id of v.driverIds || []) ids.add(id);
  }
  return drivers.filter((d) => ids.has(d.id));
}

/** Count of unique drivers on this policy's versions. */
export function driverCountOnPolicy(scenario: FuelScenario): number {
  const n = normalizeScenarioVersions(scenario);
  const ids = new Set<string>();
  for (const v of n.versions || []) {
    for (const id of v.driverIds || []) ids.add(id);
  }
  return ids.length;
}

/** Drivers listed on a specific version. */
export function driversForVersion(
  version: { driverIds?: string[] },
  drivers: PolicyDriver[],
): PolicyDriver[] {
  const ids = new Set(version.driverIds || []);
  return drivers.filter((d) => ids.has(d.id));
}

/**
 * Drivers with fuelScenarioId pointing at a missing scenario (legacy field).
 * Prefer version membership for recon; this is for cleanup UI only.
 */
export function orphanDrivers(drivers: PolicyDriver[], scenarios: FuelScenario[]): PolicyDriver[] {
  const ids = new Set(scenarios.map((s) => s.id));
  return drivers.filter((d) => d.fuelScenarioId && !ids.has(d.fuelScenarioId));
}

/** @deprecated Vehicle assignment retained for cutover reads only. */
export function vehiclesForPolicy(scenario: FuelScenario, vehicles: any[]): any[] {
  return vehicles.filter((v: any) =>
    scenario.isDefault
      ? !v.fuelScenarioId || v.fuelScenarioId === scenario.id
      : v.fuelScenarioId === scenario.id,
  );
}

/** @deprecated Use orphanDrivers */
export function orphanVehicles(vehicles: any[], scenarios: FuelScenario[]): any[] {
  const ids = new Set(scenarios.map((s) => s.id));
  return vehicles.filter((v: any) => v.fuelScenarioId && !ids.has(v.fuelScenarioId));
}

/**
 * One-time cutover: copy vehicle.fuelScenarioId onto currentDriver when driver has no policy.
 */
export function migrateVehiclePoliciesToDrivers(
  vehicles: Array<{ fuelScenarioId?: string; currentDriverId?: string }>,
  drivers: PolicyDriver[],
): PolicyDriver[] {
  const byId = new Map(drivers.map((d) => [d.id, { ...d }]));
  const touched = new Map<string, PolicyDriver>();

  for (const v of vehicles) {
    if (!v.fuelScenarioId || !v.currentDriverId) continue;
    const d = byId.get(v.currentDriverId);
    if (!d) continue;
    if (d.fuelScenarioId) continue;
    d.fuelScenarioId = v.fuelScenarioId;
    touched.set(d.id, d);
  }

  return Array.from(touched.values());
}
