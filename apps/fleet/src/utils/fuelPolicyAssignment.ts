import type { FuelScenario } from '../types/fuel';

/** Vehicles on this policy: explicit fuelScenarioId, or unset when scenario is default. */
export function vehiclesForPolicy(scenario: FuelScenario, vehicles: any[]): any[] {
  return vehicles.filter((v: any) =>
    scenario.isDefault
      ? !v.fuelScenarioId || v.fuelScenarioId === scenario.id
      : v.fuelScenarioId === scenario.id,
  );
}

/** Vehicles whose fuelScenarioId points at a missing scenario. */
export function orphanVehicles(vehicles: any[], scenarios: FuelScenario[]): any[] {
  const ids = new Set(scenarios.map((s) => s.id));
  return vehicles.filter((v: any) => v.fuelScenarioId && !ids.has(v.fuelScenarioId));
}
