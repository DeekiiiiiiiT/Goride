/**
 * Fleet notices when catalog requests resolve (audit C2).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { applyPendingPartsGroupFilters } from "./pending_parts_group.ts";

export async function notifyFleetsRequestOutcome(
  supabase: SupabaseClient,
  groupId: string,
  kind: "not_found",
) {
  let query = supabase
    .from("parts_sourcing_requests")
    .select("id, organization_id, need_text, vehicle_catalog_id, maintenance_component_id")
    .eq("kind", "add_part_info")
    .in("status", ["open", "in_progress", "rejected"]);
  applyPendingPartsGroupFilters(query, groupId);
  const { data: rows, error } = await query;
  if (error) throw error;
  if (!rows?.length) return;

  const first = rows[0] as {
    need_text?: string;
    vehicle_catalog_id?: string | null;
    maintenance_component_id?: string | null;
  };
  let carLabel = "your vehicle";
  if (first.vehicle_catalog_id) {
    const { data: vc } = await supabase
      .from("vehicle_catalog")
      .select("make, model, production_start_year")
      .eq("id", first.vehicle_catalog_id)
      .maybeSingle();
    if (vc) {
      carLabel = [vc.make, vc.model, vc.production_start_year].filter(Boolean).join(" ");
    }
  }
  let partLabel = String(first.need_text || "Part").slice(0, 120);
  if (first.maintenance_component_id) {
    const { data: comp } = await supabase
      .from("maintenance_service_categories")
      .select("name")
      .eq("id", first.maintenance_component_id)
      .maybeSingle();
    if (comp?.name) partLabel = String(comp.name);
  }

  const orgs = new Set(rows.map((r) => String((r as { organization_id: string }).organization_id)));
  const inserts = [...orgs].map((organization_id) => ({
    organization_id,
    kind: "catalog_not_found",
    title: "Part not found yet",
    body: `Roam couldn't find ${partLabel} for your ${carLabel} yet.`,
  }));
  const { error: nErr } = await supabase.from("fleet_parts_notices").insert(inserts);
  if (nErr) throw nErr;
}
