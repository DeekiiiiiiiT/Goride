import { Trip } from '../types/data';

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

export function tripNeedsAddressResolution(trip: Trip): boolean {
  const hasMissingPickup =
    !trip.pickupLocation ||
    trip.pickupLocation === 'Manual Entry' ||
    trip.pickupLocation.startsWith('Lat:');
  const hasMissingDropoff =
    !trip.dropoffLocation || trip.dropoffLocation.startsWith('Lat:');
  const hasCoords =
    (trip.startLat && trip.startLng) || (trip.endLat && trip.endLng);
  return !!hasCoords && (hasMissingPickup || hasMissingDropoff);
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
