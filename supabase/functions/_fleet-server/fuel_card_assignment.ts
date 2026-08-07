/**
 * Deno-friendly card↔driver assignment windows (mirrors @roam/roam-shared).
 * Keep in sync with packages/roam-shared/src/fuel/fuelCardAssignmentHistory.ts
 */

const LEGACY_ASSIGNED_AT = "1970-01-01T00:00:00.000Z";

export type FuelCardAssignmentHistoryEntry = {
  driverId: string;
  driverName?: string;
  assignedAt: string;
  unassignedAt?: string;
  assignedBy?: string;
  vehicleIdAtAssign?: string;
  vehicleLabelAtAssign?: string;
};

function ensureOpen(
  card: { assignedDriverId?: string | null; assignmentHistory?: FuelCardAssignmentHistoryEntry[] },
): FuelCardAssignmentHistoryEntry[] {
  const prev = [...(card.assignmentHistory || [])];
  if (prev.length > 0) return prev;
  const driverId = card.assignedDriverId || undefined;
  if (!driverId) return prev;
  return [{ driverId, driverName: "Unknown", assignedAt: LEGACY_ASSIGNED_AT }];
}

export function applyFuelCardAssignmentChangeServer(
  card: { assignedDriverId?: string | null; assignmentHistory?: FuelCardAssignmentHistoryEntry[] },
  nextDriverId: string | undefined | null,
  nextDriverName: string,
  atIso: string = new Date().toISOString(),
  opts?: {
    assignedBy?: string;
    vehicleIdAtAssign?: string;
    vehicleLabelAtAssign?: string;
  },
): FuelCardAssignmentHistoryEntry[] {
  const seeded = ensureOpen(card);
  const open = [...seeded].reverse().find((e) => !e.unassignedAt);
  if (nextDriverId && open?.driverId === nextDriverId) {
    return seeded;
  }
  const closed = seeded.map((e) => (!e.unassignedAt ? { ...e, unassignedAt: atIso } : e));
  if (!nextDriverId) return closed;
  return [
    ...closed,
    {
      driverId: nextDriverId,
      driverName: nextDriverName || "Unknown",
      assignedAt: atIso,
      assignedBy: opts?.assignedBy,
      vehicleIdAtAssign: opts?.vehicleIdAtAssign,
      vehicleLabelAtAssign: opts?.vehicleLabelAtAssign,
    },
  ];
}

/** Prefer client history when it already reflects the new assignee; else rebuild. */
export function resolveAssignmentHistoryOnSave(
  existing: { assignedDriverId?: string | null; assignmentHistory?: FuelCardAssignmentHistoryEntry[] } | null,
  incoming: {
    assignedDriverId?: string | null;
    assignmentHistory?: FuelCardAssignmentHistoryEntry[];
  },
): FuelCardAssignmentHistoryEntry[] {
  const nextDriver = incoming.assignedDriverId || undefined;
  const prevDriver = existing?.assignedDriverId || undefined;
  const clientHist = incoming.assignmentHistory;

  if (clientHist?.length) {
    const open = [...clientHist].reverse().find((e) => !e.unassignedAt);
    if (nextDriver && open?.driverId === nextDriver) return clientHist;
    if (!nextDriver && !open) return clientHist;
  }

  if (nextDriver === prevDriver) {
    return clientHist || existing?.assignmentHistory || [];
  }

  return applyFuelCardAssignmentChangeServer(
    {
      assignedDriverId: existing?.assignedDriverId,
      assignmentHistory: existing?.assignmentHistory || clientHist,
    },
    nextDriver,
    "Unknown",
  );
}
