import type { VehicleCatalogCreatePayload, VehicleCatalogRecord } from "../types/vehicleCatalog";

/** Columns that often exist in CSV but disappear when Postgres/PostgREST lacks the column. */
const DRIFT_KEYS = [
  "full_model_code",
  "catalog_trim",
  "emissions_prefix",
  "trim_suffix_code",
  "production_start_month",
  "production_end_month",
  "engine_code",
  "engine_type",
  "fuel_category",
  "fuel_grade",
  "fuel_economy_km_per_l",
  "estimated_km_per_refuel",
] as const;

function sentMeaningful(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (typeof v === "number") return Number.isFinite(v);
  return true;
}

function storedEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  return false;
}

/** Field names where `sent` had data but `returned` is blank after create. */
export function catalogCreateDriftFieldNames(
  sent: VehicleCatalogCreatePayload,
  returned: VehicleCatalogRecord,
): (typeof DRIFT_KEYS)[number][] {
  const drift: (typeof DRIFT_KEYS)[number][] = [];
  for (const k of DRIFT_KEYS) {
    const s = (sent as Record<string, unknown>)[k];
    if (!sentMeaningful(s)) continue;
    const r = (returned as Record<string, unknown>)[k];
    if (storedEmpty(r)) drift.push(k);
  }
  return drift;
}
