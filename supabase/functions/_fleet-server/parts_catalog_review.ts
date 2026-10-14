import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const RETIRED = new Set(["retired", "sold", "inactive", "archived"]);

const ENGINE_OPS = new Set(["ENG-OIL", "ENG-SPARK", "ENG-THERM", "ENG-COIL"]);

const REVIEW_OPS = [
  "ENG-OIL", "ENG-SPARK", "ENG-THERM", "FILT-AIR", "HVAC-CABIN",
  "BRK-PADS", "BELT-SERP", "LGT-WIPER", "BRK-ROTOR", "SUS-SHOCK",
  "ENG-O2", "ENG-WPUMP",
];

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

function partFitsFleet(part: PartRow, fleet: { engineCode: string; chassisCode: string }): boolean {
  if (part.engineCode && fleet.engineCode && part.engineCode === fleet.engineCode) return true;
  const code = part.groupCode.toUpperCase();
  if (fleet.chassisCode && code.endsWith(`-${fleet.chassisCode}`)) return true;
  if (fleet.engineCode && code.endsWith(`-${fleet.engineCode}`)) return true;
  return false;
}

function normNumber(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function loadCatalogReview(supabase: SupabaseClient) {
  const parts = await loadParts(supabase);
  const fleets = await loadFleetChassis(supabase);
  const gaps = fleets.map((fleet) => ({
    ...fleet,
    rows: REVIEW_OPS.map((opCode) => {
      const matches = parts.filter((part) => part.opCode === opCode && partFitsFleet(part, fleet));
      if (!matches.length) {
        return { opCode, action: "enter" as const, partNumber: "", manufacturer: "", partId: null, decision: "pending", done: false };
      }
      const part = matches[0];
      const attach = !ENGINE_OPS.has(opCode);
      const attached = part.platformCodes.includes(fleet.chassisCode);
      const done = part.catalog_decision === "confirmed" && (!attach || attached);
      return {
        opCode,
        action: attach ? "attach" as const : "confirm" as const,
        partNumber: part.oem_part_number ?? "",
        manufacturer: part.manufacturer ?? "",
        partId: part.id,
        partName: part.name,
        decision: part.catalog_decision,
        done,
      };
    }),
  }));
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

async function loadFleetChassis(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("fleet_vehicles")
    .select("organization_id, make, model, year, status, vehicle_catalog_id");
  if (error) throw error;
  const active = ((data || []) as Array<Record<string, unknown>>).filter((row) => {
    const status = String(row.status ?? "active").toLowerCase();
    return !RETIRED.has(status) && row.vehicle_catalog_id;
  });
  const catalogIds = [...new Set(active.map((row) => String(row.vehicle_catalog_id)))];
  const catalog = new Map<string, { chassis: string; engine: string; make: string; model: string }>();
  if (catalogIds.length) {
    const { data: rows, error: catErr } = await supabase
      .from("vehicle_catalog")
      .select("id, chassis_code, engine_code, make, model")
      .in("id", catalogIds);
    if (catErr) throw catErr;
    for (const row of (rows || []) as Array<Record<string, unknown>>) {
      catalog.set(String(row.id), {
        chassis: String(row.chassis_code ?? "").toUpperCase(),
        engine: String(row.engine_code ?? "").toUpperCase(),
        make: String(row.make ?? ""),
        model: String(row.model ?? ""),
      });
    }
  }
  const orgIds = [...new Set(active.map((row) => String(row.organization_id ?? "")).filter(Boolean))];
  const names = new Map<string, string>();
  if (orgIds.length) {
    const { data: orgs } = await supabase.from("organizations").select("id, name").in("id", orgIds);
    for (const org of (orgs || []) as Array<{ id: string; name?: string }>) {
      if (org.name) names.set(String(org.id), org.name);
    }
  }
  const grouped = new Map<string, {
    organizationId: string;
    organizationName: string;
    chassisCode: string;
    engineCode: string;
    carName: string;
    vehicleCount: number;
  }>();
  for (const row of active) {
    const info = catalog.get(String(row.vehicle_catalog_id));
    if (!info?.chassis) continue;
    const organizationId = String(row.organization_id ?? "");
    const key = `${organizationId}:${info.chassis}`;
    const current = grouped.get(key);
    if (current) {
      current.vehicleCount += 1;
      continue;
    }
    grouped.set(key, {
      organizationId,
      organizationName: names.get(organizationId) || organizationId,
      chassisCode: info.chassis,
      engineCode: info.engine,
      carName: `${info.make || row.make || ""} ${info.model || row.model || ""}`.trim(),
      vehicleCount: 1,
    });
  }
  return [...grouped.values()].sort((a, b) => b.vehicleCount - a.vehicleCount || a.carName.localeCompare(b.carName));
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

export async function loadPartsCompare(supabase: SupabaseClient, organizationId: string) {
  const { data, error } = await supabase
    .from("fleet_vehicles")
    .select("make, model, year, status, vehicle_catalog_id")
    .eq("organization_id", organizationId);
  if (error) throw error;
  const vehicle = ((data || []) as Array<Record<string, unknown>>).find((row) => {
    const status = String(row.status ?? "active").toLowerCase();
    return !RETIRED.has(status) && row.vehicle_catalog_id;
  });
  if (!vehicle) return { vehicle: null, legacy: [], tiered: [] };
  const catalogId = String(vehicle.vehicle_catalog_id);
  const year = Number(vehicle.year);
  const { data: catalog } = await supabase.from("vehicle_catalog").select("chassis_code, make, model").eq("id", catalogId).maybeSingle();
  const { data: legacyRows, error: legacyErr } = await supabase
    .from("part_fitment")
    .select("part_master(name, oem_part_number)")
    .eq("vehicle_catalog_id", catalogId);
  if (legacyErr) throw legacyErr;
  const { data: tieredRows, error: tieredErr } = await supabase.rpc("parts_for_vehicle", {
    p_catalog_id: catalogId,
    p_component_id: null,
    p_vehicle_year: Number.isFinite(year) ? year : null,
  });
  if (tieredErr) throw tieredErr;
  const cat = catalog as { chassis_code?: string; make?: string; model?: string } | null;
  return {
    vehicle: {
      make: cat?.make || vehicle.make || "",
      model: cat?.model || vehicle.model || "",
      year: Number.isFinite(year) ? year : null,
      chassisCode: cat?.chassis_code ?? "",
    },
    legacy: ((legacyRows || []) as Array<Record<string, unknown>>).map((row) => {
      const part = one(row.part_master);
      return { name: String(part?.name ?? ""), partNumber: String(part?.oem_part_number ?? "") };
    }).filter((row) => row.name || row.partNumber),
    tiered: ((tieredRows || []) as Array<Record<string, unknown>>).map((row) => ({
      name: String(row.part_name ?? ""),
      partNumber: String(row.oem_part_number ?? ""),
      tier: Number(row.tier ?? 0),
    })),
  };
}
