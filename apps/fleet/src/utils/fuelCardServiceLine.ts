import { personMatchesServiceLine, vehicleMatchesLine, type VehicleServiceLine } from './vehicleServiceLines';

type CardLike = {
  assignedVehicleId?: string | null;
  assignedDriverId?: string | null;
};

type VehicleLike = {
  id?: string;
  serviceLines?: unknown;
  service_lines?: unknown;
};

type DriverLike = {
  id?: string;
  serviceLines?: unknown;
  service_lines?: unknown;
};

/**
 * Cards multi-home: visible on a line if assigned vehicle OR driver matches that line.
 * Unassigned cards appear in All only (inventory), not forced into a line.
 * Do not sum tab counts to equal All — dual-line cards appear in both tabs.
 */
export function fuelCardMatchesLine(
  card: CardLike,
  line: VehicleServiceLine | 'all',
  vehicles: VehicleLike[],
  drivers: DriverLike[],
): boolean {
  if (line === 'all') return true;
  const vehicle = card.assignedVehicleId
    ? vehicles.find((v) => v.id === card.assignedVehicleId)
    : null;
  const driver = card.assignedDriverId
    ? drivers.find((d) => d.id === card.assignedDriverId)
    : null;
  if (!vehicle && !driver) return false; // unassigned — not in Rideshare/Delivery tabs
  if (vehicle && vehicleMatchesLine(vehicle, line)) return true;
  if (driver && personMatchesServiceLine(driver, line)) return true;
  return false;
}
