/** Logistics job status machine — shared by edge routes + Deno tests. */

export const JOB_TRANSITIONS: Record<string, string[]> = {
  unassigned: ["matching", "assigned", "cancelled", "exception"],
  matching: ["assigned", "unassigned", "cancelled", "exception"],
  assigned: ["in_progress", "unassigned", "cancelled", "exception"],
  in_progress: ["completed", "exception", "cancelled"],
  completed: [],
  cancelled: [],
  exception: ["unassigned", "assigned", "matching", "in_progress", "cancelled"],
};

export function canTransitionJob(from: string, to: string): boolean {
  return (JOB_TRANSITIONS[from] ?? []).includes(to);
}

/** Map domestic freight shipment status → logistics job status (mirror, not override assigned). */
export function shipmentStatusToJobStatus(
  shipmentStatus: string,
  currentJobStatus?: string | null,
): string {
  switch (shipmentStatus) {
    case "draft":
      return "unassigned";
    case "booked":
      if (
        currentJobStatus === "assigned" ||
        currentJobStatus === "in_progress" ||
        currentJobStatus === "matching"
      ) {
        return currentJobStatus;
      }
      return "unassigned";
    case "in_transit":
    case "out_for_delivery":
      if (currentJobStatus === "matching") return "matching";
      return "in_progress";
    case "delivered":
      return "completed";
    case "cancelled":
      return "cancelled";
    case "exception":
      return "exception";
    default:
      return currentJobStatus || "unassigned";
  }
}

export const MANUAL_ASSIGNEE_TYPES = [
  "org_fleet",
  "client_fleet",
  "third_party",
] as const;

/** Phase C: roam_marketplace starts org-fleet auto-matching (not instant assign). */
export const ENABLED_ASSIGNEE_TYPES = [
  ...MANUAL_ASSIGNEE_TYPES,
  "roam_marketplace",
] as const;

export type EnabledAssigneeType = (typeof ENABLED_ASSIGNEE_TYPES)[number];

export function isMarketplaceAssignee(type: string | null | undefined): boolean {
  return type === "roam_marketplace";
}

export function validateAssignPayload(body: {
  assigneeType: string;
  assigneeDriverId?: string | null;
  assigneeVehicleId?: string | null;
  clientFleetAssetId?: string | null;
  thirdPartyCarrierId?: string | null;
}): { ok: true } | { ok: false; error: string; code?: string } {
  if (!(ENABLED_ASSIGNEE_TYPES as readonly string[]).includes(body.assigneeType)) {
    return { ok: false, error: "Invalid assignee type", code: "invalid_assignee_type" };
  }
  // Marketplace: no secondary refs required — matching finds drivers
  if (isMarketplaceAssignee(body.assigneeType)) {
    return { ok: true };
  }
  if (body.assigneeType === "client_fleet" && !body.clientFleetAssetId) {
    return {
      ok: false,
      error: "clientFleetAssetId is required for client_fleet",
      code: "missing_client_fleet_asset",
    };
  }
  if (body.assigneeType === "third_party" && !body.thirdPartyCarrierId) {
    return {
      ok: false,
      error: "thirdPartyCarrierId is required for third_party",
      code: "missing_carrier",
    };
  }
  return { ok: true };
}
