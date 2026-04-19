import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, Loader2, MoreVertical, Pencil, Plus, Trash2, Wrench, Database } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { listVehicleCatalog } from "../../../services/vehicleCatalogService";
import {
  createGlobalMaintenanceTemplate,
  createMaintenanceTemplate,
  deleteMaintenanceTemplate,
  listGlobalMaintenanceTemplates,
  listMaintenanceTemplates,
  migrateMaintenanceFromKv,
  updateMaintenanceTemplate,
} from "../../../services/maintenanceTemplateService";
import type { VehicleCatalogRecord } from "../../../types/vehicleCatalog";
import type { MaintenanceFrequencyKind, MaintenanceTaskTemplate } from "../../../types/maintenance";
import { MAINTENANCE_SCHEDULE_PRESETS } from "../../../constants/maintenanceSchedulePresets";
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
import { Checkbox } from "../../ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../ui/table";
import { Tabs, TabsList, TabsTrigger } from "../../ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../ui/dropdown-menu";

function scheduleKindShort(k: string | undefined): string {
  if (k === "once_milestone") return "One-time";
  if (k === "manual_only") return "Manual";
  return "Recurring";
}

function scheduleKindFull(k: string | undefined): string {
  if (k === "once_milestone") return "One-time milestone";
  if (k === "manual_only") return "Manual (no auto next due)";
  return "Recurring (repeat by interval)";
}

function formatIntervalMilesDisplay(t: Pick<MaintenanceTaskTemplate, "interval_miles" | "interval_miles_max">): string {
  const lo = t.interval_miles;
  const hi = t.interval_miles_max;
  if (lo == null && (hi == null || hi === undefined)) return "—";
  if (lo != null && hi != null && hi > lo) return `${lo}–${hi}`;
  if (lo != null) return String(lo);
  return "—";
}

/** Prefer API / Error text; avoid useless "[object Object]" from `new Error(nonString)`. */
function formatCatchError(e: unknown, fallback: string): string {
  if (e instanceof Error) {
    const m = e.message?.trim() ?? "";
    if (m && m !== "[object Object]") return m;
    return fallback;
  }
  if (typeof e === "string" && e.trim()) return e.trim();
  if (e && typeof e === "object" && !(e instanceof Error)) {
    const o = e as Record<string, unknown>;
    if (typeof o.message === "string" && o.message.trim() && o.message.trim() !== "[object Object]") {
      return o.message.trim();
    }
    if (typeof o.error === "string" && o.error.trim()) return o.error.trim();
    const nested = o.error && typeof o.error === "object" ? (o.error as { message?: unknown }).message : undefined;
    if (typeof nested === "string" && nested.trim()) return nested.trim();
  }
  return fallback;
}

