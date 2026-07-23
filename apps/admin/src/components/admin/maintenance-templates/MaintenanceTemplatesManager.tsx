import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
  Wrench,
  Database,
} from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { listVehicleCatalog } from "../../../services/vehicleCatalogService";
import {
  createGlobalMaintenanceTemplate,
  createMaintenanceCategory,
  createMaintenanceTemplate,
  deleteMaintenanceCategory,
  deleteMaintenanceTemplate,
  listGlobalMaintenanceTemplates,
  listMaintenanceCategories,
  listMaintenanceTemplates,
  listPackageCategories,
  migrateMaintenanceFromKv,
  setPackageCategories,
  updateMaintenanceCategory,
  updateMaintenanceTemplate,
} from "../../../services/maintenanceTemplateService";
import { formatCatalogProductionSpan, type VehicleCatalogRecord } from "../../../types/vehicleCatalog";
import type {
  MaintenanceCategoryFieldSchema,
  MaintenanceCategoryKind,
  MaintenanceDueKind,
  MaintenanceFrequencyKind,
  MaintenancePackageCategory,
  MaintenanceServiceCategory,
  MaintenanceTaskTemplate,
} from "../../../types/maintenance";
import { groupCategoriesBySystem } from "../../../types/maintenance";
import { MAINTENANCE_SCHEDULE_PRESETS } from "../../../constants/maintenanceSchedulePresets";
import {
  inferPackageIconKey,
  MAINTENANCE_ICON_KEYS,
  PACKAGE_CATEGORY_CODES,
} from "../../../constants/maintenanceCategoryIcons";
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
import { MaintenanceIcon } from "./MaintenanceIcon";

type ScopeTab = "global" | "catalog" | "categories";
type FieldSchemaPreset = "simple" | "commercial";

const SIMPLE_FIELD_SCHEMA: MaintenanceCategoryFieldSchema = {
  fields: [
    { key: "material", type: "number", label: "Parts / materials", required: false },
    { key: "labor", type: "number", label: "Labor", required: false },
  ],
};

const COMMERCIAL_FIELD_SCHEMA: MaintenanceCategoryFieldSchema = {
  fields: [
    { key: "qty", type: "number", label: "Quantity", required: true },
    { key: "unit_price", type: "number", label: "Unit price", required: true },
    {
      key: "condition",
      type: "select",
      label: "Condition",
      required: false,
      options: ["new", "used"],
    },
    { key: "labor", type: "number", label: "Labor", required: false },
  ],
};

const EMPTY_FIELD_SCHEMA: MaintenanceCategoryFieldSchema = { fields: [] };

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

function dueKindLabel(k: MaintenanceDueKind | undefined): string {
  if (k === "statutory_inspection") return "Statutory inspection";
  return "Service package";
}

