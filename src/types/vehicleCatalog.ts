/** Row from `public.vehicle_catalog` (Super Admin motor vehicle master DB). */
export interface VehicleCatalogRecord {
  id: string;
  make: string;
  model: string;
  /** First calendar year this variant was produced */
  production_start_year: number;
  /** Last calendar year inclusive; null = still in production */
  production_end_year: number | null;
  /** 1–12; null = January for uniqueness (see DB index coalesce) */
  production_start_month?: number | null;
  /** 1–12; null when production_end_year is null (ongoing) */
  production_end_month?: number | null;
  /**
   * Trim grade, market series, and/or **facelift phase** (mid-cycle update). Stored in one field per v1.
   * For a major MC (e.g. pre- vs post-facelift), use **separate catalog rows** with distinct year ranges
   * and values like `Pre-Facelift` / `Facelift` (optional: align with frame prefixes DBA vs 5BA/4BA where applicable).
   */
  trim_series: string | null;
  /** Free-text generation label (e.g. Mk2, E210). */
  generation: string | null;
  /** OEM full model / frame code (e.g. DBA-M900A-GBME); CSV "Full Model Code". */
  full_model_code?: string | null;
  /** Market trim / grade (e.g. Custom G); CSV "Trim". */
  catalog_trim?: string | null;
  /** Emissions / frame prefix (e.g. DBA); CSV "Emissions Prefix". */
  emissions_prefix?: string | null;
  /** Trim suffix / package code (e.g. GBME); CSV "Trim Suffix Code". */
  trim_suffix_code?: string | null;
  /** Primary technical index (e.g. M900A) */
  chassis_code?: string | null;
  /** OEM engine code (e.g. 1KR-FE) */
  engine_code?: string | null;
  /** Free-text engine / induction label (e.g. N/A, Turbo, Hybrid). */
  engine_type?: string | null;
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
  /** CSV "Fuel Category" (e.g. Gas, Hybrid). */
  fuel_category?: string | null;
  fuel_type: string | null;
  /** CSV "Fuel Grade" (e.g. 87). */
  fuel_grade?: string | null;
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

/** Year + optional month precision, or year-only when no month fields are set. */
export function formatCatalogProductionWindow(
  r: Pick<
    VehicleCatalogRecord,
    | "production_start_year"
    | "production_end_year"
    | "production_start_month"
    | "production_end_month"
  >,
): string {
  const hasMonth =
    (r.production_start_month != null && r.production_start_month >= 1 && r.production_start_month <= 12) ||
    (r.production_end_month != null && r.production_end_month >= 1 && r.production_end_month <= 12);
  if (!hasMonth) return formatCatalogProductionSpan(r);

  const y0 = r.production_start_year;
  const m0 =
    r.production_start_month != null && r.production_start_month >= 1 && r.production_start_month <= 12
      ? r.production_start_month
      : 1;
  const start = `${y0}-${String(m0).padStart(2, "0")}`;
  const y1 = r.production_end_year;
  if (y1 == null) return `${start}–Present`;
  const m1 =
    r.production_end_month != null && r.production_end_month >= 1 && r.production_end_month <= 12
      ? r.production_end_month
      : 12;
  const end = `${y1}-${String(m1).padStart(2, "0")}`;
  return start === end ? start : `${start}–${end}`;
}

const MONTH_NAMES_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** Export production month as English name to match CSV round-trip. */
export function formatCatalogMonthEnglish(m: number | null | undefined): string {
  if (m == null || m < 1 || m > 12) return "";
  return MONTH_NAMES_EN[m - 1];
}
