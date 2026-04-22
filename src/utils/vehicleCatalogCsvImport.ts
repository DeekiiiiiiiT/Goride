/**
 * Parse motor vehicle catalog CSV for Super Admin import.
 * Accepts headers from app export (readable labels) plus common spreadsheet aliases.
 */
import Papa from "papaparse";
import type { VehicleCatalogCreatePayload } from "../types/vehicleCatalog";

/** Normalized header → API field name */
const ALIAS_TO_CANONICAL: Record<string, string> = {
  id: "id",
  make: "make",
  model: "model",
  production_start_year: "production_start_year",
  "production start year": "production_start_year",
  "start year": "production_start_year",
  production_end_year: "production_end_year",
  "production end year": "production_end_year",
  "end year": "production_end_year",
  production_start_month: "production_start_month",
  "production start month": "production_start_month",
  "start month": "production_start_month",
  production_end_month: "production_end_month",
  "production end month": "production_end_month",
  "end month": "production_end_month",
  trim_series: "trim_series",
  "trim series": "trim_series",
  "series / facelift": "trim_series",
  "series/facelift": "trim_series",
  "series facelift": "trim_series",
  generation: "generation",
  model_code: "model_code",
  "model code": "model_code",
  generation_code: "generation_code",
  "generation code": "generation_code",
  chassis_code: "chassis_code",
  "chassis code": "chassis_code",
  engine_code: "engine_code",
  "engine code": "engine_code",
  engine_type: "engine_type",
  "engine type": "engine_type",
  engine_induction: "engine_type",
  "engine induction": "engine_type",
  body_type: "body_type",
  "body type": "body_type",
  doors: "doors",
  length_mm: "length_mm",
  "length mm": "length_mm",
  width_mm: "width_mm",
  "width mm": "width_mm",
  height_mm: "height_mm",
  "height mm": "height_mm",
  wheelbase_mm: "wheelbase_mm",
  "wheelbase mm": "wheelbase_mm",
  ground_clearance_mm: "ground_clearance_mm",
  "ground clearance mm": "ground_clearance_mm",
  engine_displacement_l: "engine_displacement_l",
  "engine displacement l": "engine_displacement_l",
  engine_displacement_cc: "engine_displacement_cc",
  "engine displacement cc": "engine_displacement_cc",
  engine_configuration: "engine_configuration",
  "engine configuration": "engine_configuration",
  fuel_type: "fuel_type",
  "fuel type": "fuel_type",
  transmission: "transmission",
  drivetrain: "drivetrain",
  "drive train": "drivetrain",
  "drive-train": "drivetrain",
  horsepower: "horsepower",
  torque: "torque",
  torque_unit: "torque_unit",
  "torque unit": "torque_unit",
  fuel_tank_capacity: "fuel_tank_capacity",
  "fuel tank capacity": "fuel_tank_capacity",
  fuel_tank_unit: "fuel_tank_unit",
  "fuel tank unit": "fuel_tank_unit",
  seating_capacity: "seating_capacity",
  "seating capacity": "seating_capacity",
  curb_weight_kg: "curb_weight_kg",
  "curb weight kg": "curb_weight_kg",
  gross_vehicle_weight_kg: "gross_vehicle_weight_kg",
  "gross vehicle weight kg": "gross_vehicle_weight_kg",
  max_payload_kg: "max_payload_kg",
  "max payload kg": "max_payload_kg",
  max_towing_kg: "max_towing_kg",
  "max towing kg": "max_towing_kg",
  front_brake_type: "front_brake_type",
  "front brake type": "front_brake_type",
  rear_brake_type: "rear_brake_type",
  "rear brake type": "rear_brake_type",
  brake_size_mm: "brake_size_mm",
  "brake size mm": "brake_size_mm",
  tire_size: "tire_size",
  "tire size": "tire_size",
  bolt_pattern: "bolt_pattern",
  "bolt pattern": "bolt_pattern",
  wheel_offset_mm: "wheel_offset_mm",
  "wheel offset mm": "wheel_offset_mm",
  engine_oil_capacity_l: "engine_oil_capacity_l",
  "engine oil capacity l": "engine_oil_capacity_l",
  coolant_capacity_l: "coolant_capacity_l",
  "coolant capacity l": "coolant_capacity_l",
  created_at: "created_at",
  "created at": "created_at",
  updated_at: "updated_at",
  "updated at": "updated_at",
};

