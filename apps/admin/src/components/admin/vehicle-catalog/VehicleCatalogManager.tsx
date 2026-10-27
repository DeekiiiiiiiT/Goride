// Stitch: dominion-redesign/d955104c499d440581c90e8a17bfc573
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  Download,
  Upload,
  Loader2,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { CatalogOrphansPanel } from "./CatalogOrphansPanel";
import {
  bulkUpsertVehicleCatalog,
  createVehicleCatalog,
  deleteVehicleCatalog,
  getVehicleCatalogDependencies,
  listVehicleCatalog,
  purgeAllVehicleCatalog,
  type CatalogDependencyCounts,
  undoVehicleCatalogImportBatch,
  updateVehicleCatalog,
  VEHICLE_CATALOG_PURGE_CONFIRM_PHRASE,
  VEHICLE_CATALOG_UNDO_BATCH_CONFIRM_PHRASE,
} from "../../../services/vehicleCatalogService";
import {
  formatCatalogProductionWindow,
  type VehicleCatalogRecord,
} from "../../../types/vehicleCatalog";
import { VEHICLE_CATALOG_CSV_COLUMNS } from "../../../types/csv-schemas";
import { downloadBlob, jsonToCsv } from "../../../utils/csv-helper";
import {
  parseVehicleCatalogCsvWithPapa,
  VEHICLE_CATALOG_BULK_MAX_ROWS,
  type ParsedCatalogImportRow,
} from "../../../utils/vehicleCatalogCsvImport";
import { catalogCreateDriftFieldNames } from "../../../utils/vehicleCatalogWriteDrift";
import {
  clearCatalogImportCheckpoint,
  loadCatalogImportCheckpoint,
  saveCatalogImportCheckpoint,
} from "../../../utils/catalogImportCheckpoint";
import { toast } from "sonner";
import { Button } from "../../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../ui/alert-dialog";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import {
  VehicleCatalogEditDialog,
  emptyForm,
  recordToForm,
  toCreatePayload,
  toPatchPayload,
  resolveMake,
  type FormState,
} from "./VehicleCatalogEditDialog";
import {
  VehicleCatalogImportDialog,
  type VehicleCatalogImportOutcome,
  type VehicleCatalogImportStep,
} from "./VehicleCatalogImportDialog";
import { VehicleCatalogTable } from "./VehicleCatalogTable";
import { VehicleSpecificationSheet } from "./VehicleSpecificationSheet";

function rowMatchesSearch(row: VehicleCatalogRecord, q: string): boolean {
  if (!q) return true;
  const hay = [
    row.make,
    row.model,
    row.chassis_code,
    row.engine_code,
    row.trim_series,
    row.full_model_code,
    row.catalog_trim,
    row.generation,
  ]
    .map((x) => String(x ?? "").toLowerCase())
    .join(" ");
  return hay.includes(q);
}

