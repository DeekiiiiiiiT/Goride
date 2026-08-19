import { Trip } from '../types/data';
import { encodePlusCode } from './plusCode';

export type VehicleOption = {
  id: string;
  plate: string;
  currentDriverId?: string;
  currentDriverName?: string;
};

export type DriverOption = {
  id: string;
  name: string;
  driverId?: string;
};

function driverNameMatches(tripName: string, driverName: string): boolean {
  const a = tripName.trim().toLowerCase();
  const b = driverName.trim().toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 3 && b.length >= 3 && (a.includes(b) || b.includes(a))) return true;

  const tokensA = a.split(/\s+/).filter((t) => t.length >= 2);
  const tokensB = b.split(/\s+/).filter((t) => t.length >= 2);
  const shared = tokensA.filter((t) => tokensB.includes(t));
  return shared.length >= 2;
}

function findDriverForTrip(trip: Trip, drivers: DriverOption[]): DriverOption | undefined {
  return drivers.find(
    (d) =>
      d.id === trip.driverId ||
      d.driverId === trip.driverId ||
      (trip.driverName && driverNameMatches(trip.driverName, d.name))
  );
}

function isUsableCoord(value: number | undefined | null): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value !== 0;
}

function readPointLon(point?: { lon?: number; lng?: number }): number | undefined {
  const lon = point?.lon ?? point?.lng;
  return isUsableCoord(lon) ? lon : undefined;
}

export function isPlaceholderAddress(location?: string): boolean {
  const loc = location?.trim();
  return !loc || loc === 'Manual Entry' || loc.startsWith('Lat:');
}

export function formatCoordsAsPlusCode(lat: number, lng: number): string {
  try {
    return encodePlusCode(lat, lng, 10);
  } catch {
    return `Lat: ${lat.toFixed(5)}, Lon: ${lng.toFixed(5)}`;
  }
}

export function getTripStartCoords(trip: Trip): { lat: number; lng: number } | null {
  if (isUsableCoord(trip.startLat) && isUsableCoord(trip.startLng)) {
    return { lat: trip.startLat, lng: trip.startLng };
  }
  const first = trip.route?.[0];
  const lon = readPointLon(first);
  if (first && isUsableCoord(first.lat) && lon != null) {
    return { lat: first.lat, lng: lon };
  }
  return null;
}

export function getTripEndCoords(trip: Trip): { lat: number; lng: number } | null {
  if (isUsableCoord(trip.endLat) && isUsableCoord(trip.endLng)) {
    return { lat: trip.endLat, lng: trip.endLng };
  }
  const last = trip.route?.[trip.route.length - 1];
  const lon = readPointLon(last);
  if (last && isUsableCoord(last.lat) && lon != null) {
    return { lat: last.lat, lng: lon };
  }
  return null;
}

export function getTripEndpointLabel(
  stored: string | undefined,
  area: string | undefined,
  coords: { lat: number; lng: number } | null,
  unknownLabel: string
): string {
  if (!isPlaceholderAddress(stored)) return area || stored || unknownLabel;
  if (coords) return formatCoordsAsPlusCode(coords.lat, coords.lng);
  return unknownLabel;
}

export function tripNeedsAddressResolution(trip: Trip): boolean {
  const missingPickup = isPlaceholderAddress(trip.pickupLocation);
  const missingDropoff = isPlaceholderAddress(trip.dropoffLocation);
  return (missingPickup && !!getTripStartCoords(trip)) || (missingDropoff && !!getTripEndCoords(trip));
}

export function getUnresolvedTripKey(trips: Trip[]): string {
  return trips
    .filter(tripNeedsAddressResolution)
    .map((t) => t.id)
    .sort()
    .join(',');
}

export function getTripVehicleLabel(
  trip: Trip,
  vehicles: VehicleOption[],
  drivers: DriverOption[]
): string {
  if (trip.vehicleId) {
    const vehicle = vehicles.find(
      (v) => v.id === trip.vehicleId || v.plate === trip.vehicleId
    );
    return vehicle?.plate || trip.vehicleId;
  }

  const driverIds = new Set<string>();
  if (trip.driverId) driverIds.add(trip.driverId);

  const driver = findDriverForTrip(trip, drivers);
  if (driver) {
    driverIds.add(driver.id);
    if (driver.driverId) driverIds.add(driver.driverId);
  }

  let assigned = vehicles.find(
    (v) => v.currentDriverId && driverIds.has(v.currentDriverId)
  );

  // Fallback: match vehicle assignment by driver name on the trip
  if (!assigned && trip.driverName) {
    assigned = vehicles.find((v) => {
      const assignedName = v.currentDriverName;
      return assignedName ? driverNameMatches(trip.driverName!, assignedName) : false;
    });
  }

  return assigned?.plate || 'No Vehicle';
}

export function getAssignedVehicleId(
  trip: Trip,
  vehicles: VehicleOption[],
  drivers: DriverOption[]
): string | undefined {
  if (trip.vehicleId) return trip.vehicleId;

  const driverIds = new Set<string>();
  if (trip.driverId) driverIds.add(trip.driverId);

  const driver = findDriverForTrip(trip, drivers);
  if (driver) {
    driverIds.add(driver.id);
    if (driver.driverId) driverIds.add(driver.driverId);
  }

  let assigned = vehicles.find(
    (v) => v.currentDriverId && driverIds.has(v.currentDriverId)
  );

  if (!assigned && trip.driverName) {
    assigned = vehicles.find((v) => {
      const assignedName = v.currentDriverName;
      return assignedName ? driverNameMatches(trip.driverName!, assignedName) : false;
    });
  }

  return assigned?.id;
}
