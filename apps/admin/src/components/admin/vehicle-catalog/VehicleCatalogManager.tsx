import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type LucideIcon,
  Armchair,
  Calendar,
  CarFront,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  DoorOpen,
  Download,
  Upload,
  Eye,
  Fuel,
  Gauge,
  Info,
  Loader2,
  Pencil,
  Plus,
  Ruler,
  Settings2,
  Tag,
  Trash2,
  Weight,
  XCircle,
} from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import {
  createVehicleCatalog,
  deleteVehicleCatalog,
  listVehicleCatalog,
  purgeAllVehicleCatalog,
  updateVehicleCatalog,
  VEHICLE_CATALOG_PURGE_CONFIRM_PHRASE,
} from "../../../services/vehicleCatalogService";
import {
  formatCatalogProductionWindow,
  type VehicleCatalogCreatePayload,
  type VehicleCatalogRecord,
} from "../../../types/vehicleCatalog";
import { VEHICLE_CATALOG_CSV_COLUMNS } from "../../../types/csv-schemas";
import { downloadBlob, jsonToCsv } from "../../../utils/csv-helper";
import { parseVehicleCatalogCsvWithPapa, type ParsedCatalogImportRow } from "../../../utils/vehicleCatalogCsvImport";
import { catalogCreateDriftFieldNames } from "../../../utils/vehicleCatalogWriteDrift";
import { toast } from "sonner@2.0.3";
import { Button } from "../../ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
import { Progress } from "../../ui/progress";
import { ScrollArea } from "../../ui/scroll-area";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";
import {
  CATALOG_REFERENCE_MAKES,
  MODELS_BY_MAKE,
  isCatalogReferenceMake,
  type CatalogReferenceMake,
} from "../../../data/vehicleMakesReference";
import { VEHICLE_BODY_TYPE_OPTIONS, VEHICLE_DOOR_COUNT_OPTIONS } from "../../../data/vehicleBodyOptions";
import {
  VEHICLE_DRIVETRAIN_OPTIONS,
  VEHICLE_FUEL_TYPE_OPTIONS,
  VEHICLE_TRANSMISSION_OPTIONS,
} from "../../../data/vehicleEngineOptions";
import { EngineCatalogSelect } from "./EngineCatalogSelect";
import { VehicleModelCombobox } from "./VehicleModelCombobox";

/** DB allows 1900–2100; list next model year through 1900, newest first. */
function standardModelYearRange(): number[] {
  const max = Math.min(2100, new Date().getFullYear() + 1);
  const min = 1900;
  const years: number[] = [];
  for (let y = max; y >= min; y--) years.push(y);
  return years;
}

/** Include the current form year if it is valid but missing from the standard list. */
function modelYearsForForm(selectedYearStr: string, standard: number[]): number[] {
  const y = parseInt(selectedYearStr, 10);
  if (!Number.isFinite(y) || y < 1900 || y > 2100) return standard;
  if (standard.includes(y)) return standard;
  return [y, ...standard].sort((a, b) => b - a);
}

type MakeSelection = CatalogReferenceMake | "Other";

const MONTH_OPTIONS = [
  { value: "", label: "—" },
  ...Array.from({ length: 12 }, (_, i) => {
    const n = i + 1;
    return { value: String(n), label: String(n) };
  }),
] as const;

const TRIM_SERIES_DATALIST_ID = "vehicle-catalog-trim-series-suggestions";
/** Common values; free text is allowed for trim grades and other markets. */
const TRIM_SERIES_SUGGESTIONS = ["Pre-Facelift", "Facelift", "Base", "XLE", "G", "Z"] as const;

const IDENTIFICATION_TAB_DESCRIPTION =
  "This group contains the absolute essentials for identifying what the car actually is, which is critical for looking up VINs and sourcing trim-specific interior/exterior parts.";

const IDENTIFICATION_FIELD_HINTS = {
  make: "The manufacturer or brand of the vehicle (e.g., Toyota, Honda).",
  model: "The specific product name under the manufacturer's brand (e.g., Roomy, Fit).",
  fullModelCode:
    "The complete factory string identifying the exact build, including emissions, chassis, and trim (e.g., DBA-M900A-GBME).",
  chassisCode:
    "The factory identifier for the vehicle's frame and engine combination; commonly used as the primary ID for sourcing JDM parts.",
  trim: "The specific equipment level, package, or grade of the vehicle (e.g., Custom G, RS).",
  emissionsPrefix:
    "A 3-character Japanese factory code indicating the vehicle's emission standard and era (e.g., DBA, 6AA).",
  trimSuffix:
    "The 4-to-5 letter factory code that dictates the exact interior features, wiring, and exterior accessories.",
  generation: "The chronological iteration of the vehicle model (e.g., 1st Gen, 3rd Gen).",
  seriesFacelift:
    "Indicates if the vehicle is the original design or a mid-cycle refresh with updated body parts and styling.",
} as const;

const PRODUCTION_LIFECYCLE_TAB_DESCRIPTION =
  "Production start year is required to save. Use these dates to record when this chassis and facelift were manufactured, including mid-year changeovers and models still in production.";

const PRODUCTION_LIFECYCLE_FIELD_HINTS = {
  productionStartYear:
    "The year manufacturing officially began for this specific chassis and facelift.",
  productionEndYear:
    "The year manufacturing ceased. (Often marked as 9999 for vehicles currently in active production).",
  productionStartMonth:
    "The specific month manufacturing began, crucial for identifying mid-year part changeovers.",
  productionEndMonth: "The specific month manufacturing ceased.",
} as const;

const DIMENSIONS_BODY_TAB_DESCRIPTION =
  "Classifies the vehicle's body style and records exterior dimensions in millimeters—used for parts fitment, garage clearance, and loading limits.";

const DIMENSIONS_BODY_FIELD_HINTS = {
  bodyType: "The general structural classification of the vehicle (e.g., Sedan, Hatchback, SUV).",
  doors: "The total number of doors, including the rear hatch or trunk.",
  lengthMm: "The total bumper-to-bumper length of the vehicle in millimeters.",
  widthMm: "The maximum width of the vehicle in millimeters, excluding side mirrors.",
  heightMm: "The total height of the vehicle from the ground to the highest point of the roof in millimeters.",
  wheelbaseMm:
    "The exact distance between the centers of the front and rear wheels, affecting interior space and handling.",
  groundClearanceMm:
    "The distance between the lowest point of the vehicle's undercarriage and the ground.",
} as const;

const ENGINE_TRANSMISSION_TAB_DESCRIPTION =
  "Factory engine identifiers, displacement, output figures, and how torque is quoted—plus gearbox and driven wheels for maintenance and parts lookup.";

const ENGINE_TRANSMISSION_FIELD_HINTS = {
  engineCode: "The factory designation for the specific engine block (e.g., 1KR-FE, K20C1).",
  engineType:
    "Indicates if the engine has forced induction or special performance characteristics (e.g., Turbo, N/A).",
  engineDisplacementL:
    "The total volume of all engine cylinders rounded to the nearest tenth of a liter (e.g., 1.5L).",
  engineDisplacementCc: "The exact factory cubic capacity of the engine (e.g., 1496 cc).",
  engineConfiguration:
    "The physical layout and number of the engine's cylinders (e.g., Inline-4, V6).",
  horsepower: "The maximum factory-rated metric horsepower output of the engine.",
  torque: "The maximum factory-rated rotational pulling force the engine produces.",
  torqueUnit:
    "The standard unit used for measuring the engine's torque (typically Nm for Newton-meters).",
  transmission:
    "The type of gearbox equipped in the vehicle (e.g., CVT, 5AT, 6MT).",
  drivetrain: "Indicates which wheels receive power from the engine (e.g., 2WD, 4WD, AWD).",
} as const;

const FUEL_SYSTEM_FLUIDS_TAB_DESCRIPTION =
  "Fuel classification, tank size, and routine service fluid volumes—used for compliance, range estimates, and maintenance intervals.";

const FUEL_SYSTEM_FLUIDS_FIELD_HINTS = {
  fuelCategory: "The broad classification of the vehicle's power source (e.g., Gas, Diesel, Hybrid).",
  fuelType:
    "The specific fuel format required, mapped for system filtering (e.g., Petrol, Hybrid(petrol)).",
  fuelGrade:
    "The minimum recommended octane rating or specific grade required at the pump (e.g., 87, 90, ULSD).",
  fuelTankCapacity: "The maximum volume the fuel tank can hold from empty to full.",
  fuelTankUnit: "The unit of measurement for the fuel tank capacity (typically L for Liters).",
  fuelEconomyKmPerL:
    "Combined or rated fuel economy in kilometers per liter (km/L)—from manufacturer figures or your working assumption.",
  estimatedKmPerRefuel:
    "Approximate kilometers from a full tank at that economy (tank capacity × km/L when the tank is in liters).",
  engineOilCapacityL: "The estimated amount of engine oil required for a standard oil and filter change.",
  coolantCapacityL: "The estimated total fluid volume of the engine's cooling system.",
} as const;

const WEIGHTS_PAYLOAD_TAB_DESCRIPTION =
  "Passenger capacity and certified mass ratings—used for compliance, loading, and towing limits.";

const WEIGHTS_PAYLOAD_FIELD_HINTS = {
  seatingCapacity:
    "The maximum legal number of passengers the vehicle is designed to carry with seatbelts.",
  curbWeightKg:
    "The total weight of the vehicle with all standard equipment and full fluids, but without passengers or cargo.",
  grossVehicleWeightKg:
    "The maximum allowable total weight of the fully loaded vehicle, including curb weight, passengers, and payload.",
  maxPayloadKg:
    "The maximum combined weight of passengers and cargo the vehicle is rated to safely carry inside the cabin.",
  maxTowingKg:
    "The maximum braked trailer weight the vehicle is officially rated to tow.",
} as const;

const WHEELS_BRAKES_TAB_DESCRIPTION =
  "OEM wheel and brake specifications for pads, rotors, tires, and fitment—critical for safe replacement parts.";

const WHEELS_BRAKES_FIELD_HINTS = {
  frontBrakeType:
    "The mechanical design of the front braking system (typically Ventilated Disc).",
  rearBrakeType: "The mechanical design of the rear braking system (e.g., Drum, Solid Disc).",
  brakeSizeMm: "The approximate diameter of the brake rotors or drums.",
  tireSize:
    "The factory-standard OEM tire dimensions formatted as Width/Ratio/Rim (e.g., 195/65R15).",
  boltPattern:
    "The number of wheel studs and the diameter of the circle they form, also known as PCD (e.g., 4x100, 5x114.3).",
  wheelOffsetMm:
    "The distance from the hub mounting surface to the centerline of the wheel (e.g., 45, 50).",
} as const;

const CATALOG_FORM_TOOLTIP_CLASS =
  "z-[300] max-w-[min(22rem,calc(100vw-2rem))] border border-slate-600/90 bg-slate-900 px-3 py-2.5 text-left text-xs font-normal leading-relaxed text-slate-50 shadow-xl";

