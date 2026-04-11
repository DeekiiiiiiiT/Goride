/** Row from `public.vehicle_catalog` (Super Admin motor vehicle master DB). */
export interface VehicleCatalogRecord {
  id: string;
  make: string;
  model: string;
  year: number;
  trim_series: string | null;
  generation: number | null;
  model_code: string | null;
  body_type: string | null;
  doors: number | null;
  exterior_color: string | null;
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
  created_at: string;
  updated_at: string;
}

/** Payload for create (required: make, model, year). */
export type VehicleCatalogCreatePayload = Partial<VehicleCatalogRecord> &
  Pick<VehicleCatalogRecord, "make" | "model" | "year">;
