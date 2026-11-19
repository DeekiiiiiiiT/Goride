/**
 * Fleet notices when catalog requests resolve (audit C2).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { applyPendingPartsGroupFilter } from "./pending_parts_group.ts";

export async function notifyFleetsRequestOutcome(
  supabase: SupabaseClient,
  groupId: string,
  kind: "not_found",
  /** Only these asks (the ones just answered); leaves earlier rounds of the same key alone. */
  requestIds?: string[],
) {
  let query = supabase
    .from("parts_sourcing_requests")
    .select(
      "id, organization_id, need_text, vehicle_catalog_id, maintenance_component_id, position_codes, created_at",
    )
    .eq("kind", "add_part_info")
    .in("status", ["open", "in_progress", "rejected"]);
  applyPendingPartsGroupFilter(query, groupId);
  if (requestIds?.length) query = query.in("id", requestIds);
  const { data: rows, error } = await query;
  if (error) throw error;
  if (!rows?.length) return;

  type ReqRow = {
    organization_id?: string;
    need_text?: string;
    vehicle_catalog_id?: string | null;
    maintenance_component_id?: string | null;
    position_codes?: string[] | null;
    created_at?: string;
  };
  const earliestByOrg = new Map<string, ReqRow>();
  for (const row of rows) {
    const r = row as ReqRow;
    const org = String(r.organization_id ?? "");
    if (!org) continue;
    const existing = earliestByOrg.get(org);
    const created = String(r.created_at ?? "");
    if (!existing || (created && (!existing.created_at || created < existing.created_at))) {
      earliestByOrg.set(org, r);
    }
  }
  const first = (rows[0] ?? {}) as ReqRow;
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

  // Every ask in one group is for the same car model and job (the group key), so one car and part label serves all.
  const inserts = [...earliestByOrg.entries()].map(([organization_id, req]) => {
    return {
      organization_id,
      kind: "catalog_not_found",
      title: "Part not found yet",
      body: `Roam couldn't find ${partLabel} for your ${carLabel} yet.`,
      vehicle_catalog_id: req.vehicle_catalog_id ?? null,
      maintenance_component_id: req.maintenance_component_id ?? null,
      position_codes: Array.isArray(req.position_codes) ? req.position_codes.map(String) : null,
    };
  });
  const { error: nErr } = await supabase.from("fleet_parts_notices").insert(inserts);
  if (nErr) throw nErr;
}