function formatIntervalMilesDisplay(
  t: Pick<MaintenanceTaskTemplate, "interval_miles" | "interval_miles_max">,
): string {
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

function detectFieldSchemaPreset(schema: MaintenanceCategoryFieldSchema | undefined): FieldSchemaPreset {
  const keys = new Set((schema?.fields ?? []).map((f) => f.key));
  if (keys.has("qty") || keys.has("unit_price") || keys.has("condition")) return "commercial";
  return "simple";
}

function summarizeFieldSchema(schema: MaintenanceCategoryFieldSchema | undefined): string {
  const fields = schema?.fields ?? [];
  if (fields.length === 0) return "No fields";
  return fields.map((f) => f.key).join(", ");
}

function resolveCategoryKind(c: MaintenanceServiceCategory): MaintenanceCategoryKind {
  if (c.kind === "system" || c.kind === "component") return c.kind;
  if (!c.parent_id && c.code?.startsWith("sys_")) return "system";
  return "component";
}

const TAB_TRIGGER_CLASS =
  "rounded-lg font-medium transition-colors text-slate-700 shadow-none border-0 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm dark:text-slate-300 dark:data-[state=active]:bg-amber-500/20 dark:data-[state=active]:text-amber-50 dark:data-[state=active]:shadow-none dark:data-[state=active]:ring-1 dark:data-[state=active]:ring-amber-400/45";

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
  const [categories, setCategories] = useState<MaintenanceServiceCategory[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [templateScopeTab, setTemplateScopeTab] = useState<ScopeTab>("global");
  const [expandedSystems, setExpandedSystems] = useState<Set<string>>(() => new Set());

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MaintenanceTaskTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [viewing, setViewing] = useState<MaintenanceTaskTemplate | null>(null);
  const [viewingCategories, setViewingCategories] = useState<MaintenancePackageCategory[]>([]);
  const [loadingViewCats, setLoadingViewCats] = useState(false);

  /** Ordered category ids included in the open package create/edit dialog. */
  const [packageCategoryIds, setPackageCategoryIds] = useState<string[]>([]);
  const [loadingPackageCats, setLoadingPackageCats] = useState(false);

  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<MaintenanceServiceCategory | null>(null);
  const [savingCategory, setSavingCategory] = useState(false);
  const [categoryForm, setCategoryForm] = useState({
    code: "",
    name: "",
    icon_key: "wrench",
    quick_job_eligible: false,
    sort_order: "0",
    schema_preset: "simple" as FieldSchemaPreset,
    kind: "component" as MaintenanceCategoryKind,
    parent_id: "",
    op_code: "",
  });

  const [form, setForm] = useState({
    task_name: "",
    task_code: "",
    icon_key: "wrench",
    interval_miles: "",
    interval_miles_max: "",
    interval_months: "",
    frequency_kind: "recurring" as MaintenanceFrequencyKind,
    frequency_label: "",
    due_kind: "service_package" as MaintenanceDueKind,
    priority: "standard" as MaintenanceTaskTemplate["priority"],
    sort_order: "0",
  });
  const [presetId, setPresetId] = useState<string>("__none__");

  const categoryTree = useMemo(() => groupCategoriesBySystem(categories), [categories]);

  const systemOptions = useMemo(
    () =>
      categories
        .filter((c) => resolveCategoryKind(c) === "system")
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
    [categories],
  );

  const loadCatalog = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const items = await listVehicleCatalog(token);
      setCatalog(items);
      setSelectedCatalogId((prev) => prev || items[0]?.id || "");
    } catch (e: unknown) {
      setError(formatCatchError(e, "Failed to load catalog"));
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadCategories = useCallback(async () => {
    if (!token) {
      setCategories([]);
      return;
    }
    setLoadingCategories(true);
    setError(null);
    try {
      const items = await listMaintenanceCategories(token);
      const sorted = items
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
      setCategories(sorted);
      setExpandedSystems((prev) => {
        const next = new Set(prev);
        for (const c of sorted) {
          if (resolveCategoryKind(c) === "system") next.add(c.id);
        }
        return next;
      });
    } catch (e: unknown) {
      setError(formatCatchError(e, "Could not load categories."));
    } finally {
      setLoadingCategories(false);
    }
  }, [token]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const loadTemplates = useCallback(async () => {
    if (!token) {
      setTemplates([]);
      return;
    }
    if (templateScopeTab === "categories") return;
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
      setError(
        formatCatchError(
          e,
          "Could not load templates. Please refresh the page. If it continues, contact support.",
        ),
      );
    } finally {
      setLoadingTemplates(false);
    }
  }, [token, selectedCatalogId, templateScopeTab]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    setDialogOpen(false);
    setCategoryDialogOpen(false);
    setViewing(null);
    setPackageCategoryIds([]);
  }, [templateScopeTab]);

  useEffect(() => {
    if (!viewing || !token) {
      setViewingCategories([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingViewCats(true);
      try {
        const items = await listPackageCategories(token, viewing.id);
        if (!cancelled) setViewingCategories(items);
      } catch (e: unknown) {
        if (!cancelled) {
          setViewingCategories([]);
          setError(formatCatchError(e, "Could not load package categories."));
        }
      } finally {
        if (!cancelled) setLoadingViewCats(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewing, token]);

  const selectedVehicleLabel = useMemo(() => {
    const row = catalog.find((c) => c.id === selectedCatalogId);
    if (!row) return "";
    return `${row.make} ${row.model} (${formatCatalogProductionSpan(row)})`;
  }, [catalog, selectedCatalogId]);

  const categoryIdsForPreset = (preset: string): string[] => {
    const codes = PACKAGE_CATEGORY_CODES[preset as "A" | "B" | "C" | "D"];
    if (!codes?.length) return [];
    const byCode = new Map(categories.map((c) => [c.code, c]));
    return codes
      .map((code) => byCode.get(code))
      .filter((c): c is MaintenanceServiceCategory => Boolean(c) && resolveCategoryKind(c) !== "system")
      .map((c) => c.id);
  };

  const toggleSystemExpanded = (systemId: string) => {
    setExpandedSystems((prev) => {
      const next = new Set(prev);
      if (next.has(systemId)) next.delete(systemId);
      else next.add(systemId);
      return next;
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
    const task_code = id.toLowerCase();
    setForm({
      task_name: shortName,
      task_code,
      icon_key: inferPackageIconKey(shortName, task_code),
      interval_miles: String(preset.interval_miles),
      interval_miles_max: "",
      interval_months: String(preset.interval_months),
      frequency_kind: "recurring",
      frequency_label: "",
      due_kind: "service_package",
      priority: "standard",
      sort_order: String(preset.sort_order),
    });
    setPackageCategoryIds(categoryIdsForPreset(id));
  };

  const openCreate = () => {
    setEditing(null);
    setPresetId("__none__");
    setPackageCategoryIds([]);
    setLoadingPackageCats(false);
    setForm({
      task_name: "",
      task_code: "",
      icon_key: "wrench",
      interval_miles: "",
      interval_miles_max: "",
      interval_months: "",
      frequency_kind: "recurring",
      frequency_label: "",
      due_kind: "service_package",
      priority: "standard",
      sort_order: String(templates.length),
    });
    setDialogOpen(true);
  };

  const openEdit = async (t: MaintenanceTaskTemplate) => {
    setEditing(t);
    setPresetId("__none__");
    setForm({
      task_name: t.task_name,
      task_code: t.task_code ?? "",
      icon_key: t.icon_key?.trim() || inferPackageIconKey(t.task_name, t.task_code),
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
      due_kind: t.due_kind ?? "service_package",
      priority: t.priority,
      sort_order: String(t.sort_order),
    });
    setPackageCategoryIds([]);
    setDialogOpen(true);
    if (!token) return;
    setLoadingPackageCats(true);
    setError(null);
    try {
      const items = await listPackageCategories(token, t.id);
      setPackageCategoryIds(
        items
          .slice()
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((m) => m.category_id),
      );
    } catch (e: unknown) {
      setPackageCategoryIds([]);
      setError(formatCatchError(e, "Could not load package categories."));
    } finally {
      setLoadingPackageCats(false);
    }
  };

  const togglePackageCategory = (categoryId: string, checked: boolean) => {
    setPackageCategoryIds((prev) => {
      if (checked) {
        if (prev.includes(categoryId)) return prev;
        return [...prev, categoryId];
      }
      return prev.filter((id) => id !== categoryId);
    });
  };

  const movePackageCategory = (categoryId: string, dir: -1 | 1) => {
    setPackageCategoryIds((prev) => {
      const idx = prev.indexOf(categoryId);
      if (idx < 0) return prev;
      const nextIdx = idx + dir;
      if (nextIdx < 0 || nextIdx >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.splice(nextIdx, 0, item);
      return next;
    });
  };

  const handleSave = async () => {
    if (!token) return;
    if (templateScopeTab === "catalog" && !selectedCatalogId) return;
    const task_name = form.task_name.trim();
    if (!task_name) {
      setError("Package name is required.");
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
      const interval_miles_max: number | null =
        milesHiRaw != null && Number.isFinite(milesHiRaw) && milesLo != null && milesHiRaw > milesLo
          ? milesHiRaw
          : null;

      const icon_key =
        form.icon_key.trim() ||
        inferPackageIconKey(task_name, form.task_code.trim() || null);

      const payload = {
        task_name,
        task_code: form.task_code.trim() || null,
        icon_key,
        interval_miles: milesLo,
        interval_miles_max,
        interval_months: form.interval_months.trim() === "" ? null : Number(form.interval_months),
        frequency_kind: form.frequency_kind,
        frequency_label: form.frequency_label.trim() || null,
        due_kind: form.due_kind,
        priority: form.priority,
        sort_order: Number(form.sort_order) || 0,
      };

      let saved: MaintenanceTaskTemplate;
      if (editing) {
        saved = await updateMaintenanceTemplate(token, editing.id, payload);
      } else if (templateScopeTab === "global") {
        saved = await createGlobalMaintenanceTemplate(token, payload);
      } else {
        saved = await createMaintenanceTemplate(token, selectedCatalogId, payload);
      }

      await setPackageCategories(token, saved.id, packageCategoryIds);
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
    if (!window.confirm(`Delete package "${t.task_name}"?`)) return;
    setError(null);
    try {
      await deleteMaintenanceTemplate(token, t.id);
      await loadTemplates();
    } catch (e: unknown) {
      setError(formatCatchError(e, "Delete failed"));
    }
  };

  const openCreateSystem = () => {
    setEditingCategory(null);
    setCategoryForm({
      code: "",
      name: "",
      icon_key: "wrench",
      quick_job_eligible: false,
      sort_order: String(systemOptions.length * 10),
      schema_preset: "simple",
      kind: "system",
      parent_id: "",
      op_code: "",
    });
    setCategoryDialogOpen(true);
  };

  const openCreateComponent = (parentId?: string) => {
    const defaultParent = parentId || systemOptions[0]?.id || "";
    setEditingCategory(null);
    setCategoryForm({
      code: "",
      name: "",
      icon_key: "wrench",
      quick_job_eligible: false,
      sort_order: "0",
      schema_preset: "simple",
      kind: "component",
      parent_id: defaultParent,
      op_code: "",
    });
    setCategoryDialogOpen(true);
  };

  const openEditCategory = (c: MaintenanceServiceCategory) => {
    const kind = resolveCategoryKind(c);
    setEditingCategory(c);
    setCategoryForm({
      code: c.code,
      name: c.name,
      icon_key: c.icon_key || "wrench",
      quick_job_eligible: c.quick_job_eligible,
      sort_order: String(c.sort_order),
      schema_preset: detectFieldSchemaPreset(c.field_schema),
      kind,
      parent_id: c.parent_id || "",
      op_code: c.op_code || "",
    });
    setCategoryDialogOpen(true);
  };

  const handleSaveCategory = async () => {
    if (!token) return;
    const code = categoryForm.code.trim();
    const name = categoryForm.name.trim();
    if (!code || !name) {
      setError("Code and name are required.");
      return;
    }
    if (categoryForm.kind === "component" && !categoryForm.parent_id) {
      setError("Components must belong to a system.");
      return;
    }
    setSavingCategory(true);
    setError(null);
    try {
      const isSystem = categoryForm.kind === "system";
      const field_schema = isSystem
        ? EMPTY_FIELD_SCHEMA
        : categoryForm.schema_preset === "commercial"
          ? COMMERCIAL_FIELD_SCHEMA
          : SIMPLE_FIELD_SCHEMA;
      const payload = {
        code,
        name,
        icon_key: categoryForm.icon_key || "wrench",
        quick_job_eligible: isSystem ? false : categoryForm.quick_job_eligible,
        sort_order: Number(categoryForm.sort_order) || 0,
        field_schema,
        kind: categoryForm.kind,
        parent_id: isSystem ? null : categoryForm.parent_id,
        op_code: categoryForm.op_code.trim() || null,
      };
      if (editingCategory) {
        await updateMaintenanceCategory(token, editingCategory.id, payload);
      } else {
        await createMaintenanceCategory(token, payload);
      }
      setCategoryDialogOpen(false);
      await loadCategories();
    } catch (e: unknown) {
      setError(formatCatchError(e, "Category save failed"));
    } finally {
      setSavingCategory(false);
    }
  };

  const handleDeleteCategory = async (c: MaintenanceServiceCategory) => {
    if (!token) return;
    const kind = resolveCategoryKind(c);
    const label = kind === "system" ? "system" : "component";
    if (
      !window.confirm(
        `Delete ${label} "${c.name}"?${
          kind === "system"
            ? " Components under it may become orphaned. Packages that use related components will lose those memberships."
            : " Packages that use it will lose this membership."
        }`,
      )
    ) {
      return;
    }
    setError(null);
    try {
      await deleteMaintenanceCategory(token, c.id);
      await loadCategories();
    } catch (e: unknown) {
      setError(formatCatchError(e, "Category delete failed"));
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

  const showPackages = templateScopeTab === "global" || templateScopeTab === "catalog";
  const editingKind = categoryForm.kind;
  const isEditingSystem = editingKind === "system";

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 text-slate-900">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Wrench className="w-5 h-5 text-amber-600" />
            Maintenance templates
          </h2>
          <p className="text-sm text-slate-500">
            Fleet packages and service categories power icon-driven logging. Catalog packages add or override by
            model/year.
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
        onValueChange={(v) => setTemplateScopeTab(v as ScopeTab)}
        className="w-full max-w-2xl"
      >
        {/*
          Admin shell uses `.dark`; base TabsTrigger applies dark:muted styles that fight light slate track.
          Explicit light + dark overrides keep contrast; active state uses amber to match Super Admin accents.
        */}
        <TabsList className="grid w-full max-w-xl grid-cols-3 rounded-xl border border-slate-200/90 bg-slate-100 p-1 dark:border-slate-600 dark:bg-slate-900/70">
          <TabsTrigger value="global" className={TAB_TRIGGER_CLASS}>
            Fleet defaults
          </TabsTrigger>
          <TabsTrigger value="catalog" className={TAB_TRIGGER_CLASS}>
            Per motor vehicle
          </TabsTrigger>
          <TabsTrigger value="categories" className={TAB_TRIGGER_CLASS}>
            Categories
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
                    {c.make} {c.model} ({formatCatalogProductionSpan(c)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {loading && showPackages ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
        </div>
      ) : showPackages ? (
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <p className="text-sm text-slate-600">
              {templateScopeTab === "global" ? (
                <>
                  Fleet-wide packages for <span className="font-medium text-slate-900">all vehicles</span>
                </>
              ) : (
                <>
                  Packages for:{" "}
                  <span className="font-medium text-slate-900">{selectedVehicleLabel || "—"}</span>
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
              Add package
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
                  <TableHead className="w-[48px]">Icon</TableHead>
                  <TableHead>Package</TableHead>
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
                    <TableCell colSpan={8} className="text-center text-slate-500 py-10">
                      {templateScopeTab === "global"
                        ? "No fleet packages yet. Add Basic / Intermediate / Major / Long-Term or custom packages."
                        : "No packages yet. Add packages that apply to this catalog entry."}
                    </TableCell>
                  </TableRow>
                ) : (
                  templates.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>
                        <MaintenanceIcon
                          iconKey={t.icon_key}
                          className="h-5 w-5 text-amber-600"
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        <button
                          type="button"
                          className="text-left hover:text-amber-700 hover:underline underline-offset-2"
                          onClick={() => void openEdit(t)}
                        >
                          {t.task_name}
                        </button>
                      </TableCell>
                      <TableCell
                        className="text-xs text-slate-500 font-mono truncate max-w-[120px]"
                        title={t.task_code ?? ""}
                      >
                        {t.task_code?.trim() ? t.task_code : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">
                        {scheduleKindShort(t.frequency_kind)}
                        {t.frequency_label ? (
                          <span
                            className="block text-[11px] text-slate-400 truncate max-w-[140px]"
                            title={t.frequency_label}
                          >
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
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label="Open row actions"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem className="gap-2" onClick={() => setViewing(t)}>
                              <Eye className="w-4 h-4" />
                              View
                            </DropdownMenuItem>
                            <DropdownMenuItem className="gap-2" onClick={() => void openEdit(t)}>
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
      ) : null}

      {templateScopeTab === "categories" && (
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3 border-b border-slate-100">
            <p className="text-sm text-slate-600">
              Garage taxonomy: systems (headers) and components (loggable lines)
            </p>
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant="outline" className="gap-1" onClick={openCreateSystem}>
                <Plus className="w-4 h-4" />
                Add System
              </Button>
              <Button
                type="button"
                size="sm"
                className="gap-1"
                onClick={() => openCreateComponent()}
                disabled={systemOptions.length === 0}
              >
                <Plus className="w-4 h-4" />
                Add Component
              </Button>
            </div>
          </div>
          {loadingCategories ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
            </div>
          ) : categoryTree.length === 0 ? (
            <p className="text-center text-slate-500 py-10 text-sm">
              No systems yet. Add a system, then add components under it.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]" />
                  <TableHead className="w-[48px]">Icon</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Op code</TableHead>
                  <TableHead>Quick job</TableHead>
                  <TableHead className="w-[80px]">Sort</TableHead>
                  <TableHead className="text-right w-[72px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categoryTree.map(({ system, components }) => {
                  const isSynthetic = system.id === "__other__";
                  const open = expandedSystems.has(system.id);
                  return (
                    <React.Fragment key={system.id}>
                      <TableRow className="bg-slate-50/80 hover:bg-slate-50">
                        <TableCell className="pr-0">
                          <button
                            type="button"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-200/60"
                            onClick={() => toggleSystemExpanded(system.id)}
                            aria-label={open ? "Collapse system" : "Expand system"}
                          >
                            {open ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </button>
                        </TableCell>
                        <TableCell>
                          <MaintenanceIcon iconKey={system.icon_key} className="h-5 w-5 text-amber-600" />
                        </TableCell>
                        <TableCell className="font-semibold text-slate-900">
                          {system.name}
                          <span className="ml-2 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                            System
                          </span>
                          <span className="ml-2 text-[11px] font-normal text-slate-400">
                            ({components.length})
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-slate-500">{system.code}</TableCell>
                        <TableCell className="font-mono text-xs text-slate-400">
                          {system.op_code?.trim() || "—"}
                        </TableCell>
                        <TableCell className="text-slate-400">—</TableCell>
                        <TableCell className="tabular-nums">{isSynthetic ? "—" : system.sort_order}</TableCell>
                        <TableCell className="text-right">
                          {!isSynthetic ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  aria-label="Open system actions"
                                >
                                  <MoreVertical className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem
                                  className="gap-2"
                                  onClick={() => openCreateComponent(system.id)}
                                >
                                  <Plus className="w-4 h-4" />
                                  Add component
                                </DropdownMenuItem>
                                <DropdownMenuItem className="gap-2" onClick={() => openEditCategory(system)}>
                                  <Pencil className="w-4 h-4" />
                                  Edit system
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="gap-2 text-red-600 focus:text-red-600"
                                  onClick={() => handleDeleteCategory(system)}
                                >
                                  <Trash2 className="w-4 h-4" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : null}
                        </TableCell>
                      </TableRow>
                      {open
                        ? components.map((c) => (
                            <TableRow key={c.id} className="bg-white">
                              <TableCell />
                              <TableCell className="pl-6">
                                <MaintenanceIcon iconKey={c.icon_key} className="h-5 w-5 text-amber-600" />
                              </TableCell>
                              <TableCell className="pl-2 font-medium text-slate-800">
                                <span className="text-slate-300 mr-1">└</span>
                                {c.name}
                              </TableCell>
                              <TableCell className="font-mono text-xs text-slate-500">{c.code}</TableCell>
                              <TableCell className="font-mono text-xs text-slate-500">
                                {c.op_code?.trim() || "—"}
                              </TableCell>
                              <TableCell>{c.quick_job_eligible ? "Yes" : "No"}</TableCell>
                              <TableCell className="tabular-nums">{c.sort_order}</TableCell>
                              <TableCell className="text-right">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      aria-label="Open component actions"
                                    >
                                      <MoreVertical className="w-4 h-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-40">
                                    <DropdownMenuItem className="gap-2" onClick={() => openEditCategory(c)}>
                                      <Pencil className="w-4 h-4" />
                                      Edit
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      className="gap-2 text-red-600 focus:text-red-600"
                                      onClick={() => handleDeleteCategory(c)}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                      Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            </TableRow>
                          ))
                        : null}
                      {open && components.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-slate-400 text-sm py-4">
                            No components in this system yet.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      {/* Package create/edit — intervals + categories in one dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-xl bg-white max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit package" : "New package"}</DialogTitle>
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
                  Fills name, icon, intervals, sort, and the categories checklist below.
                </p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Package name *</Label>
              <Input
                value={form.task_name}
                onChange={(e) => setForm((f) => ({ ...f, task_name: e.target.value }))}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600">Package code (optional)</Label>
              <Input
                value={form.task_code}
                onChange={(e) => setForm((f) => ({ ...f, task_code: e.target.value }))}
                className="h-9 font-mono text-sm"
                placeholder="e.g. basic / a"
              />
              <p className="text-[11px] text-slate-500 leading-snug">
                Stable slug for bootstrap merge: catalog wins over fleet default when codes match.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Icon</Label>
              <Select
                value={form.icon_key}
                onValueChange={(v) => setForm((f) => ({ ...f, icon_key: v }))}
              >
                <SelectTrigger className="h-9 bg-white border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MAINTENANCE_ICON_KEYS.map((key) => (
                    <SelectItem key={key} value={key}>
                      <span className="inline-flex items-center gap-2">
                        <MaintenanceIcon iconKey={key} className="h-4 w-4 text-slate-600" />
                        {key}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Schedule type</Label>
                <Select
                  value={form.frequency_kind}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, frequency_kind: v as MaintenanceFrequencyKind }))
                  }
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
                <Label className="text-xs">Due kind</Label>
                <Select
                  value={form.due_kind}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, due_kind: v as MaintenanceDueKind }))
                  }
                >
                  <SelectTrigger className="h-9 bg-white border-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="service_package">Service package</SelectItem>
                    <SelectItem value="statutory_inspection">Statutory inspection</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Service label (optional)</Label>
              <Input
                className="h-9 bg-white border-slate-200"
                placeholder="e.g. A-service, Inspection I"
                value={form.frequency_label}
                onChange={(e) => setForm((f) => ({ ...f, frequency_label: e.target.value }))}
              />
              <p className="text-[10px] text-slate-400 leading-snug">
                Display only; scheduling follows schedule type.
              </p>
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
                  Optional range. Leave the second box empty for a single interval.
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
                Manual packages may leave intervals empty; the system will not compute a next due date
                automatically.
              </p>
            )}
            {form.frequency_kind === "once_milestone" && (
              <p className="text-[11px] text-amber-800/90 bg-amber-50 border border-amber-100 rounded-md px-2 py-1.5 leading-snug">
                Set at least one interval (km or months) so the first milestone can be scheduled. After this
                service is logged once, the package is marked fulfilled.
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Priority</Label>
                <Select
                  value={form.priority}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, priority: v as MaintenanceTaskTemplate["priority"] }))
                  }
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

            <div className="space-y-2 border-t border-slate-100 pt-3 mt-1">
              <div>
                <Label className="text-xs font-semibold text-slate-800">Categories in this package</Label>
                <p className="text-[11px] text-slate-500 leading-snug mt-0.5">
                  Select components only. Systems are section headers. Order is the log order.
                </p>
              </div>
              {loadingPackageCats ? (
                <div className="flex items-center gap-2 text-slate-400 py-4 justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading categories…
                </div>
              ) : categoryTree.every((g) => g.components.length === 0) ? (
                <p className="text-sm text-slate-500 py-4 text-center">
                  No components yet. Add systems and components in the Categories tab first.
                </p>
              ) : (
                <div className="grid gap-3 max-h-[36vh] overflow-y-auto pr-1">
                  {categoryTree.map(({ system, components }) => {
                    if (components.length === 0) return null;
                    return (
                      <div key={system.id} className="space-y-1.5">
                        <div className="flex items-center gap-2 px-1 pt-1">
                          <MaintenanceIcon iconKey={system.icon_key} className="h-3.5 w-3.5 text-slate-400" />
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            {system.name}
                          </span>
                        </div>
                        {components.map((c) => {
                          const checked = packageCategoryIds.includes(c.id);
                          const orderIdx = packageCategoryIds.indexOf(c.id);
                          return (
                            <div
                              key={c.id}
                              className={`flex items-center gap-3 rounded-md border px-3 py-2 ${
                                checked
                                  ? "border-amber-200 bg-amber-50/40"
                                  : "border-slate-100 bg-slate-50/60"
                              }`}
                            >
                              <Checkbox
                                id={`pkg-dialog-cat-${c.id}`}
                                checked={checked}
                                onCheckedChange={(v) => togglePackageCategory(c.id, v === true)}
                              />
                              <MaintenanceIcon iconKey={c.icon_key} className="h-4 w-4 text-amber-600" />
                              <Label
                                htmlFor={`pkg-dialog-cat-${c.id}`}
                                className="flex-1 cursor-pointer font-medium"
                              >
                                {c.name}
                                <span className="ml-2 text-[11px] font-mono text-slate-400 font-normal">
                                  {c.op_code?.trim() || c.code}
                                </span>
                              </Label>
                              {checked ? (
                                <div className="flex items-center gap-1">
                                  <span className="text-[11px] tabular-nums text-slate-400 w-5 text-center">
                                    {orderIdx + 1}
                                  </span>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    disabled={orderIdx <= 0}
                                    onClick={() => movePackageCategory(c.id, -1)}
                                    aria-label="Move up"
                                  >
                                    ↑
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    disabled={orderIdx >= packageCategoryIds.length - 1}
                                    onClick={() => movePackageCategory(c.id, 1)}
                                    aria-label="Move down"
                                  >
                                    ↓
                                  </Button>
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving || loadingPackageCats}
              className="gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Package view */}
      <Dialog open={!!viewing} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="sm:max-w-lg bg-white max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {viewing ? (
                <MaintenanceIcon iconKey={viewing.icon_key} className="h-5 w-5 text-amber-600" />
              ) : null}
              {viewing?.task_name ?? "Package"}
            </DialogTitle>
          </DialogHeader>
          {viewing ? (
            <div className="grid gap-3 py-1 text-sm text-slate-800">
              <div className="grid grid-cols-[120px_1fr] gap-x-2 gap-y-1">
                <span className="text-slate-500">Package code</span>
                <span className="font-mono text-xs">{viewing.task_code?.trim() || "—"}</span>
                <span className="text-slate-500">Icon</span>
                <span className="font-mono text-xs">{viewing.icon_key?.trim() || "wrench"}</span>
                <span className="text-slate-500">Scope</span>
                <span className="capitalize">{viewing.template_scope ?? "catalog"}</span>
                <span className="text-slate-500">Schedule type</span>
                <span>{scheduleKindFull(viewing.frequency_kind)}</span>
                <span className="text-slate-500">Due kind</span>
                <span>{dueKindLabel(viewing.due_kind)}</span>
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
              <div className="space-y-1.5">
                <span className="text-xs text-slate-500">Categories in this package</span>
                {loadingViewCats ? (
                  <div className="flex items-center gap-2 text-slate-400 py-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading…
                  </div>
                ) : viewingCategories.length > 0 ? (
                  <ul className="space-y-1.5">
                    {viewingCategories
                      .slice()
                      .sort((a, b) => a.sort_order - b.sort_order)
                      .map((m) => {
                        const cat =
                          m.category ??
                          categories.find((c) => c.id === m.category_id);
                        return (
                          <li
                            key={m.id}
                            className="flex items-center gap-2 rounded-md border border-slate-100 bg-slate-50 px-2.5 py-1.5"
                          >
                            <MaintenanceIcon
                              iconKey={cat?.icon_key}
                              className="h-4 w-4 text-amber-600"
                            />
                            <span className="font-medium text-slate-800">
                              {cat?.name ?? m.category_id}
                            </span>
                            {cat?.op_code || cat?.code ? (
                              <span className="text-[11px] font-mono text-slate-400">
                                {cat.op_code?.trim() || cat.code}
                              </span>
                            ) : null}
                          </li>
                        );
                      })}
                  </ul>
                ) : (
                  <p className="text-slate-400">No categories assigned yet.</p>
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
                  void openEdit(row);
                }}
              >
                Edit
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Category create/edit */}
      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent className="sm:max-w-md bg-white max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingCategory
                ? isEditingSystem
                  ? "Edit system"
                  : "Edit component"
                : isEditingSystem
                  ? "New system"
                  : "New component"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Kind</Label>
              <Select
                value={categoryForm.kind}
                onValueChange={(v) => {
                  const kind = v as MaintenanceCategoryKind;
                  setCategoryForm((f) => ({
                    ...f,
                    kind,
                    parent_id: kind === "system" ? "" : f.parent_id || systemOptions[0]?.id || "",
                    quick_job_eligible: kind === "system" ? false : f.quick_job_eligible,
                  }));
                }}
                disabled={!!editingCategory}
              >
                <SelectTrigger className="h-9 bg-white border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">System (parent)</SelectItem>
                  <SelectItem value="component">Component (loggable)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {!isEditingSystem && (
              <div className="space-y-1.5">
                <Label className="text-xs">Parent system *</Label>
                <Select
                  value={categoryForm.parent_id || undefined}
                  onValueChange={(v) => setCategoryForm((f) => ({ ...f, parent_id: v }))}
                >
                  <SelectTrigger className="h-9 bg-white border-slate-200">
                    <SelectValue placeholder="Select system" />
                  </SelectTrigger>
                  <SelectContent>
                    {systemOptions.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {systemOptions.length === 0 ? (
                  <p className="text-[11px] text-amber-700 leading-snug">
                    Create a system first before adding components.
                  </p>
                ) : null}
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Code *</Label>
              <Input
                value={categoryForm.code}
                onChange={(e) => setCategoryForm((f) => ({ ...f, code: e.target.value }))}
                className="h-9 font-mono text-sm"
                placeholder={isEditingSystem ? "e.g. sys_engine" : "e.g. oil"}
                disabled={!!editingCategory}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Name *</Label>
              <Input
                value={categoryForm.name}
                onChange={(e) => setCategoryForm((f) => ({ ...f, name: e.target.value }))}
                className="h-9"
                placeholder={isEditingSystem ? "e.g. Engine" : "e.g. Oil & Filter"}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Op code (optional)</Label>
              <Input
                value={categoryForm.op_code}
                onChange={(e) => setCategoryForm((f) => ({ ...f, op_code: e.target.value }))}
                className="h-9 font-mono text-sm"
                placeholder="e.g. ENG-OIL"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Icon</Label>
              <Select
                value={categoryForm.icon_key}
                onValueChange={(v) => setCategoryForm((f) => ({ ...f, icon_key: v }))}
              >
                <SelectTrigger className="h-9 bg-white border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MAINTENANCE_ICON_KEYS.map((key) => (
                    <SelectItem key={key} value={key}>
                      <span className="inline-flex items-center gap-2">
                        <MaintenanceIcon iconKey={key} className="h-4 w-4 text-slate-600" />
                        {key}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!isEditingSystem && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="cat-quick-job"
                  checked={categoryForm.quick_job_eligible}
                  onCheckedChange={(v) =>
                    setCategoryForm((f) => ({ ...f, quick_job_eligible: v === true }))
                  }
                />
                <Label htmlFor="cat-quick-job" className="text-sm cursor-pointer">
                  Quick job eligible
                </Label>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Sort order</Label>
              <Input
                value={categoryForm.sort_order}
                onChange={(e) => setCategoryForm((f) => ({ ...f, sort_order: e.target.value }))}
                className="h-9"
                type="number"
              />
            </div>
            {!isEditingSystem && (
              <div className="space-y-1.5">
                <Label className="text-xs">Field schema</Label>
                <Select
                  value={categoryForm.schema_preset}
                  onValueChange={(v) =>
                    setCategoryForm((f) => ({ ...f, schema_preset: v as FieldSchemaPreset }))
                  }
                >
                  <SelectTrigger className="h-9 bg-white border-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="simple">Simple — material, labor</SelectItem>
                    <SelectItem value="commercial">Commercial — qty, unit price, condition, labor</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-slate-500 font-mono leading-snug break-all">
                  {summarizeFieldSchema(
                    categoryForm.schema_preset === "commercial"
                      ? COMMERCIAL_FIELD_SCHEMA
                      : SIMPLE_FIELD_SCHEMA,
                  )}
                </p>
                {editingCategory ? (
                  <p className="text-[11px] text-slate-400 leading-snug">
                    Saving replaces the field schema with the selected preset.
                  </p>
                ) : null}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCategoryDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSaveCategory}
              disabled={
                savingCategory ||
                (!isEditingSystem && !categoryForm.parent_id && systemOptions.length === 0)
              }
              className="gap-2"
            >
              {savingCategory && <Loader2 className="w-4 h-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
