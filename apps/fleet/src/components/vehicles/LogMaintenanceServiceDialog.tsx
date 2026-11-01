import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
} from '../ui/responsive-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Checkbox } from "../ui/checkbox";
import { toast } from "sonner";
import { api } from "../../services/api";
import { uploadEvidenceFile } from "../../services/uploadEvidence";
import { requireAuthHeaders } from "../../utils/authHeaders";
import { API_ENDPOINTS } from "../../services/apiConfig";
import { MAINTENANCE_SCHEDULE_PRESETS } from "../../constants/maintenanceSchedulePresets";
import { inferPackageIconKey } from "../../constants/maintenanceCategoryIcons";
import { MaintenanceIcon } from "./MaintenanceIcon";
import { MaintenanceInspectionPanel } from "./MaintenanceInspectionPanel";
import {
  LogServiceDateMileageStep,
  LogServiceWhatWasDoneStep,
  LogServiceLineDetailsStep,
  LogServiceReviewStep,
  LogServiceWizardChrome,
  LogServiceWizardContinueButton,
  LOG_SERVICE_COPY,
} from "./maintenance-logging/log-service";
import type { LogServiceVehicleStrip, LogServiceWizardStep } from "./maintenance-logging/log-service";
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
  sumMaintenanceLogLines,
} from "../../types/maintenance";
import type { CompatiblePartsItem } from "../../types/partSourcing";

type DialogStep =
  | "dateMileage"
  | "whatWasDone"
  | "lineDetails"
  | "review"
  | "system"
  | "component"
  | "inspect";
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
  /** Car strip + labels for Stitch wizard chrome. */
  vehicleStrip?: LogServiceVehicleStrip;
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
  supplierPartOfferId: string | null;
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
    supplierPartOfferId: null,
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
    supplierPartOfferId: extras.supplierPartOfferId || undefined,
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

function dialogWizardStep(step: DialogStep): LogServiceWizardStep {
  if (step === "dateMileage") return 1;
  if (step === "lineDetails") return 3;
  if (step === "review") return 4;
  return 2;
}

