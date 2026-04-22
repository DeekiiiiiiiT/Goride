/**
 * Support both DB schemas: legacy `year` only, or migrated `production_*` + `chassis_code`.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export function isVehicleCatalogSchemaMismatchError(err: { message?: string; code?: string } | null): boolean {
  if (!err) return false;
  const msg = String(err.message ?? "");
  const code = String(err.code ?? "");
  if (code === "42703") return true;
  /** PostgREST: column not in schema cache / not exposed */
  if (msg.includes("schema cache")) return true;
  if (msg.includes("Could not find") && msg.includes("column")) return true;
  if (msg.includes("production_start_year") || msg.includes("production_end_year")) return true;
  if (msg.includes("production_start_month") || msg.includes("production_end_month")) return true;
  if (msg.includes("engine_type") || msg.includes("engine_code")) return true;
  if (msg.includes("chassis_code") && (msg.includes("schema") || msg.includes("exist") || msg.includes("find"))) {
    return true;
  }
  if (msg.includes("does not exist") && msg.includes("vehicle_catalog")) return true;
  return false;
}

/** Columns from specs-enhancement migration; strip when DB is behind migrations but core catalog exists. */
const VEHICLE_CATALOG_SPEC_PACK_KEYS = [
  "front_brake_type",
  "rear_brake_type",
  "brake_size_mm",
  "tire_size",
  "bolt_pattern",
  "wheel_offset_mm",
  "engine_oil_capacity_l",
  "coolant_capacity_l",
] as const;

export function stripVehicleCatalogSpecPackColumns(row: Record<string, unknown>): Record<string, unknown> {
  const out = { ...row };
  for (const k of VEHICLE_CATALOG_SPEC_PACK_KEYS) {
    delete out[k];
  }
  return out;
}

/** Ensure API responses match VehicleCatalogRecord after migration or on legacy rows. */
export function catalogRowForApi(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  if ((out.engine_type === null || out.engine_type === "") && out.engine_induction != null && out.engine_induction !== "") {
    out.engine_type = out.engine_induction;
  }
  delete out.engine_induction;

  if (out.production_start_year != null && out.production_start_year !== "") {
    return out;
  }
  const y = out.year;
  if (y == null || y === "") return out;
  const yn = Number(y);
  if (!Number.isFinite(yn)) return out;
  return {
    ...out,
    production_start_year: yn,
    production_end_year: out.production_end_year ?? yn,
    chassis_code: out.chassis_code ?? out.generation_code ?? null,
  };
}

export async function listVehicleCatalogWithFallback(
  supabase: SupabaseClient,
): Promise<{ items: Record<string, unknown>[] }> {
  const modern = await supabase
    .from("vehicle_catalog")
    .select("*")
    .order("make", { ascending: true })
    .order("model", { ascending: true })
    .order("production_start_year", { ascending: false })
    .order("production_start_month", { ascending: false });
  if (!modern.error) {
    return { items: (modern.data || []).map((r) => catalogRowForApi(r as Record<string, unknown>)) };
  }
  if (!isVehicleCatalogSchemaMismatchError(modern.error)) throw modern.error;

  const leg = await supabase
    .from("vehicle_catalog")
    .select("*")
    .order("make", { ascending: true })
    .order("model", { ascending: true })
    .order("year", { ascending: false });
  if (leg.error) throw leg.error;
  return { items: (leg.data || []).map((r) => catalogRowForApi(r as Record<string, unknown>)) };
}

/** Insert payload built for modern schema → legacy table (single `year`, `generation_code` for chassis). */
export function insertRowForLegacyDb(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  const ps = out.production_start_year;
  delete out.production_start_year;
  delete out.production_end_year;
  delete out.production_start_month;
  delete out.production_end_month;
  if (ps != null && ps !== "") out.year = ps;
  const ch = out.chassis_code;
  if (ch != null && ch !== "") {
    if (!out.generation_code || out.generation_code === "") out.generation_code = ch;
  }
  delete out.chassis_code;
  delete out.engine_type;
  delete out.engine_code;
  delete out.engine_induction;
  return out;
}

/** PATCH payload: only map keys that are present. */
export function patchRowForLegacyDb(row: Record<string, unknown>): Record<string, unknown> {
  const out = { ...row };
  if ("production_start_year" in out && out.production_start_year !== undefined) {
    out.year = out.production_start_year;
    delete out.production_start_year;
  }
  if ("production_end_year" in out) {
    delete out.production_end_year;
  }
  if ("production_start_month" in out) {
    delete out.production_start_month;
  }
  if ("production_end_month" in out) {
    delete out.production_end_month;
  }
  if ("chassis_code" in out) {
    const ch = out.chassis_code;
    if (ch != null && ch !== "" && (out.generation_code === undefined || out.generation_code === "")) {
      out.generation_code = ch;
    }
    delete out.chassis_code;
  }
  if ("engine_type" in out) {
    delete out.engine_type;
  }
  if ("engine_code" in out) {
    delete out.engine_code;
  }
  if ("engine_induction" in out) {
    delete out.engine_induction;
  }
  return out;
}
