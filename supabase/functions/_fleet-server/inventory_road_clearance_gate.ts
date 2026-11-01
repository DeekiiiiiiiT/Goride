/**
 * Rush delivery dispatch gate when inv_road_clearance_gate is enabled (audit §6.4).
 */
import { getServiceClient } from "./service_client.ts";
import { invDb } from "./inventory_db.ts";

export async function fleetVehicleRoadClear(
  organizationId: string,
  vehicleId: string,
): Promise<{ roadClear: boolean; blockedLines?: number }> {
  const sb = getServiceClient();
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
    return { roadClear: true };
  }

  const blocked = (rows ?? []).filter(
    (r) =>
      r.blocks_road_clearance &&
      ["missing", "short", "damaged"].includes(String(r.line_status)),
  ).length;

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