export function VehicleCatalogManager() {
  const { session } = useAuth();
  const token = session?.access_token;

  const [items, setItems] = useState<VehicleCatalogRecord[]>([]);
  const [listTotal, setListTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewRecord, setViewRecord] = useState<VehicleCatalogRecord | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingUpdatedAt, setEditingUpdatedAt] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm());

  const [classFilter, setClassFilter] = useState<"all" | "car" | "motorcycle">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<VehicleCatalogRecord | null>(null);
  const [deleteDeps, setDeleteDeps] = useState<CatalogDependencyCounts | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items
      .filter((r) => {
        if (classFilter !== "all" && (r.vehicle_class ?? "car") !== classFilter) return false;
        return rowMatchesSearch(r, q);
      })
      .sort((a, b) => {
        const makeCmp = (a.make ?? "").localeCompare(b.make ?? "", undefined, { sensitivity: "base" });
        if (makeCmp !== 0) return makeCmp;
        const modelCmp = (a.model ?? "").localeCompare(b.model ?? "", undefined, { sensitivity: "base" });
        if (modelCmp !== 0) return modelCmp;
        const ya = a.production_start_year ?? 0;
        const yb = b.production_start_year ?? 0;
        if (yb !== ya) return yb - ya;
        return (b.production_start_month ?? 0) - (a.production_start_month ?? 0);
      });
  }, [items, classFilter, searchQuery]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const { items: list, total } = await listVehicleCatalog(token);
      setItems(list);
      setListTotal(total);
      if (list.length !== total) {
        setError(`Catalog list mismatch: loaded ${list.length} of reported ${total}. Refresh or contact support.`);
      }
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
    setEditingUpdatedAt(null);
    setForm(emptyForm());
    setError(null);
    setDialogOpen(true);
  };

  const openEdit = (row: VehicleCatalogRecord) => {
    setEditingId(row.id);
    setEditingUpdatedAt(row.updated_at ?? null);
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
        const patched = await updateVehicleCatalog(token, editingId, {
          ...toPatchPayload(form),
          ...(editingUpdatedAt ? { expected_updated_at: editingUpdatedAt } : {}),
        });
        setItems((prev) => prev.map((r) => (r.id === editingId ? patched : r)));
      } else {
        const created = await createVehicleCatalog(token, toCreatePayload(form));
        setItems((prev) => [...prev, created]);
        setListTotal((t) => (t == null ? null : t + 1));
      }
      setDialogOpen(false);
    } catch (e: unknown) {
      const err = e as Error & { code?: string };
      if (err.code === "STALE_WRITE") {
        setError("Someone else saved this variant first — refresh and try again.");
        toast.error("Conflict: record was updated elsewhere");
        await load();
      } else {
        setError(e instanceof Error ? e.message : "Save failed");
      }
    } finally {
      setSaving(false);
    }
  };

  const openDelete = async (row: VehicleCatalogRecord) => {
    if (!token) return;
    setDeleteTarget(row);
    setDeleteDeps(null);
    setDeleteLoading(true);
    try {
      const deps = await getVehicleCatalogDependencies(token, row.id);
      setDeleteDeps(deps);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not load dependencies");
      setDeleteTarget(null);
    } finally {
      setDeleteLoading(false);
    }
  };

  const confirmDelete = async (force: boolean) => {
    if (!token || !deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteVehicleCatalog(token, deleteTarget.id, { force });
      setItems((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      setListTotal((t) => (t == null ? null : Math.max(0, t - 1)));
      setDeleteTarget(null);
      setDeleteDeps(null);
      toast.success("Catalog variant deleted");
    } catch (e: unknown) {
      const err = e as Error & { code?: string; dependencies?: CatalogDependencyCounts };
      if (err.code === "CATALOG_HAS_DEPENDENTS" && err.dependencies) {
        setDeleteDeps(err.dependencies);
        toast.error("This variant has dependents — confirm force delete if intended");
      } else {
        setError(e instanceof Error ? e.message : "Delete failed");
        toast.error(e instanceof Error ? e.message : "Delete failed");
      }
    } finally {
      setDeleting(false);
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
  const [importUnknownHeaders, setImportUnknownHeaders] = useState<string[]>([]);
  /** preview â†’ importing â†’ result */
  const [importStep, setImportStep] = useState<VehicleCatalogImportStep>("preview");
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [importOutcome, setImportOutcome] = useState<VehicleCatalogImportOutcome | null>(null);
  const [importBatchId, setImportBatchId] = useState<string | null>(null);
  const [undoingBatch, setUndoingBatch] = useState(false);
  const [forceUndoOpen, setForceUndoOpen] = useState(false);
  const [forceUndoDeps, setForceUndoDeps] = useState<CatalogDependencyCounts | null>(null);
  const [forceUndoConfirmInput, setForceUndoConfirmInput] = useState("");

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
        const parsed = parseVehicleCatalogCsvWithPapa(text);
        setImportPreview(parsed.rows);
        setImportUnknownHeaders(parsed.unknownHeaders);
        setImportStep("preview");
        setImportProgress(null);
        setImportOutcome(null);
        const existing = loadCatalogImportCheckpoint();
        setImportBatchId(existing?.importBatchId ?? crypto.randomUUID());
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
    setImportUnknownHeaders([]);
    setImportStep("preview");
    setImportProgress(null);
    setImportOutcome(null);
  };

  const handleRunCatalogImport = async () => {
    if (!token) return;
    if (importPreview == null) return;
    if (importUnknownHeaders.length > 0) {
      toast.error("Remove or map unknown CSV columns before importing.");
      return;
    }
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
    const batchId = importBatchId ?? crypto.randomUUID();
    setImportBatchId(batchId);
    const checkpoint = loadCatalogImportCheckpoint();
    const completed = new Set(
      checkpoint?.importBatchId === batchId ? checkpoint.completedRowIndices : [],
    );
    const pending = ready.filter((r) => !completed.has(r.rowIndex));

    setImportStep("importing");
    setImportProgress({ current: ready.length - pending.length, total: ready.length });
    setImportOutcome(null);
    let imported = 0;
    let updated = 0;
    const apiErrors: string[] = [];
    const driftFieldSet = new Set<string>();
    let driftRowCount = 0;
    const createdItems: VehicleCatalogRecord[] = [];
    const updatedItems: VehicleCatalogRecord[] = [];

    for (let i = 0; i < pending.length; i += VEHICLE_CATALOG_BULK_MAX_ROWS) {
      const slice = pending.slice(i, i + VEHICLE_CATALOG_BULK_MAX_ROWS);
      try {
        const res = await bulkUpsertVehicleCatalog(
          token,
          batchId,
          slice.map((r) => ({
            rowIndex: r.rowIndex,
            id: r.catalogId,
            payload: r.payload,
          })),
        );
        for (const result of res.results) {
          if (!result.ok) {
            apiErrors.push(`Row ${result.rowIndex}: ${result.error || "failed"}`);
            continue;
          }
          completed.add(result.rowIndex);
          if (result.action === "created") imported++;
          else updated++;
          if (result.item) {
            const src = slice.find((s) => s.rowIndex === result.rowIndex);
            if (src) {
              const drift = catalogCreateDriftFieldNames(src.payload, result.item);
              if (drift.length) {
                driftRowCount++;
                drift.forEach((f) => driftFieldSet.add(f));
              }
            }
            if (result.action === "created") createdItems.push(result.item);
            else updatedItems.push(result.item);
          }
        }
      } catch (err) {
        for (const r of slice) {
          apiErrors.push(`Row ${r.rowIndex}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      saveCatalogImportCheckpoint({
        importBatchId: batchId,
        completedRowIndices: [...completed],
        updatedAt: new Date().toISOString(),
      });
      setImportProgress({ current: completed.size, total: ready.length });
    }

    const schemaWarnings: string[] = [];
    if (driftFieldSet.size > 0) {
      const fields = [...driftFieldSet].sort().join(", ");
      schemaWarnings.push(
        `${driftRowCount} of ${ready.length} row(s) had CSV data for: ${fields}, but the API response still had blanks. If you already added columns in SQL, run the three PostgREST reload statements from supabase/scripts/repair_vehicle_catalog_for_csv_import.sql (end of file: pg_sleep, NOTIFY pgrst, NOTIFY with reload), wait 30 seconds, purge catalog rows, then import again—or restart the project from Supabase Dashboard if reload still fails.`,
      );
    }
    if (apiErrors.length === 0) clearCatalogImportCheckpoint();

    setItems((prev) => {
      const byId = new Map(prev.map((r) => [r.id, r]));
      for (const u of updatedItems) byId.set(u.id, u);
      for (const c of createdItems) byId.set(c.id, c);
      return [...byId.values()];
    });
    if (createdItems.length) {
      setListTotal((t) => (t == null ? null : t + createdItems.length));
    }

    setImportOutcome({
      imported,
      updated,
      failed: apiErrors.length,
      errors: apiErrors,
      schemaWarnings,
      importBatchId: batchId,
    });
    setImportStep("result");
  };

  const handleUndoImportBatch = async (force = false) => {
    if (!token || !importBatchId) return;
    setUndoingBatch(true);
    try {
      const { deleted } = await undoVehicleCatalogImportBatch(token, importBatchId, { force });
      clearCatalogImportCheckpoint();
      setForceUndoOpen(false);
      setForceUndoDeps(null);
      setForceUndoConfirmInput("");
      toast.success(`Undid import batch — removed ${deleted} row(s)`);
      setImportDialogOpen(false);
      await load();
    } catch (e: unknown) {
      const err = e as Error & { code?: string; dependencies?: CatalogDependencyCounts };
      if (err.code === "CATALOG_HAS_DEPENDENTS") {
        setForceUndoDeps(
          err.dependencies ?? { maintenanceTemplates: 0, partFitments: 0, fleetVehicles: 0 },
        );
        setForceUndoConfirmInput("");
        setForceUndoOpen(true);
      } else {
        toast.error(e instanceof Error ? e.message : "Undo failed");
      }
    } finally {
      setUndoingBatch(false);
    }
  };

  const confirmForceUndoBatch = async () => {
    if (forceUndoConfirmInput.trim() !== VEHICLE_CATALOG_UNDO_BATCH_CONFIRM_PHRASE) return;
    await handleUndoImportBatch(true);
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
    <div className="mx-auto w-full max-w-[1440px] space-y-6 text-slate-900">
      <nav className="flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
        <span>Dominion</span>
        <span className="text-slate-400" aria-hidden>›</span>
        <span>Master data</span>
        <span className="text-slate-400" aria-hidden>›</span>
        <span>Vehicles</span>
        <span className="text-slate-400" aria-hidden>›</span>
        <span className="font-medium text-slate-900">Vehicle catalog</span>
      </nav>

      <div className="flex flex-col gap-1">
        <h1 className="font-headline text-2xl font-bold tracking-tight text-slate-900">Vehicle catalog</h1>
        <p className="text-sm text-slate-500">
          Makes, models, and the record you open with the eye to read specs.
          {listTotal != null && (
            <span className="ml-1">
              ({filteredItems.length}
              {listTotal !== filteredItems.length ? ` of ${listTotal}` : ""} variants)
            </span>
          )}
        </p>
      </div>

      <CatalogOrphansPanel />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex max-w-lg flex-1 flex-wrap items-center gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute inset-y-0 left-0 my-auto ml-3 h-[18px] w-[18px] text-slate-400" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search make or model"
              type="text"
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-800 shadow-2xs placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="relative w-44">
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value as "all" | "car" | "motorcycle")}
              className="w-full cursor-pointer appearance-none rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-8 text-xs text-slate-800 shadow-2xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">Class: All</option>
              <option value="car">Cars</option>
              <option value="motorcycle">Motorcycles</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-slate-400" aria-hidden />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={importFileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            aria-hidden
            onChange={handleImportFileChange}
          />
          <button
            type="button"
            onClick={handleImportPick}
            disabled={loading || importStep === "importing"}
            title="Import rows from CSV (export first to use as a template)"
            className="inline-flex items-center gap-2 rounded-lg bg-[#316bf3] px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-blue-600 active:bg-blue-700 disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            Import CSV
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={loading}
            title={
              items.length === 0
                ? "Exports headers and column guide; add vehicles or import to fill rows"
                : "Download catalog with production months, engine code, and engine type columns"
            }
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
          >
            <Plus className="h-4 w-4" />
            Add vehicle
          </button>
          <button
            type="button"
            disabled={loading || items.length === 0 || importStep === "importing"}
            title="Remove every row in the motor vehicle catalog (cannot be undone)"
            onClick={() => {
              setPurgeConfirmInput("");
              setPurgeDialogOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3.5 py-2 text-xs font-medium text-red-600 shadow-sm transition-colors hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            Delete all
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : (
        <VehicleCatalogTable
          items={filteredItems}
          viewingId={viewRecord?.id ?? null}
          onView={(row) => setViewRecord((prev) => (prev?.id === row.id ? null : row))}
          onEdit={openEdit}
          onDelete={openDelete}
        />
      )}

      {viewRecord ? (
        <VehicleSpecificationSheet record={viewRecord} onClose={() => setViewRecord(null)} />
      ) : null}

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
        unknownHeaders={importUnknownHeaders}
        importProgress={importProgress}
        importOutcome={importOutcome}
        importBatchId={importBatchId}
        undoingBatch={undoingBatch}
        onOpenChange={(open) => {
          if (!open) handleCloseImportDialog();
        }}
        onClose={handleCloseImportDialog}
        onRunImport={handleRunCatalogImport}
        onUndoBatch={() => void handleUndoImportBatch(false)}
      />

      <AlertDialog
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open && !deleting) {
            setDeleteTarget(null);
            setDeleteDeps(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleteTarget?.make} {deleteTarget?.model}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-slate-600">
                <p>
                  Production window:{" "}
                  {deleteTarget ? formatCatalogProductionWindow(deleteTarget) : "—"}
                </p>
                {deleteLoading && <p>Loading dependency counts…</p>}
                {deleteDeps && (
                  <ul className="list-disc pl-5 space-y-1">
                    <li>{deleteDeps.maintenanceTemplates} maintenance template(s)</li>
                    <li>{deleteDeps.partFitments} part fitment(s)</li>
                    <li>{deleteDeps.fleetVehicles} fleet vehicle link(s)</li>
                  </ul>
                )}
                {deleteDeps &&
                  (deleteDeps.maintenanceTemplates > 0 ||
                    deleteDeps.partFitments > 0 ||
                    deleteDeps.fleetVehicles > 0) && (
                    <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
                      Force delete also permanently removes cascading maintenance templates and part
                      fitments. Fleet vehicles will keep dangling catalog ids until rematched.
                    </p>
                  )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            {deleteDeps &&
            (deleteDeps.maintenanceTemplates > 0 ||
              deleteDeps.partFitments > 0 ||
              deleteDeps.fleetVehicles > 0) ? (
              <AlertDialogAction
                className="bg-rose-700 hover:bg-rose-800"
                disabled={deleting || deleteLoading}
                onClick={(e) => {
                  e.preventDefault();
                  void confirmDelete(true);
                }}
              >
                {deleting ? "Deleting…" : "Delete anyway"}
              </AlertDialogAction>
            ) : (
              <AlertDialogAction
                className="bg-rose-600 hover:bg-rose-700"
                disabled={deleting || deleteLoading}
                onClick={(e) => {
                  e.preventDefault();
                  void confirmDelete(false);
                }}
              >
                {deleting ? "Deleting…" : "Delete"}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={forceUndoOpen}
        onOpenChange={(open) => {
          if (undoingBatch) return;
          setForceUndoOpen(open);
          if (!open) {
            setForceUndoDeps(null);
            setForceUndoConfirmInput("");
          }
        }}
      >
        <DialogContent
          className="sm:max-w-md bg-white border-slate-200"
          hideCloseButton={undoingBatch}
          onPointerDownOutside={(e) => {
            if (undoingBatch) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (undoingBatch) e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>Force undo this import batch?</DialogTitle>
            <DialogDescription className="text-slate-600 text-sm leading-relaxed">
              This permanently deletes every catalog row created by this import. Cascading maintenance
              templates and part fitments are removed with them. Fleet vehicles that still point at those
              rows will need rematching.
            </DialogDescription>
          </DialogHeader>
          {forceUndoDeps && (
            <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700">
              <li>{forceUndoDeps.maintenanceTemplates} maintenance template(s)</li>
              <li>{forceUndoDeps.partFitments} part fitment(s)</li>
              <li>{forceUndoDeps.fleetVehicles} fleet vehicle link(s)</li>
            </ul>
          )}
          <div className="space-y-2 py-1">
            <Label className="text-xs text-slate-600">Confirmation</Label>
            <p className="text-xs text-slate-500">
              Type{" "}
              <code className="rounded bg-slate-100 px-1 font-mono text-slate-800">
                {VEHICLE_CATALOG_UNDO_BATCH_CONFIRM_PHRASE}
              </code>{" "}
              exactly (case-sensitive).
            </p>
            <Input
              value={forceUndoConfirmInput}
              onChange={(e) => setForceUndoConfirmInput(e.target.value)}
              placeholder={VEHICLE_CATALOG_UNDO_BATCH_CONFIRM_PHRASE}
              className="bg-white font-mono text-sm"
              autoComplete="off"
              disabled={undoingBatch}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setForceUndoOpen(false)}
              disabled={undoingBatch}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={
                undoingBatch ||
                forceUndoConfirmInput.trim() !== VEHICLE_CATALOG_UNDO_BATCH_CONFIRM_PHRASE
              }
              className="gap-2"
              onClick={() => void confirmForceUndoBatch()}
            >
              {undoingBatch && <Loader2 className="w-4 h-4 animate-spin" />}
              Force undo batch
            </Button>
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
              This permanently removes every row in the platform catalog. Maintenance templates and part
              fitments tied to those rows are removed automatically (CASCADE). Fleet vehicles that
              referenced a catalog entry may need to be re-linked later.
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

