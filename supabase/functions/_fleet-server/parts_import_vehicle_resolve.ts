import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { isCatalogVariantUuid, parseImportVehicleLabel } from "../../../packages/types/src/partsDatabaseImportCsv.ts";
import { resolveVehicleCatalogIdFromMakeModelYear } from "./vehicle_catalog_resolve.ts";

export type VehicleResolveResult = {
  id: string | null;
  candidates: Array<{ id: string; label: string }>;
};

function candidateLabel(v: {
  make: string;
  model: string;
  chassis_code?: string | null;
  production_start_year?: number | null;
  version_name?: string | null;
}): string {
  const parts = [v.make, v.model, v.chassis_code, v.production_start_year ? String(v.production_start_year) : null].filter(Boolean);
  if (v.version_name) parts.push(v.version_name);
  return parts.join(" ");
}

function filterByChassisAndYear<
  T extends {
    chassis_code?: string | null;
    production_start_year?: number | null;
    production_end_year?: number | null;
  },
>(rows: T[], chassis: string | null, year: string): T[] {
  let out = rows;
  if (chassis) {
    const c = chassis.toLowerCase();
    out = out.filter((r) => (r.chassis_code ?? "").toLowerCase() === c);
  }
  const y = Number(year);
  if (Number.isFinite(y) && y > 0) {
    out = out.filter((r) => {
      const start = r.production_start_year ?? 0;
      const end = r.production_end_year ?? 9999;
      return y >= start && y <= end;
    });
  }
  return out;
}

/** Resolve import vehicle label or catalog UUID; up to 5 candidates for disambiguation. */
export async function resolveVehicleForImport(
  supabase: SupabaseClient,
  raw: string,
): Promise<VehicleResolveResult> {
  const text = raw.trim();
  if (!text) return { id: null, candidates: [] };
  if (isCatalogVariantUuid(text)) {
    const { data } = await supabase.from("vehicle_catalog").select("id").eq("id", text).maybeSingle();
    return data?.id ? { id: data.id, candidates: [] } : { id: null, candidates: [] };
  }
  const parsed = parseImportVehicleLabel(text);
  if (!parsed) return { id: null, candidates: [] };

  const { data: broad, error } = await supabase
    .from("vehicle_catalog")
    .select("id, make, model, chassis_code, production_start_year, production_end_year, version_name:trim_series")
    .ilike("make", parsed.make)
    .ilike("model", parsed.model)
    .limit(50);
  if (error) throw new Error(error.message || "Vehicle catalog lookup failed");

  let matches = filterByChassisAndYear(broad ?? [], parsed.chassis, parsed.year);
  if (!matches.length) {
    const id = await resolveVehicleCatalogIdFromMakeModelYear(
      supabase,
      parsed.make,
      parsed.model,
      parsed.year,
      { chassis_code: parsed.chassis },
    );
    return id ? { id, candidates: [] } : { id: null, candidates: [] };
  }
  if (matches.length === 1) {
    return { id: matches[0]!.id, candidates: [] };
  }
  const candidates = matches.slice(0, 5).map((m) => ({ id: m.id, label: candidateLabel(m) }));
  return { id: null, candidates };
}

/** Apply vehicle resolution to staged rows (unique labels, batched). */
export async function resolveImportBatchVehicles(
  supabase: SupabaseClient,
  batchId: string,
  onProgress?: (checked: number, total: number) => Promise<void>,
): Promise<void> {
  const { data: rows, error } = await supabase
    .from("part_import_row")
    .select("line_no, raw, normalized")
    .eq("batch_id", batchId)
    .order("line_no");
  if (error) throw new Error(error.message || "Vehicle catalog lookup failed");
  const list = rows ?? [];
  const total = list.length;
  const byVehicle = new Map<string, number[]>();
  for (const row of list) {
    const v = String((row.raw as Record<string, string>)?.vehicle ?? "").trim();
    const lines = byVehicle.get(v) ?? [];
    lines.push(row.line_no as number);
    byVehicle.set(v, lines);
  }
  let checked = 0;
  for (const [vehicleLabel, lineNos] of byVehicle) {
    const resolved = await resolveVehicleForImport(supabase, vehicleLabel);
    for (const lineNo of lineNos) {
      const row = list.find((r) => r.line_no === lineNo);
      const prevNorm = (row?.normalized as Record<string, unknown> | null) ?? {};
      await supabase
        .from("part_import_row")
        .update({
          vehicle_catalog_id: resolved.id,
          normalized: {
            ...prevNorm,
            vehicle_candidates: resolved.candidates,
          },
        })
        .eq("batch_id", batchId)
        .eq("line_no", lineNo);
      checked += 1;
      if (onProgress && (checked % 25 === 0 || checked === total)) {
        await onProgress(checked, total);
      }
    }
  }
  if (onProgress && total === 0) await onProgress(0, 0);
}
