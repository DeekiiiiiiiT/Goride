import React, { useMemo } from "react";
import { Info, Loader2 } from "lucide-react";
import type { VehicleCatalogCreatePayload, VehicleCatalogRecord } from "../../../types/vehicleCatalog";
import { Button } from "../../ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
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
  "z-[300] max-w-[min(22rem,calc(100vw-2rem))] border border-slate-300 bg-white px-3 py-2.5 text-left text-xs font-normal leading-relaxed text-slate-900 dark:border-slate-600/90 dark:bg-slate-900 dark:text-slate-50 shadow-xl";

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

export type { FormState };
export { emptyForm, recordToForm, toCreatePayload, toPatchPayload, resolveMake, MONTH_OPTIONS };

export type VehicleCatalogEditDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingId: string | null;
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  update: (key: keyof FormState) => (value: string) => void;
  saving: boolean;
  onSave: () => void;
};

export function VehicleCatalogEditDialog({
  open,
  onOpenChange,
  editingId,
  form,
  setForm,
  update,
  saving,
  onSave,
}: VehicleCatalogEditDialogProps) {
  const standardModelYears = useMemo(() => standardModelYearRange(), []);
  const startYearDropdownYears = useMemo(
    () => modelYearsForForm(form.production_start_year, standardModelYears),
    [form.production_start_year, standardModelYears],
  );
  const endYearDropdownYears = useMemo(
    () => modelYearsForForm(form.production_end_year, standardModelYears),
    [form.production_end_year, standardModelYears],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={onSave} disabled={saving} className="gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {editingId ? "Save changes" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
