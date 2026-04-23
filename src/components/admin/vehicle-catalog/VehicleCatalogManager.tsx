import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type LucideIcon,
  Armchair,
  Calendar,
  CarFront,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  DoorOpen,
  Download,
  Upload,
  Eye,
  Fuel,
  Gauge,
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
  model_code: string;
  chassis_code: string;
  generation_code: string;
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
    model_code: "",
    chassis_code: "",
    generation_code: "",
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
  const chassis = t(r.chassis_code ?? r.generation_code);
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
    model_code: t(r.model_code),
    chassis_code: chassis,
    generation_code: t(r.generation_code),
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
    fuel_type: t(r.fuel_type),
    transmission: t(r.transmission),
    drivetrain: t(r.drivetrain),
    horsepower: s(r.horsepower),
    torque: s(r.torque),
    torque_unit: t(r.torque_unit) || "Nm",
    fuel_tank_capacity: s(r.fuel_tank_capacity),
    fuel_tank_unit: t(r.fuel_tank_unit) || "L",
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
  assign("model_code", form.model_code.trim() || null);
  assign("generation_code", form.generation_code.trim() || null);
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
    model_code: form.model_code.trim() || null,
    generation_code: form.generation_code.trim() || null,
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
    for (let i = 0; i < ready.length; i++) {
      const r = ready[i];
      try {
        await createVehicleCatalog(token, r.payload);
        imported++;
      } catch (err) {
        apiErrors.push(`Row ${r.rowIndex}: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setImportProgress({ current: i + 1, total: ready.length });
      }
    }
    setImportOutcome({ imported, failed: apiErrors.length, errors: apiErrors });
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
    <div className="flex flex-col gap-4 p-4 sm:p-6 text-slate-900 [color-scheme:light]">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Motor vehicles</h2>
          <p className="text-sm text-slate-500">
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
            className="gap-2 border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
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
            className="gap-2 border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
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
          <Button onClick={openCreate} className="gap-2">
            <Plus className="w-4 h-4" />
            Add vehicle
          </Button>
          <Button
            type="button"
            variant="outline"
            className="gap-2 border-red-200 bg-white text-red-700 hover:bg-red-50 hover:text-red-800"
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
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
          <Table className="[&_th]:text-slate-800 [&_td]:text-slate-900 [&_tbody_tr]:border-slate-200 [&_tbody_tr:hover]:bg-slate-50">
          <TableHeader>
            <TableRow className="border-slate-200 hover:bg-transparent">
              <TableHead className="bg-slate-50/90">Make</TableHead>
              <TableHead className="bg-slate-50/90">Model</TableHead>
              <TableHead className="bg-slate-50/90">Years</TableHead>
              <TableHead
                className="hidden md:table-cell bg-slate-50/90"
                title="Series, facelift phase, or trim grade"
              >
                Series / facelift
              </TableHead>
              <TableHead
                className="hidden lg:table-cell bg-slate-50/90"
                title="Full model code, chassis, or legacy codes"
              >
                Code
              </TableHead>
              <TableHead className="hidden lg:table-cell bg-slate-50/90">Body</TableHead>
              <TableHead className="w-[140px] text-right bg-slate-50/90">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow className="hover:bg-transparent border-slate-200">
                <TableCell colSpan={7} className="text-center text-slate-600 py-12">
                  No vehicles yet. Add one to get started.
                </TableCell>
              </TableRow>
            ) : (
              items.map((row) => (
                <TableRow key={row.id} className="border-slate-200 hover:bg-slate-50 data-[state=selected]:bg-slate-50">
                  <TableCell className="font-medium text-slate-900">{row.make}</TableCell>
                  <TableCell className="text-slate-900">{row.model}</TableCell>
                  <TableCell className="text-slate-900 tabular-nums">
                    {formatCatalogProductionWindow(row)}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-slate-700">
                    {row.trim_series ?? "—"}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-slate-700">
                    {row.full_model_code ??
                      row.chassis_code ??
                      row.generation_code ??
                      row.model_code ??
                      row.generation ??
                      "—"}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-slate-700">
                    {row.body_type ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1 justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-700 hover:text-slate-900 hover:bg-slate-100"
                        onClick={() => setViewRecord(row)}
                        title="View details"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-700 hover:text-slate-900 hover:bg-slate-100"
                        onClick={() => openEdit(row)}
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-600 hover:text-red-700"
                        onClick={() => handleDelete(row)}
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
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
        <DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-y-auto bg-white">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit vehicle" : "Add vehicle"}</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="identity" className="w-full">
            <TabsList className="flex flex-wrap h-auto gap-1 p-1 w-full justify-start">
              <TabsTrigger value="identity" className="text-xs sm:text-sm">
                Identity
              </TabsTrigger>
              <TabsTrigger value="variant" className="text-xs sm:text-sm">
                Variant
              </TabsTrigger>
              <TabsTrigger value="body" className="text-xs sm:text-sm">
                Body
              </TabsTrigger>
              <TabsTrigger value="engine" className="text-xs sm:text-sm">
                Engine
              </TabsTrigger>
              <TabsTrigger value="fueldrive" className="text-xs sm:text-sm">
                Fuel & drive
              </TabsTrigger>
              <TabsTrigger value="brakes" className="text-xs sm:text-sm">
                Brakes
              </TabsTrigger>
              <TabsTrigger value="capacity" className="text-xs sm:text-sm">
                Capacity
              </TabsTrigger>
            </TabsList>

            <TabsContent value="identity" className="mt-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-600">Make *</Label>
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
                    <SelectTrigger className="h-9 bg-white border-slate-300">
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
                    <Label className="text-xs text-slate-600">Model *</Label>
                    <VehicleModelCombobox
                      models={MODELS_BY_MAKE[form.makeSelection]}
                      value={form.model}
                      onChange={(v) => setForm((f) => ({ ...f, model: v }))}
                    />
                  </div>
                ) : null}

                {form.makeSelection === "Other" && (
                  <>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label className="text-xs text-slate-600">Custom make *</Label>
                      <Input
                        value={form.makeOther}
                        onChange={(e) => setForm((f) => ({ ...f, makeOther: e.target.value }))}
                        className="h-9 bg-white"
                        placeholder="e.g. Lexus, BMW"
                        autoComplete="off"
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label className="text-xs text-slate-600">Model *</Label>
                      <Input
                        value={form.model}
                        onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                        className="h-9 bg-white"
                        placeholder="Vehicle model"
                        autoComplete="off"
                      />
                    </div>
                  </>
                )}

                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-600">Production start year *</Label>
                  <Select
                    value={form.production_start_year}
                    onValueChange={(v) => setForm((f) => ({ ...f, production_start_year: v }))}
                  >
                    <SelectTrigger className="h-9 bg-white border-slate-300">
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
                  <Label className="text-xs text-slate-600">Production start month</Label>
                  <Select
                    value={form.production_start_month || "__none__"}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, production_start_month: v === "__none__" ? "" : v }))
                    }
                  >
                    <SelectTrigger className="h-9 bg-white border-slate-300">
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
                  <Label className="text-xs text-slate-600">Production end (empty = ongoing)</Label>
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
                    <SelectTrigger className="h-9 bg-white border-slate-300">
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
                  <Label className="text-xs text-slate-600">Production end month</Label>
                  <Select
                    value={form.production_end_month || "__none__"}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, production_end_month: v === "__none__" ? "" : v }))
                    }
                    disabled={form.production_end_year === ""}
                  >
                    <SelectTrigger className="h-9 bg-white border-slate-300">
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

            <TabsContent value="variant" className="mt-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field
                  label="Chassis code"
                  value={form.chassis_code}
                  onChange={update("chassis_code")}
                  placeholder="e.g. M900A"
                />
                <Field
                  label="Full model code"
                  value={form.full_model_code}
                  onChange={update("full_model_code")}
                  placeholder="e.g. DBA-M900A-GBME"
                />
                <Field label="Trim (catalog)" value={form.catalog_trim} onChange={update("catalog_trim")} placeholder="e.g. Custom G" />
                <Field
                  label="Emissions prefix"
                  value={form.emissions_prefix}
                  onChange={update("emissions_prefix")}
                  placeholder="e.g. DBA"
                />
                <Field
                  label="Trim suffix code"
                  value={form.trim_suffix_code}
                  onChange={update("trim_suffix_code")}
                  placeholder="e.g. GBME"
                />
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs text-slate-600" htmlFor="catalog-trim-series">
                    Series / facelift
                  </Label>
                  <Input
                    id="catalog-trim-series"
                    list={TRIM_SERIES_DATALIST_ID}
                    value={form.trim_series}
                    onChange={(e) => setForm((f) => ({ ...f, trim_series: e.target.value }))}
                    className="h-9 bg-white border-slate-300"
                    placeholder="e.g. Pre-Facelift, Facelift, Base, XLE"
                    autoComplete="off"
                  />
                  <datalist id={TRIM_SERIES_DATALIST_ID}>
                    {TRIM_SERIES_SUGGESTIONS.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                  <p className="text-[11px] leading-relaxed text-slate-500">
                    Use separate catalog rows for major facelifts. Frame prefixes (DBA vs 5BA) can distinguish JDM phases.
                  </p>
                </div>
                <Field label="Generation" value={form.generation} onChange={update("generation")} placeholder="e.g. Mk2" />
                <Field
                  label="Model code (legacy)"
                  value={form.model_code}
                  onChange={update("model_code")}
                  placeholder="Legacy OEM field"
                />
                <Field
                  label="Generation code (legacy)"
                  value={form.generation_code}
                  onChange={update("generation_code")}
                  placeholder="Optional if same as chassis"
                />
              </div>
            </TabsContent>

            <TabsContent value="body" className="mt-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <EngineCatalogSelect
                  label="Body type"
                  value={form.body_type}
                  onChange={(v) => setForm((f) => ({ ...f, body_type: v }))}
                  options={VEHICLE_BODY_TYPE_OPTIONS}
                  placeholder="Select a Body Type"
                />
                <EngineCatalogSelect
                  label="Doors"
                  value={form.doors}
                  onChange={(v) => setForm((f) => ({ ...f, doors: v }))}
                  options={VEHICLE_DOOR_COUNT_OPTIONS}
                  placeholder="Select doors"
                />
                <Field label="Length (mm)" value={form.length_mm} onChange={update("length_mm")} />
                <Field label="Width (mm)" value={form.width_mm} onChange={update("width_mm")} />
                <Field label="Height (mm)" value={form.height_mm} onChange={update("height_mm")} />
                <Field label="Wheelbase (mm)" value={form.wheelbase_mm} onChange={update("wheelbase_mm")} />
                <Field
                  label="Ground clearance (mm)"
                  value={form.ground_clearance_mm}
                  onChange={update("ground_clearance_mm")}
                />
              </div>
            </TabsContent>

            <TabsContent value="engine" className="mt-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Displacement (L)" value={form.engine_displacement_l} onChange={update("engine_displacement_l")} />
                <Field label="Displacement (cc)" value={form.engine_displacement_cc} onChange={update("engine_displacement_cc")} />
                <Field
                  label="Engine code"
                  value={form.engine_code}
                  onChange={update("engine_code")}
                  placeholder="e.g. 1KR-FE"
                />
                <Field
                  label="Engine type"
                  value={form.engine_type}
                  onChange={update("engine_type")}
                  placeholder="e.g. N/A, Turbo, Hybrid, Hybrid (2.0L)"
                />
                <Field
                  label="Configuration"
                  value={form.engine_configuration}
                  onChange={update("engine_configuration")}
                  placeholder="e.g. I4, V6"
                />
                <Field label="Horsepower" value={form.horsepower} onChange={update("horsepower")} />
                <Field label="Torque" value={form.torque} onChange={update("torque")} />
                <Field label="Torque unit" value={form.torque_unit} onChange={update("torque_unit")} placeholder="Nm" />
              </div>
            </TabsContent>

            <TabsContent value="fueldrive" className="mt-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field
                  label="Fuel category"
                  value={form.fuel_category}
                  onChange={update("fuel_category")}
                  placeholder="e.g. Gas, Hybrid"
                />
                <Field label="Fuel grade" value={form.fuel_grade} onChange={update("fuel_grade")} placeholder="e.g. 87" />
                <EngineCatalogSelect
                  label="Fuel type"
                  value={form.fuel_type}
                  onChange={(v) => setForm((f) => ({ ...f, fuel_type: v }))}
                  options={VEHICLE_FUEL_TYPE_OPTIONS}
                  placeholder="Select a Fuel"
                />
                <EngineCatalogSelect
                  label="Transmission"
                  value={form.transmission}
                  onChange={(v) => setForm((f) => ({ ...f, transmission: v }))}
                  options={VEHICLE_TRANSMISSION_OPTIONS}
                  placeholder="Select a Transmission"
                />
                <EngineCatalogSelect
                  label="Drivetrain"
                  value={form.drivetrain}
                  onChange={(v) => setForm((f) => ({ ...f, drivetrain: v }))}
                  options={VEHICLE_DRIVETRAIN_OPTIONS}
                  placeholder="Select a Drivetrain"
                />
              </div>
            </TabsContent>

            <TabsContent value="brakes" className="mt-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field
                  label="Front brakes"
                  value={form.front_brake_type}
                  onChange={update("front_brake_type")}
                  placeholder="disc / drum"
                />
                <Field
                  label="Rear brakes"
                  value={form.rear_brake_type}
                  onChange={update("rear_brake_type")}
                  placeholder="disc / drum"
                />
                <Field label="Brake size (mm)" value={form.brake_size_mm} onChange={update("brake_size_mm")} />
                <Field label="Tire size" value={form.tire_size} onChange={update("tire_size")} placeholder="185/60R15" />
                <Field label="Bolt pattern" value={form.bolt_pattern} onChange={update("bolt_pattern")} placeholder="5x114.3" />
                <Field label="Wheel offset (mm)" value={form.wheel_offset_mm} onChange={update("wheel_offset_mm")} />
              </div>
            </TabsContent>

            <TabsContent value="capacity" className="mt-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Engine oil (L)" value={form.engine_oil_capacity_l} onChange={update("engine_oil_capacity_l")} />
                <Field label="Coolant (L)" value={form.coolant_capacity_l} onChange={update("coolant_capacity_l")} />
                <Field label="Fuel tank capacity" value={form.fuel_tank_capacity} onChange={update("fuel_tank_capacity")} />
                <Field label="Fuel tank unit" value={form.fuel_tank_unit} onChange={update("fuel_tank_unit")} placeholder="L" />
                <Field label="Seating" value={form.seating_capacity} onChange={update("seating_capacity")} type="number" />
                <Field label="Curb weight (kg)" value={form.curb_weight_kg} onChange={update("curb_weight_kg")} />
                <Field label="GVWR (kg)" value={form.gross_vehicle_weight_kg} onChange={update("gross_vehicle_weight_kg")} />
                <Field label="Max payload (kg)" value={form.max_payload_kg} onChange={update("max_payload_kg")} />
                <Field label="Max towing (kg)" value={form.max_towing_kg} onChange={update("max_towing_kg")} />
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="gap-2 sm:gap-0 mt-4">
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
      <VehicleSpecItem icon={Armchair} label="Seats" value={viewText(r.seating_capacity)} />
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
            <ViewSpecSection title="Identifiers">
              <div className="grid grid-cols-1 gap-0 sm:grid-cols-2 sm:gap-x-8">
                <div className="flex flex-col divide-y divide-slate-100">
                  <VehicleSpecItem icon={Tag} label="Full model code" value={viewText(r.full_model_code)} />
                  <VehicleSpecItem icon={Tag} label="Chassis code" value={viewText(r.chassis_code ?? r.generation_code)} />
                  <VehicleSpecItem icon={Tag} label="Trim (catalog)" value={viewText(r.catalog_trim)} />
                  <VehicleSpecItem icon={Tag} label="Emissions prefix" value={viewText(r.emissions_prefix)} />
                  <VehicleSpecItem icon={Tag} label="Trim suffix code" value={viewText(r.trim_suffix_code)} />
                </div>
                <div className="flex flex-col divide-y divide-slate-100 border-t border-slate-100 sm:border-t-0">
                  <VehicleSpecItem icon={Tag} label="Series / facelift" value={viewText(r.trim_series)} />
                  <VehicleSpecItem icon={Tag} label="Generation" value={viewText(r.generation)} />
                  <VehicleSpecItem icon={Tag} label="Model code (legacy)" value={viewText(r.model_code)} />
                  <VehicleSpecItem icon={Tag} label="Generation code (legacy)" value={viewText(r.generation_code)} />
                </div>
              </div>
            </ViewSpecSection>

            <ViewSpecSection title="Brakes & wheels">
              <div className="grid grid-cols-1 gap-0 sm:grid-cols-2 sm:gap-x-8">
                <div className="flex flex-col divide-y divide-slate-100">
                  <VehicleSpecItem icon={CircleDot} label="Front brakes" value={viewText(r.front_brake_type)} />
                  <VehicleSpecItem icon={CircleDot} label="Rear brakes" value={viewText(r.rear_brake_type)} />
                  <VehicleSpecItem icon={Ruler} label="Brake size (mm)" value={viewText(r.brake_size_mm)} />
                </div>
                <div className="flex flex-col divide-y divide-slate-100 border-t border-slate-100 sm:border-t-0">
                  <VehicleSpecItem icon={CarFront} label="Tire size" value={viewText(r.tire_size)} />
                  <VehicleSpecItem icon={Settings2} label="Bolt pattern" value={viewText(r.bolt_pattern)} />
                  <VehicleSpecItem icon={Ruler} label="Wheel offset (mm)" value={viewText(r.wheel_offset_mm)} />
                </div>
              </div>
            </ViewSpecSection>

            <ViewSpecSection title="Dimensions">
              <div className="grid grid-cols-1 gap-0 sm:grid-cols-2 sm:gap-x-8">
                <div className="flex flex-col divide-y divide-slate-100">
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

            <ViewSpecSection title="Engine & performance">
              <div className="grid grid-cols-1 gap-0 sm:grid-cols-2 sm:gap-x-8">
                <div className="flex flex-col divide-y divide-slate-100">
                  <VehicleSpecItem icon={Gauge} label="Displacement (L)" value={viewText(r.engine_displacement_l)} />
                  <VehicleSpecItem icon={Gauge} label="Displacement (cc)" value={viewText(r.engine_displacement_cc)} />
                  <VehicleSpecItem icon={Settings2} label="Configuration" value={viewText(r.engine_configuration)} />
                  <VehicleSpecItem icon={Gauge} label="Engine code" value={viewText(r.engine_code)} />
                  <VehicleSpecItem icon={Gauge} label="Engine type" value={viewText(r.engine_type)} />
                  <VehicleSpecItem icon={Fuel} label="Fuel category" value={viewText(r.fuel_category)} />
                  <VehicleSpecItem icon={Fuel} label="Fuel grade" value={viewText(r.fuel_grade)} />
                </div>
                <div className="flex flex-col divide-y divide-slate-100 border-t border-slate-100 sm:border-t-0">
                  <VehicleSpecItem icon={Gauge} label="Horsepower" value={viewText(r.horsepower)} />
                  <VehicleSpecItem icon={Gauge} label="Torque" value={viewText(r.torque)} />
                  <VehicleSpecItem icon={Gauge} label="Torque unit" value={viewText(r.torque_unit)} />
                </div>
              </div>
            </ViewSpecSection>

            <ViewSpecSection title="Fuel & weight">
              <div className="grid grid-cols-1 gap-0 sm:grid-cols-2 sm:gap-x-8">
                <div className="flex flex-col divide-y divide-slate-100">
                  <VehicleSpecItem icon={Gauge} label="Engine oil (L)" value={viewText(r.engine_oil_capacity_l)} />
                  <VehicleSpecItem icon={Gauge} label="Coolant (L)" value={viewText(r.coolant_capacity_l)} />
                  <VehicleSpecItem icon={Fuel} label="Fuel tank capacity" value={viewText(r.fuel_tank_capacity)} />
                  <VehicleSpecItem icon={Fuel} label="Fuel tank unit" value={viewText(r.fuel_tank_unit)} />
                </div>
                <div className="flex flex-col divide-y divide-slate-100 border-t border-slate-100 sm:border-t-0">
                  <VehicleSpecItem icon={Weight} label="Curb weight (kg)" value={viewText(r.curb_weight_kg)} />
                  <VehicleSpecItem icon={Weight} label="GVWR (kg)" value={viewText(r.gross_vehicle_weight_kg)} />
                  <VehicleSpecItem icon={Weight} label="Max payload (kg)" value={viewText(r.max_payload_kg)} />
                  <VehicleSpecItem icon={Weight} label="Max towing (kg)" value={viewText(r.max_towing_kg)} />
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
