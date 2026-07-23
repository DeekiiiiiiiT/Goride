import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
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
import { MaintenanceInspectionPanel } from "./MaintenanceInspectionPanel";
import type {
  CatalogMaintenanceTaskOption,
  MaintenanceCategoryFieldDef,
  MaintenanceLineAction,
  MaintenanceLog,
  MaintenanceLogLine,
  MaintenanceServiceCategory,
} from "../../types/maintenance";
import {
  formatMaintenanceLineLabel,
  groupCategoriesBySystem,
  MAINTENANCE_LINE_ACTIONS,
  sumMaintenanceLogLines,
} from "../../types/maintenance";
import type { CompatiblePartsItem } from "../../types/partSourcing";

type DialogStep = "pick" | "system" | "component" | "form" | "inspect" | "review";
type LogMode = "package" | "quick_job" | "inspect";

type PackageChoice = {
  id: string;
  label: string;
  shortLabel: string;
  iconKey: string;
  templateId?: string;
  categories: MaintenanceServiceCategory[];
  dueKind?: CatalogMaintenanceTaskOption["dueKind"];
};

const TIRE_BRAKE_POSITIONS = ["LF", "RF", "LR", "RR"] as const;

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
    kind: "component" as const,
    parent_id: null,
    created_at: "",
    updated_at: "",
  }));
}

