import { Trip } from '../types/data';
import { api } from '../services/api';
import {
  DriverOption,
  VehicleOption,
  getAssignedVehicleId,
} from './tripManifestHelpers';

export async function resolveMissingTripVehicles(
  trips: Trip[],
  vehicles: VehicleOption[],
  drivers: DriverOption[]
): Promise<Trip[]> {
  if (vehicles.length === 0 || drivers.length === 0) return [];

  const updatedTrips: Trip[] = [];

  for (const trip of trips) {
    if (trip.vehicleId) continue;
    const vehicleId = getAssignedVehicleId(trip, vehicles, drivers);
    if (!vehicleId) continue;
    updatedTrips.push({ ...trip, vehicleId });
  }

  if (updatedTrips.length > 0) {
    try {
      await api.saveTrips(updatedTrips);
    } catch (e) {
      console.error('[TripManifest] Failed to backfill trip vehicles:', e);
    }
  }

  return updatedTrips;
}
