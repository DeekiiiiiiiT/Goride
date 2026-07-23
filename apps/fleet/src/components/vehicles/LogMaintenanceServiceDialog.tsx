import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Scan,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Checkbox } from "../ui/checkbox";
import { toast } from "sonner@2.0.3";
import { api } from "../../services/api";
import { uploadEvidenceFile } from "../../services/uploadEvidence";
import { requireAuthHeaders } from "../../utils/authHeaders";
import { API_ENDPOINTS } from "../../services/apiConfig";
import { MAINTENANCE_SCHEDULE_PRESETS } from "../../constants/maintenanceSchedulePresets";
import { inferPackageIconKey } from "../../constants/maintenanceCategoryIcons";
import { MaintenanceIcon } from "./MaintenanceIcon";
import type {
  CatalogMaintenanceTaskOption,
  MaintenanceCategoryFieldDef,
  MaintenanceLog,
  MaintenanceLogLine,
  MaintenanceServiceCategory,
} from "../../types/maintenance";
import { sumMaintenanceLogLines } from "../../types/maintenance";

type DialogStep = "pick" | "categories" | "form" | "review";
type LogMode = "package" | "quick_job";

type PackageChoice = {
  id: string;
  label: string;
  shortLabel: string;
  iconKey: string;
  templateId?: string;
  categories: MaintenanceServiceCategory[];
};

export interface LogMaintenanceServiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleId: string;
  catalogTemplates: CatalogMaintenanceTaskOption[];
  /** Prefill odometer (e.g. fleet canonical reading). */
  defaultOdo?: number;
  /** When set, PATCH this record (e.g. complete a driver Requested row). */
  initialLog?: Partial<MaintenanceLog> | null;
  onSaved?: () => void;
}

function stripEverySuffix(label: string): string {
  return label.replace(/\s*\(Every[^)]*\)\s*$/i, "").trim() || label;
}

function defaultFieldSchema(): MaintenanceServiceCategory["field_schema"] {
  return {
    fields: [
      { key: "material", type: "number", label: "Parts / materials", required: false },
      { key: "labor", type: "number", label: "Labor", required: false },
    ],
  };
}

function syntheticCategoriesFromNames(names: string[]): MaintenanceServiceCategory[] {
  return names.map((name, index) => ({
    id: `synthetic-${index}-${name}`,
    code: `synthetic_${index}`,
    name,
    icon_key: "wrench",
    field_schema: defaultFieldSchema(),
    quick_job_eligible: false,
    sort_order: index,
    created_at: "",
    updated_at: "",
  }));
}

function packageFromCatalog(t: CatalogMaintenanceTaskOption): PackageChoice {
  const cats =
    t.categories && t.categories.length > 0
      ? t.categories
      : syntheticCategoriesFromNames(t.checklistLines);
  return {
    id: t.templateId,
    label: t.label,
    shortLabel: stripEverySuffix(t.label),
    iconKey: t.iconKey || inferPackageIconKey(t.label),
    templateId: t.templateId,
    categories: cats,
  };
}

function packageFromPreset(p: (typeof MAINTENANCE_SCHEDULE_PRESETS)[number]): PackageChoice {
  return {
    id: `preset-${p.id}`,
    label: p.label,
    shortLabel: stripEverySuffix(p.label),
    iconKey: inferPackageIconKey(p.label, p.id),
    templateId: undefined,
    categories: syntheticCategoriesFromNames(p.items),
  };
}

function emptyValuesForCategory(cat: MaintenanceServiceCategory): Record<string, string | number | boolean | null> {
  const values: Record<string, string | number | boolean | null> = {};
  for (const field of cat.field_schema?.fields || []) {
    if (field.type === "boolean") values[field.key] = false;
    else if (field.type === "number") {
      // Prefill qty=1 for tires (and similar qty fields on tire categories)
      if (field.key === "qty" && (cat.code === "tires" || cat.icon_key === "tires")) {
        values[field.key] = 1;
      } else {
        values[field.key] = null;
      }
    } else if (field.type === "select") {
      values[field.key] = field.options?.[0] ?? null;
    } else {
      values[field.key] = "";
    }
  }
  return values;
}

