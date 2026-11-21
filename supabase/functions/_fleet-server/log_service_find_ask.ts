/**
 * Slice C — "Has Roam been asked?" for GET /parts/find (LC-02).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { researchGroupKeyFromRow } from "./catalog_research_intake.ts";
import { fitFieldsForPartsRequest } from "./parts_sourcing_request_build.ts";

export type FindPartsAskState = {
  state: "none" | "looking";
  askedAt: string | null;
  byYou: boolean;
};

export async function loadFindPartsAskState(
  supabase: SupabaseClient,
  orgId: string,
  input: {
    vehicleCatalogId: string;
    maintenanceComponentId: string;
    positionScheme: string | null;
    positionCodes: string[] | null;
  },
): Promise<FindPartsAskState> {
  const groupKey = await researchGroupKeyFromRow(supabase, findPartsAskGroupKeyRow(input));
  const { data, error } = await supabase
    .from("parts_sourcing_requests")
    .select("organization_id, created_at")
    .eq("kind", "add_part_info")
    .eq("research_group_key", groupKey)
    .in("status", ["open", "in_progress"])
    .order("created_at", { ascending: true });
  if (error) throw error;
  const rows = data ?? [];
  if (!rows.length) {
    return { state: "none", askedAt: null, byYou: false };
  }
  const earliest = rows[0] as { organization_id?: string; created_at?: string };
  const byYou = rows.some((r) => String((r as { organization_id?: string }).organization_id) === orgId);
  return {
    state: "looking",
    askedAt: earliest.created_at != null ? String(earliest.created_at) : null,
    byYou,
  };
}

/** Same row shape POST /parts/request uses before insert (for tests). */
export function findPartsAskGroupKeyRow(input: {
  vehicleCatalogId: string;
  maintenanceComponentId: string;
  positionScheme: string | null;
  positionCodes: string[] | null;
}): Record<string, unknown> {
  const fit = fitFieldsForPartsRequest({}, input.positionCodes);
  return {
    vehicle_catalog_id: input.vehicleCatalogId,
    maintenance_component_id: input.maintenanceComponentId,
    position_scheme: input.positionScheme,
    position_codes: input.positionCodes,
    // A real ask turns wheel places (LF, RF…) into fit / side the same way (buildPartsSourcingInsert); without this a
    // brake-pad ask would never be found and the button would keep showing.
    fit_descriptor: fit.fitDescriptor,
    install_side: fit.install_side,
    match_type: null,
    old_part_number: null,
    name: "",
  };
}