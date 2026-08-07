/**
 * Card ↔ driver assignment windows (mirrors vehicle driverAssignmentHistory).
 * Handoff vehicle fields are audit snapshots only — not fill-time vehicle truth.
 */

export interface FuelCardAssignmentHistoryEntry {
  driverId: string;
  driverName?: string;
  assignedAt: string;
  unassignedAt?: string;
  assignedBy?: string;
  /** Snapshot at handoff only — audit/UI, not fill-time vehicle truth */
  vehicleIdAtAssign?: string;
  vehicleLabelAtAssign?: string;
}

export type FuelCardWithAssignmentHistory = {
  assignedDriverId?: string | null;
  assignmentHistory?: FuelCardAssignmentHistoryEntry[];
};

export type ApplyFuelCardAssignmentOpts = {
  assignedBy?: string;
  vehicleIdAtAssign?: string;
  vehicleLabelAtAssign?: string;
};

/** Synthetic open row start so pre-history fills still land on legacy assignee after first handoff. */
const LEGACY_ASSIGNED_AT = '1970-01-01T00:00:00.000Z';

/** Close open history rows and optionally append the new assignee. */
export function applyFuelCardAssignmentChange(
  card: FuelCardWithAssignmentHistory,
  nextDriverId: string | undefined | null,
  nextDriverName: string,
  atIso: string = new Date().toISOString(),
  opts?: ApplyFuelCardAssignmentOpts,
): FuelCardAssignmentHistoryEntry[] {
  const seeded = ensureOpenAssignmentFromCurrent(card);
  const open = [...seeded].reverse().find((e) => !e.unassignedAt);
  if (nextDriverId && open?.driverId === nextDriverId) {
    return seeded;
  }

  const closed = seeded.map((e) =>
    !e.unassignedAt ? { ...e, unassignedAt: atIso } : e,
  );

  if (!nextDriverId) return closed;

  return [
    ...closed,
    {
      driverId: nextDriverId,
      driverName: nextDriverName || 'Unknown',
      assignedAt: atIso,
      assignedBy: opts?.assignedBy,
      vehicleIdAtAssign: opts?.vehicleIdAtAssign,
      vehicleLabelAtAssign: opts?.vehicleLabelAtAssign,
    },
  ];
}

/**
 * If history empty but current assignee set, synthesize one open row
 * (far-past start so first mid-week handoff still covers earlier fills).
 */
export function ensureOpenAssignmentFromCurrent(
  card: FuelCardWithAssignmentHistory,
): FuelCardAssignmentHistoryEntry[] {
  const prev = [...(card.assignmentHistory || [])];
  if (prev.length > 0) return prev;
  const driverId = card.assignedDriverId || undefined;
  if (!driverId) return prev;
  return [
    {
      driverId,
      driverName: 'Unknown',
      assignedAt: LEGACY_ASSIGNED_AT,
    },
  ];
}

/** [assignedAt, unassignedAt) windows; open end = Infinity. */
export function buildFuelCardAssignmentWindows(
  history: FuelCardAssignmentHistoryEntry[] | undefined,
): Array<{ driverId: string; start: number; end: number }> {
  const windows: Array<{ driverId: string; start: number; end: number }> = [];
  for (const h of history || []) {
    if (!h.driverId || !h.assignedAt) continue;
    const start = new Date(h.assignedAt).getTime();
    if (Number.isNaN(start)) continue;
    const end = h.unassignedAt ? new Date(h.unassignedAt).getTime() : Infinity;
    windows.push({
      driverId: h.driverId,
      start,
      end: Number.isNaN(end) ? Infinity : end,
    });
  }
  return windows;
}

/** Driver who held the card at atMs from history; else current assignedDriverId. */
export function driverIdAtCardTime(
  card: FuelCardWithAssignmentHistory | null | undefined,
  atMs: number,
): string | undefined {
  if (!card) return undefined;
  if (!card.assignmentHistory?.length) {
    return card.assignedDriverId || undefined;
  }
  const windows = buildFuelCardAssignmentWindows(card.assignmentHistory);
  for (let i = windows.length - 1; i >= 0; i--) {
    const w = windows[i];
    if (atMs >= w.start && atMs < w.end) return w.driverId;
  }
  return card.assignedDriverId || undefined;
}