export function normalizeCatalogCsvHeader(raw: string): string {
  return raw
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/\s*\/\s*/g, " / ")
    .replace(/\s+/g, " ")
    .trim();
}

export function remapCsvRowToCanonical(row: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) {
    const nk = normalizeCatalogCsvHeader(k);
    const canon = ALIAS_TO_CANONICAL[nk];
    if (canon) out[canon] = String(v ?? "").trim();
  }
  return out;
}

function isRowEmpty(canon: Record<string, string>): boolean {
  return Object.values(canon).every((v) => v === "");
}

function parseOptionalInt(s: string | undefined): number | null {
  if (s == null || s === "") return null;
  const n = parseInt(String(s).trim(), 10);
  return Number.isFinite(n) ? n : null;
}

function parseOptionalNum(s: string | undefined): number | null {
  if (s == null || s === "") return null;
  const n = Number(String(s).trim());
  return Number.isFinite(n) ? n : null;
}

/** Max length aligned with API validation (`validateEngineType`). */
export const MAX_ENGINE_TYPE_LEN = 200;

/** Trim spreadsheet value for optional engine / induction label. */
export function normalizeEngineType(raw: string | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  return s === "" ? null : s;
}

/** Ongoing production: empty, 9999+, or keywords. */
function parseProductionEndYear(raw: string): { value: number | null; invalid?: boolean } {
  const t = String(raw).trim();
  if (!t) return { value: null };
  const lowered = t.toLowerCase();
  if (lowered === "ongoing" || lowered === "present" || lowered === "current" || lowered === "open") {
    return { value: null };
  }
  const n = parseInt(t, 10);
  if (!Number.isFinite(n)) return { value: null, invalid: true };
  if (n >= 9999) return { value: null };
  return { value: n };
}

function pickStr(canon: Record<string, string>, key: string): string {
  return (canon[key] ?? "").trim();
}

export type BuildPayloadResult =
  | { ok: true; payload: VehicleCatalogCreatePayload }
  | { ok: false; message: string };

