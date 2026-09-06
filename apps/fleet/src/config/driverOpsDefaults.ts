/**
 * Fleet-default operational constants for driver metrics reconstruction.
 * Prefer per-vehicle catalog `fuel_economy_km_per_l` when available.
 */

/** Fallback km/L when vehicle catalog economy is missing. */
export const DEFAULT_FUEL_ECONOMY_KM_PER_L = 12;

/** Gap between trips (minutes) treated as unavailable rather than open. */
export const GAP_THRESHOLD_MINS = 45;

/** Minimum continuous unavailable block (hours) counted toward personal fuel. */
export const MIN_UNAVAILABLE_BLOCK_HOURS = 4;

/** Assumed cruising speed (km/h) when reconstructing open distance without GPS. */
export const AVG_OPEN_SPEED_KMH = 20;

export function resolveFuelEconomyKmPerL(
  vehicleEconomy: number | null | undefined,
): number {
  const n = Number(vehicleEconomy);
  if (Number.isFinite(n) && n > 0.05) return n;
  return DEFAULT_FUEL_ECONOMY_KM_PER_L;
}

/** Pull catalog/vehicle km/L from common fleet vehicle shapes (incl. nested catalog). */
export function economyFromVehicleRecord(vehicle: any): number | null {
  if (!vehicle || typeof vehicle !== 'object') return null;
  const candidates = [
    vehicle.fuelEconomyKmPerL,
    vehicle.fuel_economy_km_per_l,
    vehicle.catalog?.fuel_economy_km_per_l,
    vehicle.catalog?.fuelEconomyKmPerL,
    vehicle.vehicleCatalog?.fuel_economy_km_per_l,
    vehicle.vehicle_catalog?.fuel_economy_km_per_l,
  ];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0.05) return n;
  }
  return null;
}

/**
 * Driver-assigned vehicles (not fleet-wide VehicleMetrics).
 * First positive economy wins; else DEFAULT.
 */
export function resolveDriverFuelEconomyKmPerL(vehicles: any[]): number {
  for (const v of vehicles || []) {
    const n = economyFromVehicleRecord(v);
    if (n != null) return resolveFuelEconomyKmPerL(n);
  }
  return DEFAULT_FUEL_ECONOMY_KM_PER_L;
}
