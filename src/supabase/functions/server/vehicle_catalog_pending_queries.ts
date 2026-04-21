/**
 * DB helpers for vehicle_catalog_pending_requests (edge service role).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

function parseYear(v: unknown): number {
  const n = parseInt(String(v ?? "").trim(), 10);
  if (Number.isFinite(n) && n >= 1900 && n <= 2100) return n;
  return new Date().getFullYear();
}

export async function upsertPendingFromKvVehicle(
  supabase: SupabaseClient,
  args: {
    organizationId: string;
    fleetVehicleId: string;
    vehicle: Record<string, unknown>;
    source: "scan" | "manual";
  },
): Promise<void> {
  const proposed_make = String(args.vehicle.make ?? "").trim() || "Unknown";
  const proposed_model = String(args.vehicle.model ?? "").trim() || "Unknown";
  const y = parseYear(args.vehicle.year);
  const proposed_production_start_year = y;
  const proposed_production_end_year = y;
  const proposed_trim = null;
  const proposed_body_type = args.vehicle.bodyType != null
    ? String(args.vehicle.bodyType).trim() || null
    : null;

  const { data: existing, error: selErr } = await supabase
    .from("vehicle_catalog_pending_requests")
    .select("id")
    .eq("organization_id", args.organizationId)
    .eq("fleet_vehicle_id", args.fleetVehicleId)
    .in("status", ["pending", "needs_info"])
    .maybeSingle();
  if (selErr) throw selErr;

  const rowBase = {
    organization_id: args.organizationId,
    fleet_vehicle_id: args.fleetVehicleId,
    proposed_make,
    proposed_model,
    proposed_production_start_year,
    proposed_production_end_year,
    proposed_trim_series: proposed_trim,
    proposed_body_type,
    source: args.source,
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    // Keep status (e.g. needs_info) - only refresh proposed fields from KV.
    const { error: upErr } = await supabase
      .from("vehicle_catalog_pending_requests")
      .update(rowBase)
      .eq("id", existing.id);
    if (upErr) throw upErr;
  } else {
    const { error: insErr } = await supabase.from("vehicle_catalog_pending_requests").insert({
      ...rowBase,
      status: "pending" as const,
      created_at: new Date().toISOString(),
    });
    if (insErr) throw insErr;
  }
}

export async function supersedePendingRequestsForVehicle(
  supabase: SupabaseClient,
  organizationId: string,
  fleetVehicleId: string,
): Promise<void> {
  const { error } = await supabase
    .from("vehicle_catalog_pending_requests")
    .update({
      status: "superseded",
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("fleet_vehicle_id", fleetVehicleId)
    .in("status", ["pending", "needs_info"]);
  if (error) throw error;
}