type FormState = {
  makeSelection: MakeSelection;
  /** Used when makeSelection is Other */
  makeOther: string;
  model: string;
  production_start_year: string;
  /** Empty string = ongoing (null in API) */
  production_end_year: string;
  production_start_month: string;
  production_end_month: string;
  trim_series: string;
  generation: string;
  full_model_code: string;
  catalog_trim: string;
  emissions_prefix: string;
  trim_suffix_code: string;
  chassis_code: string;
  engine_code: string;
  engine_type: string;
  body_type: string;
  doors: string;
  length_mm: string;
  width_mm: string;
  height_mm: string;
  wheelbase_mm: string;
  ground_clearance_mm: string;
  engine_displacement_l: string;
  engine_displacement_cc: string;
  engine_configuration: string;
  fuel_category: string;
  fuel_type: string;
  fuel_grade: string;
  transmission: string;
  drivetrain: string;
  horsepower: string;
  torque: string;
  torque_unit: string;
  fuel_tank_capacity: string;
  fuel_tank_unit: string;
  fuel_economy_km_per_l: string;
  estimated_km_per_refuel: string;
  seating_capacity: string;
  curb_weight_kg: string;
  gross_vehicle_weight_kg: string;
  max_payload_kg: string;
  max_towing_kg: string;
  front_brake_type: string;
  rear_brake_type: string;
  brake_size_mm: string;
  tire_size: string;
  bolt_pattern: string;
  wheel_offset_mm: string;
  engine_oil_capacity_l: string;
  coolant_capacity_l: string;
};

function resolveMake(form: FormState): string {
  if (form.makeSelection === "Other") return form.makeOther.trim();
  return form.makeSelection;
}

function emptyForm(): FormState {
  const y = String(new Date().getFullYear());
  return {
    makeSelection: "Toyota",
    makeOther: "",
    model: "",
    production_start_year: y,
    production_end_year: "",
    production_start_month: "",
    production_end_month: "",
    trim_series: "",
    generation: "",
    full_model_code: "",
    catalog_trim: "",
    emissions_prefix: "",
    trim_suffix_code: "",
    chassis_code: "",
    engine_code: "",
    engine_type: "",
    body_type: "",
    doors: "",
    length_mm: "",
    width_mm: "",
    height_mm: "",
    wheelbase_mm: "",
    ground_clearance_mm: "",
    engine_displacement_l: "",
    engine_displacement_cc: "",
    engine_configuration: "",
    fuel_category: "",
    fuel_type: "",
    fuel_grade: "",
    transmission: "",
    drivetrain: "",
    horsepower: "",
    torque: "",
    torque_unit: "Nm",
    fuel_tank_capacity: "",
    fuel_tank_unit: "L",
    fuel_economy_km_per_l: "",
    estimated_km_per_refuel: "",
    seating_capacity: "",
    curb_weight_kg: "",
    gross_vehicle_weight_kg: "",
    max_payload_kg: "",
    max_towing_kg: "",
    front_brake_type: "",
    rear_brake_type: "",
    brake_size_mm: "",
    tire_size: "",
    bolt_pattern: "",
    wheel_offset_mm: "",
    engine_oil_capacity_l: "",
    coolant_capacity_l: "",
  };
}

function recordToForm(r: VehicleCatalogRecord): FormState {
  const s = (n: number | null | undefined) => (n == null ? "" : String(n));
  const t = (v: string | null | undefined) => v ?? "";
  const ref = isCatalogReferenceMake(r.make) ? r.make : "Other";
  const chassis = t(r.chassis_code);
  return {
    makeSelection: ref,
    makeOther: ref === "Other" ? r.make : "",
    model: r.model,
    production_start_year: String(r.production_start_year),
    production_end_year: r.production_end_year == null ? "" : String(r.production_end_year),
    production_start_month: r.production_start_month == null ? "" : String(r.production_start_month),
    production_end_month: r.production_end_month == null ? "" : String(r.production_end_month),
    trim_series: t(r.trim_series),
    generation: t(r.generation),
    full_model_code: t(r.full_model_code),
    catalog_trim: t(r.catalog_trim),
    emissions_prefix: t(r.emissions_prefix),
    trim_suffix_code: t(r.trim_suffix_code),
    chassis_code: chassis,
    engine_code: t(r.engine_code),
    engine_type: t(r.engine_type),
    body_type: t(r.body_type),
    doors: s(r.doors),
    length_mm: s(r.length_mm),
    width_mm: s(r.width_mm),
    height_mm: s(r.height_mm),
    wheelbase_mm: s(r.wheelbase_mm),
    ground_clearance_mm: s(r.ground_clearance_mm),
    engine_displacement_l: s(r.engine_displacement_l),
    engine_displacement_cc: s(r.engine_displacement_cc),
    engine_configuration: t(r.engine_configuration),
    fuel_category: t(r.fuel_category),
    fuel_type: t(r.fuel_type),
    fuel_grade: t(r.fuel_grade),
    transmission: t(r.transmission),
    drivetrain: t(r.drivetrain),
    horsepower: s(r.horsepower),
    torque: s(r.torque),
    torque_unit: t(r.torque_unit) || "Nm",
    fuel_tank_capacity: s(r.fuel_tank_capacity),
    fuel_tank_unit: t(r.fuel_tank_unit) || "L",
    fuel_economy_km_per_l: s(r.fuel_economy_km_per_l),
    estimated_km_per_refuel: s(r.estimated_km_per_refuel),
    seating_capacity: s(r.seating_capacity),
    curb_weight_kg: s(r.curb_weight_kg),
    gross_vehicle_weight_kg: s(r.gross_vehicle_weight_kg),
    max_payload_kg: s(r.max_payload_kg),
    max_towing_kg: s(r.max_towing_kg),
    front_brake_type: t(r.front_brake_type),
    rear_brake_type: t(r.rear_brake_type),
    brake_size_mm: s(r.brake_size_mm),
    tire_size: t(r.tire_size),
    bolt_pattern: t(r.bolt_pattern),
    wheel_offset_mm: s(r.wheel_offset_mm),
    engine_oil_capacity_l: s(r.engine_oil_capacity_l),
    coolant_capacity_l: s(r.coolant_capacity_l),
  };
}

