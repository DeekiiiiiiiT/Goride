import { Trip } from '../types/data';
import { reverseGeocode } from './locationService';
import { api } from '../services/api';
import { fuelService } from '../services/fuelService';
import { looksLikePlusCodeAddress } from './plusCode';
import {
  formatCoordsAsPlusCode,
  getTripEndCoords,
  getTripStartCoords,
  isPlaceholderAddress,
  tripNeedsAddressResolution,
} from './tripManifestHelpers';

const GEOCODE_TIMEOUT_MS = 6000;
const GEOCODE_CONCURRENCY = 3;

export type ReverseGeocodeFn = (lat: number, lng: number) => Promise<string | null>;
export type SaveTripsFn = (trips: Trip[]) => Promise<unknown>;

export async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function preferStreetAddress(formatted?: string, street?: string, city?: string, parish?: string, country?: string): string | null {
  if (formatted && !looksLikePlusCodeAddress(formatted)) return formatted;
  if (street && !looksLikePlusCodeAddress(street)) {
    return [street, city, parish, country].filter(Boolean).join(', ');
  }
  return formatted || null;
}

export async function reverseGeocodeTripPoint(lat: number, lng: number): Promise<string | null> {
  try {
    const result = await withTimeout(
      fuelService.reverseGeocode(lat, lng),
      GEOCODE_TIMEOUT_MS,
      'Reverse geocode timed out'
    );
    return preferStreetAddress(
      result.formattedAddress,
      result.streetAddress,
      result.city,
      result.parish,
      result.country
    );
  } catch (serverError) {
    console.warn('[AddressResolver] Server reverse geocode failed, trying Maps JS:', serverError);
  }

  try {
    const address = await withTimeout(
      reverseGeocode(lat, lng),
      GEOCODE_TIMEOUT_MS,
      'Reverse geocode timed out'
    );
    return address || null;
  } catch (clientError) {
    console.warn('[AddressResolver] Client reverse geocode failed:', clientError);
    return null;
  }
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function resolvePoint(
  lat: number,
  lng: number,
  geocode: ReverseGeocodeFn
): Promise<{ address: string; geocodeError?: string }> {
  try {
    const address = await geocode(lat, lng);
    if (address) return { address };
  } catch (error) {
    console.warn('[AddressResolver] Point lookup failed:', error);
  }
  return {
    address: formatCoordsAsPlusCode(lat, lng),
    geocodeError: 'Street address unavailable; plus code saved',
  };
}

/**
 * Checks for trips with missing addresses but available coordinates,
 * attempts to resolve them via reverse geocoding, and saves the updates.
 * Always persists a plus-code fallback so Trip Analytics never spins forever.
 */
export async function resolveMissingTripAddresses(
  trips: Trip[],
  deps: { geocode?: ReverseGeocodeFn; saveTrips?: SaveTripsFn } = {}
): Promise<Trip[]> {
  const unresolvedTrips = trips.filter(tripNeedsAddressResolution);
  if (unresolvedTrips.length === 0) return [];

  const geocode = deps.geocode ?? reverseGeocodeTripPoint;
  const saveTrips = deps.saveTrips ?? ((updated) => api.saveTrips(updated));

  console.log(`[AddressResolver] Found ${unresolvedTrips.length} trips needing address resolution.`);

  const resolvedTrips = (
    await mapPool(unresolvedTrips, GEOCODE_CONCURRENCY, async (trip) => {
      const newTrip = { ...trip };
      let updated = false;
      const errors: string[] = [];

      const start = getTripStartCoords(newTrip);
      if (start) {
        if (newTrip.startLat !== start.lat || newTrip.startLng !== start.lng) {
          newTrip.startLat = start.lat;
          newTrip.startLng = start.lng;
          updated = true;
        }
        if (isPlaceholderAddress(newTrip.pickupLocation)) {
          const result = await resolvePoint(start.lat, start.lng, geocode);
          newTrip.pickupLocation = result.address;
          if (result.geocodeError) errors.push(`Pickup: ${result.geocodeError}`);
          updated = true;
        }
      }

      const end = getTripEndCoords(newTrip);
      if (end) {
        if (newTrip.endLat !== end.lat || newTrip.endLng !== end.lng) {
          newTrip.endLat = end.lat;
          newTrip.endLng = end.lng;
          updated = true;
        }
        if (isPlaceholderAddress(newTrip.dropoffLocation)) {
          const result = await resolvePoint(end.lat, end.lng, geocode);
          newTrip.dropoffLocation = result.address;
          if (result.geocodeError) errors.push(`Dropoff: ${result.geocodeError}`);
          updated = true;
        }
      }

      if (!updated) return null;

      newTrip.resolutionMethod = errors.length > 0 ? 'pending' : 'background';
      newTrip.resolutionTimestamp = new Date().toISOString();
      newTrip.geocodeError = errors.length > 0 ? errors.join(' | ') : undefined;
      return newTrip;
    })
  ).filter((trip): trip is Trip => trip != null);

  if (resolvedTrips.length > 0) {
    console.log(`[AddressResolver] Saving addresses for ${resolvedTrips.length} trips.`);
    await saveTrips(resolvedTrips);
  }

  return resolvedTrips;
}