function numFrom(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function lineFromCategoryValues(
  cat: MaintenanceServiceCategory,
  values: Record<string, string | number | boolean | null>,
): MaintenanceLogLine {
  const isSynthetic = cat.id.startsWith("synthetic-");
  const conditionRaw = values.condition;
  return {
    categoryId: isSynthetic ? undefined : cat.id,
    categoryCode: cat.code,
    categoryName: cat.name,
    qty: numFrom(values.qty),
    unitPrice: numFrom(values.unit_price),
    material: numFrom(values.material),
    labor: numFrom(values.labor),
    condition:
      typeof conditionRaw === "string" && conditionRaw
        ? conditionRaw
        : undefined,
    notes: typeof values.notes === "string" ? values.notes : undefined,
    values: { ...values },
  };
}

function lineTotalPreview(line: MaintenanceLogLine): number {
  return sumMaintenanceLogLines([line]);
}

function stepTitle(step: DialogStep): string {
  switch (step) {
    case "pick":
      return "Add Service Log";
    case "categories":
      return "Select Categories";
    case "form":
      return "Category Details";
    case "review":
      return "Review & Save";
    default:
      return "Add Service Log";
  }
}

function stepDescription(step: DialogStep, packageLabel?: string): string {
  switch (step) {
    case "pick":
      return "Choose a service package or a quick job.";
    case "categories":
      return packageLabel
        ? `Tap categories to log for ${packageLabel}.`
        : "Select the work performed.";
    case "form":
      return "Enter commercial details for this category.";
    case "review":
      return "Confirm totals, odometer, and provider before saving.";
    default:
      return "";
  }
}

export function LogMaintenanceServiceDialog({
  open,
  onOpenChange,
  vehicleId,
  catalogTemplates,
  defaultOdo,
  initialLog,
  onSaved,
}: LogMaintenanceServiceDialogProps) {
  const [step, setStep] = useState<DialogStep>("pick");
  const [isLoading, setIsLoading] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [quickJobsLoading, setQuickJobsLoading] = useState(false);
  const [quickJobs, setQuickJobs] = useState<MaintenanceServiceCategory[]>([]);

  const [logMode, setLogMode] = useState<LogMode>("package");
  const [selectedPackage, setSelectedPackage] = useState<PackageChoice | null>(null);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<MaintenanceServiceCategory | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string | number | boolean | null>>({});
  const [lines, setLines] = useState<MaintenanceLogLine[]>([]);
  const [markPackageComplete, setMarkPackageComplete] = useState(true);

  const [formMeta, setFormMeta] = useState({
    date: new Date().toISOString().split("T")[0],
    type: "Regular Maintenance",
    currency: "JMD",
    odo: 0,
    provider: "",
    notes: "",
    invoiceUrl: "",
    id: undefined as string | undefined,
  });
  const [pendingInvoiceFile, setPendingInvoiceFile] = useState<File | null>(null);

  const packageChoices = useMemo((): PackageChoice[] => {
    if (catalogTemplates.length > 0) {
      return catalogTemplates.map(packageFromCatalog);
    }
    return MAINTENANCE_SCHEDULE_PRESETS.map(packageFromPreset);
  }, [catalogTemplates]);

  const totalCost = useMemo(() => sumMaintenanceLogLines(lines), [lines]);

  const draftLine = useMemo(() => {
    if (!activeCategory) return null;
    return lineFromCategoryValues(activeCategory, fieldValues);
  }, [activeCategory, fieldValues]);

  const draftLineTotal = draftLine ? lineTotalPreview(draftLine) : 0;

  // Reset + load quick jobs when dialog opens
  useEffect(() => {
    if (!open) return;

    const odoPrefill =
      initialLog?.odo ??
      (defaultOdo != null && Number.isFinite(defaultOdo) ? defaultOdo : 0);

    setFormMeta({
      date: initialLog?.date || new Date().toISOString().split("T")[0],
      type: initialLog?.type || "Regular Maintenance",
      currency: initialLog?.currency || "JMD",
      odo: odoPrefill,
      provider: initialLog?.provider || "",
      notes: initialLog?.notes || "",
      invoiceUrl: initialLog?.invoiceUrl || "",
      id: initialLog?.id,
    });
    setPendingInvoiceFile(null);
    setMarkPackageComplete(true);
    setFieldValues({});
    setActiveCategory(null);
    setSelectedCategoryIds([]);

    const existingLines = initialLog?.lines?.length ? [...initialLog.lines] : [];
    setLines(existingLines);

    const hasTemplate = Boolean(initialLog?.templateId);
    const mode: LogMode =
      initialLog?.logMode === "quick_job"
        ? "quick_job"
        : hasTemplate || initialLog?.logMode === "package"
          ? "package"
          : existingLines.length
            ? (initialLog?.logMode as LogMode) || "quick_job"
            : "package";
    setLogMode(mode);

    if (hasTemplate) {
      const pkg =
        packageChoices.find((p) => p.templateId === initialLog?.templateId) ||
        null;
      setSelectedPackage(pkg);
    } else {
      setSelectedPackage(null);
    }

    if (existingLines.length > 0) {
      setStep("review");
      if (existingLines.length === 1 && mode === "quick_job") {
        setFormMeta((prev) => ({
          ...prev,
          type: existingLines[0].categoryName || prev.type,
        }));
      }
    } else {
      setStep("pick");
    }

    let cancelled = false;
    setQuickJobsLoading(true);
    api
      .listQuickJobCategories()
      .then((res) => {
        if (!cancelled) setQuickJobs(res.items || []);
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) {
          setQuickJobs([]);
          toast.error("Could not load quick jobs");
        }
      })
      .finally(() => {
        if (!cancelled) setQuickJobsLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when dialog opens
  }, [open, vehicleId, defaultOdo, catalogTemplates, initialLog]);

  const openCategoryForm = (cat: MaintenanceServiceCategory) => {
    const existing = lines.find(
      (l) =>
        (l.categoryId && l.categoryId === cat.id) ||
        (!l.categoryId && l.categoryCode === cat.code && l.categoryName === cat.name),
    );
    setActiveCategory(cat);
    setFieldValues(
      existing?.values
        ? { ...emptyValuesForCategory(cat), ...existing.values }
        : emptyValuesForCategory(cat),
    );
    setStep("form");
  };

  const handlePickPackage = (pkg: PackageChoice) => {
    setLogMode("package");
    setSelectedPackage(pkg);
    setSelectedCategoryIds([]);
    setLines([]);
    setFormMeta((prev) => ({ ...prev, type: pkg.label }));
    setStep("categories");
  };

  const handlePickQuickJob = (cat: MaintenanceServiceCategory) => {
    setLogMode("quick_job");
    setSelectedPackage(null);
    setSelectedCategoryIds([cat.id]);
    setLines([]);
    setFormMeta((prev) => ({ ...prev, type: cat.name }));
    openCategoryForm(cat);
  };

  const handleCategoryTap = (cat: MaintenanceServiceCategory) => {
    setSelectedCategoryIds((prev) =>
      prev.includes(cat.id) ? prev : [...prev, cat.id],
    );
    openCategoryForm(cat);
  };

  const toggleCategorySelected = (catId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedCategoryIds((prev) =>
      prev.includes(catId) ? prev.filter((id) => id !== catId) : [...prev, catId],
    );
  };

  const handleSaveCategory = () => {
    if (!activeCategory) return;
    const line = lineFromCategoryValues(activeCategory, fieldValues);
    setLines((prev) => {
      const without = prev.filter(
        (l) =>
          !(
            (l.categoryId && l.categoryId === activeCategory.id) ||
            (!l.categoryId &&
              l.categoryCode === activeCategory.code &&
              l.categoryName === activeCategory.name)
          ),
      );
      return [...without, line];
    });
    setSelectedCategoryIds((prev) =>
      prev.includes(activeCategory.id) ? prev : [...prev, activeCategory.id],
    );

    if (logMode === "quick_job") {
      setFormMeta((prev) => ({ ...prev, type: activeCategory.name }));
      setActiveCategory(null);
      setStep("review");
      return;
    }

    setActiveCategory(null);
    setStep("categories");
  };

  const handleContinueFromCategories = () => {
    if (!selectedPackage || selectedCategoryIds.length < 1) return;
    const cats = selectedPackage.categories;
    const nextNeedingForm = selectedCategoryIds
      .map((id) => cats.find((c) => c.id === id))
      .filter(Boolean)
      .find((cat) => {
        if (!cat) return false;
        return !lines.some(
          (l) =>
            (l.categoryId && l.categoryId === cat.id) ||
            (!l.categoryId && l.categoryCode === cat.code && l.categoryName === cat.name),
        );
      });

    if (nextNeedingForm) {
      openCategoryForm(nextNeedingForm);
      return;
    }
    setStep("review");
  };

  const handleServiceScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setScanLoading(true);
    setPendingInvoiceFile(file);
    try {
      const scanFormData = new FormData();
      scanFormData.append("file", file);

      const response = await fetch(`${API_ENDPOINTS.ai}/parse-invoice`, {
        method: "POST",
        headers: await requireAuthHeaders(null),
        body: scanFormData,
      });

      const result = await response.json();

      if (result.success && result.data) {
        setFormMeta((prev) => ({
          ...prev,
          date: result.data.date || prev.date,
          type: result.data.type || prev.type,
          odo: result.data.odometer ? Number(result.data.odometer) : prev.odo,
          notes: result.data.notes || prev.notes,
          provider: result.data.vendor || prev.provider,
          invoiceUrl: URL.createObjectURL(file),
        }));
        toast.success("Invoice scanned successfully!");
      } else {
        toast.error("Failed to extract data from invoice");
      }
    } catch (err) {
      console.error(err);
      toast.error("Error scanning invoice");
    } finally {
      setScanLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formMeta.date) {
      toast.error("Please fill in required fields");
      return;
    }
    if (!lines.length) {
      toast.error("Add at least one category line before saving");
      return;
    }

    setIsLoading(true);
    try {
      const logId = formMeta.id || crypto.randomUUID();
      let invoiceUrl = formMeta.invoiceUrl;
      if (pendingInvoiceFile) {
        const uploadRes = await uploadEvidenceFile(pendingInvoiceFile, {
          evidenceType: "maintenance_invoice",
          sourceType: "maintenance_log",
          sourceId: logId,
          retentionClass: "ephemeral",
          parentStatus: "Pending",
        });
        invoiceUrl = uploadRes.url;
      }

      // Default package visit advances schedule (logMode=package + templateId).
      // Unchecking "Mark package complete" saves lines without advancing schedule.
      const advanceSchedule = logMode === "package" && markPackageComplete;
      const templateId = advanceSchedule
        ? selectedPackage?.templateId || initialLog?.templateId
        : undefined;

      const packageLabel = selectedPackage?.label;
      const typeLabel =
        logMode === "package"
          ? packageLabel || formMeta.type || "Regular Maintenance"
          : lines[0]?.categoryName || formMeta.type;

      const payload = {
        ...formMeta,
        vehicleId,
        id: logId,
        invoiceUrl,
        lines,
        cost: sumMaintenanceLogLines(lines),
        currency: formMeta.currency || "JMD",
        odo: Number(formMeta.odo) || 0,
        status: "Completed" as const,
        logMode: advanceSchedule ? ("package" as const) : ("quick_job" as const),
        ...(advanceSchedule && templateId ? { templateId } : {}),
        type: typeLabel,
        checklist: lines.map((l) => l.categoryName),
      };

      const result = initialLog?.id
        ? await api.updateMaintenanceLog(vehicleId, logId, payload)
        : await api.saveMaintenanceLog(payload);
      if (result.ledgerWarning) {
        toast.warning(result.ledgerWarning);
      } else {
        toast.success(
          result.ledgerPosted
            ? "Service saved and posted to Business Finance"
            : "Service log saved",
        );
      }
      onOpenChange(false);
      onSaved?.();
    } catch (error) {
      console.error(error);
      toast.error("Failed to save service log");
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    if (step === "pick") {
      onOpenChange(false);
      return;
    }
    if (step === "categories") {
      setStep("pick");
      return;
    }
    if (step === "form") {
      if (logMode === "quick_job") {
        setActiveCategory(null);
        setStep("pick");
      } else {
        setActiveCategory(null);
        setStep("categories");
      }
      return;
    }
    if (step === "review") {
      if (logMode === "quick_job") {
        const cat =
          quickJobs.find((c) => c.id === selectedCategoryIds[0]) ||
          (lines[0]
            ? ({
                id: lines[0].categoryId || selectedCategoryIds[0] || "qj",
                code: lines[0].categoryCode,
                name: lines[0].categoryName,
                icon_key: "wrench",
                field_schema: defaultFieldSchema(),
                quick_job_eligible: true,
                sort_order: 0,
                created_at: "",
                updated_at: "",
              } satisfies MaintenanceServiceCategory)
            : null);
        if (cat) openCategoryForm(cat);
        else setStep("pick");
      } else if (selectedPackage) {
        setStep("categories");
      } else {
        setStep("pick");
      }
    }
  };

  const setFieldValue = (key: string, value: string | number | boolean | null) => {
    setFieldValues((prev) => ({ ...prev, [key]: value }));
  };

  const renderField = (field: MaintenanceCategoryFieldDef) => {
    const id = `cat-field-${field.key}`;
    if (field.type === "boolean") {
      return (
        <div key={field.key} className="flex items-center gap-3 py-1">
          <Checkbox
            id={id}
            checked={Boolean(fieldValues[field.key])}
            onCheckedChange={(checked) => setFieldValue(field.key, checked === true)}
          />
          <Label htmlFor={id} className="cursor-pointer font-medium">
            {field.label}
            {field.required ? " *" : ""}
          </Label>
        </div>
      );
    }
    if (field.type === "select") {
      const raw = fieldValues[field.key];
      const selectVal = raw == null || raw === "" ? undefined : String(raw);
      return (
        <div key={field.key} className="space-y-2">
          <Label htmlFor={id}>
            {field.label}
            {field.required ? " *" : ""}
          </Label>
          <Select
            value={selectVal}
            onValueChange={(v) => setFieldValue(field.key, v)}
          >
            <SelectTrigger id={id} className="bg-slate-50 border-slate-200">
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              {(field.options || ["new", "used"]).map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }
    if (field.type === "number") {
      const raw = fieldValues[field.key];
      return (
        <div key={field.key} className="space-y-2">
          <Label htmlFor={id}>
            {field.label}
            {field.required ? " *" : ""}
          </Label>
          <Input
            id={id}
            type="number"
            className="bg-slate-50 border-slate-200"
            value={raw == null || raw === "" ? "" : String(raw)}
            onChange={(e) => {
              const v = e.target.value;
              setFieldValue(field.key, v === "" ? null : Number(v));
            }}
          />
        </div>
      );
    }
    const raw = fieldValues[field.key];
    return (
      <div key={field.key} className="space-y-2">
        <Label htmlFor={id}>
          {field.label}
          {field.required ? " *" : ""}
        </Label>
        <Input
          id={id}
          type="text"
          className="bg-slate-50 border-slate-200"
          value={raw == null ? "" : String(raw)}
          onChange={(e) => setFieldValue(field.key, e.target.value)}
        />
      </div>
    );
  };

  const categoryHasLine = (cat: MaintenanceServiceCategory) =>
    lines.some(
      (l) =>
        (l.categoryId && l.categoryId === cat.id) ||
        (!l.categoryId && l.categoryCode === cat.code && l.categoryName === cat.name),
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px] max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle>{stepTitle(step)}</DialogTitle>
          <DialogDescription>
            {stepDescription(step, selectedPackage?.shortLabel)}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {step === "pick" && (
            <div className="space-y-8">
              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-900">Service packages</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {packageChoices.map((pkg) => (
                    <button
                      key={pkg.id}
                      type="button"
                      onClick={() => handlePickPackage(pkg)}
                      className="flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors text-center min-h-[108px]"
                    >
                      <div className="bg-slate-100 p-3 rounded-xl text-indigo-600">
                        <MaintenanceIcon iconKey={pkg.iconKey} className="w-6 h-6" />
                      </div>
                      <span className="text-sm font-medium text-slate-900 leading-tight">
                        {pkg.shortLabel}
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-900">Quick jobs</h3>
                {quickJobsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500 py-6 justify-center">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading quick jobs…
                  </div>
                ) : quickJobs.length === 0 ? (
                  <p className="text-sm text-slate-500 py-2">No quick jobs available.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {quickJobs.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => handlePickQuickJob(cat)}
                        className="flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors text-center min-h-[108px]"
                      >
                        <div className="bg-slate-100 p-3 rounded-xl text-indigo-600">
                          <MaintenanceIcon iconKey={cat.icon_key} className="w-6 h-6" />
                        </div>
                        <span className="text-sm font-medium text-slate-900 leading-tight">
                          {cat.name}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {step === "categories" && selectedPackage && (
            <div className="space-y-4">
              <p className="text-sm text-slate-500">
                Selected: {selectedCategoryIds.length} · Logged: {lines.length}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {selectedPackage.categories.map((cat) => {
                  const selected = selectedCategoryIds.includes(cat.id);
                  const logged = categoryHasLine(cat);
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => handleCategoryTap(cat)}
                      className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors text-center min-h-[108px] ${
                        selected || logged
                          ? "border-indigo-300 bg-indigo-50/50"
                          : "border-slate-200 bg-white hover:border-indigo-200 hover:bg-slate-50"
                      }`}
                    >
                      {(selected || logged) && (
                        <span
                          role="presentation"
                          onClick={(e) => toggleCategorySelected(cat.id, e)}
                          className="absolute top-2 right-2 text-indigo-600"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </span>
                      )}
                      <div className="bg-white p-3 rounded-xl shadow-sm text-indigo-600">
                        <MaintenanceIcon iconKey={cat.icon_key} className="w-6 h-6" />
                      </div>
                      <span className="text-sm font-medium text-slate-900 leading-tight">
                        {cat.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === "form" && activeCategory && (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="bg-indigo-50 p-3 rounded-xl text-indigo-600">
                  <MaintenanceIcon iconKey={activeCategory.icon_key} className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">{activeCategory.name}</h3>
                  <p className="text-xs text-slate-500">{activeCategory.code}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {(activeCategory.field_schema?.fields || defaultFieldSchema().fields).map(renderField)}
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 flex justify-between items-center">
                <span className="text-sm text-slate-600">Line total</span>
                <span className="font-semibold text-slate-900">
                  {formMeta.currency || "JMD"} {draftLineTotal.toLocaleString()}
                </span>
              </div>
            </div>
          )}

          {step === "review" && (
            <div className="space-y-6">
              <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 flex flex-col items-center justify-center bg-slate-50 relative group hover:bg-slate-100 transition-colors">
                <Input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={handleServiceScan}
                  disabled={scanLoading}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div className="bg-white p-3 rounded-xl shadow-sm mb-3">
                  {scanLoading ? (
                    <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                  ) : (
                    <Scan className="w-6 h-6 text-indigo-600" />
                  )}
                </div>
                <h3 className="font-semibold text-slate-900">Scan Invoice / Receipt</h3>
                <p className="text-sm text-slate-500">Optional — upload image or PDF to auto-fill</p>
                {formMeta.invoiceUrl && (
                  <div className="absolute top-4 right-4 bg-emerald-100 text-emerald-700 text-xs px-2 py-1 rounded flex items-center">
                    <CheckCircle2 className="w-3 h-3 mr-1" /> Uploaded
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={formMeta.date}
                    onChange={(e) => setFormMeta({ ...formMeta, date: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Odometer (km)</Label>
                  <Input
                    type="number"
                    className="bg-slate-50 font-medium"
                    value={formMeta.odo || ""}
                    onChange={(e) =>
                      setFormMeta({ ...formMeta, odo: parseFloat(e.target.value) || 0 })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Service Provider</Label>
                  <Input
                    className="bg-slate-50"
                    value={formMeta.provider}
                    onChange={(e) => setFormMeta({ ...formMeta, provider: e.target.value })}
                    placeholder="e.g. Whole-Heated Car Service LTD"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Currency</Label>
                  <Select
                    value={formMeta.currency || "JMD"}
                    onValueChange={(v) => setFormMeta({ ...formMeta, currency: v })}
                  >
                    <SelectTrigger className="bg-slate-50 font-medium">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="JMD">JMD</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  className="bg-slate-50 border-slate-200 min-h-[80px]"
                  placeholder="Inspection notes, recommendations…"
                  value={formMeta.notes}
                  onChange={(e) => setFormMeta({ ...formMeta, notes: e.target.value })}
                />
              </div>

              <div className="space-y-3">
                <Label className="font-semibold">Line items</Label>
                <div className="border rounded-lg divide-y bg-white">
                  {lines.map((line, idx) => (
                    <div
                      key={`${line.categoryCode}-${idx}`}
                      className="flex items-center justify-between px-4 py-3 gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {line.categoryName}
                        </p>
                        <p className="text-xs text-slate-500">
                          {[
                            line.qty != null ? `Qty ${line.qty}` : null,
                            line.condition ? String(line.condition) : null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || line.categoryCode}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-sm font-medium text-slate-900">
                          {formMeta.currency || "JMD"}{" "}
                          {lineTotalPreview(line).toLocaleString()}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-xs text-slate-500"
                          onClick={() => {
                            const pkgCat = selectedPackage?.categories.find(
                              (c) =>
                                c.id === line.categoryId ||
                                (c.code === line.categoryCode && c.name === line.categoryName),
                            );
                            const qj = quickJobs.find((c) => c.id === line.categoryId);
                            const cat = pkgCat || qj;
                            if (cat) openCategoryForm(cat);
                          }}
                        >
                          Edit
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between items-center px-1 pt-1">
                  <span className="text-sm font-semibold text-slate-700">Total</span>
                  <span className="text-base font-semibold text-slate-900">
                    {formMeta.currency || "JMD"} {totalCost.toLocaleString()}
                  </span>
                </div>
              </div>

              {logMode === "package" && (
                <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <Checkbox
                    id="mark-package-complete"
                    checked={markPackageComplete}
                    onCheckedChange={(checked) => setMarkPackageComplete(checked === true)}
                  />
                  <Label htmlFor="mark-package-complete" className="cursor-pointer">
                    Mark package complete
                    <span className="block text-xs font-normal text-slate-500 mt-0.5">
                      Advances the vehicle maintenance schedule for this package.
                    </span>
                  </Label>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t bg-slate-50/50">
          <Button variant="ghost" onClick={handleBack} className="mr-auto">
            {step === "pick" ? (
              "Cancel"
            ) : (
              <>
                <ArrowLeft className="w-4 h-4 mr-2" /> Back
              </>
            )}
          </Button>

          {step === "categories" && (selectedCategoryIds.length >= 1 || lines.length >= 1) && (
            <Button
              onClick={handleContinueFromCategories}
              className="bg-slate-900 text-white hover:bg-slate-800"
            >
              Continue
            </Button>
          )}

          {step === "form" && (
            <Button
              onClick={handleSaveCategory}
              className="bg-slate-900 text-white hover:bg-slate-800"
            >
              Save category
            </Button>
          )}

          {step === "review" && (
            <Button
              onClick={handleSave}
              disabled={isLoading || lines.length < 1}
              className="bg-slate-900 text-white hover:bg-slate-800"
            >
              {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Save Log
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