export function LogMaintenanceServiceDialog({
  open,
  onOpenChange,
  vehicleId,
  catalogTemplates,
  defaultOdo,
  vehicleStrip,
  initialLog,
  onSaved,
}: LogMaintenanceServiceDialogProps) {
  const [odoTouched, setOdoTouched] = useState(false);
  const [step, setStep] = useState<DialogStep>("dateMileage");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
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

  const [followQueue, setFollowQueue] = useState<Array<{
    kind: "fit" | "warranty";
    partId: string;
    supplierId?: string | null;
    workOrderLineId?: string | null;
  }>>([]);
  const followUp = followQueue[0] ?? null;
  const [compatibleParts, setCompatibleParts] = useState<CompatiblePartsItem[]>([]);
  const [partsLoading, setPartsLoading] = useState(false);

  const [formMeta, setFormMeta] = useState({
    date: new Date().toISOString().split("T")[0],
    type: "Regular Maintenance",
    currency: "JMD",
    odo: defaultOdo && defaultOdo > 0 ? defaultOdo : 0,
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

  const strip: LogServiceVehicleStrip = useMemo(
    () =>
      vehicleStrip ?? {
        vehicleLabel: vehicleId,
        odometerKm: defaultOdo ?? (formMeta.odo > 0 ? formMeta.odo : null),
      },
    [vehicleStrip, vehicleId, defaultOdo, formMeta.odo],
  );

  const canContinueDateStep = Number(formMeta.odo) > 0 && Boolean(formMeta.date);

  // Reset + load systems / quick jobs when dialog opens
  useEffect(() => {
    if (!open) return;
    setIdempotencyKey(crypto.randomUUID());

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
      setStep("dateMileage");
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
    if (step !== "lineDetails" || !activeCategory || !vehicleId) {
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
      supplierPartOfferId: (existing as { supplierPartOfferId?: string | null } | undefined)?.supplierPartOfferId || null,
      system,
    });
    setStep("lineDetails");
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
    const odoNum = Number(formMeta.odo);
    if (!Number.isFinite(odoNum) || odoNum <= 0) {
      toast.error("Odometer is required and must be greater than zero");
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
        const woRes = await api.createWorkOrder({
          vehicleId,
          status: "in_progress",
          performedAtDate: formMeta.date,
          odometer: odoNum,
          provider: formMeta.provider || null,
          currency: formMeta.currency || "JMD",
          templateId: payload.templateId || null,
          packageComplete: Boolean(payload.packageComplete),
          logMode: payload.logMode,
          notes: formMeta.notes || null,
          invoiceUrl: invoiceUrl || null,
          lines,
          completeNow: true,
          idempotencyKey,
        });
        result = {
          ledgerPosted: woRes.ledgerPosted,
          ledgerWarning: woRes.ledgerWarning,
        };
        const woId = woRes.item?.id;
        if (woId) {
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
                workOrderId: woId,
                findings,
              });
            }
          } catch (inspErr) {
            console.warn("Inspection findings save skipped:", inspErr);
          }
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
      onSaved?.();
      const saved = result as {
        warrantyPrompts?: Array<{ partId?: string; supplierId?: string | null; workOrderLineId?: string }>;
        stockWarnings?: Array<{ partName?: string; shortBy?: number }>;
        item?: { lines?: Array<{ id?: string; partId?: string; declined?: boolean }> };
        lines?: Array<{ id?: string; partId?: string; declined?: boolean }>;
      };
      const stockWarnings = Array.isArray(saved.stockWarnings) ? saved.stockWarnings : [];
      if (stockWarnings.length) {
        toast.warning(stockWarnings.map((warning) => {
          const name = warning.partName?.trim() || "A part";
          const shortBy = Number(warning.shortBy);
          const count = Number.isFinite(shortBy) ? shortBy : 1;
          return `${name} is short by ${count} on the shelf`;
        }).join(". "));
      }
      const prompts = saved.warrantyPrompts;
      const savedLines = saved.item?.lines?.length ? saved.item.lines : saved.lines?.length ? saved.lines : lines;
      const queue: Array<{ kind: "fit" | "warranty"; partId: string; supplierId?: string | null; workOrderLineId?: string | null }> = [];
      for (const prompt of prompts || []) {
        if (prompt.partId) queue.push({ kind: "warranty", partId: String(prompt.partId), supplierId: prompt.supplierId, workOrderLineId: prompt.workOrderLineId });
      }
      for (const line of savedLines) {
        if (line.partId && !line.declined) queue.push({ kind: "fit", partId: line.partId, workOrderLineId: line.id });
      }
      if (queue.length) setFollowQueue(queue);
      else onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast.error("Failed to save service log");
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    if (step === "dateMileage" || step === "whatWasDone") {
      onOpenChange(false);
      return;
    }
    if (step === "system") {
      setStep("whatWasDone");
      return;
    }
    if (step === "component") {
      setStep("whatWasDone");
      return;
    }
    if (step === "lineDetails") {
      setActiveCategory(null);
      if (logMode === "quick_job") setStep("system");
      else if (logMode === "package") setStep("component");
      else setStep("whatWasDone");
      return;
    }
    if (step === "inspect") {
      if (logMode === "inspect") setStep("whatWasDone");
      else if (logMode === "package") setStep("component");
      else if (logMode === "quick_job") setStep("system");
      else setStep("whatWasDone");
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

  const answerFit = async (outcome: "fit" | "no_fit" | "modified") => {
    if (!followUp) return;
    try {
      await api.submitPartFitFeedback({
        partId: followUp.partId,
        outcome,
        vehicleId,
        workOrderLineId: followUp.workOrderLineId,
      });
      toast.success("Fit recorded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setFollowQueue((q) => {
        const next = q.slice(1);
        if (!next.length) onOpenChange(false);
        return next;
      });
    }
  };

  if (followUp) {
    return (
      <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>
              {followUp.kind === "warranty" ? "Claim warranty?" : "Did the part fit?"}
            </ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {followUp.kind === "warranty"
                ? "This component was replaced again inside the previous part’s warranty. Claim it instead of buying another."
                : "This is how Dominion learns which parts actually fit your vehicles."}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <div className="flex flex-wrap gap-2 py-2">
            {followUp.kind === "warranty" ? (
              <>
                <Button type="button" onClick={async () => {
                  try {
                    await api.createWarrantyClaim({ partId: followUp.partId, supplierId: followUp.supplierId, vehicleId, workOrderLineId: followUp.workOrderLineId });
                    toast.success("Warranty claim opened");
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Could not open the claim");
                  } finally {
                    setFollowQueue((q) => {
                      const next = q.slice(1);
                      if (!next.length) onOpenChange(false);
                      return next;
                    });
                  }
                }}>Claim warranty</Button>
                <Button type="button" variant="outline" onClick={() => setFollowQueue((q) => q.length ? [{ ...q[0], kind: "fit" }, ...q.slice(1)] : q)}>It was a new buy</Button>
              </>
            ) : (
              <>
                <Button type="button" onClick={() => void answerFit("fit")}>Yes</Button>
                <Button type="button" variant="outline" onClick={() => void answerFit("no_fit")}>No</Button>
                <Button type="button" variant="outline" onClick={() => void answerFit("modified")}>Had to modify</Button>
              </>
            )}
          </div>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    );
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-[720px] max-h-[90vh] flex flex-col p-0 overflow-hidden gap-0">
        <LogServiceWizardChrome
          activeStep={dialogWizardStep(step)}
          vehicle={strip}
          onClose={() => onOpenChange(false)}
          footer={
            <>
              <Button variant="ghost" onClick={handleBack} className="text-on-surface">
                {step === "whatWasDone" || step === "dateMileage" ? (
                  LOG_SERVICE_COPY.cancelLabel
                ) : (
                  <>
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back
                  </>
                )}
              </Button>
              <div className="flex items-center gap-2">
                {step === "dateMileage" ? (
                  <LogServiceWizardContinueButton
                    label={LOG_SERVICE_COPY.continueLabel}
                    disabled={!canContinueDateStep}
                    onClick={() => {
                      setOdoTouched(true);
                      if (canContinueDateStep) setStep("whatWasDone");
                    }}
                  />
                ) : null}
                {step === "component" && (selectedCategoryIds.length >= 1 || lines.length >= 1) ? (
                  <>
                    <Button type="button" variant="outline" onClick={goToInspectOrReview}>
                      Inspect
                    </Button>
                    <LogServiceWizardContinueButton
                      label={LOG_SERVICE_COPY.continueToReview}
                      onClick={handleContinueFromComponents}
                    />
                  </>
                ) : null}
                {step === "lineDetails" ? (
                  <LogServiceWizardContinueButton
                    label={LOG_SERVICE_COPY.saveLineLabel}
                    onClick={handleSaveCategory}
                  />
                ) : null}
                {step === "review" ? (
                  <LogServiceWizardContinueButton
                    label={LOG_SERVICE_COPY.logServiceLabel}
                    disabled={isLoading || lines.length < 1 || Number(formMeta.odo) <= 0}
                    loading={isLoading}
                    onClick={() => void handleSave()}
                  />
                ) : null}
              </div>
            </>
          }
        >
          {step === "dateMileage" && (
            <LogServiceDateMileageStep
              date={formMeta.date}
              odometer={formMeta.odo}
              onDateChange={(date) => setFormMeta((p) => ({ ...p, date }))}
              onOdometerChange={(odo) => {
                setOdoTouched(true);
                setFormMeta((p) => ({ ...p, odo }));
              }}
              lastTrustedReading={defaultOdo}
              showOdometerError={odoTouched && Number(formMeta.odo) <= 0}
            />
          )}
          {step === "whatWasDone" && (
            <LogServiceWhatWasDoneStep
              packages={packageChoices}
              quickJobs={quickJobs}
              quickJobsLoading={quickJobsLoading}
              onPickPackage={handlePickPackage}
              onPickSystem={handlePickSystem}
              onOpenInspection={handleOpenInspection}
            />
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

          {step === "lineDetails" && activeCategory && (
            <LogServiceLineDetailsStep
              category={activeCategory}
              systemName={lineExtras.system?.name}
              action={lineExtras.action}
              onActionChange={(action) => setLineExtras((prev) => ({ ...prev, action }))}
              categoryFields={(activeCategory.field_schema?.fields || defaultFieldSchema().fields).map(
                renderField,
              )}
              laborHours={lineExtras.laborHours}
              laborRate={lineExtras.laborRate}
              onLaborHoursChange={(v) => setLineExtras((prev) => ({ ...prev, laborHours: v }))}
              onLaborRateChange={(v) => setLineExtras((prev) => ({ ...prev, laborRate: v }))}
              brand={lineExtras.brand}
              partNumber={lineExtras.partNumber}
              onBrandChange={(brand) => setLineExtras((prev) => ({ ...prev, brand }))}
              onPartNumberChange={(partNumber) => setLineExtras((prev) => ({ ...prev, partNumber }))}
              showPositions={needsPositions(activeCategory)}
              positions={lineExtras.positions}
              onTogglePosition={togglePosition}
              warranty={lineExtras.warranty}
              complimentary={lineExtras.complimentary}
              onWarrantyChange={(warranty) => setLineExtras((prev) => ({ ...prev, warranty }))}
              onComplimentaryChange={(complimentary) =>
                setLineExtras((prev) => ({ ...prev, complimentary }))
              }
              partsLoading={partsLoading}
              compatibleParts={compatibleParts}
              partId={lineExtras.partId}
              onPartSelect={(partId, offerId, brand, partNumber) =>
                setLineExtras((prev) => ({
                  ...prev,
                  partId,
                  supplierPartOfferId: offerId,
                  brand: prev.brand || brand || prev.brand,
                  partNumber: prev.partNumber || partNumber || prev.partNumber,
                }))
              }
              lineTotalLabel="Line total"
              currency={formMeta.currency || "JMD"}
              lineTotal={draftLineTotal}
            />
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
            <LogServiceReviewStep
              baySessionLabel={idempotencyKey.slice(0, 8).toUpperCase()}
              date={formMeta.date}
              odometer={formMeta.odo}
              provider={formMeta.provider}
              currency={formMeta.currency || "JMD"}
              notes={formMeta.notes}
              invoiceUrl={formMeta.invoiceUrl}
              scanLoading={scanLoading}
              onDateChange={(date) => setFormMeta({ ...formMeta, date })}
              onOdometerChange={(odo) => setFormMeta({ ...formMeta, odo })}
              onProviderChange={(provider) => setFormMeta({ ...formMeta, provider })}
              onCurrencyChange={(currency) => setFormMeta({ ...formMeta, currency })}
              onNotesChange={(notes) => setFormMeta({ ...formMeta, notes })}
              onScanFile={handleServiceScan}
              lines={lines}
              lineTotalPreview={lineTotalPreview}
              totalCost={totalCost}
              onEditLine={(line) => {
                const pkgCat = selectedPackage?.categories.find(
                  (c) =>
                    c.id === line.categoryId ||
                    (c.code === line.categoryCode && c.name === line.categoryName),
                );
                const qj = systemComponents.find((c) => c.id === line.categoryId);
                const cat = pkgCat || qj || catalogById.get(line.categoryId || "");
                if (cat) openCategoryForm(cat);
              }}
              showMarkPackageComplete={logMode === "package"}
              markPackageComplete={markPackageComplete}
              onMarkPackageCompleteChange={setMarkPackageComplete}
              whatHappensNext={
                <p className="text-sm text-secondary">
                  Schedule rows update after save. Overdue counts refresh on the fleet overview.
                </p>
              }
            />
          )}
        </LogServiceWizardChrome>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
