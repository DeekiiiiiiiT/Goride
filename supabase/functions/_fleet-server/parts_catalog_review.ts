import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const GROUP_PREFIXES = [
  "IC-OIL-", "IC-AIR-", "IC-PLUG-", "IC-BELT-", "IC-THERM-", "IC-PUMP-", "IC-O2-", "IC-COIL-",
];

type PartRow = {
  id: string;
  name: string;
  oem_part_number: string | null;
  manufacturer: string | null;
  part_kind: string;
  catalog_decision: string;
  interchange_group_id: string | null;
  opCode: string;
  opName: string;
  groupCode: string;
  engineCode: string;
  platformCodes: string[];
};

function engineFromGroup(code: string): string {
  for (const prefix of GROUP_PREFIXES) {
    if (code.startsWith(prefix)) return code.slice(prefix.length);
  }
  return "";
}

export async function loadCatalogReview(supabase: SupabaseClient) {
  const parts = await loadParts(supabase);
  return {
    parts: parts.map((part) => ({
      id: part.id,
      name: part.name,
      partNumber: part.oem_part_number,
      manufacturer: part.manufacturer,
      partKind: part.part_kind,
      opCode: part.opCode,
      decision: part.catalog_decision,
      engineCode: part.engineCode,
    })),
    gaps: [],
  };
}

async function loadParts(supabase: SupabaseClient): Promise<PartRow[]> {
  const platforms = await platformCodesByGroup(supabase);
  const { data, error } = await supabase
    .from("part_master")
    .select("id, name, oem_part_number, manufacturer, part_kind, catalog_decision, interchange_group_id, maintenance_service_categories(op_code, name), part_interchange_group(code)")
    .order("oem_part_number");
  if (error) throw error;
  return ((data || []) as Array<Record<string, unknown>>).map((row) => {
    const component = one(row.maintenance_service_categories);
    const group = one(row.part_interchange_group);
    const groupCode = String(group?.code ?? "");
    return {
      id: String(row.id),
      name: String(row.name ?? ""),
      oem_part_number: row.oem_part_number != null ? String(row.oem_part_number) : null,
      manufacturer: row.manufacturer != null ? String(row.manufacturer) : null,
      part_kind: String(row.part_kind ?? "oem"),
      catalog_decision: String(row.catalog_decision ?? "pending"),
      interchange_group_id: row.interchange_group_id != null ? String(row.interchange_group_id) : null,
      opCode: String(component?.op_code ?? ""),
      opName: String(component?.name ?? ""),
      groupCode,
      engineCode: engineFromGroup(groupCode),
      platformCodes: platforms.get(String(row.interchange_group_id ?? "")) ?? [],
    };
  });
}

async function platformCodesByGroup(supabase: SupabaseClient): Promise<Map<string, string[]>> {
  const { data, error } = await supabase
    .from("interchange_fitment_rule")
    .select("interchange_group_id, target_kind, vehicle_platform(code)")
    .eq("target_kind", "platform");
  if (error) throw error;
  const map = new Map<string, string[]>();
  for (const row of (data || []) as Array<Record<string, unknown>>) {
    const groupId = String(row.interchange_group_id ?? "");
    const platform = one(row.vehicle_platform);
    const code = String(platform?.code ?? "").toUpperCase();
    if (!groupId || !code) continue;
    const list = map.get(groupId) ?? [];
    list.push(code);
    map.set(groupId, list);
  }
  return map;
}

function one(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return (value[0] as Record<string, unknown>) ?? null;
  if (value && typeof value === "object") return value as Record<string, unknown>;
  return null;
}

export async function decideCatalogPart(
  supabase: SupabaseClient,
  partId: string,
  decision: "confirmed" | "rejected",
  evidence?: { url?: string | null; verifiedBy?: string | null },
) {
  const patch: Record<string, unknown> = { catalog_decision: decision, updated_at: new Date().toISOString() };
  if (decision === "confirmed") {
    let url = evidence?.url?.trim() ?? "";
    if (!url) {
      const existing = await supabase.from("part_master").select("evidence_url").eq("id", partId).maybeSingle();
      if (existing.error) throw existing.error;
      url = String((existing.data as { evidence_url?: string | null } | null)?.evidence_url ?? "").trim();
    }
    if (!url) throw new Error("A verified part needs a source link.");
    patch.verified_at = new Date().toISOString();
    patch.evidence_url = url;
    if (evidence?.verifiedBy) patch.verified_by = evidence.verifiedBy;
  }
  const { error } = await supabase.from("part_master").update(patch).eq("id", partId);
  if (error) throw error;
  const refreshed = await supabase.rpc("refresh_variant_parts_readiness");
  if (refreshed.error) throw refreshed.error;
  return { ok: true };
}

