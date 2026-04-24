/**
 * Support both DB schemas: legacy `year` only, or migrated `production_*` + `chassis_code`.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

/** True when DB still requires legacy `year NOT NULL` but payload only has `production_start_year`. */
export function isLegacyVehicleCatalogYearNotNullError(err: { message?: string; code?: string } | null): boolean {
  if (!err) return false;
  const msg = String(err.message ?? "");
  const code = String(err.code ?? "");
  if (code === "23502" && (msg.includes('"year"') || msg.includes("'year'"))) return true;
  if (msg.includes("null value in column") && (msg.includes('"year"') || msg.includes("'year'"))) return true;
  return false;
}

/**
 * True when the failure is almost certainly "this column/table is not on the exposed schema"
 * (safe to retry with fewer columns or legacy mapping).
 *
 * Important: do NOT match generic messages that merely name a column (e.g. check-constraint text),
 * or inserts will incorrectly use `stripVehicleCatalogOptionalMigrationColumns` and silently drop data.
 */
export function isVehicleCatalogSchemaMismatchError(err: { message?: string; code?: string } | null): boolean {
  if (!err) return false;
  const raw = String(err.message ?? "");
  const lower = raw.toLowerCase();
  const code = String(err.code ?? "");

  if (isLegacyVehicleCatalogYearNotNullError(err)) return true;

  // PostgreSQL: undefined_column
  if (code === "42703") return true;

  // PostgREST: missing column / stale schema cache (codes vary by version)
  if (code === "PGRST204" || code === "PGRST205") return true;
  if (code.startsWith("PGRST") && (lower.includes("schema cache") || lower.includes("could not find"))) return true;

  if (lower.includes("schema cache")) return true;
  if (lower.includes("could not find") && lower.includes("column")) return true;
  if (lower.includes("undefined column")) return true;
  if (lower.includes("column") && lower.includes("does not exist")) return true;

  return false;
}

/**
 * Best-effort parse of a missing column name from Postgres / PostgREST errors (42703, schema cache).
 * Used to retry inserts/updates after dropping only the offending key instead of stripping whole groups.
 */
export function parseMissingColumnFromVehicleCatalogDbError(
  err: { message?: string; details?: string } | null,
): string | null {
  if (!err) return null;
  const msg = String(err.message ?? "");
  const det = String(err.details ?? "");
  const blob = `${msg}\n${det}`;

  let m = msg.match(/column\s+"([^"]+)"\s+of\s+relation/i);
  if (m) return m[1];

  m = msg.match(/Could not find the '([^']+)' column/i);
  if (m) return m[1];

  m = blob.match(/column\s+"([^"]+)"\s+does not exist/i);
  if (m) return m[1];

  return null;
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

/** CSV-alignment migration (`20260427120000_*`); strip when PostgREST schema cache / DB is behind. */
const VEHICLE_CATALOG_CSV_ALIGNMENT_KEYS = [
  "full_model_code",
  "catalog_trim",
  "emissions_prefix",
  "trim_suffix_code",
  "fuel_category",
  "fuel_grade",
] as const;

/** Fold catalog trim into `trim_series` before dropping `catalog_trim` (CSV parity on narrow schemas). */
export function mergeCatalogTrimIntoTrimSeriesInPlace(row: Record<string, unknown>): void {
  const ct = typeof row.catalog_trim === "string" ? row.catalog_trim.trim() : "";
  const ts = row.trim_series != null && row.trim_series !== "" ? String(row.trim_series).trim() : "";
  if (ct) {
    if (!ts) row.trim_series = ct;
    else if (ts !== ct) row.trim_series = `${ts} · ${ct}`;
  }
}

/**
 * Removes PIM-only columns not present on older `vehicle_catalog` rows.
 * Preserves CSV "Trim" / full model hints on legacy columns where possible.
 */
export function stripVehicleCatalogCsvAlignmentColumns(row: Record<string, unknown>): Record<string, unknown> {
  const out = { ...row };
  mergeCatalogTrimIntoTrimSeriesInPlace(out);
  for (const k of VEHICLE_CATALOG_CSV_ALIGNMENT_KEYS) {
    delete out[k];
  }
  return out;
}

/** Spec-pack + CSV-alignment columns removed (insert/update fallback for aged schemas). */
export function stripVehicleCatalogOptionalMigrationColumns(row: Record<string, unknown>): Record<string, unknown> {
  return stripVehicleCatalogSpecPackColumns(stripVehicleCatalogCsvAlignmentColumns(row));
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
