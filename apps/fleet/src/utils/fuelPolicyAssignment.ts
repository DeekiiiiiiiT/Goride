import type { FuelScenario } from '../types/fuel';

export type PolicyDriver = {
  id: string;
  fuelScenarioId?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  assignedVehicleId?: string;
};

/** Drivers on this policy: explicit fuelScenarioId, or unset when scenario is default. */
export function driversForPolicy(scenario: FuelScenario, drivers: PolicyDriver[]): PolicyDriver[] {
  return drivers.filter((d) =>
    scenario.isDefault
      ? !d.fuelScenarioId || d.fuelScenarioId === scenario.id
      : d.fuelScenarioId === scenario.id,
  );
}

/** Drivers whose fuelScenarioId points at a missing scenario. */
export function orphanDrivers(drivers: PolicyDriver[], scenarios: FuelScenario[]): PolicyDriver[] {
  const ids = new Set(scenarios.map((s) => s.id));
  return drivers.filter((d) => d.fuelScenarioId && !ids.has(d.fuelScenarioId));
}

/** @deprecated Use driversForPolicy — vehicle assignment retained for cutover reads only. */
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
 * Returns drivers that need saving (mutated copies).
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
