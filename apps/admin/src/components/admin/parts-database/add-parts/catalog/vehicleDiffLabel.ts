import { versionDifferenceLabel, versionYearsLabel as coreYearsLabel } from "@roam/vehicle-catalog-core";
import type { AddPartVehicleRow } from "../addPartsApi";

/** D2 shared difference label (no years — use vehicleYearsLabel for years). */
export function vehicleDiffLabel(v: AddPartVehicleRow): string {
  const label = versionDifferenceLabel({
    drivetrain: v.drivetrain,
    engine_code: v.engine_code,
    engine_type: v.engine_type,
    engine_displacement_l: v.engine_displacement_l,
    fuel_type: v.fuel_type,
    fuel_category: v.fuel_category,
    trim_series: v.trim_series,
    version_name: v.version_name,
  });
  return label || "—";
}

export function vehicleYearsLabel(v: AddPartVehicleRow): string {
  const y = coreYearsLabel(v.production_start_year, v.production_end_year);
  return y || "—";
}

export function vehicleListingYearsLabel(yearFrom?: number, yearTo?: number): string {
  if (yearFrom && yearTo && yearTo < 9999) return `${yearFrom}–${yearTo}`;
  if (yearFrom) return `${yearFrom}–`;
  return "—";
}