export function buildVehicleCatalogCreatePayload(canon: Record<string, string>): BuildPayloadResult {
  if (isRowEmpty(canon)) {
    return { ok: false, message: "Empty row" };
  }

  const make = pickStr(canon, "make");
  const model = pickStr(canon, "model");
  if (!make || !model) {
    return { ok: false, message: "Missing make or model" };
  }

  const psy = parseOptionalInt(pickStr(canon, "production_start_year"));
  if (psy == null || psy < 1900 || psy > 2100) {
    return { ok: false, message: "production_start_year must be between 1900 and 2100" };
  }

  const peyRaw = pickStr(canon, "production_end_year");
  const peyParsed = parseProductionEndYear(peyRaw);
  if (peyParsed.invalid) {
    return { ok: false, message: "Invalid production_end_year" };
  }
  let pey = peyParsed.value;
  if (pey != null && (pey < 1900 || pey > 2100)) {
    return { ok: false, message: "production_end_year must be 1900–2100, empty, or 9999+ for ongoing" };
  }
  if (pey != null && pey < psy) {
    return { ok: false, message: "production_end_year must be >= production_start_year" };
  }

  const psm = parseOptionalInt(pickStr(canon, "production_start_month"));
  if (psm != null && (psm < 1 || psm > 12)) {
    return { ok: false, message: "production_start_month must be 1–12 or empty" };
  }

  let pem = parseOptionalInt(pickStr(canon, "production_end_month"));
  if (pem != null && (pem < 1 || pem > 12)) {
    return { ok: false, message: "production_end_month must be 1–12 or empty" };
  }
  if (pey == null) pem = null;
  if (pey == null && pickStr(canon, "production_end_month") !== "" && pem !== null) {
    return { ok: false, message: "production_end_month must be empty when production is ongoing" };
  }

  const engineTypeRaw = pickStr(canon, "engine_type");
  if (engineTypeRaw.length > MAX_ENGINE_TYPE_LEN) {
    return { ok: false, message: `engine_type must be at most ${MAX_ENGINE_TYPE_LEN} characters` };
  }
  const engineType = normalizeEngineType(engineTypeRaw || undefined);

  const payload: VehicleCatalogCreatePayload = {
    make,
    model,
    production_start_year: psy,
    production_end_year: pey,
    production_start_month: psm,
    production_end_month: pem,
    trim_series: pickStr(canon, "trim_series") || null,
    generation: pickStr(canon, "generation") || null,
    model_code: pickStr(canon, "model_code") || null,
    generation_code: pickStr(canon, "generation_code") || null,
    chassis_code: pickStr(canon, "chassis_code") || null,
    engine_code: pickStr(canon, "engine_code") || null,
    engine_type: engineType,
    body_type: pickStr(canon, "body_type") || null,
    doors: parseOptionalInt(pickStr(canon, "doors")),
    length_mm: parseOptionalNum(pickStr(canon, "length_mm")),
    width_mm: parseOptionalNum(pickStr(canon, "width_mm")),
    height_mm: parseOptionalNum(pickStr(canon, "height_mm")),
    wheelbase_mm: parseOptionalNum(pickStr(canon, "wheelbase_mm")),
    ground_clearance_mm: parseOptionalNum(pickStr(canon, "ground_clearance_mm")),
    engine_displacement_l: parseOptionalNum(pickStr(canon, "engine_displacement_l")),
    engine_displacement_cc: parseOptionalNum(pickStr(canon, "engine_displacement_cc")),
    engine_configuration: pickStr(canon, "engine_configuration") || null,
    fuel_type: pickStr(canon, "fuel_type") || null,
    transmission: pickStr(canon, "transmission") || null,
    drivetrain: pickStr(canon, "drivetrain") || null,
    horsepower: parseOptionalNum(pickStr(canon, "horsepower")),
    torque: parseOptionalNum(pickStr(canon, "torque")),
    torque_unit: pickStr(canon, "torque_unit") || null,
    fuel_tank_capacity: parseOptionalNum(pickStr(canon, "fuel_tank_capacity")),
    fuel_tank_unit: pickStr(canon, "fuel_tank_unit") || null,
    seating_capacity: parseOptionalInt(pickStr(canon, "seating_capacity")),
    curb_weight_kg: parseOptionalNum(pickStr(canon, "curb_weight_kg")),
    gross_vehicle_weight_kg: parseOptionalNum(pickStr(canon, "gross_vehicle_weight_kg")),
    max_payload_kg: parseOptionalNum(pickStr(canon, "max_payload_kg")),
    max_towing_kg: parseOptionalNum(pickStr(canon, "max_towing_kg")),
    front_brake_type: pickStr(canon, "front_brake_type") || null,
    rear_brake_type: pickStr(canon, "rear_brake_type") || null,
    brake_size_mm: parseOptionalNum(pickStr(canon, "brake_size_mm")),
    tire_size: pickStr(canon, "tire_size") || null,
    bolt_pattern: pickStr(canon, "bolt_pattern") || null,
    wheel_offset_mm: parseOptionalNum(pickStr(canon, "wheel_offset_mm")),
    engine_oil_capacity_l: parseOptionalNum(pickStr(canon, "engine_oil_capacity_l")),
    coolant_capacity_l: parseOptionalNum(pickStr(canon, "coolant_capacity_l")),
  };

  return { ok: true, payload };
}

export type ParsedCatalogImportRow = {
  /** 1-based data row index in CSV (after header) */
  rowIndex: number;
  payload?: VehicleCatalogCreatePayload;
  parseError?: string;
};

export function parseVehicleCatalogCsvWithPapa(text: string): ParsedCatalogImportRow[] {
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h: string) => String(h ?? "").replace(/^\uFEFF/, "").trim(),
  });

  const rows = (parsed.data || []) as Record<string, unknown>[];
  const out: ParsedCatalogImportRow[] = [];

  rows.forEach((raw, i) => {
    const strRow: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
      strRow[k] = v == null ? "" : String(v);
    }
    const canon = remapCsvRowToCanonical(strRow);
    const rowIndex = i + 2;
    if (isRowEmpty(canon)) {
      return;
    }
    const built = buildVehicleCatalogCreatePayload(canon);
    if (built.ok) {
      out.push({ rowIndex, payload: built.payload });
    } else {
      out.push({ rowIndex, parseError: built.message });
    }
  });

  return out;
}
