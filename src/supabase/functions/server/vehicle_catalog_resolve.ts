/**
 * Resolve platform vehicle_catalog id from KV vehicle JSON (explicit FK or catalog match hints).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  pickCatalogIdFromCandidates,
  type CatalogMatchHints,
  type CatalogVariantRow,
} from "../../../utils/vehicleCatalogResolution.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function pickStr(v: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const x = v[k];
    if (typeof x === "string" && x.trim() !== "") return x.trim();
  }
  return null;
}

function hintsFromKvVehicle(v: Record<string, unknown>): CatalogMatchHints {
  return {
    trim_series: pickStr(v, ["vehicle_catalog_trim_hint", "catalog_trim_hint", "trim_series"]),
    generation_code: pickStr(v, ["vehicle_catalog_generation_hint", "generation_code"]),
    model_code: pickStr(v, ["vehicle_catalog_model_code_hint", "model_code"]),
    chassis_code: pickStr(v, ["vehicle_catalog_chassis_hint", "chassis_code"]),
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
): Promise<string | null> {
  const year = parseInt(String(yearStr).trim(), 10);
  if (!Number.isFinite(year)) return null;
  const m = make.trim().toLowerCase();
  const mo = model.trim().toLowerCase();

  const { data, error } = await supabase
    .from("vehicle_catalog")
    .select(
      "id, make, model, trim_series, generation_code, model_code, chassis_code, drivetrain, fuel_type, transmission",
    )
    .lte("production_start_year", year)
    .or(`production_end_year.is.null,production_end_year.gte.${year}`);
  if (error || !data?.length) return null;
  const candidates = (data as Array<CatalogVariantRow & { make?: string; model?: string }>).filter(
    (r) =>
      String(r.make ?? "")
        .trim()
        .toLowerCase() === m &&
      String(r.model ?? "")
        .trim()
        .toLowerCase() === mo,
  );
  if (candidates.length === 0) return null;
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
  return resolveVehicleCatalogIdFromMakeModelYear(
    supabase,
    String(v.make ?? ""),
    String(v.model ?? ""),
    String(v.year ?? ""),
    hints,
  );
}
