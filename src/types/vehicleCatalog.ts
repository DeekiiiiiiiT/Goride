/** Row from `public.vehicle_catalog` (Super Admin motor vehicle master DB). */
export interface VehicleCatalogRecord {
  id: string;
  make: string;
  model: string;
  /** First calendar year this variant was produced */
  production_start_year: number;
  /** Last calendar year inclusive; null = still in production */
  production_end_year: number | null;
  trim_series: string | null;
  generation: number | null;
  model_code: string | null;
  /** OEM / platform code (legacy); prefer chassis_code for new rows */
  generation_code?: string | null;
  /** Primary technical index (e.g. M900A) */
  chassis_code?: string | null;
  /** na | turbo | supercharged | other */
  engine_induction?: string | null;
  body_type: string | null;
  doors: number | null;
  length_mm: number | null;
  width_mm: number | null;
  height_mm: number | null;
  wheelbase_mm: number | null;
  ground_clearance_mm: number | null;
  engine_displacement_l: number | null;
  engine_displacement_cc: number | null;
  engine_configuration: string | null;
  fuel_type: string | null;
  transmission: string | null;
  drivetrain: string | null;
  horsepower: number | null;
  torque: number | null;
  torque_unit: string | null;
  fuel_tank_capacity: number | null;
  fuel_tank_unit: string | null;
  seating_capacity: number | null;
  curb_weight_kg: number | null;
  gross_vehicle_weight_kg: number | null;
  max_payload_kg: number | null;
  max_towing_kg: number | null;
  /** @deprecated Instance data; column may exist on legacy rows — do not set for new catalog entries */
  exterior_color?: string | null;
  front_brake_type?: string | null;
  rear_brake_type?: string | null;
  brake_size_mm?: number | null;
  tire_size?: string | null;
  bolt_pattern?: string | null;
  wheel_offset_mm?: number | null;
  engine_oil_capacity_l?: number | null;
  coolant_capacity_l?: number | null;
  created_at: string;
  updated_at: string;
}

/** Payload for create (required: make, model, production_start_year). */
export type VehicleCatalogCreatePayload = Partial<VehicleCatalogRecord> &
  Pick<VehicleCatalogRecord, "make" | "model" | "production_start_year">;

/** Display label for catalog production span (e.g. `2020–Present`, `2018–2022`). */
export function formatCatalogProductionSpan(
  r: Pick<VehicleCatalogRecord, "production_start_year" | "production_end_year">,
): string {
  const a = r.production_start_year;
  const b = r.production_end_year;
  if (b == null) return `${a}–Present`;
  if (a === b) return String(a);
  return `${a}–${b}`;
}
