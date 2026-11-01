/**
 * Rush dispatch road-clearance gate (R3-12) — duplicated for delivery edge bundle.
 */
import { createClient } from "npm:@supabase/supabase-js@2";

function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key);
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

  const fleet = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    db: { schema: "fleet" },
  });
  const { data: rows, error } = await fleet
    .from("v_inv_kit_compliance")
    .select("line_status, blocks_road_clearance")
    .eq("organization_id", organizationId)
    .eq("vehicle_id", vehicleId);

  if (error) {
    console.error("[road_clearance] compliance read failed:", error.message);
    return { ok: true };
  }

  const blocked = (rows ?? []).filter(
    (r) =>
      r.blocks_road_clearance &&
      ["missing", "short", "damaged"].includes(String(r.line_status)),
  ).length;

  if (blocked === 0) return { ok: true };
  return {
    ok: false,
    message:
      "Dispatch blocked: vehicle kit is not road-cleared. Complete missing kit items in Inventory → Vehicle kits.",
  };
}
