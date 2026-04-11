import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, Plus, Trash2, Wrench, Database } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { listVehicleCatalog } from "../../../services/vehicleCatalogService";
import {
  createMaintenanceTemplate,
  deleteMaintenanceTemplate,
  listMaintenanceTemplates,
  migrateMaintenanceFromKv,
  updateMaintenanceTemplate,
} from "../../../services/maintenanceTemplateService";
import type { VehicleCatalogRecord } from "../../../types/vehicleCatalog";
import type { MaintenanceTaskTemplate } from "../../../types/maintenance";
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
import { Textarea } from "../../ui/textarea";
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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MaintenanceTaskTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [migrating, setMigrating] = useState(false);

  const [form, setForm] = useState({
    task_name: "",
    description: "",
    interval_miles: "",
    interval_months: "",
    priority: "standard" as MaintenanceTaskTemplate["priority"],
    sort_order: "0",
  });
  /** Create dialog only: which built-in interval preset was applied (optional). */
  const [presetId, setPresetId] = useState<string>("__none__");

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
      description: preset.items.join("\n"),
      interval_miles: String(preset.interval_miles),
      interval_months: String(preset.interval_months),
      priority: "standard",
      sort_order: String(preset.sort_order),
    });
  };

  const loadCatalog = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const items = await listVehicleCatalog(token);
      setCatalog(items);
      setSelectedCatalogId((prev) => (prev || (items[0]?.id ?? "")));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load catalog");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const loadTemplates = useCallback(async () => {
    if (!token || !selectedCatalogId) {
      setTemplates([]);
      return;
    }
    setLoadingTemplates(true);
    setError(null);
    try {
      const items = await listMaintenanceTemplates(token, selectedCatalogId);
      setTemplates(items);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load templates");
    } finally {
      setLoadingTemplates(false);
    }
  }, [token, selectedCatalogId]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

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
      description: "",
      interval_miles: "",
      interval_months: "",
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
      description: t.description ?? "",
      interval_miles: t.interval_miles != null ? String(t.interval_miles) : "",
      interval_months: t.interval_months != null ? String(t.interval_months) : "",
      priority: t.priority,
      sort_order: String(t.sort_order),
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!token || !selectedCatalogId) return;
    const task_name = form.task_name.trim();
    if (!task_name) {
      setError("Task name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        task_name,
        description: form.description.trim() || undefined,
        interval_miles: form.interval_miles.trim() === "" ? null : Number(form.interval_miles),
        interval_months: form.interval_months.trim() === "" ? null : Number(form.interval_months),
        priority: form.priority,
        sort_order: Number(form.sort_order) || 0,
      };
      if (editing) {
        await updateMaintenanceTemplate(token, editing.id, payload);
      } else {
        await createMaintenanceTemplate(token, selectedCatalogId, payload);
      }
      setDialogOpen(false);
      await loadTemplates();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
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
      setError(e instanceof Error ? e.message : "Delete failed");
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
      setError(e instanceof Error ? e.message : "Migration failed");
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
            Define mileage and time intervals per motor vehicle catalog entry. Fleet schedules bootstrap from these tasks.
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

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <p className="text-sm text-slate-600">
              Templates for: <span className="font-medium text-slate-900">{selectedVehicleLabel || "—"}</span>
            </p>
            <Button type="button" size="sm" className="gap-1" onClick={openCreate} disabled={!selectedCatalogId}>
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
                  <TableHead>Every (mi)</TableHead>
                  <TableHead>Every (mo)</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead className="text-right w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-slate-500 py-10">
                      No templates yet. Add tasks that apply to this catalog entry.
                    </TableCell>
                  </TableRow>
                ) : (
                  templates.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.task_name}</TableCell>
                      <TableCell>{t.interval_miles ?? "—"}</TableCell>
                      <TableCell>{t.interval_months ?? "—"}</TableCell>
                      <TableCell className="capitalize">{t.priority}</TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-1">
                          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(t)} title="Edit">
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-600"
                            onClick={() => handleDelete(t)}
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
                  Fills task name, checklist lines, mileage/month intervals, and sort order. Edit anything before saving.
                </p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Task name *</Label>
              <Input value={form.task_name} onChange={(e) => setForm((f) => ({ ...f, task_name: e.target.value }))} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description (checklist — one line per item)</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="min-h-[140px] text-sm resize-y bg-white border-slate-200"
                placeholder="e.g. pick Quick fill above, or type one checklist item per line"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Interval (miles)</Label>
                <Input
                  value={form.interval_miles}
                  onChange={(e) => setForm((f) => ({ ...f, interval_miles: e.target.value }))}
                  className="h-9"
                  placeholder="5000"
                  type="number"
                />
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
    </div>
  );
}