export function MaintenanceTemplatesManager() {
  const { session, user } = useAuth();
  const token = session?.access_token;
  const rawRole =
    (user as { app_metadata?: { role?: string }; user_metadata?: { role?: string } })?.app_metadata?.role ||
    (user as { user_metadata?: { role?: string } })?.user_metadata?.role ||
    "";
  const canMigrate =
    rawRole === "platform_owner" || rawRole === "superadmin" || rawRole === "platform_support";

  const [catalog, setCatalog] = useState<VehicleCatalogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCatalogId, setSelectedCatalogId] = useState<string>("");
  const [templates, setTemplates] = useState<MaintenanceTaskTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  /** Fleet-wide defaults vs per–vehicle-catalog templates. */
  const [templateScopeTab, setTemplateScopeTab] = useState<"global" | "catalog">("catalog");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MaintenanceTaskTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [viewing, setViewing] = useState<MaintenanceTaskTemplate | null>(null);

  const [form, setForm] = useState({
    task_name: "",
    task_code: "",
    description: "",
    interval_miles: "",
    interval_miles_max: "",
    interval_months: "",
    frequency_kind: "recurring" as MaintenanceFrequencyKind,
    frequency_label: "",
    priority: "standard" as MaintenanceTaskTemplate["priority"],
    sort_order: "0",
  });
  /** Create dialog only: which built-in interval preset was applied (optional). */
  const [presetId, setPresetId] = useState<string>("__none__");

  const updateChecklistLine = (index: number, value: string) => {
    setForm((f) => {
      const lines = !f.description.trim() ? [""] : f.description.split("\n");
      const next = [...lines];
      next[index] = value;
      return { ...f, description: next.join("\n") };
    });
  };

  const removeChecklistLine = (index: number) => {
    setForm((f) => {
      let lines = !f.description.trim() ? [""] : f.description.split("\n");
      lines = lines.filter((_, i) => i !== index);
      if (lines.length === 0) lines = [""];
      return { ...f, description: lines.join("\n") };
    });
  };

  const addChecklistLine = () => {
    setForm((f) => {
      const lines = !f.description.trim() ? [""] : f.description.split("\n");
      return { ...f, description: [...lines, ""].join("\n") };
    });
  };

  const applyPreset = (id: string) => {
    setPresetId(id);
    if (id === "__none__") return;
    const preset = MAINTENANCE_SCHEDULE_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    const shortName = preset.label.includes(" (")
      ? preset.label.slice(0, preset.label.indexOf(" ("))
      : preset.label;
    setForm({
      task_name: shortName,
      task_code: "",
      description: preset.items.join("\n"),
      interval_miles: String(preset.interval_miles),
      interval_miles_max: "",
      interval_months: String(preset.interval_months),
      frequency_kind: "recurring",
      frequency_label: "",
      priority: "standard",
      sort_order: String(preset.sort_order),
    });
  };

  const checklistLines = useMemo(() => {
    if (!form.description.trim()) return [""];
    return form.description.split("\n");
  }, [form.description]);

  const checklistFilledCount = useMemo(
    () => checklistLines.filter((l) => l.trim()).length,
    [checklistLines],
  );

  const loadCatalog = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const items = await listVehicleCatalog(token);
      setCatalog(items);
      setSelectedCatalogId((prev) => (prev || (items[0]?.id ?? "")));
    } catch (e: unknown) {
      setError(formatCatchError(e, "Failed to load catalog"));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const loadTemplates = useCallback(async () => {
    if (!token) {
      setTemplates([]);
      return;
    }
    if (templateScopeTab === "catalog" && !selectedCatalogId) {
      setTemplates([]);
      return;
    }
    setLoadingTemplates(true);
    setError(null);
    try {
      const items =
        templateScopeTab === "global"
          ? await listGlobalMaintenanceTemplates(token)
          : await listMaintenanceTemplates(token, selectedCatalogId);
      setTemplates(items);
    } catch (e: unknown) {
      setError(formatCatchError(e, "Could not load templates. Please refresh the page. If it continues, contact support."));
    } finally {
      setLoadingTemplates(false);
    }
  }, [token, selectedCatalogId, templateScopeTab]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    setDialogOpen(false);
  }, [templateScopeTab]);

  const selectedVehicleLabel = useMemo(() => {
    const row = catalog.find((c) => c.id === selectedCatalogId);
    if (!row) return "";
    return `${row.make} ${row.model} (${row.year})`;
  }, [catalog, selectedCatalogId]);

  const openCreate = () => {
    setEditing(null);
    setPresetId("__none__");
    setForm({
      task_name: "",
      task_code: "",
      description: "",
      interval_miles: "",
      interval_miles_max: "",
      interval_months: "",
      frequency_kind: "recurring",
      frequency_label: "",
      priority: "standard",
      sort_order: String(templates.length),
    });
    setDialogOpen(true);
  };

  const openEdit = (t: MaintenanceTaskTemplate) => {
    setEditing(t);
    setPresetId("__none__");
    setForm({
      task_name: t.task_name,
      task_code: t.task_code ?? "",
      description: t.description ?? "",
      interval_miles: t.interval_miles != null ? String(t.interval_miles) : "",
      interval_miles_max:
        t.interval_miles_max != null &&
        t.interval_miles != null &&
        t.interval_miles_max > t.interval_miles
          ? String(t.interval_miles_max)
          : "",
      interval_months: t.interval_months != null ? String(t.interval_months) : "",
      frequency_kind: t.frequency_kind ?? "recurring",
      frequency_label: t.frequency_label ?? "",
      priority: t.priority,
      sort_order: String(t.sort_order),
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!token) return;
    if (templateScopeTab === "catalog" && !selectedCatalogId) return;
    const task_name = form.task_name.trim();
    if (!task_name) {
      setError("Task name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const milesLo = form.interval_miles.trim() === "" ? null : Number(form.interval_miles);
      const milesHiRaw = form.interval_miles_max.trim() === "" ? null : Number(form.interval_miles_max);
      if (milesHiRaw != null && Number.isFinite(milesHiRaw)) {
        if (milesLo == null || !Number.isFinite(milesLo)) {
          setError("Enter the lower mileage (from) before setting an upper mileage.");
          setSaving(false);
          return;
        }
        if (milesHiRaw < milesLo) {
          setError("Upper mileage must be greater than or equal to lower mileage.");
          setSaving(false);
          return;
        }
      }
      let interval_miles_max: number | null =
        milesHiRaw != null && Number.isFinite(milesHiRaw) && milesLo != null && milesHiRaw > milesLo
          ? milesHiRaw
          : null;

      const payload = {
        task_name,
        task_code: form.task_code.trim() || null,
        description: form.description.trim() || undefined,
        interval_miles: milesLo,
        interval_miles_max,
        interval_months: form.interval_months.trim() === "" ? null : Number(form.interval_months),
        frequency_kind: form.frequency_kind,
        frequency_label: form.frequency_label.trim() || null,
        priority: form.priority,
        sort_order: Number(form.sort_order) || 0,
      };
      if (editing) {
        await updateMaintenanceTemplate(token, editing.id, payload);
      } else if (templateScopeTab === "global") {
        await createGlobalMaintenanceTemplate(token, payload);
      } else {
        await createMaintenanceTemplate(token, selectedCatalogId, payload);
      }
      setDialogOpen(false);
      await loadTemplates();
    } catch (e: unknown) {
      setError(formatCatchError(e, "Save failed"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (t: MaintenanceTaskTemplate) => {
    if (!token) return;
    if (!window.confirm(`Delete template "${t.task_name}"?`)) return;
    setError(null);
    try {
      await deleteMaintenanceTemplate(token, t.id);
      await loadTemplates();
    } catch (e: unknown) {
      setError(formatCatchError(e, "Delete failed"));
    }
  };

  const handleMigrate = async () => {
    if (!token || !canMigrate) return;
    if (!window.confirm("Copy maintenance logs from legacy KV storage into Postgres?")) return;
    setMigrating(true);
    setError(null);
    try {
      const r = await migrateMaintenanceFromKv(token);
      window.alert(`Migration complete: ${r.inserted} inserted, ${r.skipped} skipped (${r.scanned} scanned).`);
    } catch (e: unknown) {
      setError(formatCatchError(e, "Migration failed"));
    } finally {
      setMigrating(false);
    }
  };

  if (!token) {
    return <p className="text-sm text-slate-500">Sign in to manage maintenance templates.</p>;
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 text-slate-900 [color-scheme:light]">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Wrench className="w-5 h-5 text-amber-600" />
            Maintenance templates
          </h2>
          <p className="text-sm text-slate-500">
            Fleet defaults apply to every vehicle; catalog tasks add or override by model/year. Schedules merge both at bootstrap.
          </p>
        </div>
        {canMigrate && (
          <Button
            type="button"
            variant="outline"
            className="gap-2 border-slate-300"
            onClick={handleMigrate}
            disabled={migrating}
          >
            {migrating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
            Migrate KV logs
          </Button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
      )}

      <Tabs
        value={templateScopeTab}
        onValueChange={(v) => setTemplateScopeTab(v as "global" | "catalog")}
        className="w-full max-w-2xl"
      >
        <TabsList className="grid w-full max-w-md grid-cols-2 bg-slate-100/80 p-1 rounded-xl border border-slate-200/80">
          <TabsTrigger
            value="global"
            className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-slate-900 text-slate-600"
          >
            Fleet defaults
          </TabsTrigger>
          <TabsTrigger
            value="catalog"
            className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-slate-900 text-slate-600"
          >
            Per motor vehicle
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {templateScopeTab === "catalog" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl">
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-600">Motor vehicle (catalog)</Label>
            <Select
              value={selectedCatalogId}
              onValueChange={setSelectedCatalogId}
              disabled={loading || catalog.length === 0}
            >
              <SelectTrigger className="h-9 bg-white border-slate-300">
                <SelectValue placeholder="Select catalog row" />
              </SelectTrigger>
              <SelectContent>
                {catalog.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.make} {c.model} ({c.year})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <p className="text-sm text-slate-600">
              {templateScopeTab === "global" ? (
                <>
                  Fleet-wide tasks for <span className="font-medium text-slate-900">all vehicles</span>
                </>
              ) : (
                <>
                  Templates for: <span className="font-medium text-slate-900">{selectedVehicleLabel || "—"}</span>
                </>
              )}
            </p>
            <Button
              type="button"
              size="sm"
              className="gap-1"
              onClick={openCreate}
              disabled={templateScopeTab === "catalog" && !selectedCatalogId}
            >
              <Plus className="w-4 h-4" />
              Add task
            </Button>
          </div>
          {loadingTemplates ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task</TableHead>
                  <TableHead className="w-[120px]">Code</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead>Every (km)</TableHead>
                  <TableHead>Every (mo)</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead className="text-right w-[72px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-slate-500 py-10">
                      {templateScopeTab === "global"
                        ? "No fleet defaults yet. Add universal tasks (oil, filters, etc.)."
                        : "No templates yet. Add tasks that apply to this catalog entry."}
                    </TableCell>
                  </TableRow>
                ) : (
                  templates.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.task_name}</TableCell>
                      <TableCell className="text-xs text-slate-500 font-mono truncate max-w-[120px]" title={t.task_code ?? ""}>
                        {t.task_code?.trim() ? t.task_code : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">
                        {scheduleKindShort(t.frequency_kind)}
                        {t.frequency_label ? (
                          <span className="block text-[11px] text-slate-400 truncate max-w-[140px]" title={t.frequency_label}>
                            {t.frequency_label}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="tabular-nums">{formatIntervalMilesDisplay(t)}</TableCell>
                      <TableCell>{t.interval_months ?? "—"}</TableCell>
                      <TableCell className="capitalize">{t.priority}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Open row actions">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem className="gap-2" onClick={() => setViewing(t)}>
                              <Eye className="w-4 h-4" />
                              View
                            </DropdownMenuItem>
                            <DropdownMenuItem className="gap-2" onClick={() => openEdit(t)}>
                              <Pencil className="w-4 h-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="gap-2 text-red-600 focus:text-red-600"
                              onClick={() => handleDelete(t)}
                            >
                              <Trash2 className="w-4 h-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg bg-white max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit task" : "New task"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            {!editing && (
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-600">Quick fill</Label>
                <Select value={presetId} onValueChange={applyPreset}>
                  <SelectTrigger className="h-9 bg-slate-50 border-slate-200">
                    <SelectValue placeholder="Choose a preset…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None — enter manually</SelectItem>
                    {MAINTENANCE_SCHEDULE_PRESETS.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-slate-500 leading-snug">
                  Fills task name, checklist lines, km/month intervals, and sort order. Edit anything before saving.
                </p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Task name *</Label>
              <Input value={form.task_name} onChange={(e) => setForm((f) => ({ ...f, task_name: e.target.value }))} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600">Task code (optional)</Label>
              <Input
                value={form.task_code}
                onChange={(e) => setForm((f) => ({ ...f, task_code: e.target.value }))}
                className="h-9 font-mono text-sm"
                placeholder="e.g. oil_service_5k"
              />
              <p className="text-[11px] text-slate-500 leading-snug">
                Stable slug for bootstrap merge: catalog wins over fleet default when codes match.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Schedule type</Label>
                <Select
                  value={form.frequency_kind}
                  onValueChange={(v) => setForm((f) => ({ ...f, frequency_kind: v as MaintenanceFrequencyKind }))}
                >
                  <SelectTrigger className="h-9 bg-white border-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recurring">Recurring (repeat by interval)</SelectItem>
                    <SelectItem value="once_milestone">One-time milestone</SelectItem>
                    <SelectItem value="manual_only">Manual (no auto next due)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Service label (optional)</Label>
                <Input
                  className="h-9 bg-white border-slate-200"
                  placeholder="e.g. A-service, Inspection I"
                  value={form.frequency_label}
                  onChange={(e) => setForm((f) => ({ ...f, frequency_label: e.target.value }))}
                />
                <p className="text-[10px] text-slate-400 leading-snug">Display only; scheduling follows schedule type.</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between items-center gap-2">
                <Label className="text-xs">Checklist items</Label>
                <span className="text-xs text-slate-400 tabular-nums">
                  {checklistFilledCount}/{checklistLines.length}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-snug -mt-0.5">
                Use Quick fill or add lines below. Uncheck a row to remove it from the checklist.
              </p>
              <div className="rounded-lg border border-slate-200 bg-white p-3 flex flex-col max-h-[280px]">
                <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-[120px]">
                  {checklistLines.map((item, idx) => (
                    <div
                      key={`checklist-${idx}-${checklistLines.length}`}
                      className={`p-3 rounded-md border transition-all ${
                        item.trim()
                          ? "border-indigo-200 bg-indigo-50/50"
                          : "border-slate-100 bg-slate-50/80"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <Checkbox
                          id={`template-checklist-${idx}`}
                          checked={true}
                          onCheckedChange={(checked) => {
                            if (checked === false) removeChecklistLine(idx);
                          }}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <Label
                            htmlFor={`template-checklist-${idx}`}
                            className="sr-only"
                          >
                            Checklist item {idx + 1}
                          </Label>
                          <Input
                            value={item}
                            onChange={(e) => updateChecklistLine(idx, e.target.value)}
                            className="h-9 text-sm bg-white border-slate-200"
                            placeholder="e.g. Replace engine oil"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full gap-1.5 border-slate-200 text-slate-700"
                  onClick={addChecklistLine}
                >
                  <Plus className="w-4 h-4" />
                  Add checklist item
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Interval (km)</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={form.interval_miles}
                    onChange={(e) => setForm((f) => ({ ...f, interval_miles: e.target.value }))}
                    className="h-9 w-[100px] sm:w-[110px] tabular-nums"
                    placeholder="5000"
                    type="number"
                    min={0}
                  />
                  <span className="text-xs text-slate-500 shrink-0">to</span>
                  <Input
                    value={form.interval_miles_max}
                    onChange={(e) => setForm((f) => ({ ...f, interval_miles_max: e.target.value }))}
                    className="h-9 w-[100px] sm:w-[110px] tabular-nums"
                    placeholder="7500"
                    type="number"
                    min={0}
                    aria-label="Upper km (optional)"
                  />
                </div>
                <p className="text-[11px] text-slate-500 leading-snug">
                  Optional range. Leave the second box empty for a single interval. Next due starts at the lower km; overdue is after the upper km when set.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Interval (months)</Label>
                <Input
                  value={form.interval_months}
                  onChange={(e) => setForm((f) => ({ ...f, interval_months: e.target.value }))}
                  className="h-9"
                  placeholder="6"
                  type="number"
                />
              </div>
            </div>
            {form.frequency_kind === "manual_only" && (
              <p className="text-[11px] text-slate-500 leading-snug">
                Manual tasks may leave intervals empty; the system will not compute a next due date or odometer automatically.
              </p>
            )}
            {form.frequency_kind === "once_milestone" && (
              <p className="text-[11px] text-amber-800/90 bg-amber-50 border border-amber-100 rounded-md px-2 py-1.5 leading-snug">
                Set at least one interval (km or months) so the first milestone can be scheduled. After this service is logged once, the task is marked fulfilled.
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Priority</Label>
                <Select
                  value={form.priority}
                  onValueChange={(v) => setForm((f) => ({ ...f, priority: v as MaintenanceTaskTemplate["priority"] }))}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="optional">Optional</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Sort order</Label>
                <Input
                  value={form.sort_order}
                  onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))}
                  className="h-9"
                  type="number"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving} className="gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewing} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="sm:max-w-lg bg-white max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewing?.task_name ?? "Task"}</DialogTitle>
          </DialogHeader>
          {viewing ? (
            <div className="grid gap-3 py-1 text-sm text-slate-800">
              <div className="grid grid-cols-[120px_1fr] gap-x-2 gap-y-1">
                <span className="text-slate-500">Task code</span>
                <span className="font-mono text-xs">{viewing.task_code?.trim() || "—"}</span>
                <span className="text-slate-500">Scope</span>
                <span className="capitalize">{viewing.template_scope ?? "catalog"}</span>
                <span className="text-slate-500">Schedule type</span>
                <span>{scheduleKindFull(viewing.frequency_kind)}</span>
                <span className="text-slate-500">Service label</span>
                <span>{viewing.frequency_label?.trim() || "—"}</span>
                <span className="text-slate-500">Every (km)</span>
                <span className="tabular-nums">{formatIntervalMilesDisplay(viewing)}</span>
                <span className="text-slate-500">Every (mo)</span>
                <span className="tabular-nums">{viewing.interval_months ?? "—"}</span>
                <span className="text-slate-500">Priority</span>
                <span className="capitalize">{viewing.priority}</span>
                <span className="text-slate-500">Sort order</span>
                <span className="tabular-nums">{viewing.sort_order}</span>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-slate-500">Checklist</span>
                {viewing.description?.trim() ? (
                  <ul className="list-disc pl-5 space-y-1 text-slate-700">
                    {viewing.description.split("\n").filter((line) => line.trim()).map((line, i) => (
                      <li key={i}>{line.trim()}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-slate-400">—</p>
                )}
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setViewing(null)}>
              Close
            </Button>
            {viewing ? (
              <Button
                type="button"
                onClick={() => {
                  const row = viewing;
                  setViewing(null);
                  openEdit(row);
                }}
              >
                Edit
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
