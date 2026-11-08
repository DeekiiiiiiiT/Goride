import type { VehicleCatalogRecord } from "../../../../types/vehicleCatalog";
import { versionDifferenceLabel, versionYearsLabel } from "@roam/vehicle-catalog-core";

export function factValue(v: unknown): string | null {
  if (v == null || v === "") return null;
  return String(v);
}

function normAddCarField(v: unknown): string {
  if (v == null) return "";
  return String(v).trim().toLowerCase();
}

/** Match key for Add a car duplicate check (maker, model, years, drive, engine, frame). */
export function addCarDuplicateKey(
  r: Pick<
    VehicleCatalogRecord,
    | "make"
    | "model"
    | "production_start_year"
    | "production_end_year"
    | "drivetrain"
    | "engine_code"
    | "chassis_code"
  >,
): string {
  const end = r.production_end_year ?? "";
  return [
    normAddCarField(r.make),
    normAddCarField(r.model),
    String(r.production_start_year ?? ""),
    String(end),
    normAddCarField(r.drivetrain),
    normAddCarField(r.engine_code),
    normAddCarField(r.chassis_code),
  ].join("|");
}

export function rowFingerprint(r: VehicleCatalogRecord): string {
  return addCarDuplicateKey(r);
}

export function saveToCarsLabel(count: number): string {
  return `Save to ${count} car${count === 1 ? "" : "s"}`;
}

export function modelYearSpan(versions: VehicleCatalogRecord[]): { min: number; max: number; label: string } {
  const yearMin = Math.min(...versions.map((v) => v.production_start_year));
  const yearMax = Math.max(...versions.map((v) => v.production_end_year ?? 9999));
  const label =
    yearMax >= 9999
      ? `${yearMin} – today`
      : `${yearMin} – ${yearMax}`;
  return { min: yearMin, max: yearMax, label };
}

export function versionHeaderLine(versions: VehicleCatalogRecord[]): string {
  const { label } = modelYearSpan(versions);
  return `${versions.length} version${versions.length === 1 ? "" : "s"} · ${label}`;
}

export function duplicateOfExisting(
  items: VehicleCatalogRecord[],
  candidate: Pick<
    VehicleCatalogRecord,
    "make" | "model" | "production_start_year" | "production_end_year" | "drivetrain" | "engine_code" | "chassis_code"
  >,
  excludeId?: string | null,
): VehicleCatalogRecord | null {
  const fp = addCarDuplicateKey(candidate);
  if (!fp || !normAddCarField(candidate.make) || !normAddCarField(candidate.model)) return null;
  return items.find((r) => r.id !== excludeId && addCarDuplicateKey(r) === fp) ?? null;
}

export function duplicateLine(existing: VehicleCatalogRecord): string {
  const diff = versionDifferenceLabel(existing).split(" · ").join(" ");
  return `A ${existing.make} ${existing.model} ${versionYearsLabel(existing.production_start_year, existing.production_end_year)} ${diff} already exists`;
}

export const VEHICLE_SEARCH_EXAMPLES = ["Toyota Roomy", "M900A", "1KR-FE", "Tank 2019"] as const;

export type ModelAgg = {
  name: string;
  versions: VehicleCatalogRecord[];
  yearMin: number;
  yearMax: number;
};
