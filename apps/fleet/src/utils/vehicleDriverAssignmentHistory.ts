/**
 * Vehicle ↔ driver assignment windows (toll-tag assignmentHistory pattern).
 * Used to attribute fuel fills when two drivers share a car in one week.
 */

export interface DriverAssignmentHistoryEntry {
  driverId: string;
  driverName: string;
  assignedAt: string;
  unassignedAt?: string;
  assignedBy?: string;
}

export type VehicleWithDriverHistory = {
  currentDriverId?: string;
  currentDriverName?: string;
  driverAssignmentHistory?: DriverAssignmentHistoryEntry[];
};

/** Close open history rows and optionally append the new assignee. */
export function applyDriverAssignmentChange(
  vehicle: VehicleWithDriverHistory,
  nextDriverId: string | undefined | null,
  nextDriverName: string,
  atIso: string = new Date().toISOString(),
  assignedBy?: string,
): DriverAssignmentHistoryEntry[] {
  const prev = [...(vehicle.driverAssignmentHistory || [])];
  const closed = prev.map((e) =>
    !e.unassignedAt ? { ...e, unassignedAt: atIso } : e,
  );

  if (!nextDriverId) return closed;

  return [
    ...closed,
    {
      driverId: nextDriverId,
      driverName: nextDriverName || 'Unknown',
      assignedAt: atIso,
      assignedBy,
    },
  ];
}

/** [assignedAt, unassignedAt) windows; open end = Infinity. */
export function buildDriverAssignmentWindows(
  history: DriverAssignmentHistoryEntry[] | undefined,
): Array<{ driverId: string; start: number; end: number }> {
  const windows: Array<{ driverId: string; start: number; end: number }> = [];
  for (const h of history || []) {
    if (!h.driverId || !h.assignedAt) continue;
    const start = new Date(h.assignedAt).getTime();
    if (Number.isNaN(start)) continue;
    const end = h.unassignedAt ? new Date(h.unassignedAt).getTime() : Infinity;
    windows.push({ driverId: h.driverId, start, end: Number.isNaN(end) ? Infinity : end });
  }
  return windows;
}

/** Driver who had the vehicle at atMs from history; else currentDriverId. */
export function driverIdAtVehicleTime(
  vehicle: VehicleWithDriverHistory | null | undefined,
  atMs: number,
): string | undefined {
  if (!vehicle) return undefined;
  const windows = buildDriverAssignmentWindows(vehicle.driverAssignmentHistory);
  for (let i = windows.length - 1; i >= 0; i--) {
    const w = windows[i];
    if (atMs >= w.start && atMs < w.end) return w.driverId;
  }
  return vehicle.currentDriverId || undefined;
}