function optInt(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

function optNum(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function optMonth(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = parseInt(t, 10);
  return Number.isFinite(n) && n >= 1 && n <= 12 ? n : null;
}

function toCreatePayload(form: FormState): VehicleCatalogCreatePayload {
  const ps = parseInt(form.production_start_year, 10);
  const peStr = form.production_end_year.trim();
  const pe = peStr === "" ? null : parseInt(peStr, 10);
  const make = resolveMake(form);
  const base: VehicleCatalogCreatePayload = {
    make,
    model: form.model.trim(),
    production_start_year: ps,
    production_end_year: pe,
  };
  const assign = (k: keyof VehicleCatalogRecord, v: unknown) => {
    if (v !== undefined && v !== null) (base as Record<string, unknown>)[k as string] = v;
  };
  assign("trim_series", form.trim_series.trim() || null);
  assign("generation", form.generation.trim() || null);
  assign("full_model_code", form.full_model_code.trim() || null);
  assign("catalog_trim", form.catalog_trim.trim() || null);
  assign("emissions_prefix", form.emissions_prefix.trim() || null);
  assign("trim_suffix_code", form.trim_suffix_code.trim() || null);
  assign("chassis_code", form.chassis_code.trim() || null);
  assign("engine_code", form.engine_code.trim() || null);
  assign("engine_type", form.engine_type.trim() || null);
  assign("production_start_month", optMonth(form.production_start_month));
  assign("production_end_month", pe == null ? null : optMonth(form.production_end_month));
  assign("body_type", form.body_type.trim() || null);
  assign("doors", optInt(form.doors));
  assign("length_mm", optNum(form.length_mm));
  assign("width_mm", optNum(form.width_mm));
  assign("height_mm", optNum(form.height_mm));
  assign("wheelbase_mm", optNum(form.wheelbase_mm));
  assign("ground_clearance_mm", optNum(form.ground_clearance_mm));
  assign("engine_displacement_l", optNum(form.engine_displacement_l));
  assign("engine_displacement_cc", optNum(form.engine_displacement_cc));
  assign("engine_configuration", form.engine_configuration.trim() || null);
  assign("fuel_category", form.fuel_category.trim() || null);
  assign("fuel_type", form.fuel_type.trim() || null);
  assign("fuel_grade", form.fuel_grade.trim() || null);
  assign("transmission", form.transmission.trim() || null);
  assign("drivetrain", form.drivetrain.trim() || null);
  assign("horsepower", optNum(form.horsepower));
  assign("torque", optNum(form.torque));
  assign("torque_unit", form.torque_unit.trim() || null);
  assign("fuel_tank_capacity", optNum(form.fuel_tank_capacity));
  assign("fuel_tank_unit", form.fuel_tank_unit.trim() || null);
  assign("fuel_economy_km_per_l", optNum(form.fuel_economy_km_per_l));
  assign("estimated_km_per_refuel", optNum(form.estimated_km_per_refuel));
  assign("seating_capacity", optInt(form.seating_capacity));
  assign("curb_weight_kg", optNum(form.curb_weight_kg));
  assign("gross_vehicle_weight_kg", optNum(form.gross_vehicle_weight_kg));
  assign("max_payload_kg", optNum(form.max_payload_kg));
  assign("max_towing_kg", optNum(form.max_towing_kg));
  assign("front_brake_type", form.front_brake_type.trim() || null);
  assign("rear_brake_type", form.rear_brake_type.trim() || null);
  assign("brake_size_mm", optNum(form.brake_size_mm));
  assign("tire_size", form.tire_size.trim() || null);
  assign("bolt_pattern", form.bolt_pattern.trim() || null);
  assign("wheel_offset_mm", optNum(form.wheel_offset_mm));
  assign("engine_oil_capacity_l", optNum(form.engine_oil_capacity_l));
  assign("coolant_capacity_l", optNum(form.coolant_capacity_l));
  return base;
}

function toPatchPayload(form: FormState): Partial<VehicleCatalogRecord> {
  const ps = parseInt(form.production_start_year, 10);
  const peStr = form.production_end_year.trim();
  const pe = peStr === "" ? null : parseInt(peStr, 10);
  const make = resolveMake(form);
  return {
    make,
    model: form.model.trim(),
    production_start_year: Number.isFinite(ps) ? ps : 0,
    production_end_year: pe,
    trim_series: form.trim_series.trim() || null,
    generation: form.generation.trim() || null,
    full_model_code: form.full_model_code.trim() || null,
    catalog_trim: form.catalog_trim.trim() || null,
    emissions_prefix: form.emissions_prefix.trim() || null,
    trim_suffix_code: form.trim_suffix_code.trim() || null,
    chassis_code: form.chassis_code.trim() || null,
    engine_code: form.engine_code.trim() || null,
    engine_type: form.engine_type.trim() || null,
    production_start_month: optMonth(form.production_start_month),
    production_end_month: pe == null ? null : optMonth(form.production_end_month),
    body_type: form.body_type.trim() || null,
    doors: optInt(form.doors),
    length_mm: optNum(form.length_mm),
    width_mm: optNum(form.width_mm),
    height_mm: optNum(form.height_mm),
    wheelbase_mm: optNum(form.wheelbase_mm),
    ground_clearance_mm: optNum(form.ground_clearance_mm),
    engine_displacement_l: optNum(form.engine_displacement_l),
    engine_displacement_cc: optNum(form.engine_displacement_cc),
    engine_configuration: form.engine_configuration.trim() || null,
    fuel_category: form.fuel_category.trim() || null,
    fuel_type: form.fuel_type.trim() || null,
    fuel_grade: form.fuel_grade.trim() || null,
    transmission: form.transmission.trim() || null,
    drivetrain: form.drivetrain.trim() || null,
    horsepower: optNum(form.horsepower),
    torque: optNum(form.torque),
    torque_unit: form.torque_unit.trim() || null,
    fuel_tank_capacity: optNum(form.fuel_tank_capacity),
    fuel_tank_unit: form.fuel_tank_unit.trim() || null,
    fuel_economy_km_per_l: optNum(form.fuel_economy_km_per_l),
    estimated_km_per_refuel: optNum(form.estimated_km_per_refuel),
    seating_capacity: optInt(form.seating_capacity),
    curb_weight_kg: optNum(form.curb_weight_kg),
    gross_vehicle_weight_kg: optNum(form.gross_vehicle_weight_kg),
    max_payload_kg: optNum(form.max_payload_kg),
    max_towing_kg: optNum(form.max_towing_kg),
    front_brake_type: form.front_brake_type.trim() || null,
    rear_brake_type: form.rear_brake_type.trim() || null,
    brake_size_mm: optNum(form.brake_size_mm),
    tire_size: form.tire_size.trim() || null,
    bolt_pattern: form.bolt_pattern.trim() || null,
    wheel_offset_mm: optNum(form.wheel_offset_mm),
    engine_oil_capacity_l: optNum(form.engine_oil_capacity_l),
    coolant_capacity_l: optNum(form.coolant_capacity_l),
  };
}

export function VehicleCatalogManager() {
  const { session } = useAuth();
  const token = session?.access_token;

  const standardModelYears = useMemo(() => standardModelYearRange(), []);

  const [items, setItems] = useState<VehicleCatalogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewRecord, setViewRecord] = useState<VehicleCatalogRecord | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm());

  /** Grouped table: make → model → variants */
  const [expandedMakes, setExpandedMakes] = useState<Set<string>>(() => new Set());
  const [expandedModels, setExpandedModels] = useState<Set<string>>(() => new Set());

  const groupedCatalog = useMemo(() => {
    const byMake = new Map<string, Map<string, VehicleCatalogRecord[]>>();
    for (const row of items) {
      const make = (row.make ?? "").trim() || "—";
      const model = (row.model ?? "").trim() || "—";
      if (!byMake.has(make)) byMake.set(make, new Map());
      const byModel = byMake.get(make)!;
      if (!byModel.has(model)) byModel.set(model, []);
      byModel.get(model)!.push(row);
    }
    const variantSort = (a: VehicleCatalogRecord, b: VehicleCatalogRecord) => {
      const ya = a.production_start_year ?? 0;
      const yb = b.production_start_year ?? 0;
      if (yb !== ya) return yb - ya;
      const ma = a.production_start_month ?? 0;
      const mb = b.production_start_month ?? 0;
      return mb - ma;
    };
    const makes = [...byMake.keys()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    return makes.map((make) => {
      const byModel = byMake.get(make)!;
      const models = [...byModel.keys()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
      const modelGroups = models.map((model) => ({
        model,
        rows: [...(byModel.get(model) ?? [])].sort(variantSort),
      }));
      const variantCount = modelGroups.reduce((n, g) => n + g.rows.length, 0);
      return { make, modelGroups, variantCount };
    });
  }, [items]);

  const modelGroupKey = (make: string, model: string) => `${make}\u001f${model}`;

  const startYearDropdownYears = useMemo(
    () => modelYearsForForm(form.production_start_year, standardModelYears),
    [form.production_start_year, standardModelYears],
  );
  const endYearDropdownYears = useMemo(
    () => modelYearsForForm(form.production_end_year, standardModelYears),
    [form.production_end_year, standardModelYears],
  );

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const list = await listVehicleCatalog(token);
      setItems(list);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load vehicle catalog");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setError(null);
    setDialogOpen(true);
  };

  const openEdit = (row: VehicleCatalogRecord) => {
    setEditingId(row.id);
    setForm(recordToForm(row));
    setError(null);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!token) return;
    const make = resolveMake(form);
    const model = form.model.trim();
    const ps = parseInt(form.production_start_year, 10);
    const peStr = form.production_end_year.trim();
    const pe = peStr === "" ? null : parseInt(peStr, 10);
    if (form.makeSelection === "Other" && !form.makeOther.trim()) {
      setError("Enter a custom make, or pick a make from the list.");
      return;
    }
    if (!make || !model) {
      setError("Make and model are required.");
      return;
    }
    if (!Number.isFinite(ps) || ps < 1900 || ps > 2100) {
      setError("Production start year must be between 1900 and 2100.");
      return;
    }
    if (pe != null && (!Number.isFinite(pe) || pe < 1900 || pe > 2100)) {
      setError("Production end year must be between 1900 and 2100, or leave empty for ongoing.");
      return;
    }
    if (pe != null && pe < ps) {
      setError("Production end year must be on or after the start year.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        await updateVehicleCatalog(token, editingId, toPatchPayload(form));
      } else {
        await createVehicleCatalog(token, toCreatePayload(form));
      }
      setDialogOpen(false);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: VehicleCatalogRecord) => {
    if (!token) return;
    if (!window.confirm(`Delete ${row.make} ${row.model} (${formatCatalogProductionWindow(row)})?`)) return;
    setError(null);
    try {
      await deleteVehicleCatalog(token, row.id);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const update =
    (key: keyof FormState) =>
    (value: string) =>
      setForm((f) => ({ ...f, [key]: value }));

  const handleExportCsv = () => {
    const csv = jsonToCsv(items, VEHICLE_CATALOG_CSV_COLUMNS);
    const today = new Date().toISOString().split("T")[0];
    downloadBlob(csv, `motor_vehicle_catalog_${today}.csv`);
  };

  const importFileRef = useRef<HTMLInputElement>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<ParsedCatalogImportRow[] | null>(null);
  /** preview → importing → result */
  const [importStep, setImportStep] = useState<"preview" | "importing" | "result">("preview");
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [importOutcome, setImportOutcome] = useState<{
    imported: number;
    failed: number;
    errors: string[];
    /** Present when API accepted rows but omitted columns the CSV had (remote DB / Edge out of date). */
    schemaWarnings: string[];
  } | null>(null);

  const [purgeDialogOpen, setPurgeDialogOpen] = useState(false);
  const [purgeConfirmInput, setPurgeConfirmInput] = useState("");
  const [purging, setPurging] = useState(false);

  const handleImportPick = () => importFileRef.current?.click();

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? "");
        const rows = parseVehicleCatalogCsvWithPapa(text);
        setImportPreview(rows);
        setImportStep("preview");
        setImportProgress(null);
        setImportOutcome(null);
        setImportDialogOpen(true);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not parse CSV");
      }
    };
    reader.onerror = () => toast.error("Could not read file");
    reader.readAsText(file);
  };

  const handleCloseImportDialog = () => {
    if (importStep === "importing") return;
    setImportDialogOpen(false);
    setImportPreview(null);
    setImportStep("preview");
    setImportProgress(null);
    setImportOutcome(null);
  };

  const handleRunCatalogImport = async () => {
    if (!token) return;
    if (importPreview == null) return;
    if (importPreview.length === 0) {
      toast.error(
        "No data rows found in this file. Use a comma-separated CSV with a header row (export from here for a template).",
      );
      return;
    }
    const ready = importPreview.filter((r): r is ParsedCatalogImportRow & { payload: NonNullable<ParsedCatalogImportRow["payload"]> } =>
      Boolean(r.payload),
    );
    if (ready.length === 0) {
      toast.error("No valid rows to import — fix the parse issues listed in the dialog, then try again.");
      return;
    }
    setImportStep("importing");
    setImportProgress({ current: 0, total: ready.length });
    setImportOutcome(null);
    let imported = 0;
    const apiErrors: string[] = [];
    const driftFieldSet = new Set<string>();
    let driftRowCount = 0;
    for (let i = 0; i < ready.length; i++) {
      const r = ready[i];
      try {
        const created = await createVehicleCatalog(token, r.payload);
        const drift = catalogCreateDriftFieldNames(r.payload, created);
        if (drift.length) {
          driftRowCount++;
          drift.forEach((f) => driftFieldSet.add(f));
        }
        imported++;
      } catch (err) {
        apiErrors.push(`Row ${r.rowIndex}: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setImportProgress({ current: i + 1, total: ready.length });
      }
    }
    const schemaWarnings: string[] = [];
    if (driftFieldSet.size > 0) {
      const fields = [...driftFieldSet].sort().join(", ");
      schemaWarnings.push(
        `${driftRowCount} of ${ready.length} row(s) had CSV data for: ${fields}, but the API response still had blanks. If you already added columns in SQL, run the three PostgREST reload statements from supabase/scripts/repair_vehicle_catalog_for_csv_import.sql (end of file: pg_sleep, NOTIFY pgrst, NOTIFY with reload), wait 30 seconds, purge catalog rows, then import again—or restart the project from Supabase Dashboard if reload still fails.`,
      );
      schemaWarnings.push(
        `If you have not added the columns yet, run supabase/scripts/repair_vehicle_catalog_for_csv_import.sql (includes NOTIFY at the end), or apply the vehicle_catalog migrations under supabase/migrations. Then deploy the make-server-37f42386 Edge function from this repo. Confirm the dashboard project ref matches the app (see projectId in src/utils/supabase/info.tsx).`,
      );
    }
    setImportOutcome({ imported, failed: apiErrors.length, errors: apiErrors, schemaWarnings });
    setImportStep("result");
    if (imported > 0) {
      await load();
    }
  };

  const handlePurgeCatalog = async () => {
    if (!token) return;
    if (purgeConfirmInput.trim() !== VEHICLE_CATALOG_PURGE_CONFIRM_PHRASE) return;
    setPurging(true);
    setError(null);
    try {
      const { deleted } = await purgeAllVehicleCatalog(token, purgeConfirmInput.trim());
      setPurgeDialogOpen(false);
      setPurgeConfirmInput("");
      setViewRecord(null);
      setDialogOpen(false);
      toast.success(
        deleted === 0
          ? "Catalog was already empty."
          : `Removed ${deleted} motor vehicle${deleted === 1 ? "" : "s"} from the catalog.`,
      );
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not delete all vehicles");
      toast.error(e instanceof Error ? e.message : "Could not delete all vehicles");
    } finally {
      setPurging(false);
    }
  };

  if (!token) {
    return <p className="text-sm text-slate-500">Sign in to manage the vehicle catalog.</p>;
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 text-slate-200">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Motor vehicles</h2>
          <p className="text-sm text-slate-400">
            Platform-wide reference variants—use separate rows and year ranges for major facelifts (e.g.
            Pre-Facelift vs Facelift). Used as reference data for fleets.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <input
            ref={importFileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            aria-hidden
            onChange={handleImportFileChange}
          />
          <Button
            type="button"
            variant="outline"
            className="gap-2 border-slate-600 bg-slate-800/80 text-slate-200 hover:bg-slate-700 hover:text-white"
            onClick={handleImportPick}
            disabled={loading || importStep === "importing"}
            title="Import rows from CSV (export first to use as a template)"
          >
            <Upload className="w-4 h-4" />
            Import CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            className="gap-2 border-slate-600 bg-slate-800/80 text-slate-200 hover:bg-slate-700 hover:text-white"
            onClick={handleExportCsv}
            disabled={loading}
            title={
              items.length === 0
                ? "Exports headers and column guide; add vehicles or import to fill rows"
                : "Download catalog with production months, engine code, and engine type columns"
            }
          >
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
          <Button onClick={openCreate} className="gap-2 bg-amber-500 text-slate-950 hover:bg-amber-400">
            <Plus className="w-4 h-4" />
            Add vehicle
          </Button>
          <Button
            type="button"
            variant="outline"
            className="gap-2 border-red-500/40 bg-slate-800/80 text-red-400 hover:bg-red-950/40 hover:text-red-300"
            disabled={loading || items.length === 0 || importStep === "importing"}
            title="Remove every row in the motor vehicle catalog (cannot be undone)"
            onClick={() => {
              setPurgeConfirmInput("");
              setPurgeDialogOpen(true);
            }}
          >
            <Trash2 className="w-4 h-4" />
            Delete all
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
        </div>
      ) : (
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 shadow-sm overflow-hidden [&_tbody_td]:!text-slate-200 [&_thead_th]:!text-slate-300">
          <Table className="[&_th]:!text-slate-300 [&_td]:!text-slate-200 [&_tbody_tr]:border-slate-800 [&_tbody_tr:hover]:bg-slate-800/40">
          <TableHeader>
            <TableRow className="border-slate-700 hover:bg-transparent bg-slate-800/90">
              <TableHead className="!bg-transparent text-slate-300">Make</TableHead>
              <TableHead className="!bg-transparent text-slate-300">Model</TableHead>
              <TableHead className="!bg-transparent text-slate-300">Years</TableHead>
              <TableHead
                className="hidden md:table-cell !bg-transparent text-slate-300"
                title="Series, facelift phase, or trim grade"
              >
                Series / facelift
              </TableHead>
              <TableHead
                className="hidden lg:table-cell !bg-transparent text-slate-300"
                title="Full model code or chassis"
              >
                Code
              </TableHead>
              <TableHead className="hidden lg:table-cell !bg-transparent text-slate-300">Body</TableHead>
              <TableHead className="w-[140px] text-right !bg-transparent text-slate-300">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow className="hover:bg-transparent border-slate-800">
                <TableCell colSpan={7} className="text-center text-slate-500 py-12">
                  No vehicles yet. Add one to get started.
                </TableCell>
              </TableRow>
            ) : (
              groupedCatalog.flatMap((makeGroup) => {
                const makeOpen = expandedMakes.has(makeGroup.make);
                const rowsOut: React.ReactNode[] = [];
                rowsOut.push(
                  <TableRow
                    key={`make:${makeGroup.make}`}
                    className="border-slate-700 !bg-slate-800 hover:!bg-slate-700/95 [&_td]:!bg-slate-800 hover:[&_td]:!bg-slate-700/95 [&_td]:!text-slate-100"
                  >
                    <TableCell className="!bg-slate-800 font-semibold !text-slate-100">
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-md py-1 pr-2 text-left -ml-1 text-slate-100 hover:bg-slate-700/80"
                        onClick={() =>
                          setExpandedMakes((prev) => {
                            const next = new Set(prev);
                            if (next.has(makeGroup.make)) next.delete(makeGroup.make);
                            else next.add(makeGroup.make);
                            return next;
                          })
                        }
                        aria-expanded={makeOpen}
                      >
                        <ChevronRight
                          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${makeOpen ? "rotate-90" : ""}`}
                          aria-hidden
                        />
                        {makeGroup.make}
                      </button>
                    </TableCell>
                    <TableCell className="!bg-slate-800 !text-slate-400 text-sm font-medium" colSpan={5}>
                      {makeGroup.modelGroups.length} model
                      {makeGroup.modelGroups.length === 1 ? "" : "s"} · {makeGroup.variantCount} variant
                      {makeGroup.variantCount === 1 ? "" : "s"}
                    </TableCell>
                    <TableCell className="!bg-slate-800" />
                  </TableRow>,
                );
                if (!makeOpen) return rowsOut;

                for (const mg of makeGroup.modelGroups) {
                  const mk = modelGroupKey(makeGroup.make, mg.model);
                  const modelOpen = expandedModels.has(mk);
                  rowsOut.push(
                    <TableRow
                      key={`model:${mk}`}
                      className="border-slate-700/80 !bg-slate-900/85 hover:!bg-slate-800/90 [&_td]:!bg-slate-900/85 hover:[&_td]:!bg-slate-800/90 [&_td]:!text-slate-100"
                    >
                      <TableCell className="!bg-slate-900/85 pl-8 font-medium !text-slate-100">
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 rounded-md py-1 pr-2 text-left -ml-1 text-slate-100 hover:bg-slate-800"
                          onClick={() =>
                            setExpandedModels((prev) => {
                              const next = new Set(prev);
                              if (next.has(mk)) next.delete(mk);
                              else next.add(mk);
                              return next;
                            })
                          }
                          aria-expanded={modelOpen}
                        >
                          <ChevronRight
                            className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${modelOpen ? "rotate-90" : ""}`}
                            aria-hidden
                          />
                          {mg.model}
                        </button>
                      </TableCell>
                      <TableCell className="!bg-slate-900/85 !text-slate-400 text-sm font-medium" colSpan={5}>
                        {mg.rows.length} variant{mg.rows.length === 1 ? "" : "s"}
                      </TableCell>
                      <TableCell className="!bg-slate-900/85" />
                    </TableRow>,
                  );
                  if (!modelOpen) continue;
                  for (const row of mg.rows) {
                    rowsOut.push(
                      <TableRow
                        key={row.id}
                        className="border-slate-800 !bg-slate-950/40 hover:!bg-slate-800/35 data-[state=selected]:!bg-slate-800/50 [&_td]:!text-slate-200"
                      >
                        <TableCell
                          className="w-8 min-w-[2rem] border-l-2 border-slate-600 bg-slate-900/50 pl-3"
                          aria-hidden
                        />
                        <TableCell className="!text-slate-100 font-medium">{row.model}</TableCell>
                        <TableCell className="!text-slate-200 tabular-nums">
                          {formatCatalogProductionWindow(row)}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-slate-400">
                          {row.trim_series ?? "—"}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-slate-400">
                          {row.full_model_code ?? row.chassis_code ?? row.generation ?? "—"}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-slate-400">
                          {row.body_type ?? "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex gap-1 justify-end">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-slate-400 hover:text-white hover:bg-slate-800"
                              onClick={() => setViewRecord(row)}
                              title="View details"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-slate-400 hover:text-white hover:bg-slate-800"
                              onClick={() => openEdit(row)}
                              title="Edit"
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-950/50"
                              onClick={() => handleDelete(row)}
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>,
                    );
                  }
                }
                return rowsOut;
              })
            )}
          </TableBody>
        </Table>
        </div>
      )}

      <Dialog open={viewRecord !== null} onOpenChange={(o) => !o && setViewRecord(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto bg-white border-slate-200/80 p-0 gap-0 shadow-xl sm:rounded-2xl">
          {viewRecord && (
            <>
              <div className="px-6 pt-6 pb-2 sm:px-8 sm:pt-8">
                <DialogHeader className="space-y-1 text-left">
                  <DialogTitle className="text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
                    {viewRecord.make} {viewRecord.model}
                  </DialogTitle>
                  <p className="text-sm font-normal text-slate-500">
                    {formatCatalogProductionWindow(viewRecord)} production
                  </p>
                </DialogHeader>
              </div>
              <div className="px-6 pb-6 sm:px-8 sm:pb-8">
                <VehicleViewBody record={viewRecord} />
              </div>
              <DialogFooter className="border-t border-slate-100 bg-slate-50/50 px-6 py-4 sm:px-8 sm:py-4">
                <Button type="button" variant="outline" className="w-full sm:w-auto border-slate-200" onClick={() => setViewRecord(null)}>
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="flex h-[min(92vh,56rem)] w-[calc(100vw-1rem)] max-w-[min(100vw-1rem,56rem)] flex-col gap-0 overflow-hidden rounded-2xl border-slate-200/90 bg-white p-0 shadow-2xl sm:max-w-3xl lg:max-w-5xl">
          <DialogHeader className="shrink-0 space-y-1 border-b border-slate-100 px-5 py-4 sm:px-8 sm:py-5">
            <DialogTitle className="text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
              {editingId ? "Edit vehicle" : "Add vehicle"}
            </DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-8 sm:py-5">
            <Tabs defaultValue="identity" className="w-full">
                <TabsList className="mb-1 flex h-auto w-full flex-wrap justify-start gap-1 rounded-xl border border-slate-200/70 bg-slate-100/70 p-1">
                  <TabsTrigger
                    value="identity"
                    className="h-auto max-w-[11rem] rounded-lg px-2.5 py-2 text-left text-[10px] font-medium leading-snug text-slate-600 shadow-none transition-all data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm sm:max-w-[13rem] sm:px-3 sm:text-xs lg:max-w-none lg:px-4 lg:text-sm"
                  >
                    <span className="lg:hidden">
                      <span className="block">Identification &amp; Core</span>
                      <span className="block">Details</span>
                    </span>
                    <span className="hidden lg:inline">Identification &amp; Core Details</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="production"
                    className="h-auto max-w-[10.5rem] rounded-lg px-2.5 py-2 text-left text-[10px] font-medium leading-snug text-slate-600 shadow-none transition-all data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm sm:max-w-none sm:px-3 sm:text-xs md:text-sm"
                  >
                    <span className="md:hidden">
                      <span className="block">Production</span>
                      <span className="block">Lifecycle</span>
                    </span>
                    <span className="hidden md:inline">Production Lifecycle</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="body"
                    className="h-auto max-w-[10.5rem] rounded-lg px-2.5 py-2 text-left text-[10px] font-medium leading-snug text-slate-600 shadow-none transition-all data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm sm:max-w-none sm:px-3 sm:text-xs md:text-sm"
                  >
                    <span className="md:hidden">
                      <span className="block">Dimensions &amp;</span>
                      <span className="block">Body</span>
                    </span>
                    <span className="hidden md:inline">Dimensions &amp; Body</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="engine"
                    className="h-auto max-w-[11rem] rounded-lg px-2.5 py-2 text-left text-[10px] font-medium leading-snug text-slate-600 shadow-none transition-all data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm sm:max-w-none sm:px-3 sm:text-xs lg:text-sm"
                  >
                    <span className="lg:hidden">
                      <span className="block">Engine &amp;</span>
                      <span className="block">Transmission</span>
                    </span>
                    <span className="hidden lg:inline">Engine &amp; Transmission</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="fueldrive"
                    className="h-auto max-w-[11rem] rounded-lg px-2.5 py-2 text-left text-[10px] font-medium leading-snug text-slate-600 shadow-none transition-all data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm sm:max-w-none sm:px-3 sm:text-xs lg:text-sm"
                  >
                    <span className="lg:hidden">
                      <span className="block">Fuel System &amp;</span>
                      <span className="block">Fluids</span>
                    </span>
                    <span className="hidden lg:inline">Fuel System &amp; Fluids</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="brakes"
                    className="h-auto max-w-[10rem] rounded-lg px-2.5 py-2 text-left text-[10px] font-medium leading-snug text-slate-600 shadow-none transition-all data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm sm:max-w-none sm:px-3 sm:text-xs lg:text-sm"
                  >
                    <span className="lg:hidden">
                      <span className="block">Wheels &amp;</span>
                      <span className="block">Brakes</span>
                    </span>
                    <span className="hidden lg:inline">Wheels &amp; Brakes</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="capacity"
                    className="h-auto max-w-[10.5rem] rounded-lg px-2.5 py-2 text-left text-[10px] font-medium leading-snug text-slate-600 shadow-none transition-all data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm sm:max-w-none sm:px-3 sm:text-xs lg:text-sm"
                  >
                    <span className="lg:hidden">
                      <span className="block">Weights &amp;</span>
                      <span className="block">Payload</span>
                    </span>
                    <span className="hidden lg:inline">Weights &amp; Payload</span>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="identity" className="mt-4 outline-none">
                  <div className="mb-5 rounded-xl border border-slate-200/80 bg-slate-50/90 px-4 py-3.5 sm:px-5">
                    <p className="text-sm leading-relaxed text-slate-600">{IDENTIFICATION_TAB_DESCRIPTION}</p>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-x-5 sm:gap-y-4">
                    <div className="space-y-1.5">
                      <LabelWithHint label="Make" hint={IDENTIFICATION_FIELD_HINTS.make} required />
                      <Select
                        value={form.makeSelection}
                        onValueChange={(v) =>
                          setForm((f) => ({
                            ...f,
                            makeSelection: v as MakeSelection,
                            makeOther: v === "Other" ? f.makeOther : "",
                            model: v === f.makeSelection ? f.model : "",
                          }))
                        }
                      >
                        <SelectTrigger className="h-10 bg-white border-slate-200 shadow-sm focus:ring-slate-200/80">
                          <SelectValue placeholder="Select make" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[min(320px,50vh)]">
                          {CATALOG_REFERENCE_MAKES.map((m) => (
                            <SelectItem key={m} value={m}>
                              {m}
                            </SelectItem>
                          ))}
                          <SelectItem value="Other">Other (custom make)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {form.makeSelection !== "Other" ? (
                      <div className="space-y-1.5">
                        <LabelWithHint
                          label="Model"
                          hint={IDENTIFICATION_FIELD_HINTS.model}
                          required
                          htmlFor="vehicle-catalog-model"
                        />
                        <VehicleModelCombobox
                          id="vehicle-catalog-model"
                          models={MODELS_BY_MAKE[form.makeSelection]}
                          value={form.model}
                          onChange={(v) => setForm((f) => ({ ...f, model: v }))}
                        />
                      </div>
                    ) : null}

                    {form.makeSelection === "Other" && (
                      <>
                        <div className="space-y-1.5 sm:col-span-2">
                          <Label className="text-xs font-medium text-slate-700">Custom make *</Label>
                          <Input
                            value={form.makeOther}
                            onChange={(e) => setForm((f) => ({ ...f, makeOther: e.target.value }))}
                            className="h-10 border-slate-200 bg-white shadow-sm"
                            placeholder="e.g. Lexus, BMW"
                            autoComplete="off"
                          />
                        </div>
                        <div className="space-y-1.5 sm:col-span-2">
                          <LabelWithHint label="Model" hint={IDENTIFICATION_FIELD_HINTS.model} required />
                          <Input
                            value={form.model}
                            onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                            className="h-10 border-slate-200 bg-white shadow-sm"
                            placeholder="Vehicle model"
                            autoComplete="off"
                          />
                        </div>
                      </>
                    )}

                    <FieldWithHint
                      label="Full Model Code"
                      hint={IDENTIFICATION_FIELD_HINTS.fullModelCode}
                      value={form.full_model_code}
                      onChange={update("full_model_code")}
                      placeholder="e.g. DBA-M900A-GBME"
                    />
                    <FieldWithHint
                      label="Chassis Code"
                      hint={IDENTIFICATION_FIELD_HINTS.chassisCode}
                      value={form.chassis_code}
                      onChange={update("chassis_code")}
                      placeholder="e.g. M900A"
                    />
                    <FieldWithHint
                      label="Trim"
                      hint={IDENTIFICATION_FIELD_HINTS.trim}
                      value={form.catalog_trim}
                      onChange={update("catalog_trim")}
                      placeholder="e.g. Custom G"
                    />
                    <FieldWithHint
                      label="Trim Suffix Code"
                      hint={IDENTIFICATION_FIELD_HINTS.trimSuffix}
                      value={form.trim_suffix_code}
                      onChange={update("trim_suffix_code")}
                      placeholder="e.g. GBME"
                    />
                    <FieldWithHint
                      label="Emissions Prefix"
                      hint={IDENTIFICATION_FIELD_HINTS.emissionsPrefix}
                      value={form.emissions_prefix}
                      onChange={update("emissions_prefix")}
                      placeholder="e.g. DBA"
                    />
                    <FieldWithHint
                      label="Generation"
                      hint={IDENTIFICATION_FIELD_HINTS.generation}
                      value={form.generation}
                      onChange={update("generation")}
                      placeholder="e.g. Mk2"
                    />
                    <div className="space-y-1.5 sm:col-span-2">
                      <div className="flex items-center gap-1">
                        <Label className="text-xs font-medium text-slate-700" htmlFor="catalog-trim-series">
                          Series / facelift
                        </Label>
                        <HintIcon label="Series / facelift" hint={IDENTIFICATION_FIELD_HINTS.seriesFacelift} />
                      </div>
                      <Input
                        id="catalog-trim-series"
                        list={TRIM_SERIES_DATALIST_ID}
                        value={form.trim_series}
                        onChange={(e) => setForm((f) => ({ ...f, trim_series: e.target.value }))}
                        className="h-10 border-slate-200 bg-white shadow-sm transition-shadow focus-visible:border-slate-300 focus-visible:shadow-md"
                        placeholder="e.g. Pre-Facelift, Facelift, Base, XLE"
                        autoComplete="off"
                      />
                      <datalist id={TRIM_SERIES_DATALIST_ID}>
                        {TRIM_SERIES_SUGGESTIONS.map((s) => (
                          <option key={s} value={s} />
                        ))}
                      </datalist>
                    </div>
                  </div>
                </TabsContent>

            <TabsContent value="production" className="mt-4 outline-none">
              <div className="mb-5 rounded-xl border border-slate-200/80 bg-slate-50/90 px-4 py-3.5 sm:px-5">
                <p className="text-sm font-medium text-slate-800">Production lifecycle</p>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{PRODUCTION_LIFECYCLE_TAB_DESCRIPTION}</p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-x-5 sm:gap-y-4">
                <div className="space-y-1.5">
                  <LabelWithHint
                    label="Production start year"
                    hint={PRODUCTION_LIFECYCLE_FIELD_HINTS.productionStartYear}
                    required
                  />
                  <Select
                    value={form.production_start_year}
                    onValueChange={(v) => setForm((f) => ({ ...f, production_start_year: v }))}
                  >
                    <SelectTrigger className="h-10 bg-white border-slate-200 shadow-sm focus:ring-slate-200/80">
                      <SelectValue placeholder="Start year" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[min(320px,50vh)]">
                      {startYearDropdownYears.map((y) => (
                        <SelectItem key={y} value={String(y)}>
                          {y}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <LabelWithHint
                    label="Production start month"
                    hint={PRODUCTION_LIFECYCLE_FIELD_HINTS.productionStartMonth}
                  />
                  <Select
                    value={form.production_start_month || "__none__"}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, production_start_month: v === "__none__" ? "" : v }))
                    }
                  >
                    <SelectTrigger className="h-10 bg-white border-slate-200 shadow-sm focus:ring-slate-200/80">
                      <SelectValue placeholder="Optional" />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTH_OPTIONS.map((o) => (
                        <SelectItem key={o.value || "none"} value={o.value || "__none__"}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <LabelWithHint
                    label="Production end year (empty = ongoing)"
                    hint={PRODUCTION_LIFECYCLE_FIELD_HINTS.productionEndYear}
                  />
                  <Select
                    value={form.production_end_year === "" ? "__ongoing__" : form.production_end_year}
                    onValueChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        production_end_year: v === "__ongoing__" ? "" : v,
                        production_end_month: v === "__ongoing__" ? "" : f.production_end_month,
                      }))
                    }
                  >
                    <SelectTrigger className="h-10 bg-white border-slate-200 shadow-sm focus:ring-slate-200/80">
                      <SelectValue placeholder="End year or ongoing" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[min(320px,50vh)]">
                      <SelectItem value="__ongoing__">Ongoing</SelectItem>
                      {endYearDropdownYears.map((y) => (
                        <SelectItem key={y} value={String(y)}>
                          {y}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <LabelWithHint
                    label="Production end month"
                    hint={PRODUCTION_LIFECYCLE_FIELD_HINTS.productionEndMonth}
                  />
                  <Select
                    value={form.production_end_month || "__none__"}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, production_end_month: v === "__none__" ? "" : v }))
                    }
                    disabled={form.production_end_year === ""}
                  >
                    <SelectTrigger className="h-10 bg-white border-slate-200 shadow-sm focus:ring-slate-200/80">
                      <SelectValue placeholder={form.production_end_year === "" ? "Ongoing" : "Optional"} />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTH_OPTIONS.map((o) => (
                        <SelectItem key={o.value || "none-m"} value={o.value || "__none__"}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="body" className="mt-4 outline-none">
              <div className="mb-5 rounded-xl border border-slate-200/80 bg-slate-50/90 px-4 py-3.5 sm:px-5">
                <p className="text-sm font-medium text-slate-800">Dimensions &amp; Body</p>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{DIMENSIONS_BODY_TAB_DESCRIPTION}</p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-x-5 sm:gap-y-4">
                <EngineCatalogSelect
                  label="Body type"
                  hint={DIMENSIONS_BODY_FIELD_HINTS.bodyType}
                  value={form.body_type}
                  onChange={(v) => setForm((f) => ({ ...f, body_type: v }))}
                  options={VEHICLE_BODY_TYPE_OPTIONS}
                  placeholder="Select a Body Type"
                />
                <EngineCatalogSelect
                  label="Doors"
                  hint={DIMENSIONS_BODY_FIELD_HINTS.doors}
                  value={form.doors}
                  onChange={(v) => setForm((f) => ({ ...f, doors: v }))}
                  options={VEHICLE_DOOR_COUNT_OPTIONS}
                  placeholder="Select doors"
                />
                <FieldWithHint
                  label="Length (mm)"
                  hint={DIMENSIONS_BODY_FIELD_HINTS.lengthMm}
                  value={form.length_mm}
                  onChange={update("length_mm")}
                />
                <FieldWithHint
                  label="Width (mm)"
                  hint={DIMENSIONS_BODY_FIELD_HINTS.widthMm}
                  value={form.width_mm}
                  onChange={update("width_mm")}
                />
                <FieldWithHint
                  label="Height (mm)"
                  hint={DIMENSIONS_BODY_FIELD_HINTS.heightMm}
                  value={form.height_mm}
                  onChange={update("height_mm")}
                />
                <FieldWithHint
                  label="Wheelbase (mm)"
                  hint={DIMENSIONS_BODY_FIELD_HINTS.wheelbaseMm}
                  value={form.wheelbase_mm}
                  onChange={update("wheelbase_mm")}
                />
                <FieldWithHint
                  label="Ground clearance (mm)"
                  hint={DIMENSIONS_BODY_FIELD_HINTS.groundClearanceMm}
                  value={form.ground_clearance_mm}
                  onChange={update("ground_clearance_mm")}
                />
              </div>
            </TabsContent>

            <TabsContent value="engine" className="mt-4 outline-none">
              <div className="mb-5 rounded-xl border border-slate-200/80 bg-slate-50/90 px-4 py-3.5 sm:px-5">
                <p className="text-sm font-medium text-slate-800">Engine &amp; Transmission</p>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{ENGINE_TRANSMISSION_TAB_DESCRIPTION}</p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-x-5 sm:gap-y-4">
                <FieldWithHint
                  label="Engine code"
                  hint={ENGINE_TRANSMISSION_FIELD_HINTS.engineCode}
                  value={form.engine_code}
                  onChange={update("engine_code")}
                  placeholder="e.g. 1KR-FE"
                />
                <FieldWithHint
                  label="Engine type"
                  hint={ENGINE_TRANSMISSION_FIELD_HINTS.engineType}
                  value={form.engine_type}
                  onChange={update("engine_type")}
                  placeholder="e.g. N/A, Turbo, Hybrid, Hybrid (2.0L)"
                />
                <FieldWithHint
                  label="Engine displacement L"
                  hint={ENGINE_TRANSMISSION_FIELD_HINTS.engineDisplacementL}
                  value={form.engine_displacement_l}
                  onChange={update("engine_displacement_l")}
                  placeholder="e.g. 1.5"
                />
                <FieldWithHint
                  label="Engine displacement cc"
                  hint={ENGINE_TRANSMISSION_FIELD_HINTS.engineDisplacementCc}
                  value={form.engine_displacement_cc}
                  onChange={update("engine_displacement_cc")}
                  placeholder="e.g. 1496"
                />
                <FieldWithHint
                  label="Engine configuration"
                  hint={ENGINE_TRANSMISSION_FIELD_HINTS.engineConfiguration}
                  value={form.engine_configuration}
                  onChange={update("engine_configuration")}
                  placeholder="e.g. Inline-4, V6"
                />
                <FieldWithHint
                  label="Horsepower"
                  hint={ENGINE_TRANSMISSION_FIELD_HINTS.horsepower}
                  value={form.horsepower}
                  onChange={update("horsepower")}
                />
                <FieldWithHint
                  label="Torque"
                  hint={ENGINE_TRANSMISSION_FIELD_HINTS.torque}
                  value={form.torque}
                  onChange={update("torque")}
                />
                <FieldWithHint
                  label="Torque unit"
                  hint={ENGINE_TRANSMISSION_FIELD_HINTS.torqueUnit}
                  value={form.torque_unit}
                  onChange={update("torque_unit")}
                  placeholder="Nm"
                />
                <EngineCatalogSelect
                  label="Transmission"
                  hint={ENGINE_TRANSMISSION_FIELD_HINTS.transmission}
                  value={form.transmission}
                  onChange={(v) => setForm((f) => ({ ...f, transmission: v }))}
                  options={VEHICLE_TRANSMISSION_OPTIONS}
                  placeholder="Select a Transmission"
                />
                <EngineCatalogSelect
                  label="Drivetrain"
                  hint={ENGINE_TRANSMISSION_FIELD_HINTS.drivetrain}
                  value={form.drivetrain}
                  onChange={(v) => setForm((f) => ({ ...f, drivetrain: v }))}
                  options={VEHICLE_DRIVETRAIN_OPTIONS}
                  placeholder="Select a Drivetrain"
                />
              </div>
            </TabsContent>

            <TabsContent value="fueldrive" className="mt-4 outline-none">
              <div className="mb-5 rounded-xl border border-slate-200/80 bg-slate-50/90 px-4 py-3.5 sm:px-5">
                <p className="text-sm font-medium text-slate-800">Fuel System &amp; Fluids</p>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{FUEL_SYSTEM_FLUIDS_TAB_DESCRIPTION}</p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-x-5 sm:gap-y-4">
                <FieldWithHint
                  label="Fuel category"
                  hint={FUEL_SYSTEM_FLUIDS_FIELD_HINTS.fuelCategory}
                  value={form.fuel_category}
                  onChange={update("fuel_category")}
                  placeholder="e.g. Gas, Hybrid"
                />
                <EngineCatalogSelect
                  label="Fuel type"
                  hint={FUEL_SYSTEM_FLUIDS_FIELD_HINTS.fuelType}
                  value={form.fuel_type}
                  onChange={(v) => setForm((f) => ({ ...f, fuel_type: v }))}
                  options={VEHICLE_FUEL_TYPE_OPTIONS}
                  placeholder="Select a Fuel"
                />
                <FieldWithHint
                  label="Fuel grade"
                  hint={FUEL_SYSTEM_FLUIDS_FIELD_HINTS.fuelGrade}
                  value={form.fuel_grade}
                  onChange={update("fuel_grade")}
                  placeholder="e.g. 87, 90, ULSD"
                />
                <FieldWithHint
                  label="Fuel tank capacity"
                  hint={FUEL_SYSTEM_FLUIDS_FIELD_HINTS.fuelTankCapacity}
                  value={form.fuel_tank_capacity}
                  onChange={update("fuel_tank_capacity")}
                />
                <FieldWithHint
                  label="Fuel tank unit"
                  hint={FUEL_SYSTEM_FLUIDS_FIELD_HINTS.fuelTankUnit}
                  value={form.fuel_tank_unit}
                  onChange={update("fuel_tank_unit")}
                  placeholder="L"
                />
                <FieldWithHint
                  label="Fuel economy (km/L)"
                  hint={FUEL_SYSTEM_FLUIDS_FIELD_HINTS.fuelEconomyKmPerL}
                  value={form.fuel_economy_km_per_l}
                  onChange={update("fuel_economy_km_per_l")}
                  type="number"
                />
                <FieldWithHint
                  label="Estimated (Km) per re-fuel"
                  hint={FUEL_SYSTEM_FLUIDS_FIELD_HINTS.estimatedKmPerRefuel}
                  value={form.estimated_km_per_refuel}
                  onChange={update("estimated_km_per_refuel")}
                  type="number"
                />
                <FieldWithHint
                  label="Engine oil capacity L"
                  hint={FUEL_SYSTEM_FLUIDS_FIELD_HINTS.engineOilCapacityL}
                  value={form.engine_oil_capacity_l}
                  onChange={update("engine_oil_capacity_l")}
                />
                <div className="sm:col-span-2">
                  <FieldWithHint
                    label="Coolant capacity L"
                    hint={FUEL_SYSTEM_FLUIDS_FIELD_HINTS.coolantCapacityL}
                    value={form.coolant_capacity_l}
                    onChange={update("coolant_capacity_l")}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="brakes" className="mt-4 outline-none">
              <div className="mb-5 rounded-xl border border-slate-200/80 bg-slate-50/90 px-4 py-3.5 sm:px-5">
                <p className="text-sm font-medium text-slate-800">Wheels &amp; Brakes</p>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{WHEELS_BRAKES_TAB_DESCRIPTION}</p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-x-5 sm:gap-y-4">
                <FieldWithHint
                  label="Front brake type"
                  hint={WHEELS_BRAKES_FIELD_HINTS.frontBrakeType}
                  value={form.front_brake_type}
                  onChange={update("front_brake_type")}
                  placeholder="e.g. ventilated disc, drum"
                />
                <FieldWithHint
                  label="Rear brake type"
                  hint={WHEELS_BRAKES_FIELD_HINTS.rearBrakeType}
                  value={form.rear_brake_type}
                  onChange={update("rear_brake_type")}
                  placeholder="e.g. drum, solid disc"
                />
                <FieldWithHint
                  label="Brake size mm"
                  hint={WHEELS_BRAKES_FIELD_HINTS.brakeSizeMm}
                  value={form.brake_size_mm}
                  onChange={update("brake_size_mm")}
                />
                <FieldWithHint
                  label="Tire size"
                  hint={WHEELS_BRAKES_FIELD_HINTS.tireSize}
                  value={form.tire_size}
                  onChange={update("tire_size")}
                  placeholder="195/65R15"
                />
                <FieldWithHint
                  label="Bolt pattern"
                  hint={WHEELS_BRAKES_FIELD_HINTS.boltPattern}
                  value={form.bolt_pattern}
                  onChange={update("bolt_pattern")}
                  placeholder="5x114.3"
                />
                <FieldWithHint
                  label="Wheel offset mm"
                  hint={WHEELS_BRAKES_FIELD_HINTS.wheelOffsetMm}
                  value={form.wheel_offset_mm}
                  onChange={update("wheel_offset_mm")}
                  placeholder="e.g. 45"
                />
              </div>
            </TabsContent>

            <TabsContent value="capacity" className="mt-4 outline-none">
              <div className="mb-5 rounded-xl border border-slate-200/80 bg-slate-50/90 px-4 py-3.5 sm:px-5">
                <p className="text-sm font-medium text-slate-800">Weights &amp; Payload</p>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{WEIGHTS_PAYLOAD_TAB_DESCRIPTION}</p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-x-5 sm:gap-y-4">
                <FieldWithHint
                  label="Seating capacity"
                  hint={WEIGHTS_PAYLOAD_FIELD_HINTS.seatingCapacity}
                  value={form.seating_capacity}
                  onChange={update("seating_capacity")}
                  type="number"
                />
                <FieldWithHint
                  label="Curb weight kg"
                  hint={WEIGHTS_PAYLOAD_FIELD_HINTS.curbWeightKg}
                  value={form.curb_weight_kg}
                  onChange={update("curb_weight_kg")}
                />
                <FieldWithHint
                  label="Gross vehicle weight kg"
                  hint={WEIGHTS_PAYLOAD_FIELD_HINTS.grossVehicleWeightKg}
                  value={form.gross_vehicle_weight_kg}
                  onChange={update("gross_vehicle_weight_kg")}
                />
                <FieldWithHint
                  label="Max payload kg"
                  hint={WEIGHTS_PAYLOAD_FIELD_HINTS.maxPayloadKg}
                  value={form.max_payload_kg}
                  onChange={update("max_payload_kg")}
                />
                <div className="sm:col-span-2">
                  <FieldWithHint
                    label="Max towing kg"
                    hint={WEIGHTS_PAYLOAD_FIELD_HINTS.maxTowingKg}
                    value={form.max_towing_kg}
                    onChange={update("max_towing_kg")}
                  />
                </div>
              </div>
            </TabsContent>
            </Tabs>
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-4 sm:gap-0 sm:px-8">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving} className="gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {editingId ? "Save changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={importDialogOpen}
        onOpenChange={(open) => {
          if (!open) handleCloseImportDialog();
        }}
      >
        <DialogContent
          className="sm:max-w-lg bg-white border-slate-200"
          hideCloseButton={importStep === "importing"}
          aria-busy={importStep === "importing"}
          onPointerDownOutside={(e) => {
            if (importStep === "importing") e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (importStep === "importing") e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {importStep === "importing"
                ? "Importing…"
                : importStep === "result"
                  ? "Import finished"
                  : "Import motor catalog"}
            </DialogTitle>
            {importStep === "preview" && (
              <DialogDescription className="text-slate-600 text-sm leading-relaxed">
                Required columns: <span className="font-medium text-slate-800">Make</span>,{" "}
                <span className="font-medium text-slate-800">Model</span>,{" "}
                <span className="font-medium text-slate-800">Production start year</span>. Use{" "}
                <span className="font-medium text-slate-800">Export CSV</span> for a compatible template. End year{" "}
                <span className="font-medium text-slate-800">9999</span> or empty means ongoing.{" "}
                <span className="font-medium text-slate-800">Engine type</span> is free text (e.g. N/A, Turbo, Hybrid).
              </DialogDescription>
            )}
            {importStep === "importing" && (
              <DialogDescription className="text-slate-600 text-sm">
                Uploading rows to the catalog. Please keep this window open.
              </DialogDescription>
            )}
            {importStep === "result" && importOutcome && (
              <DialogDescription className="sr-only">
                Import completed with {importOutcome.imported} imported and {importOutcome.failed} failed.
              </DialogDescription>
            )}
          </DialogHeader>

          {importStep === "preview" && importPreview && (
            <div className="space-y-3 py-1">
              <p className="text-sm text-slate-700">
                <span className="font-semibold text-slate-900">{importPreview.filter((r) => r.payload).length}</span>{" "}
                row(s) ready to import
                {importPreview.some((r) => r.parseError) && (
                  <>
                    {" "}
                    ·{" "}
                    <span className="text-amber-800">
                      {importPreview.filter((r) => r.parseError).length} row(s) skipped (see below)
                    </span>
                  </>
                )}
                .
              </p>
              {importPreview.some((r) => r.parseError) && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-slate-600">Parse issues</p>
                  <ScrollArea className="h-[min(200px,40vh)] rounded-md border border-slate-200 bg-slate-50/80 p-2">
                    <ul className="space-y-1 text-xs text-slate-700 font-mono">
                      {importPreview
                        .filter((r) => r.parseError)
                        .map((r) => (
                          <li key={r.rowIndex}>
                            Line {r.rowIndex}: {r.parseError}
                          </li>
                        ))}
                    </ul>
                  </ScrollArea>
                </div>
              )}
            </div>
          )}

          {importStep === "importing" && importProgress && importProgress.total > 0 && (
            <div className="space-y-3 py-2">
              <div className="flex items-center justify-between gap-3 text-sm text-slate-700">
                <span className="tabular-nums">
                  Row {importProgress.current} of {importProgress.total}
                </span>
                <span className="text-slate-500 tabular-nums">
                  {Math.min(
                    100,
                    Math.round((importProgress.current / importProgress.total) * 100),
                  )}
                  %
                </span>
              </div>
              <Progress
                value={Math.min(
                  100,
                  Math.round((importProgress.current / importProgress.total) * 100),
                )}
                className="h-2.5 bg-slate-200"
                indicatorClassName="bg-slate-900"
              />
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" aria-hidden />
                Saving to server…
              </div>
            </div>
          )}

          {importStep === "result" && importOutcome && (
            <div className="space-y-4 py-1">
              {importOutcome.failed === 0 && importOutcome.imported > 0 && (
                <div className="flex gap-3 rounded-xl border border-emerald-200/80 bg-emerald-50/90 p-4">
                  <CheckCircle2 className="h-10 w-10 shrink-0 text-emerald-600" strokeWidth={1.75} aria-hidden />
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-semibold text-emerald-950">Import successful</p>
                    <p className="text-sm text-emerald-900/90">
                      {importOutcome.imported} vehicle{importOutcome.imported === 1 ? "" : "s"} added to the catalog.
                    </p>
                  </div>
                </div>
              )}

              {importOutcome.schemaWarnings.length > 0 && (
                <div className="rounded-xl border border-amber-300/90 bg-amber-50 p-4 text-sm text-amber-950">
                  <p className="font-semibold text-amber-950">Some CSV columns were not stored</p>
                  {importOutcome.schemaWarnings.map((w, idx) => (
                    <p key={idx} className="mt-2 leading-relaxed text-amber-900/95">
                      {w}
                    </p>
                  ))}
                </div>
              )}

              {importOutcome.imported === 0 && importOutcome.failed > 0 && (
                <div className="flex gap-3 rounded-xl border border-red-200/80 bg-red-50/90 p-4">
                  <XCircle className="h-10 w-10 shrink-0 text-red-600" strokeWidth={1.75} aria-hidden />
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-semibold text-red-950">Import failed</p>
                    <p className="text-sm text-red-900/90">
                      None of the {importOutcome.failed} row{importOutcome.failed === 1 ? "" : "s"} could be saved. See
                      details below.
                    </p>
                  </div>
                </div>
              )}

              {importOutcome.imported > 0 && importOutcome.failed > 0 && (
                <div className="flex gap-3 rounded-xl border border-amber-200/80 bg-amber-50/90 p-4">
                  <CheckCircle2 className="h-10 w-10 shrink-0 text-amber-600" strokeWidth={1.75} aria-hidden />
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-semibold text-amber-950">Partially imported</p>
                    <p className="text-sm text-amber-950/90">
                      <span className="font-medium tabular-nums">{importOutcome.imported}</span> saved,{" "}
                      <span className="font-medium tabular-nums">{importOutcome.failed}</span> failed.
                    </p>
                  </div>
                </div>
              )}

              {importOutcome.errors.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-slate-600">Error details</p>
                  <ScrollArea className="h-[min(220px,45vh)] rounded-md border border-slate-200 bg-slate-50/80 p-2">
                    <ul className="space-y-1.5 text-xs text-slate-800 font-mono leading-relaxed">
                      {importOutcome.errors.map((line, idx) => (
                        <li key={`${idx}-${line.slice(0, 24)}`}>{line}</li>
                      ))}
                    </ul>
                  </ScrollArea>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            {importStep === "preview" && (
              <>
                <Button type="button" variant="outline" onClick={handleCloseImportDialog}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleRunCatalogImport()}
                  disabled={!importPreview?.some((r) => r.payload)}
                  className="gap-2"
                >
                  Import
                </Button>
              </>
            )}
            {importStep === "result" && (
              <Button type="button" onClick={handleCloseImportDialog} className="w-full sm:w-auto">
                Done
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={purgeDialogOpen}
        onOpenChange={(open) => {
          if (purging) return;
          setPurgeDialogOpen(open);
          if (!open) setPurgeConfirmInput("");
        }}
      >
        <DialogContent
          className="sm:max-w-md bg-white border-slate-200"
          hideCloseButton={purging}
          onPointerDownOutside={(e) => {
            if (purging) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (purging) e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>Delete all motor vehicles?</DialogTitle>
            <DialogDescription className="text-slate-600 text-sm leading-relaxed">
              This permanently removes every row in the platform catalog. Maintenance templates tied to those
              rows are removed automatically. Fleet vehicles that referenced a catalog entry may need to be
              re-linked later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-1">
            <Label className="text-xs text-slate-600">Confirmation</Label>
            <p className="text-xs text-slate-500">
              Type{" "}
              <code className="rounded bg-slate-100 px-1 font-mono text-slate-800">{VEHICLE_CATALOG_PURGE_CONFIRM_PHRASE}</code>{" "}
              exactly (case-sensitive).
            </p>
            <Input
              value={purgeConfirmInput}
              onChange={(e) => setPurgeConfirmInput(e.target.value)}
              placeholder={VEHICLE_CATALOG_PURGE_CONFIRM_PHRASE}
              className="bg-white font-mono text-sm"
              autoComplete="off"
              disabled={purging}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setPurgeDialogOpen(false)} disabled={purging}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={purging || purgeConfirmInput.trim() !== VEHICLE_CATALOG_PURGE_CONFIRM_PHRASE}
              className="gap-2"
              onClick={() => void handlePurgeCatalog()}
            >
              {purging && <Loader2 className="w-4 h-4 animate-spin" />}
              Delete everything
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function viewText(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string" && v.trim() === "") return "—";
  return String(v);
}

function formatCatalogMonthField(m: string | number | null | undefined): string {
  if (m === null || m === undefined || m === "") return "—";
  const s = String(m).trim();
  if (!s) return "—";
  const opt = MONTH_OPTIONS.find((o) => o.value === s);
  if (opt && opt.value !== "") return opt.label === "—" ? s : opt.label;
  return s;
}

function viewProductionEndYear(y: number | null | undefined): string {
  if (y === null || y === undefined) return "Ongoing";
  return viewText(y);
}

function fuelSummaryLine(r: VehicleCatalogRecord): string {
  const parts = [r.fuel_category, r.fuel_type, r.fuel_grade].filter(
    (x) => x != null && String(x).trim() !== "",
  );
  return parts.length ? parts.map((x) => String(x).trim()).join(" · ") : "—";
}

function formatEngineDisplacement(r: VehicleCatalogRecord): string {
  if (r.engine_displacement_cc != null && Number.isFinite(Number(r.engine_displacement_cc))) {
    return `${Math.round(Number(r.engine_displacement_cc)).toLocaleString()}cc`;
  }
  if (r.engine_displacement_l != null && Number.isFinite(Number(r.engine_displacement_l))) {
    return `${r.engine_displacement_l}L`;
  }
  return "—";
}

function VehicleSpecItem({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <Icon className="h-[18px] w-[18px] shrink-0 text-slate-400" strokeWidth={1.5} aria-hidden />
        <span className="text-[13px] text-slate-500">{label}</span>
      </div>
      <span className="shrink-0 text-right text-[13px] font-semibold tabular-nums text-slate-950">{value}</span>
    </div>
  );
}

function VehicleViewBody({ record: r }: { record: VehicleCatalogRecord }) {
  const colA = (
    <>
      <VehicleSpecItem icon={Calendar} label="Production" value={formatCatalogProductionWindow(r)} />
      <VehicleSpecItem icon={Settings2} label="Transmission" value={viewText(r.transmission)} />
      <VehicleSpecItem icon={CarFront} label="Body type" value={viewText(r.body_type)} />
      <VehicleSpecItem icon={DoorOpen} label="Doors" value={viewText(r.doors)} />
    </>
  );
  const colB = (
    <>
      <VehicleSpecItem icon={Gauge} label="Engine" value={formatEngineDisplacement(r)} />
      <VehicleSpecItem icon={CircleDot} label="Drive" value={viewText(r.drivetrain)} />
      <VehicleSpecItem icon={Fuel} label="Fuel" value={fuelSummaryLine(r)} />
      <VehicleSpecItem icon={Armchair} label="Seating capacity" value={viewText(r.seating_capacity)} />
    </>
  );

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200/70 bg-gradient-to-b from-slate-50/90 to-white p-5 shadow-sm sm:p-6">
        <div className="grid grid-cols-1 gap-0 md:grid-cols-2 md:gap-x-10">
          <div className="flex flex-col divide-y divide-slate-100">{colA}</div>
          <div className="flex flex-col divide-y divide-slate-100 border-t border-slate-100 md:border-t-0 md:pt-0">
            {colB}
          </div>
        </div>
      </div>

      <Collapsible className="group">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-xl border border-slate-200/80 bg-white px-4 py-3 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50/90"
          >
            <span>Full specifications</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 group-data-[state=open]:rotate-180" />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-3 space-y-6 rounded-2xl border border-slate-200/60 bg-white p-5 sm:p-6">
            <ViewSpecSection title="Identification & Core Details">
              <div className="grid grid-cols-1 gap-0 sm:grid-cols-2 sm:gap-x-8">
                <div className="flex flex-col divide-y divide-slate-100">
                  <VehicleSpecItem icon={Tag} label="Full model code" value={viewText(r.full_model_code)} />
                  <VehicleSpecItem icon={Tag} label="Chassis code" value={viewText(r.chassis_code)} />
                  <VehicleSpecItem icon={Tag} label="Trim" value={viewText(r.catalog_trim)} />
                  <VehicleSpecItem icon={Tag} label="Trim suffix code" value={viewText(r.trim_suffix_code)} />
                  <VehicleSpecItem icon={Tag} label="Emissions prefix" value={viewText(r.emissions_prefix)} />
                </div>
                <div className="flex flex-col divide-y divide-slate-100 border-t border-slate-100 sm:border-t-0">
                  <VehicleSpecItem icon={Tag} label="Generation" value={viewText(r.generation)} />
                  <VehicleSpecItem icon={Tag} label="Series / facelift" value={viewText(r.trim_series)} />
                </div>
              </div>
            </ViewSpecSection>

            <ViewSpecSection title="Production Lifecycle">
              <div className="grid grid-cols-1 gap-0 sm:grid-cols-2 sm:gap-x-8">
                <div className="flex flex-col divide-y divide-slate-100">
                  <VehicleSpecItem icon={Calendar} label="Production start year" value={viewText(r.production_start_year)} />
                  <VehicleSpecItem icon={Calendar} label="Production start month" value={formatCatalogMonthField(r.production_start_month)} />
                </div>
                <div className="flex flex-col divide-y divide-slate-100 border-t border-slate-100 sm:border-t-0">
                  <VehicleSpecItem
                    icon={Calendar}
                    label="Production end year (empty = ongoing)"
                    value={viewProductionEndYear(r.production_end_year)}
                  />
                  <VehicleSpecItem
                    icon={Calendar}
                    label="Production end month"
                    value={
                      r.production_end_year === null || r.production_end_year === undefined
                        ? "—"
                        : formatCatalogMonthField(r.production_end_month)
                    }
                  />
                </div>
              </div>
            </ViewSpecSection>

            <ViewSpecSection title="Dimensions & Body">
              <div className="grid grid-cols-1 gap-0 sm:grid-cols-2 sm:gap-x-8">
                <div className="flex flex-col divide-y divide-slate-100">
                  <VehicleSpecItem icon={CarFront} label="Body type" value={viewText(r.body_type)} />
                  <VehicleSpecItem icon={DoorOpen} label="Doors" value={viewText(r.doors)} />
                  <VehicleSpecItem icon={Ruler} label="Length (mm)" value={viewText(r.length_mm)} />
                  <VehicleSpecItem icon={Ruler} label="Width (mm)" value={viewText(r.width_mm)} />
                  <VehicleSpecItem icon={Ruler} label="Height (mm)" value={viewText(r.height_mm)} />
                </div>
                <div className="flex flex-col divide-y divide-slate-100 border-t border-slate-100 sm:border-t-0">
                  <VehicleSpecItem icon={Ruler} label="Wheelbase (mm)" value={viewText(r.wheelbase_mm)} />
                  <VehicleSpecItem icon={Ruler} label="Ground clearance (mm)" value={viewText(r.ground_clearance_mm)} />
                </div>
              </div>
            </ViewSpecSection>

            <ViewSpecSection title="Engine & Transmission">
              <div className="grid grid-cols-1 gap-0 sm:grid-cols-2 sm:gap-x-8">
                <div className="flex flex-col divide-y divide-slate-100">
                  <VehicleSpecItem icon={Gauge} label="Engine code" value={viewText(r.engine_code)} />
                  <VehicleSpecItem icon={Gauge} label="Engine type" value={viewText(r.engine_type)} />
                  <VehicleSpecItem icon={Gauge} label="Engine displacement L" value={viewText(r.engine_displacement_l)} />
                  <VehicleSpecItem icon={Gauge} label="Engine displacement cc" value={viewText(r.engine_displacement_cc)} />
                  <VehicleSpecItem icon={Settings2} label="Engine configuration" value={viewText(r.engine_configuration)} />
                </div>
                <div className="flex flex-col divide-y divide-slate-100 border-t border-slate-100 sm:border-t-0">
                  <VehicleSpecItem icon={Gauge} label="Horsepower" value={viewText(r.horsepower)} />
                  <VehicleSpecItem icon={Gauge} label="Torque" value={viewText(r.torque)} />
                  <VehicleSpecItem icon={Gauge} label="Torque unit" value={viewText(r.torque_unit)} />
                  <VehicleSpecItem icon={Settings2} label="Transmission" value={viewText(r.transmission)} />
                  <VehicleSpecItem icon={CircleDot} label="Drivetrain" value={viewText(r.drivetrain)} />
                </div>
              </div>
            </ViewSpecSection>

            <ViewSpecSection title="Fuel System & Fluids">
              <div className="grid grid-cols-1 gap-0 sm:grid-cols-2 sm:gap-x-8">
                <div className="flex flex-col divide-y divide-slate-100">
                  <VehicleSpecItem icon={Fuel} label="Fuel category" value={viewText(r.fuel_category)} />
                  <VehicleSpecItem icon={Fuel} label="Fuel type" value={viewText(r.fuel_type)} />
                  <VehicleSpecItem icon={Fuel} label="Fuel grade" value={viewText(r.fuel_grade)} />
                  <VehicleSpecItem icon={Fuel} label="Fuel tank capacity" value={viewText(r.fuel_tank_capacity)} />
                  <VehicleSpecItem icon={Fuel} label="Fuel economy (km/L)" value={viewText(r.fuel_economy_km_per_l)} />
                </div>
                <div className="flex flex-col divide-y divide-slate-100 border-t border-slate-100 sm:border-t-0">
                  <VehicleSpecItem icon={Fuel} label="Fuel tank unit" value={viewText(r.fuel_tank_unit)} />
                  <VehicleSpecItem
                    icon={Fuel}
                    label="Estimated (Km) per re-fuel"
                    value={viewText(r.estimated_km_per_refuel)}
                  />
                  <VehicleSpecItem icon={Gauge} label="Engine oil capacity L" value={viewText(r.engine_oil_capacity_l)} />
                  <VehicleSpecItem icon={Gauge} label="Coolant capacity L" value={viewText(r.coolant_capacity_l)} />
                </div>
              </div>
            </ViewSpecSection>

            <ViewSpecSection title="Wheels & Brakes">
              <div className="grid grid-cols-1 gap-0 sm:grid-cols-2 sm:gap-x-8">
                <div className="flex flex-col divide-y divide-slate-100">
                  <VehicleSpecItem icon={CircleDot} label="Front brake type" value={viewText(r.front_brake_type)} />
                  <VehicleSpecItem icon={CircleDot} label="Rear brake type" value={viewText(r.rear_brake_type)} />
                  <VehicleSpecItem icon={Ruler} label="Brake size mm" value={viewText(r.brake_size_mm)} />
                </div>
                <div className="flex flex-col divide-y divide-slate-100 border-t border-slate-100 sm:border-t-0">
                  <VehicleSpecItem icon={CarFront} label="Tire size" value={viewText(r.tire_size)} />
                  <VehicleSpecItem icon={Settings2} label="Bolt pattern" value={viewText(r.bolt_pattern)} />
                  <VehicleSpecItem icon={Ruler} label="Wheel offset mm" value={viewText(r.wheel_offset_mm)} />
                </div>
              </div>
            </ViewSpecSection>

            <ViewSpecSection title="Weights & Payload">
              <div className="grid grid-cols-1 gap-0 sm:grid-cols-2 sm:gap-x-8">
                <div className="flex flex-col divide-y divide-slate-100">
                  <VehicleSpecItem icon={Armchair} label="Seating capacity" value={viewText(r.seating_capacity)} />
                  <VehicleSpecItem icon={Weight} label="Curb weight kg" value={viewText(r.curb_weight_kg)} />
                  <VehicleSpecItem icon={Weight} label="Gross vehicle weight kg" value={viewText(r.gross_vehicle_weight_kg)} />
                </div>
                <div className="flex flex-col divide-y divide-slate-100 border-t border-slate-100 sm:border-t-0">
                  <VehicleSpecItem icon={Weight} label="Max payload kg" value={viewText(r.max_payload_kg)} />
                  <VehicleSpecItem icon={Weight} label="Max towing kg" value={viewText(r.max_towing_kg)} />
                </div>
              </div>
            </ViewSpecSection>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <p className="text-center text-[11px] text-slate-400">
        Updated {new Date(r.updated_at).toLocaleString()}
        {r.created_at !== r.updated_at && <> · Created {new Date(r.created_at).toLocaleString()}</>}
      </p>
    </div>
  );
}

function ViewSpecSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">{title}</h4>
      {children}
    </div>
  );
}

function HintIcon({ label, hint }: { label: string; hint: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex shrink-0 rounded-full p-0.5 text-slate-400 transition-colors hover:bg-slate-200/90 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40"
          aria-label={`Help: ${label}`}
        >
          <Info className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6} className={CATALOG_FORM_TOOLTIP_CLASS}>
        {hint}
      </TooltipContent>
    </Tooltip>
  );
}

function LabelWithHint({
  label,
  hint,
  required,
  htmlFor,
}: {
  label: string;
  hint: string;
  required?: boolean;
  htmlFor?: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <Label htmlFor={htmlFor} className="text-xs font-medium text-slate-700">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </Label>
      <HintIcon label={label} hint={hint} />
    </div>
  );
}

function FieldWithHint({
  label,
  hint,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1">
        <Label className="text-xs font-medium text-slate-700">{label}</Label>
        <HintIcon label={label} hint={hint} />
      </div>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={type}
        placeholder={placeholder}
        className="h-10 bg-white border-slate-200 shadow-sm transition-shadow focus-visible:border-slate-300 focus-visible:shadow-md"
      />
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-slate-600">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={type}
        placeholder={placeholder}
        className="bg-white"
      />
    </div>
  );
}
