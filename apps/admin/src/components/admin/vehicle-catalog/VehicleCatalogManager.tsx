import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type LucideIcon,
  Armchair,
  Calendar,
  CarFront,
  ChevronDown,
  CircleDot,
  DoorOpen,
  Download,
  Upload,
  Fuel,
  Gauge,
  Loader2,
  Plus,
  Ruler,
  Settings2,
  Tag,
  Trash2,
  Weight,
} from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { CatalogGateObservabilityPanel } from "./CatalogGateObservabilityPanel";
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
  type VehicleCatalogRecord,
} from "../../../types/vehicleCatalog";
import { VEHICLE_CATALOG_CSV_COLUMNS } from "../../../types/csv-schemas";
import { downloadBlob, jsonToCsv } from "../../../utils/csv-helper";
import { parseVehicleCatalogCsvWithPapa, type ParsedCatalogImportRow } from "../../../utils/vehicleCatalogCsvImport";
import { catalogCreateDriftFieldNames } from "../../../utils/vehicleCatalogWriteDrift";
import { toast } from "sonner";
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
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import {
  VehicleCatalogEditDialog,
  emptyForm,
  recordToForm,
  toCreatePayload,
  toPatchPayload,
  resolveMake,
  MONTH_OPTIONS,
  type FormState,
} from "./VehicleCatalogEditDialog";
import {
  VehicleCatalogImportDialog,
  type VehicleCatalogImportOutcome,
  type VehicleCatalogImportStep,
} from "./VehicleCatalogImportDialog";
import { VehicleCatalogTable } from "./VehicleCatalogTable";

export function VehicleCatalogManager() {
  const { session } = useAuth();
  const token = session?.access_token;

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
  const [importStep, setImportStep] = useState<VehicleCatalogImportStep>("preview");
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [importOutcome, setImportOutcome] = useState<VehicleCatalogImportOutcome | null>(null);

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
    <div className="flex flex-col gap-4 p-4 sm:p-6 text-slate-900 dark:text-slate-200">
      <CatalogGateObservabilityPanel />
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Motor vehicles</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
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
            className="gap-2 border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-white"
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
            className="gap-2 border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-white"
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
            className="gap-2 border-red-300 bg-white text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-500/40 dark:bg-slate-800/80 dark:text-red-400 dark:hover:bg-red-950/40 dark:hover:text-red-300"
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
        <VehicleCatalogTable
          items={items}
          groupedCatalog={groupedCatalog}
          expandedMakes={expandedMakes}
          expandedModels={expandedModels}
          onToggleMake={(make) =>
            setExpandedMakes((prev) => {
              const next = new Set(prev);
              if (next.has(make)) next.delete(make);
              else next.add(make);
              return next;
            })
          }
          onToggleModel={(make, model) => {
            const mk = modelGroupKey(make, model);
            setExpandedModels((prev) => {
              const next = new Set(prev);
              if (next.has(mk)) next.delete(mk);
              else next.add(mk);
              return next;
            });
          }}
          modelGroupKey={modelGroupKey}
          onView={setViewRecord}
          onEdit={openEdit}
          onDelete={handleDelete}
        />
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

      <VehicleCatalogEditDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingId={editingId}
        form={form}
        setForm={setForm}
        update={update}
        saving={saving}
        onSave={handleSave}
      />

      <VehicleCatalogImportDialog
        open={importDialogOpen}
        importStep={importStep}
        importPreview={importPreview}
        importProgress={importProgress}
        importOutcome={importOutcome}
        onOpenChange={(open) => {
          if (!open) handleCloseImportDialog();
        }}
        onClose={handleCloseImportDialog}
        onRunImport={handleRunCatalogImport}
      />

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
