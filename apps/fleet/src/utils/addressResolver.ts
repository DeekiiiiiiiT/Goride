import { Trip } from '../types/data';
import { reverseGeocode } from './locationService';
import { api } from '../services/api';

/**
 * Checks for trips with missing addresses but available coordinates,
 * attempts to resolve them via reverse geocoding, and saves the updates.
 */
export async function resolveMissingTripAddresses(trips: Trip[]): Promise<Trip[]> {
  const unresolvedTrips = trips.filter(trip => {
    const hasMissingPickup = !trip.pickupLocation || trip.pickupLocation === 'Manual Entry' || trip.pickupLocation.startsWith('Lat:');
    const hasMissingDropoff = !trip.dropoffLocation || trip.dropoffLocation.startsWith('Lat:');
    const hasCoords = (trip.startLat && trip.startLng) || (trip.endLat && trip.endLng);
    
    return hasCoords && (hasMissingPickup || hasMissingDropoff);
  });

  if (unresolvedTrips.length === 0) return [];

  console.log(`[AddressResolver] Found ${unresolvedTrips.length} trips needing address resolution.`);

  const resolvedTrips: Trip[] = [];

  for (const trip of unresolvedTrips) {
    let updated = false;
    const newTrip = { ...trip };

    // Resolve Pickup
    if ((!newTrip.pickupLocation || newTrip.pickupLocation === 'Manual Entry' || newTrip.pickupLocation.startsWith('Lat:')) && newTrip.startLat && newTrip.startLng) {
      try {
        const address = await reverseGeocode(newTrip.startLat, newTrip.startLng);
        if (address) {
          newTrip.pickupLocation = address;
          updated = true;
        }
      } catch (e) {
        console.error(`[AddressResolver] Failed to resolve pickup for trip ${trip.id}:`, e);
      }
    }

    // Resolve Dropoff
    if ((!newTrip.dropoffLocation || newTrip.dropoffLocation.startsWith('Lat:')) && newTrip.endLat && newTrip.endLng) {
      try {
        const address = await reverseGeocode(newTrip.endLat, newTrip.endLng);
        if (address) {
          newTrip.dropoffLocation = address;
          updated = true;
        }
      } catch (e) {
        console.error(`[AddressResolver] Failed to resolve dropoff for trip ${trip.id}:`, e);
      }
    }

    if (updated) {
      newTrip.resolutionMethod = 'background';
      newTrip.resolutionTimestamp = new Date().toISOString();
      newTrip.geocodeError = undefined; // Clear any previous error
      resolvedTrips.push(newTrip);
    }
  }

  if (resolvedTrips.length > 0) {
    console.log(`[AddressResolver] Successfully resolved addresses for ${resolvedTrips.length} trips. Saving...`);
    try {
      await api.saveTrips(resolvedTrips);
    } catch (e) {
      console.error('[AddressResolver] Failed to save resolved trips:', e);
    }
  }

  return resolvedTrips;
}
