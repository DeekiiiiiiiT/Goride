/**
 * Resolve platform vehicle_catalog id from KV vehicle JSON (explicit FK or catalog match hints).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  pickCatalogIdFromCandidates,
  filterCatalogRowsByFleetMonth,
  type CatalogMatchHints,
  type CatalogVariantRow,
} from "../../../utils/vehicleCatalogResolution.ts";
import { isVehicleCatalogSchemaMismatchError } from "./vehicle_catalog_schema_fallback.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function pickStr(v: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const x = v[k];
    if (typeof x === "string" && x.trim() !== "") return x.trim();
  }
  return null;
}

function parseFleetProductionMonth(v: Record<string, unknown>): number | null {
  for (const k of ["vehicle_catalog_production_month_hint", "vehicle_manufacture_month"]) {
    const x = v[k];
    if (x === undefined || x === null || x === "") continue;
    const n = typeof x === "number" ? x : parseInt(String(x).trim(), 10);
    if (Number.isFinite(n) && n >= 1 && n <= 12) return n;
  }
  return null;
}

function hintsFromKvVehicle(v: Record<string, unknown>): CatalogMatchHints {
  return {
    trim_series: pickStr(v, ["vehicle_catalog_trim_hint", "catalog_trim_hint", "trim_series"]),
    catalog_trim: pickStr(v, ["vehicle_catalog_catalog_trim_hint", "catalog_trim"]),
    full_model_code: pickStr(v, ["vehicle_catalog_full_model_code_hint", "full_model_code"]),
    emissions_prefix: pickStr(v, ["vehicle_catalog_emissions_prefix_hint", "emissions_prefix"]),
    trim_suffix_code: pickStr(v, ["vehicle_catalog_trim_suffix_hint", "trim_suffix_code"]),
    /** Legacy KV used `vehicle_catalog_generation_hint` for OEM frame index; treat as chassis. */
    chassis_code: pickStr(v, [
      "vehicle_catalog_chassis_hint",
      "chassis_code",
      "vehicle_catalog_generation_hint",
      "generation_code",
    ]),
    engine_code: pickStr(v, ["vehicle_catalog_engine_code_hint", "engine_code"]),
    engine_type: pickStr(v, ["vehicle_catalog_engine_type_hint", "engine_type"]),
    drivetrain: pickStr(v, ["vehicle_catalog_drivetrain_hint", "drivetrain"]),
    fuel_type: pickStr(v, ["vehicle_catalog_fuel_type_hint", "fuel_type"]),
    transmission: pickStr(v, ["vehicle_catalog_transmission_hint", "transmission"]),
  };
}

export async function resolveVehicleCatalogIdFromMakeModelYear(
  supabase: SupabaseClient,
  make: string,
  model: string,
  yearStr: string,
  hints?: CatalogMatchHints,
  fleetProductionMonth?: number | null,
): Promise<string | null> {
  const year = parseInt(String(yearStr).trim(), 10);
  if (!Number.isFinite(year)) return null;
  const m = make.trim().toLowerCase();
  const mo = model.trim().toLowerCase();

  const selModern =
    "id, make, model, production_start_year, production_start_month, production_end_year, production_end_month, trim_series, generation, full_model_code, catalog_trim, emissions_prefix, trim_suffix_code, chassis_code, engine_code, engine_type, drivetrain, fuel_type, transmission";
  const selLegacy =
    "id, make, model, trim_series, generation_code, drivetrain, fuel_type, transmission";

  let data: unknown[] | null = null;

  const modern = await supabase
    .from("vehicle_catalog")
    .select(selModern)
    .lte("production_start_year", year)
    .or(`production_end_year.is.null,production_end_year.gte.${year}`);
  if (!modern.error) {
    data = modern.data as unknown[] | null;
  } else if (isVehicleCatalogSchemaMismatchError(modern.error)) {
    const leg = await supabase.from("vehicle_catalog").select(selLegacy).eq("year", year);
    if (leg.error) return null;
    data = leg.data as unknown[] | null;
  } else {
    return null;
  }
  if (!data?.length) return null;

  let candidates = (data as Array<CatalogVariantRow & { make?: string; model?: string }>).filter(
    (r) =>
      String(r.make ?? "")
        .trim()
        .toLowerCase() === m &&
      String(r.model ?? "")
        .trim()
        .toLowerCase() === mo,
  );
  if (candidates.length === 0) return null;

  const withMonth = candidates.map((r) => {
    const raw = r as Record<string, unknown>;
    const chassisFromRow =
      (typeof raw.chassis_code === "string" && raw.chassis_code.trim() !== ""
        ? String(raw.chassis_code).trim()
        : null) ??
      (typeof raw.generation_code === "string" && raw.generation_code.trim() !== ""
        ? String(raw.generation_code).trim()
        : null);
    if ("production_start_year" in r && r.production_start_year != null) {
      return { ...(r as CatalogVariantRow), chassis_code: chassisFromRow ?? (r as CatalogVariantRow).chassis_code };
    }
    const y = year;
    return {
      ...r,
      production_start_year: y,
      production_start_month: null,
      production_end_year: y,
      production_end_month: null,
      chassis_code: chassisFromRow,
    } as CatalogVariantRow;
  });

  const narrowed = filterCatalogRowsByFleetMonth(withMonth, year, fleetProductionMonth ?? null);
  candidates = narrowed.length > 0 ? narrowed : withMonth;

  return pickCatalogIdFromCandidates(candidates, hints ?? {});
}

export async function resolveCatalogIdForKvVehicle(
  supabase: SupabaseClient,
  v: Record<string, unknown>,
): Promise<string | null> {
  const explicit = v.vehicle_catalog_id;
  if (typeof explicit === "string" && UUID_RE.test(explicit.trim())) {
    const { data } = await supabase
      .from("vehicle_catalog")
      .select("id")
      .eq("id", explicit.trim())
      .maybeSingle();
    if (data && (data as { id: string }).id) return (data as { id: string }).id;
  }
  const hints = hintsFromKvVehicle(v);
  const month = parseFleetProductionMonth(v);
  return resolveVehicleCatalogIdFromMakeModelYear(
    supabase,
    String(v.make ?? ""),
    String(v.model ?? ""),
    String(v.year ?? ""),
    hints,
    month,
  );
}