function packageFromCatalog(t: CatalogMaintenanceTaskOption): PackageChoice {
  const cats =
    t.categories && t.categories.length > 0
      ? t.categories.filter(
          (c) => c.kind !== "system" && !String(c.code || "").startsWith("sys_"),
        )
      : syntheticCategoriesFromNames(t.checklistLines);
  return {
    id: t.templateId,
    label: t.label,
    shortLabel: stripEverySuffix(t.label),
    iconKey: t.iconKey || inferPackageIconKey(t.label),
    templateId: t.templateId,
    categories: cats,
    dueKind: t.dueKind,
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

function needsPositions(cat: MaintenanceServiceCategory): boolean {
  if (cat.position_aware === true) return true;
  const hay = `${cat.code} ${cat.name} ${cat.icon_key}`.toLowerCase();
  return /tire|brake|wheel/.test(hay);
}

type LineExtras = {
  action: MaintenanceLineAction;
  laborHours: number | null;
  laborRate: number | null;
  brand: string;
  partNumber: string;
  positions: string[];
  warranty: boolean;
  complimentary: boolean;
  partId: string | null;
  system: MaintenanceServiceCategory | null;
};

function defaultExtras(system: MaintenanceServiceCategory | null = null): LineExtras {
  return {
    action: "replace",
    laborHours: null,
    laborRate: null,
    brand: "",
    partNumber: "",
    positions: [],
    warranty: false,
    complimentary: false,
    partId: null,
    system,
  };
}

function lineFromCategoryValues(
  cat: MaintenanceServiceCategory,
  values: Record<string, string | number | boolean | null>,
  extras: LineExtras,
): MaintenanceLogLine {
  const isSynthetic = cat.id.startsWith("synthetic-");
  const conditionRaw = values.condition;
  const hours = extras.laborHours;
  const rate = extras.laborRate;
  let labor = numFrom(values.labor);
  if (hours != null && hours > 0 && rate != null && rate > 0) {
    labor = hours * rate;
  }
  if (extras.complimentary) labor = 0;

  return {
    categoryId: isSynthetic ? undefined : cat.id,
    categoryCode: cat.code,
    categoryName: cat.name,
    systemId: extras.system?.id,
    systemCode: extras.system?.code,
    systemName: extras.system?.name,
    action: extras.action,
    qty: numFrom(values.qty),
    unitPrice: numFrom(values.unit_price),
    material: numFrom(values.material),
    labor,
    laborHours: hours ?? undefined,
    laborRate: rate ?? undefined,
    condition:
      typeof conditionRaw === "string" && conditionRaw
        ? conditionRaw
        : undefined,
    positions: extras.positions.length ? [...extras.positions] : undefined,
    brand: extras.brand.trim() || undefined,
    partNumber: extras.partNumber.trim() || undefined,
    warranty: extras.warranty || undefined,
    complimentary: extras.complimentary || undefined,
    partId: extras.partId || undefined,
    notes: typeof values.notes === "string" ? values.notes : undefined,
    values: { ...values },
  };
}

function lineTotalPreview(line: MaintenanceLogLine): number {
  return sumMaintenanceLogLines([line]);
}

function lineMatchKey(line: MaintenanceLogLine): string {
  return `${line.categoryId || ""}|${line.categoryCode}|${line.categoryName}|${line.recommended ? "r" : "n"}`;
}

function categoryMatchLine(cat: MaintenanceServiceCategory, line: MaintenanceLogLine): boolean {
  if (line.recommended) return false;
  return (
    (Boolean(line.categoryId) && line.categoryId === cat.id) ||
    (!line.categoryId && line.categoryCode === cat.code && line.categoryName === cat.name)
  );
}

function stepTitle(step: DialogStep): string {
  switch (step) {
    case "pick":
      return "Add Service Log";
    case "system":
      return "Select Component";
    case "component":
      return "Select Components";
    case "form":
      return "Component Details";
    case "inspect":
      return "Digital Inspection";
    case "review":
      return "Review & Save";
    default:
      return "Add Service Log";
  }
}

function stepDescription(step: DialogStep, packageLabel?: string, systemName?: string): string {
  switch (step) {
    case "pick":
      return "Choose a service package, system quick job, or open a digital inspection.";
    case "system":
      return systemName
        ? `Pick a component under ${systemName}.`
        : "Pick a component under this system.";
    case "component":
      return packageLabel
        ? `Select components to log for ${packageLabel}.`
        : "Select the components worked on.";
    case "form":
      return "Choose an action and enter commercial details.";
    case "inspect":
      return "Mark each item pass, attention, or fail. Failures can add recommended work.";
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
  const [allSystems, setAllSystems] = useState<MaintenanceServiceCategory[]>([]);
  const [systemComponents, setSystemComponents] = useState<MaintenanceServiceCategory[]>([]);
  const [systemComponentsLoading, setSystemComponentsLoading] = useState(false);

  const [logMode, setLogMode] = useState<LogMode>("package");
  const [selectedPackage, setSelectedPackage] = useState<PackageChoice | null>(null);
  const [selectedSystem, setSelectedSystem] = useState<MaintenanceServiceCategory | null>(null);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<MaintenanceServiceCategory | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string | number | boolean | null>>({});
  const [lineExtras, setLineExtras] = useState<LineExtras>(defaultExtras());
  const [lines, setLines] = useState<MaintenanceLogLine[]>([]);
  const [markPackageComplete, setMarkPackageComplete] = useState(true);
  const [formQueue, setFormQueue] = useState<MaintenanceServiceCategory[]>([]);

  const [compatibleParts, setCompatibleParts] = useState<CompatiblePartsItem[]>([]);
  const [partsLoading, setPartsLoading] = useState(false);

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

  const catalogById = useMemo(() => {
    const m = new Map<string, MaintenanceServiceCategory>();
    for (const s of allSystems) m.set(s.id, s);
    for (const c of systemComponents) m.set(c.id, c);
    for (const pkg of packageChoices) {
      for (const c of pkg.categories) m.set(c.id, c);
    }
    for (const q of quickJobs) m.set(q.id, q);
    return m;
  }, [allSystems, systemComponents, packageChoices, quickJobs]);

  const packageGrouped = useMemo(() => {
    if (!selectedPackage) return [];
    const components = selectedPackage.categories;
    const systemsForGroup =
      allSystems.length > 0
        ? allSystems
        : components
            .map((c) => (c.parent_id ? catalogById.get(c.parent_id) : null))
            .filter((s): s is MaintenanceServiceCategory => Boolean(s));
    const uniqSystems = new Map<string, MaintenanceServiceCategory>();
    for (const s of systemsForGroup) uniqSystems.set(s.id, s);
    return groupCategoriesBySystem([...uniqSystems.values(), ...components]);
  }, [selectedPackage, allSystems, catalogById]);

  const totalCost = useMemo(() => sumMaintenanceLogLines(lines), [lines]);

  const draftLine = useMemo(() => {
    if (!activeCategory) return null;
    return lineFromCategoryValues(activeCategory, fieldValues, lineExtras);
  }, [activeCategory, fieldValues, lineExtras]);

  const draftLineTotal = draftLine ? lineTotalPreview(draftLine) : 0;

  // Reset + load systems / quick jobs when dialog opens
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
    setLineExtras(defaultExtras());
    setActiveCategory(null);
    setSelectedCategoryIds([]);
    setSelectedSystem(null);
    setSystemComponents([]);
    setFormQueue([]);
    setCompatibleParts([]);

    const existingLines = initialLog?.lines?.length ? [...initialLog.lines] : [];
    setLines(existingLines);

    const hasTemplate = Boolean(initialLog?.templateId);
    const mode: LogMode =
      initialLog?.logMode === "quick_job"
        ? "quick_job"
        : hasTemplate || initialLog?.logMode === "package"
          ? "package"
          : existingLines.length
            ? "quick_job"
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
    Promise.all([
      api.listQuickJobCategories().catch((err) => {
        console.error(err);
        return { items: [] as MaintenanceServiceCategory[] };
      }),
      api.listMaintenanceSystems().catch((err) => {
        console.error(err);
        return { items: [] as MaintenanceServiceCategory[] };
      }),
    ])
      .then(([qj, systems]) => {
        if (cancelled) return;
        const qItems = qj.items || [];
        const sItems = systems.items || [];
        setQuickJobs(qItems.length ? qItems : sItems.filter((s) => s.quick_job_eligible));
        setAllSystems(sItems.length ? sItems : qItems.filter((s) => s.kind === "system" || s.code?.startsWith("sys_")));
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) {
          setQuickJobs([]);
          setAllSystems([]);
          toast.error("Could not load systems");
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

  // Load compatible parts when editing a component form
  useEffect(() => {
    if (step !== "form" || !activeCategory || !vehicleId) {
      setCompatibleParts([]);
      return;
    }
    if (activeCategory.id.startsWith("synthetic-")) {
      setCompatibleParts([]);
      return;
    }
    let cancelled = false;
    setPartsLoading(true);
    api
      .getCompatibleParts(vehicleId, activeCategory.id)
      .then((res) => {
        if (!cancelled) setCompatibleParts(res.items || []);
      })
      .catch(() => {
        if (!cancelled) setCompatibleParts([]);
      })
      .finally(() => {
        if (!cancelled) setPartsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [step, activeCategory, vehicleId]);

  const resolveSystemForComponent = (
    cat: MaintenanceServiceCategory,
  ): MaintenanceServiceCategory | null => {
    if (selectedSystem) return selectedSystem;
    if (cat.parent_id) {
      const fromAll = allSystems.find((s) => s.id === cat.parent_id);
      if (fromAll) return fromAll;
      const fromCat = catalogById.get(cat.parent_id);
      if (fromCat) return fromCat;
    }
    return null;
  };

  const openCategoryForm = (
    cat: MaintenanceServiceCategory,
    systemOverride?: MaintenanceServiceCategory | null,
  ) => {
    const existing = lines.find((l) => categoryMatchLine(cat, l));
    const system = systemOverride ?? resolveSystemForComponent(cat);
    setActiveCategory(cat);
    setFieldValues(
      existing?.values
        ? { ...emptyValuesForCategory(cat), ...existing.values }
        : emptyValuesForCategory(cat),
    );
    setLineExtras({
      action: (existing?.action as MaintenanceLineAction) || "replace",
      laborHours: existing?.laborHours ?? null,
      laborRate: existing?.laborRate ?? null,
      brand: existing?.brand || "",
      partNumber: existing?.partNumber || "",
      positions: existing?.positions ? [...existing.positions] : [],
      warranty: Boolean(existing?.warranty),
      complimentary: Boolean(existing?.complimentary),
      partId: existing?.partId || null,
      system,
    });
    setStep("form");
  };

  const handlePickPackage = (pkg: PackageChoice) => {
    setLogMode("package");
    setSelectedPackage(pkg);
    setSelectedSystem(null);
    setSelectedCategoryIds([]);
    setLines([]);
    setFormQueue([]);
    setFormMeta((prev) => ({ ...prev, type: pkg.label }));
    setStep("component");
  };

  const handlePickSystem = async (system: MaintenanceServiceCategory) => {
    setLogMode("quick_job");
    setSelectedPackage(null);
    setSelectedSystem(system);
    setSelectedCategoryIds([]);
    setLines([]);
    setFormQueue([]);
    setFormMeta((prev) => ({ ...prev, type: system.name }));
    setStep("system");
    setSystemComponentsLoading(true);
    try {
      const res = await api.listSystemComponents(system.id);
      let items = res.items || [];
      if (!items.length) {
        const all = await api.listMaintenanceCategories("component");
        items = (all.items || []).filter((c) => c.parent_id === system.id);
      }
      setSystemComponents(items);
    } catch (err) {
      console.error(err);
      setSystemComponents([]);
      toast.error("Could not load components");
    } finally {
      setSystemComponentsLoading(false);
    }
  };

  const handleOpenInspection = () => {
    setLogMode("inspect");
    setSelectedPackage(null);
    setSelectedSystem(null);
    setSelectedCategoryIds([]);
    setFormQueue([]);
    setFormMeta((prev) => ({ ...prev, type: "Digital Inspection" }));
    setStep("inspect");
  };

  const handlePickQuickComponent = (cat: MaintenanceServiceCategory) => {
    setSelectedCategoryIds([cat.id]);
    openCategoryForm(cat, selectedSystem);
  };

  const handleComponentTap = (cat: MaintenanceServiceCategory) => {
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

  const advanceAfterForm = (savedCat: MaintenanceServiceCategory) => {
    if (formQueue.length > 0) {
      const [next, ...rest] = formQueue;
      setFormQueue(rest);
      openCategoryForm(next);
      return;
    }
    if (logMode === "quick_job") {
      setFormMeta((prev) => ({ ...prev, type: savedCat.name }));
      setActiveCategory(null);
      setStep("review");
      return;
    }
    if (logMode === "package") {
      setActiveCategory(null);
      setStep("component");
      return;
    }
    setActiveCategory(null);
    setStep("review");
  };

  const handleSaveCategory = () => {
    if (!activeCategory) return;
    const line = lineFromCategoryValues(activeCategory, fieldValues, lineExtras);
    setLines((prev) => {
      const without = prev.filter((l) => !categoryMatchLine(activeCategory, l));
      return [...without, line];
    });
    setSelectedCategoryIds((prev) =>
      prev.includes(activeCategory.id) ? prev : [...prev, activeCategory.id],
    );
    advanceAfterForm(activeCategory);
  };

  const handleContinueFromComponents = () => {
    if (!selectedPackage || selectedCategoryIds.length < 1) return;
    const cats = selectedPackage.categories;
    const needingForm = selectedCategoryIds
      .map((id) => cats.find((c) => c.id === id))
      .filter((cat): cat is MaintenanceServiceCategory => Boolean(cat))
      .filter((cat) => !lines.some((l) => categoryMatchLine(cat, l)));

    if (needingForm.length > 0) {
      const [first, ...rest] = needingForm;
      setFormQueue(rest);
      openCategoryForm(first);
      return;
    }
    setStep("review");
  };

  const goToInspectOrReview = () => {
    if (logMode === "inspect") {
      setStep("review");
      return;
    }
    setStep("inspect");
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

  const buildSavePayload = (logId: string, invoiceUrl: string) => {
    const effectiveMode: "package" | "quick_job" =
      logMode === "package" ? "package" : "quick_job";
    const advanceSchedule = effectiveMode === "package" && markPackageComplete;
    const templateId = advanceSchedule
      ? selectedPackage?.templateId || initialLog?.templateId
      : undefined;

    const packageLabel = selectedPackage?.label;
    const typeLabel =
      effectiveMode === "package"
        ? packageLabel || formMeta.type || "Regular Maintenance"
        : lines.find((l) => !l.recommended)?.categoryName ||
          lines[0]?.categoryName ||
          formMeta.type;

    return {
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
      checklist: lines.filter((l) => !l.declined).map((l) => formatMaintenanceLineLabel(l)),
      packageComplete: advanceSchedule,
    };
  };

  const handleSave = async () => {
    if (!formMeta.date) {
      toast.error("Please fill in required fields");
      return;
    }
    const activeLines = lines.filter((l) => !l.declined);
    if (!activeLines.length && !lines.length) {
      toast.error("Add at least one line before saving");
      return;
    }
    if (!lines.length) {
      toast.error("Add at least one line before saving");
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

      const payload = buildSavePayload(logId, invoiceUrl);
      let result: {
        ledgerPosted?: boolean;
        ledgerWarning?: string;
      } = {};

      if (initialLog?.id) {
        result = await api.updateMaintenanceLog(vehicleId, logId, payload);
      } else {
        // Prefer work-order complete path; fall back to log bridge (creates completed WO).
        try {
          const wo = await api.createWorkOrder({
            vehicleId,
            status: "in_progress",
            performedAtDate: formMeta.date,
            odometer: Number(formMeta.odo) || 0,
            provider: formMeta.provider || null,
            currency: formMeta.currency || "JMD",
            templateId: payload.templateId || null,
            packageComplete: Boolean(payload.packageComplete),
            logMode: payload.logMode,
            notes: formMeta.notes || null,
            invoiceUrl: invoiceUrl || null,
            lines,
          });
          result = await api.completeWorkOrder(wo.id, {
            performedAtDate: formMeta.date,
            odometer: Number(formMeta.odo) || 0,
            provider: formMeta.provider || null,
            currency: formMeta.currency || "JMD",
            templateId: payload.templateId || null,
            packageComplete: Boolean(payload.packageComplete),
            logMode: payload.logMode,
            notes: formMeta.notes || null,
            invoiceUrl: invoiceUrl || null,
            lines,
            totalCost: payload.cost,
          });
          try {
            const findings = lines
              .filter((l) => l.recommended)
              .map((l) => ({
                itemId: null as string | null,
                systemId: l.systemId || null,
                componentId: l.categoryId || null,
                status: (l.declined ? "attention" : "fail") as "attention" | "fail",
                notes: l.notes || null,
                declined: Boolean(l.declined),
              }));
            if (findings.length) {
              await api.saveInspectionFindings({
                vehicleId,
                workOrderId: wo.id,
                findings,
              });
            }
          } catch (inspErr) {
            console.warn("Inspection findings save skipped:", inspErr);
          }
        } catch (woErr) {
          console.warn("Work order path failed, using maintenance log bridge:", woErr);
          result = await api.saveMaintenanceLog(payload);
        }
      }

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
    if (step === "system") {
      setStep("pick");
      return;
    }
    if (step === "component") {
      setStep("pick");
      return;
    }
    if (step === "form") {
      setActiveCategory(null);
      if (logMode === "quick_job") setStep("system");
      else if (logMode === "package") setStep("component");
      else setStep("pick");
      return;
    }
    if (step === "inspect") {
      if (logMode === "inspect") setStep("pick");
      else if (logMode === "package") setStep("component");
      else if (logMode === "quick_job") setStep("system");
      else setStep("pick");
      return;
    }
    if (step === "review") {
      setStep("inspect");
    }
  };

  const setFieldValue = (key: string, value: string | number | boolean | null) => {
    setFieldValues((prev) => ({ ...prev, [key]: value }));
  };

  const togglePosition = (pos: string) => {
    setLineExtras((prev) => ({
      ...prev,
      positions: prev.positions.includes(pos)
        ? prev.positions.filter((p) => p !== pos)
        : [...prev.positions, pos],
    }));
  };

  const renderField = (field: MaintenanceCategoryFieldDef) => {
    const id = `cat-field-${field.key}`;
    if (field.type === "boolean") {
      return (
        <div key={field.key} className="flex items-center gap-3 py-1">
          <Checkbox
            id={id}
            checked={Boolean(fieldValues[field.key])}
            onCheckedChange={(checked: boolean | "indeterminate") =>
              setFieldValue(field.key, checked === true)
            }
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
            onValueChange={(v: string) => setFieldValue(field.key, v)}
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
    lines.some((l) => categoryMatchLine(cat, l));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px] max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle>{stepTitle(step)}</DialogTitle>
          <DialogDescription>
            {stepDescription(step, selectedPackage?.shortLabel, selectedSystem?.name)}
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
                <p className="text-xs text-slate-500">Pick a vehicle system, then a component.</p>
                {quickJobsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500 py-6 justify-center">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading systems…
                  </div>
                ) : quickJobs.length === 0 ? (
                  <p className="text-sm text-slate-500 py-2">No systems available.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {quickJobs.map((sys) => (
                      <button
                        key={sys.id}
                        type="button"
                        onClick={() => handlePickSystem(sys)}
                        className="flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors text-center min-h-[108px]"
                      >
                        <div className="bg-slate-100 p-3 rounded-xl text-indigo-600">
                          <MaintenanceIcon iconKey={sys.icon_key} className="w-6 h-6" />
                        </div>
                        <span className="text-sm font-medium text-slate-900 leading-tight">
                          {sys.name}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <button
                  type="button"
                  onClick={handleOpenInspection}
                  className="w-full flex items-center gap-3 p-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 hover:bg-indigo-50/40 hover:border-indigo-300 transition-colors text-left min-h-11"
                >
                  <div className="bg-white p-3 rounded-xl shadow-sm text-indigo-600">
                    <ClipboardCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Open digital inspection</p>
                    <p className="text-xs text-slate-500">
                      Walk systems pass / attention / fail and add recommended work.
                    </p>
                  </div>
                </button>
              </section>
            </div>
          )}

          {step === "system" && selectedSystem && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="bg-indigo-50 p-3 rounded-xl text-indigo-600">
                  <MaintenanceIcon iconKey={selectedSystem.icon_key} className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">{selectedSystem.name}</h3>
                  <p className="text-xs text-slate-500">{selectedSystem.code}</p>
                </div>
              </div>
              {systemComponentsLoading ? (
                <div className="flex items-center gap-2 text-sm text-slate-500 py-8 justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading components…
                </div>
              ) : systemComponents.length === 0 ? (
                <p className="text-sm text-slate-500 py-4">No components under this system.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {systemComponents.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => handlePickQuickComponent(cat)}
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
            </div>
          )}

          {step === "component" && selectedPackage && (
            <div className="space-y-5">
              <p className="text-sm text-slate-500">
                Selected: {selectedCategoryIds.length} · Logged:{" "}
                {lines.filter((l) => !l.recommended).length}
              </p>
              {packageGrouped.length === 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {selectedPackage.categories.map((cat) => {
                    const selected = selectedCategoryIds.includes(cat.id);
                    const logged = categoryHasLine(cat);
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => handleComponentTap(cat)}
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
              ) : (
                packageGrouped.map(({ system, components }) =>
                  components.length === 0 ? null : (
                    <section key={system.id} className="space-y-3">
                      <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                        <MaintenanceIcon iconKey={system.icon_key} className="w-4 h-4 text-indigo-600" />
                        {system.name}
                      </h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {components.map((cat) => {
                          const selected = selectedCategoryIds.includes(cat.id);
                          const logged = categoryHasLine(cat);
                          return (
                            <button
                              key={cat.id}
                              type="button"
                              onClick={() => handleComponentTap(cat)}
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
                    </section>
                  ),
                )
              )}
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
                  <p className="text-xs text-slate-500">
                    {[lineExtras.system?.name, activeCategory.code].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Action</Label>
                <Select
                  value={lineExtras.action}
                  onValueChange={(v: string) =>
                    setLineExtras((prev) => ({ ...prev, action: v as MaintenanceLineAction }))
                  }
                >
                  <SelectTrigger className="bg-slate-50 border-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MAINTENANCE_LINE_ACTIONS.map((a) => (
                      <SelectItem key={a.value} value={a.value}>
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {(activeCategory.field_schema?.fields || defaultFieldSchema().fields).map(renderField)}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="labor-hours">Labor hours</Label>
                  <Input
                    id="labor-hours"
                    type="number"
                    step="0.1"
                    className="bg-slate-50 border-slate-200"
                    value={lineExtras.laborHours ?? ""}
                    onChange={(e) =>
                      setLineExtras((prev) => ({
                        ...prev,
                        laborHours: e.target.value === "" ? null : Number(e.target.value),
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="labor-rate">Labor rate</Label>
                  <Input
                    id="labor-rate"
                    type="number"
                    className="bg-slate-50 border-slate-200"
                    value={lineExtras.laborRate ?? ""}
                    onChange={(e) =>
                      setLineExtras((prev) => ({
                        ...prev,
                        laborRate: e.target.value === "" ? null : Number(e.target.value),
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="brand">Brand</Label>
                  <Input
                    id="brand"
                    className="bg-slate-50 border-slate-200"
                    value={lineExtras.brand}
                    onChange={(e) =>
                      setLineExtras((prev) => ({ ...prev, brand: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="part-number">Part number</Label>
                  <Input
                    id="part-number"
                    className="bg-slate-50 border-slate-200"
                    value={lineExtras.partNumber}
                    onChange={(e) =>
                      setLineExtras((prev) => ({ ...prev, partNumber: e.target.value }))
                    }
                  />
                </div>
              </div>

              {needsPositions(activeCategory) && (
                <div className="space-y-2">
                  <Label>Positions</Label>
                  <div className="flex flex-wrap gap-2">
                    {TIRE_BRAKE_POSITIONS.map((pos) => {
                      const on = lineExtras.positions.includes(pos);
                      return (
                        <button
                          key={pos}
                          type="button"
                          onClick={() => togglePosition(pos)}
                          className={`min-h-11 min-w-11 px-3 rounded-lg border text-sm font-semibold ${
                            on
                              ? "border-indigo-300 bg-indigo-50 text-indigo-800"
                              : "border-slate-200 bg-white text-slate-700"
                          }`}
                        >
                          {pos}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="warranty"
                    checked={lineExtras.warranty}
                    onCheckedChange={(checked: boolean | "indeterminate") =>
                      setLineExtras((prev) => ({ ...prev, warranty: checked === true }))
                    }
                  />
                  <Label htmlFor="warranty" className="cursor-pointer">
                    Warranty
                  </Label>
                </div>
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="complimentary"
                    checked={lineExtras.complimentary}
                    onCheckedChange={(checked: boolean | "indeterminate") =>
                      setLineExtras((prev) => ({ ...prev, complimentary: checked === true }))
                    }
                  />
                  <Label htmlFor="complimentary" className="cursor-pointer">
                    Complimentary labor
                  </Label>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Link part (optional)</Label>
                {partsLoading ? (
                  <p className="text-xs text-slate-500 flex items-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin" /> Loading compatible parts…
                  </p>
                ) : compatibleParts.length === 0 ? (
                  <p className="text-xs text-slate-500">No compatible parts for this vehicle/component.</p>
                ) : (
                  <Select
                    value={lineExtras.partId || "__none__"}
                    onValueChange={(v: string) => {
                      if (v === "__none__") {
                        setLineExtras((prev) => ({ ...prev, partId: null }));
                        return;
                      }
                      const item = compatibleParts.find((p) => p.part.id === v);
                      setLineExtras((prev) => ({
                        ...prev,
                        partId: v,
                        brand: prev.brand || item?.part.name || prev.brand,
                        partNumber:
                          prev.partNumber || item?.part.oem_part_number || prev.partNumber,
                      }));
                    }}
                  >
                    <SelectTrigger className="bg-slate-50 border-slate-200">
                      <SelectValue placeholder="Select a part…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {compatibleParts.map((item) => (
                        <SelectItem key={item.part.id} value={item.part.id}>
                          {item.part.name}
                          {item.part.oem_part_number ? ` · ${item.part.oem_part_number}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 flex justify-between items-center">
                <span className="text-sm text-slate-600">Line total</span>
                <span className="font-semibold text-slate-900">
                  {formMeta.currency || "JMD"} {draftLineTotal.toLocaleString()}
                </span>
              </div>
            </div>
          )}

          {step === "inspect" && (
            <MaintenanceInspectionPanel
              vehicleId={vehicleId}
              lines={lines}
              onLinesChange={setLines}
              catalogById={catalogById}
              onContinue={() => setStep("review")}
              onSkip={() => setStep("review")}
            />
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
                    onValueChange={(v: string) => setFormMeta({ ...formMeta, currency: v })}
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
                  {lines.map((line, idx) => {
                    const muted = Boolean(line.declined);
                    return (
                      <div
                        key={`${lineMatchKey(line)}-${idx}`}
                        className={`flex items-center justify-between px-4 py-3 gap-3 ${
                          muted ? "opacity-50" : ""
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">
                            {formatMaintenanceLineLabel(line)}
                          </p>
                          <p className="text-xs text-slate-500">
                            {[
                              line.recommended ? "Recommended" : null,
                              line.declined ? "Declined" : null,
                              line.qty != null ? `Qty ${line.qty}` : null,
                              line.brand || null,
                              line.positions?.length ? line.positions.join(" ") : null,
                            ]
                              .filter(Boolean)
                              .join(" · ") || line.categoryCode}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-sm font-medium text-slate-900">
                            {formMeta.currency || "JMD"}{" "}
                            {muted ? "0" : lineTotalPreview(line).toLocaleString()}
                          </span>
                          {!line.recommended && (
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
                                const qj = systemComponents.find((c) => c.id === line.categoryId);
                                const cat = pkgCat || qj || catalogById.get(line.categoryId || "");
                                if (cat) openCategoryForm(cat);
                              }}
                            >
                              Edit
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
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
                    onCheckedChange={(checked: boolean | "indeterminate") =>
                      setMarkPackageComplete(checked === true)
                    }
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

          {step === "component" && (selectedCategoryIds.length >= 1 || lines.length >= 1) && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={goToInspectOrReview}
              >
                Inspect
              </Button>
              <Button
                onClick={handleContinueFromComponents}
                className="bg-slate-900 text-white hover:bg-slate-800"
              >
                Continue
              </Button>
            </div>
          )}

          {step === "form" && (
            <Button
              onClick={handleSaveCategory}
              className="bg-slate-900 text-white hover:bg-slate-800"
            >
              Save line
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
