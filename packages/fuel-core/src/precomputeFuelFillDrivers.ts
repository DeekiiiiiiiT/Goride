/**
 * Precompute fill→driver attribution once per week (P-2).
 */
import {
  resolveFuelFillDriver,
  type FillDriverResolution,
} from './resolveFuelFillDriver.ts';
import type { FuelCard, FuelCalcTrip, FuelEntry } from './fuelTypes.ts';
import type { VehicleWithDriverHistory } from './vehicleDriverAssignmentHistory.ts';

/**
 * Build Map<entryId, driverId> for a week’s fills — call once, reuse in strip/settlement/finalize.
 */
export function precomputeFuelFillDrivers(
  entries: FuelEntry[],
  vehicles: Array<VehicleWithDriverHistory & { id: string }>,
  fuelCards: FuelCard[] = [],
  trips: FuelCalcTrip[] = [],
): Map<string, FillDriverResolution> {
  const map = new Map<string, FillDriverResolution>();
  for (const entry of entries) {
    const id = String(entry.id || '');
    if (!id) continue;
    map.set(id, resolveFuelFillDriver({ entry, vehicles, fuelCards, trips }));
  }
  return map;
}

/** Index trips by vehicleId|ymd for O(1) proximity lookups. */
export function indexTripsByVehicleYmd(
  trips: FuelCalcTrip[],
): Map<string, FuelCalcTrip[]> {
  const map = new Map<string, FuelCalcTrip[]>();
  for (const t of trips) {
    const vid = String(t.vehicleId || '');
    const ymd = String(t.date || '').slice(0, 10);
    if (!vid || !ymd) continue;
    const key = `${vid}|${ymd}`;
    const list = map.get(key) || [];
    list.push(t);
    map.set(key, list);
  }
  return map;
}
