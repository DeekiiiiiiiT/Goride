/**
 * Rush delivery dispatch gate when inv_road_clearance_gate is enabled (audit §6.4).
 * Keep in sync with supabase/functions/delivery/inventoryRoadClearanceGate.ts
 */
import { getServiceClient } from "./service_client.ts";
import { invDb } from "./inventory_db.ts";

const BLOCKED_STATUSES = ["missing", "short", "damaged"] as const;

export async function loadVehiclePlate(
  organizationId: string,
  vehicleId: string,
): Promise<string> {
  const { data } = await invDb()
    .from("fleet_vehicles")
    .select("license_plate")
    .eq("organization_id", organizationId)
    .eq("id", vehicleId)
    .maybeSingle();
  const plate = data?.license_plate ? String(data.license_plate).trim() : "";
  return plate || vehicleId;
}

export async function insertKitCheckFailedAlert(
  organizationId: string,
  vehicleId: string,
  plate: string,
): Promise<void> {
  const title = `Kit check couldn't run for ${plate}`;
  await invDb().from("fleet_inv_alert").insert({
    organization_id: organizationId,
    type: "kit_gap",
    chip_label: "KIT CHECK",
    severity: "high",
    title,
    body: title,
    entity_type: "vehicle",
    entity_id: null,
    status: "open",
  });
}

export function countBlockedComplianceRows(
  rows: Array<{ line_status?: unknown; blocks_road_clearance?: unknown }> | null,
): number {
  return (rows ?? []).filter(
    (r) =>
      Boolean(r.blocks_road_clearance) &&
      BLOCKED_STATUSES.includes(String(r.line_status) as typeof BLOCKED_STATUSES[number]),
  ).length;
}

export async function fleetVehicleRoadClear(
  organizationId: string,
  vehicleId: string,
): Promise<{ roadClear: boolean; blockedLines?: number; readFailed?: boolean }> {
  const sb = getServiceClient();
  const { data: phase3 } = await sb
    .from("platform_feature_flags")
    .select("enabled")
    .eq("name", "fleet_inventory_phase3_kits")
    .maybeSingle();
  if (!phase3?.enabled) {
    return { roadClear: true };
  }

  const { data: flagRow } = await sb
    .from("platform_feature_flags")
    .select("enabled")
    .eq("name", "inv_road_clearance_gate")
    .maybeSingle();
  if (!flagRow?.enabled) {
    return { roadClear: true };
  }

  const fleet = invDb();
  const { data: rows, error } = await fleet
    .from("fleet_inv_v_kit_compliance")
    .select("line_status, blocks_road_clearance")
    .eq("organization_id", organizationId)
    .eq("vehicle_id", vehicleId);

  if (error) {
    console.error("[road_clearance] compliance read failed:", error.message);
    const plate = await loadVehiclePlate(organizationId, vehicleId);
    await insertKitCheckFailedAlert(organizationId, vehicleId, plate);
    return { roadClear: true, readFailed: true };
  }

  const blocked = countBlockedComplianceRows(rows);
  return { roadClear: blocked === 0, blockedLines: blocked };
}

export async function assertRoadClearForDispatch(
  organizationId: string,
  vehicleId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { roadClear } = await fleetVehicleRoadClear(organizationId, vehicleId);
  if (roadClear) return { ok: true };
  return {
    ok: false,
    message:
      "Dispatch blocked: vehicle kit is not road-cleared. Complete missing kit items in Inventory → Vehicle kits.",
  };
}

/** Normalized logic excerpt for drift tests (keep in sync with delivery copy). */
export const ROAD_CLEARANCE_LOGIC_SIGNATURE = [
  "fleet_inventory_phase3_kits",
  "inv_road_clearance_gate",
  "fleet_inv_v_kit_compliance",
  "blocks_road_clearance",
  "missing",
  "short",
  "damaged",
  "Kit check couldn't run for",
  "kit_gap",
].join("|");
