/**
 * Rush dispatch road-clearance gate (R3-12) — duplicated for delivery edge bundle.
 * Keep in sync with supabase/functions/_fleet-server/inventory_road_clearance_gate.ts
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const BLOCKED_STATUSES = ["missing", "short", "damaged"] as const;

function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key);
}

function fleetSchemaClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key, { db: { schema: "fleet" } });
}

async function loadVehiclePlate(
  sb: ReturnType<typeof serviceClient>,
  organizationId: string,
  vehicleId: string,
): Promise<string> {
  if (!sb) return vehicleId;
  const { data } = await sb
    .from("fleet_vehicles")
    .select("license_plate")
    .eq("organization_id", organizationId)
    .eq("id", vehicleId)
    .maybeSingle();
  const plate = data?.license_plate ? String(data.license_plate).trim() : "";
  return plate || vehicleId;
}

async function insertKitCheckFailedAlert(
  sb: ReturnType<typeof serviceClient>,
  organizationId: string,
  plate: string,
): Promise<void> {
  if (!sb) return;
  const title = `Kit check couldn't run for ${plate}`;
  await sb.from("fleet_inv_alert").insert({
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

function countBlockedComplianceRows(
  rows: Array<{ line_status?: unknown; blocks_road_clearance?: unknown }> | null,
): number {
  return (rows ?? []).filter(
    (r) =>
      Boolean(r.blocks_road_clearance) &&
      BLOCKED_STATUSES.includes(String(r.line_status) as typeof BLOCKED_STATUSES[number]),
  ).length;
}

export async function assertRoadClearForDispatch(
  organizationId: string,
  vehicleId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const sb = serviceClient();
  if (!sb) return { ok: true };

  const { data: phase3 } = await sb
    .from("platform_feature_flags")
    .select("enabled")
    .eq("name", "fleet_inventory_phase3_kits")
    .maybeSingle();
  if (!phase3?.enabled) return { ok: true };

  const { data: flagRow } = await sb
    .from("platform_feature_flags")
    .select("enabled")
    .eq("name", "inv_road_clearance_gate")
    .maybeSingle();
  if (!flagRow?.enabled) return { ok: true };

  const fleet = fleetSchemaClient();
  if (!fleet) return { ok: true };

  const { data: rows, error } = await fleet
    .from("v_inv_kit_compliance")
    .select("line_status, blocks_road_clearance")
    .eq("organization_id", organizationId)
    .eq("vehicle_id", vehicleId);

  if (error) {
    console.error("[road_clearance] compliance read failed:", error.message);
    const plate = await loadVehiclePlate(sb, organizationId, vehicleId);
    await insertKitCheckFailedAlert(sb, organizationId, plate);
    return { ok: true };
  }

  const blocked = countBlockedComplianceRows(rows);
  if (blocked === 0) return { ok: true };
  return {
    ok: false,
    message:
      "Dispatch blocked: vehicle kit is not road-cleared. Complete missing kit items in Inventory → Vehicle kits.",
  };
}

/** Normalized logic excerpt for drift tests (keep in sync with fleet-server copy). */
export const ROAD_CLEARANCE_LOGIC_SIGNATURE = [
  "fleet_inventory_phase3_kits",
  "inv_road_clearance_gate",
  "v_inv_kit_compliance",
  "blocks_road_clearance",
  "missing",
  "short",
  "damaged",
  "Kit check couldn't run for",
  "kit_gap",
].join("|");
