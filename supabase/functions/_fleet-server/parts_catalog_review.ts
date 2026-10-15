import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const ENGINE_OPS = new Set(["ENG-OIL", "ENG-SPARK", "ENG-THERM", "ENG-COIL"]);

const CATEGORY: Record<string, string> = {
  "ENG-OIL": "engine-components",
  "ENG-SPARK": "engine-components",
  "ENG-COIL": "electrical-computers",
  "ENG-THERM": "cooling",
  "ENG-WPUMP": "cooling",
  "ENG-O2": "electrical-computers",
  "FILT-AIR": "engine-components",
  "BELT-SERP": "engine-components",
  "BRK-PADS": "brake",
  "BRK-ROTOR": "brake",
  "SUS-SHOCK": "suspension",
  "LGT-WIPER": "lighting-mirrors",
  "HVAC-CABIN": "hvac",
};

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

function normNumber(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
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
    patch.verified_at = new Date().toISOString();
    if (evidence?.verifiedBy) patch.verified_by = evidence.verifiedBy;
    if (evidence?.url) patch.evidence_url = evidence.url;
  }
  const { error } = await supabase.from("part_master").update(patch).eq("id", partId);
  if (error) throw error;
  return { ok: true };
}

export async function attachCatalogPart(supabase: SupabaseClient, partId: string, chassisCode: string) {
  const part = await partForRule(supabase, partId);
  if (ENGINE_OPS.has(part.opCode)) {
    throw new Error("This part follows the engine. Confirm the number instead of attaching it to a chassis.");
  }
  await ensurePlatformRule(supabase, part.groupId, chassisCode);
  await decideCatalogPart(supabase, partId, "confirmed");
  return { ok: true };
}

export async function saveCatalogPart(
  supabase: SupabaseClient,
  input: { opCode: string; chassisCode: string; engineCode: string; manufacturer: string; partNumber: string; partName?: string },
) {
  const opCode = input.opCode.trim().toUpperCase();
  const partNumber = input.partNumber.trim();
  const manufacturer = input.manufacturer.trim();
  const chassisCode = input.chassisCode.trim().toUpperCase();
  const engineCode = input.engineCode.trim().toUpperCase();
  if (!CATEGORY[opCode]) throw new Error("That service is not on the coverage list.");
  if (!partNumber || !manufacturer) throw new Error("Enter the maker and the part number from their catalog.");
  const engineScoped = ENGINE_OPS.has(opCode);
  if (engineScoped && !engineCode) throw new Error("This part needs an engine.");
  if (!engineScoped && !chassisCode) throw new Error("This part needs a chassis.");

  const existing = await findPart(supabase, manufacturer, partNumber);
  let partId = existing?.id ?? "";
  let groupId = existing?.groupId ?? "";
  if (!partId) {
    const targetCode = engineScoped ? engineCode : chassisCode;
    const batchId = crypto.randomUUID();
    const { data, error } = await supabase.rpc("import_parts_catalog_rows", {
      p_rows: [{
        interchangeCode: `IC-${opCode}-${targetCode}`,
        label: input.partName?.trim() || partNumber,
        manufacturer,
        partNumber,
        partName: input.partName?.trim() || partNumber,
        partKind: "oem",
        fitScope: engineScoped ? "powertrain" : "chassis",
        targetKind: engineScoped ? "engine_family" : "platform",
        targetCode,
        componentOpCode: opCode,
        categorySlug: CATEGORY[opCode],
      }],
      p_batch_id: batchId,
    });
    if (error) throw error;
    const result = data as { applied?: number; errors?: string[] } | null;
    if (result?.errors?.length) throw new Error(result.errors[0]);
    if (!result?.applied) throw new Error("The part was not saved.");
    const created = await findPart(supabase, manufacturer, partNumber);
    if (!created) throw new Error("The part was saved but could not be found.");
    partId = created.id;
    groupId = created.groupId;
  }
  if (engineScoped) await ensureEngineRule(supabase, groupId, engineCode);
  else await ensurePlatformRule(supabase, groupId, chassisCode);
  await decideCatalogPart(supabase, partId, "confirmed");
  return { ok: true, partId };
}

async function findPart(supabase: SupabaseClient, manufacturer: string, partNumber: string) {
  const { data, error } = await supabase
    .from("part_master")
    .select("id, manufacturer, interchange_group_id")
    .eq("oem_part_number_norm", normNumber(partNumber));
  if (error) throw error;
  const match = ((data || []) as Array<{ id: string; manufacturer?: string | null; interchange_group_id?: string | null }>)
    .find((row) => String(row.manufacturer ?? "").trim().toLowerCase() === manufacturer.toLowerCase());
  if (!match) return null;
  return { id: match.id, groupId: String(match.interchange_group_id ?? "") };
}

async function partForRule(supabase: SupabaseClient, partId: string) {
  const { data, error } = await supabase
    .from("part_master")
    .select("id, interchange_group_id, maintenance_service_categories(op_code)")
    .eq("id", partId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Part not found.");
  const row = data as Record<string, unknown>;
  const component = one(row.maintenance_service_categories);
  const groupId = String(row.interchange_group_id ?? "");
  if (!groupId) throw new Error("This part has no fitment group.");
  return { id: String(row.id), groupId, opCode: String(component?.op_code ?? "") };
}

async function ensurePlatformRule(supabase: SupabaseClient, groupId: string, chassisCode: string) {
  const code = chassisCode.trim().toUpperCase();
  const { data: platform, error } = await supabase.from("vehicle_platform").select("id").eq("code", code).maybeSingle();
  if (error) throw error;
  const platformId = (platform as { id?: string } | null)?.id;
  if (!platformId) throw new Error("That chassis is not in the catalog yet.");
  const { data: rules, error: ruleErr } = await supabase
    .from("interchange_fitment_rule")
    .select("id")
    .eq("interchange_group_id", groupId)
    .eq("target_kind", "platform")
    .eq("platform_id", platformId)
    .limit(1);
  if (ruleErr) throw ruleErr;
  if (rules?.length) return;
  const { error: insertErr } = await supabase.from("interchange_fitment_rule").insert({
    interchange_group_id: groupId,
    target_kind: "platform",
    platform_id: platformId,
    source: "manual",
  });
  if (insertErr) throw insertErr;
}

async function ensureEngineRule(supabase: SupabaseClient, groupId: string, engineCode: string) {
  const code = engineCode.trim().toUpperCase();
  const { data: engine, error } = await supabase.from("engine_family").select("id").eq("code", code).maybeSingle();
  if (error) throw error;
  const engineId = (engine as { id?: string } | null)?.id;
  if (!engineId) throw new Error("That engine is not in the catalog yet.");
  const { data: rules, error: ruleErr } = await supabase
    .from("interchange_fitment_rule")
    .select("id")
    .eq("interchange_group_id", groupId)
    .eq("target_kind", "engine_family")
    .eq("engine_family_id", engineId)
    .limit(1);
  if (ruleErr) throw ruleErr;
  if (rules?.length) return;
  const { error: insertErr } = await supabase.from("interchange_fitment_rule").insert({
    interchange_group_id: groupId,
    target_kind: "engine_family",
    engine_family_id: engineId,
    source: "manual",
  });
  if (insertErr) throw insertErr;
}
