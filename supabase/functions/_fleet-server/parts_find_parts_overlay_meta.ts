/**
 * FP3 area overlay: best OEM listing per component + catalog add SLA stats.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type ComponentListingHint = {
  oemPartNumber: string | null;
  position: string | null;
};

/** One listing per component (first confirmed OEM on file for this variant). */
export async function readComponentListingHints(
  supabase: SupabaseClient,
  variantId: string,
  componentIds: string[],
): Promise<Map<string, ComponentListingHint>> {
  const out = new Map<string, ComponentListingHint>();
  const ids = [...new Set(componentIds.filter(Boolean))];
  if (!variantId || !ids.length) return out;

  const { data: listings, error } = await supabase
    .from("part_listing")
    .select("id, interchange_group_id, position")
    .eq("vehicle_catalog_id", variantId);
  if (error) throw error;
  const groupIds = [...new Set((listings || []).map((row) => String((row as { interchange_group_id?: string }).interchange_group_id || "")).filter(Boolean))];
  if (!groupIds.length) return out;

  const { data: parts, error: partError } = await supabase
    .from("part_master")
    .select("id, interchange_group_id, maintenance_component_id, oem_part_number, catalog_decision")
    .in("interchange_group_id", groupIds)
    .in("maintenance_component_id", ids);
  if (partError) throw partError;

  const positionByGroup = new Map<string, string>();
  for (const row of listings || []) {
    const groupId = String((row as { interchange_group_id?: string }).interchange_group_id || "");
    const pos = String((row as { position?: string }).position || "").trim();
    if (groupId && pos && !positionByGroup.has(groupId)) positionByGroup.set(groupId, pos);
  }

  for (const part of parts || []) {
    const componentId = String((part as { maintenance_component_id?: string }).maintenance_component_id || "");
    if (!componentId || out.has(componentId)) continue;
    const oem = String((part as { oem_part_number?: string }).oem_part_number || "").trim();
    const groupId = String((part as { interchange_group_id?: string }).interchange_group_id || "");
    out.set(componentId, {
      oemPartNumber: oem || null,
      position: positionByGroup.get(groupId) || null,
    });
  }
  return out;
}

/** Average minutes from add_part_info sent to Added (resolved), org-scoped, last 30 days. */
export async function readCatalogAddAvgMinutes(
  supabase: SupabaseClient,
  orgId: string,
): Promise<number | null> {
  if (!orgId) return null;
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("parts_sourcing_requests")
    .select("sent_at, created_at, added_at, resolved_at")
    .eq("organization_id", orgId)
    .eq("kind", "add_part_info")
    .eq("status", "resolved")
    .gte("created_at", since)
    .not("added_at", "is", null)
    .limit(200);
  if (error) throw error;
  const rows = data || [];
  if (!rows.length) return null;
  const minutes: number[] = [];
  for (const row of rows) {
    const startRaw = (row as { sent_at?: string; created_at?: string }).sent_at
      || (row as { created_at?: string }).created_at;
    const endRaw = (row as { added_at?: string; resolved_at?: string }).added_at
      || (row as { resolved_at?: string }).resolved_at;
    if (!startRaw || !endRaw) continue;
    const start = Date.parse(String(startRaw));
    const end = Date.parse(String(endRaw));
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    minutes.push(Math.round((end - start) / 60_000));
  }
  if (!minutes.length) return null;
  return Math.round(minutes.reduce((a, b) => a + b, 0) / minutes.length);
}
