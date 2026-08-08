/**
 * Attach card↔driver assignmentHistory when assignee changes.
 * Handoff vehicle snapshot is audit-only.
 */
import { applyFuelCardAssignmentChange } from '@roam/roam-shared';
import type { FuelCard } from '../types/fuel';

type NamedDriver = { id: string; name?: string; driverId?: string };
type NamedVehicle = {
  id: string;
  licensePlate?: string;
  make?: string;
  currentDriverId?: string;
};

function resolveDriverName(drivers: NamedDriver[], driverId: string | undefined): string {
  if (!driverId) return '';
  const d = drivers.find((x) => x.id === driverId || x.driverId === driverId);
  return d?.name || 'Unknown';
}

function handoffVehicleSnapshot(
  vehicles: NamedVehicle[],
  nextDriverId: string | undefined,
  nextVehicleId: string | undefined,
): { vehicleIdAtAssign?: string; vehicleLabelAtAssign?: string } {
  let v: NamedVehicle | undefined;
  if (nextVehicleId) {
    v = vehicles.find((x) => x.id === nextVehicleId);
  } else if (nextDriverId) {
    v = vehicles.find((x) => x.currentDriverId === nextDriverId);
  }
  if (!v) return {};
  const label = v.licensePlate || v.make || v.id;
  return { vehicleIdAtAssign: v.id, vehicleLabelAtAssign: label };
}

/**
 * Merge next assignment onto previous card, updating assignmentHistory when driver changes.
 */
export function mergeFuelCardWithAssignmentHistory(
  previous: FuelCard | null | undefined,
  next: FuelCard,
  opts?: {
    drivers?: NamedDriver[];
    vehicles?: NamedVehicle[];
    atIso?: string;
    assignedBy?: string;
  },
): FuelCard {
  const prevDriverId = previous?.assignedDriverId || undefined;
  const nextDriverId = next.assignedDriverId || undefined;
  const atIso = opts?.atIso || new Date().toISOString();

  // Client already applied history that matches the new open assignee
  if (next.assignmentHistory?.length) {
    const open = [...next.assignmentHistory].reverse().find((e) => !e.unassignedAt);
    if (nextDriverId && open?.driverId === nextDriverId) return next;
    if (!nextDriverId && !open) return next;
  }

  if (nextDriverId === prevDriverId) {
    return {
      ...next,
      assignmentHistory: next.assignmentHistory || previous?.assignmentHistory,
    };
  }

  const base = {
    assignedDriverId: previous?.assignedDriverId,
    assignmentHistory: previous?.assignmentHistory || next.assignmentHistory,
  };
  const snapshot = handoffVehicleSnapshot(
    opts?.vehicles || [],
    nextDriverId,
    next.assignedVehicleId,
  );

  return {
    ...next,
    assignmentHistory: applyFuelCardAssignmentChange(
      base,
      nextDriverId,
      resolveDriverName(opts?.drivers || [], nextDriverId),
      atIso,
      {
        assignedBy: opts?.assignedBy,
        ...snapshot,
      },
    ),
  };
}
