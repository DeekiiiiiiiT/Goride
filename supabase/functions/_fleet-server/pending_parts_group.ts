/**
 * Dominion Pending catalog — research group key v2 helpers.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type ResearchGroupKeyV2Input = {
  vehicle_catalog_id?: string | null;
  maintenance_component_id?: string | null;
  fit_descriptor?: string | null;
  install_side?: string | null;
  match_type?: string | null;
  position_scheme?: string | null;
  position_codes?: string[] | null;
  old_part_number?: string | null;
  part_number?: string | null;
  name?: string | null;
  need_text?: string | null;
};

export async function researchGroupKeyV2(
  supabase: SupabaseClient,
  input: ResearchGroupKeyV2Input,
): Promise<string> {
  const name = input.name ?? input.need_text ?? "";
  const partNumber = input.old_part_number ?? input.part_number ?? null;
  const codes = input.position_codes?.length ? input.position_codes.map(String) : null;
  const { data, error } = await supabase.rpc("catalog_research_research_group_key_v2", {
    p_vehicle_catalog_id: input.vehicle_catalog_id ?? null,
    p_component_id: input.maintenance_component_id ?? null,
    p_fit_descriptor: input.fit_descriptor ?? null,
    p_install_side: input.install_side ?? null,
    p_match_type: input.match_type ?? null,
    p_position_scheme: input.position_scheme ?? null,
    p_position_codes: codes,
    p_part_number: partNumber,
    p_name: name,
  });
  if (error) throw error;
  return String(data ?? "");
}

export function parseGroupKeyV2(key: string): {
  vehicleCatalogId: string;
  componentId: string;
  fitOrSide: string;
  matchType: string;
  positionScheme: string;
  positionCodes: string[];
  identity: string;
} | null {
  if (!key.startsWith("v2|")) return null;
  const parts = key.split("|");
  if (parts.length < 8) return null;
  const codesRaw = parts[6] ?? "";
  const positionCodes = codesRaw ? codesRaw.split(",").filter(Boolean) : [];
  const identity = parts.slice(7).join("|");
  return {
    vehicleCatalogId: parts[1] ?? "",
    componentId: parts[2] ?? "",
    fitOrSide: parts[3] ?? "",
    matchType: parts[4] ?? "",
    positionScheme: parts[5] ?? "",
    positionCodes,
    identity,
  };
}

export function groupIdForRow(row: Record<string, unknown>): string {
  const stored = row.research_group_key;
  if (stored != null && String(stored).trim() !== "") {
    return String(stored);
  }
  return `legacy:${String(row.id ?? "")}`;
}

export function applyPendingPartsGroupFilter<T extends { eq: (col: string, val: string) => T }>(
  query: T,
  groupId: string,
): T {
  if (groupId.startsWith("legacy:")) {
    return query.eq("id", groupId.slice("legacy:".length));
  }
  return query.eq("research_group_key", groupId);
}