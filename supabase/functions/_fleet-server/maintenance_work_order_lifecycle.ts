/** Work order lifecycle (M-06). Log-service `completeNow` still uses in_progress → completed. */

export const MAINTENANCE_WO_ACTIVE_STATUSES = [
  "draft",
  "open",
  "scheduled",
  "in_shop",
  "awaiting_parts",
  "in_progress",
] as const;

export const MAINTENANCE_WO_STATUSES = [
  ...MAINTENANCE_WO_ACTIVE_STATUSES,
  "completed",
  "closed",
  "cancelled",
] as const;

export type MaintenanceWoStatus = (typeof MAINTENANCE_WO_STATUSES)[number];

const TRANSITIONS: Record<string, readonly string[]> = {
  draft: ["open", "scheduled", "in_shop", "in_progress", "cancelled"],
  open: ["scheduled", "in_shop", "awaiting_parts", "in_progress", "cancelled"],
  scheduled: ["open", "in_shop", "awaiting_parts", "cancelled"],
  in_shop: ["awaiting_parts", "scheduled", "completed", "cancelled"],
  awaiting_parts: ["in_shop", "scheduled", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: ["closed"],
  closed: [],
  cancelled: [],
};

export function isMaintenanceWoStatus(value: string): value is MaintenanceWoStatus {
  return (MAINTENANCE_WO_STATUSES as readonly string[]).includes(value);
}

export function canTransitionWorkOrderStatus(from: string, to: string): boolean {
  const allowed = TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

export function workOrderTransitionSideEffects(
  from: string,
  to: string,
  nowIso: string,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const offRoadStatuses = new Set(["in_shop", "awaiting_parts"]);
  if (to === "in_shop" && from !== "in_shop") {
    patch.off_road_at = nowIso;
  }
  if (offRoadStatuses.has(from) && ["completed", "scheduled", "open", "cancelled"].includes(to)) {
    patch.back_on_road_at = nowIso;
  }
  if (to === "cancelled") {
    patch.closed_at = nowIso;
  }
  if (to === "closed") {
    patch.closed_at = nowIso;
  }
  return patch;
}
