import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
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
  LogServiceLineDetailsMultiStep,
  LogServiceReviewStep,
  LogServiceSystemPicker,
  LogServiceComponentPicker,
  LogServiceWizardChrome,
  LogServiceWizardContinueButton,
  LOG_SERVICE_COPY,
} from "./maintenance-logging/log-service";
import type { OdometerCheckResult } from "./maintenance-logging/log-service/LogServiceDateMileageStep";
import type { LogServiceSuggestedOp } from "./maintenance-logging/log-service/LogServiceWhatWasDoneStep";
import {
  clearLogServiceDraft,
  readLogServiceDraft,
  writeLogServiceDraft,
} from "./maintenance-logging/log-service/logServiceDraft";
import type { LogServiceVehicleStrip, LogServiceWizardStep } from "./maintenance-logging/log-service";
import {
  defaultActionForCategory,
  hiddenLineFieldsFor,
  sidePositionsFor,
  isServiceJob,
  serviceJobAmount,
  serviceJobCost,
} from "./maintenance-logging/log-service/logServiceJobCost";
import {
  homeSectionNameByJob,
  visibleSections,
  type SystemSections,
} from "./maintenance-logging/log-service/systemSections";
import { logServiceOemMatchSummary } from "./maintenance-logging/log-service/logServiceOemMatchSummary";
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
  maintenanceDiscountTooLarge,
  maintenanceServiceNetTotal,
  parseMaintenanceDiscount,
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

type LogServicePackageStatus = "overdue" | "due_soon" | "ok" | "mandatory";

type PackageChoice = {
  id: string;
  label: string;
  shortLabel: string;
  iconKey: string;
  templateId?: string;
  categories: MaintenanceServiceCategory[];
  dueKind?: CatalogMaintenanceTaskOption["dueKind"] | LogServicePackageStatus;
  intervalText?: string;
  status?: LogServicePackageStatus;
  kmLabel?: string | null;
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
  /** Supabase user id for draft storage key. */
  draftUserId?: string;
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
  if (cat.is_part === false) return { cost_mode: "total", service_amount: null };
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
  if (sidePositionsFor(cat)) return true;
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
  partConfirmedFit: boolean;
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
    partConfirmedFit: false,
    system,
  };
}

function lineFromCategoryValues(
  cat: MaintenanceServiceCategory,
  values: Record<string, string | number | boolean | null>,
  extras: LineExtras,
): MaintenanceLogLine {
  const isSynthetic = cat.id.startsWith("synthetic-");
  if (isServiceJob(cat)) {
    return {
      categoryId: isSynthetic ? undefined : cat.id,
      categoryCode: cat.code,
      categoryName: cat.name,
      systemId: extras.system?.id,
      systemCode: extras.system?.code,
      systemName: extras.system?.name,
      action: extras.action,
      labor: serviceJobCost(values, extras.positions, extras.complimentary),
      positions: extras.positions.length ? [...extras.positions] : undefined,
      complimentary: extras.complimentary || undefined,
      notes: typeof values.notes === "string" ? values.notes : undefined,
      values: {
        cost_mode: values.cost_mode === "per_wheel" ? "per_wheel" : "total",
        service_amount: serviceJobAmount(values),
      },
    };
  }
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
    partConfirmedFit: extras.partId ? extras.partConfirmedFit : undefined,
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

/** Service title for one or more jobs: "Wheel Alignment + Wheel Balancing", "A + B + 2 more". */
export function quickJobTypeLabel(lines: MaintenanceLogLine[]): string {
  const done = lines.filter((l) => !l.recommended);
  const source = done.length ? done : lines;
  const names = [...new Set(source.map((l) => (l.categoryName || "").trim()).filter(Boolean))];
  if (names.length <= 2) return names.join(" + ");
  return `${names.slice(0, 2).join(" + ")} + ${names.length - 2} more`;
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
  draftUserId,
  onSaved,
}: LogMaintenanceServiceDialogProps) {
  const [odoTouched, setOdoTouched] = useState(false);
  const [anomalyAcknowledged, setAnomalyAcknowledged] = useState(false);
  const [odometerCheckLoading, setOdometerCheckLoading] = useState(false);
  const [odometerCheck, setOdometerCheck] = useState<OdometerCheckResult | null>(null);
  const [logServiceContext, setLogServiceContext] = useState<Awaited<
    ReturnType<typeof api.getLogServiceContext>
  > | null>(null);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [discountRowOpen, setDiscountRowOpen] = useState(false);
  const [discountInput, setDiscountInput] = useState("");
  const [lineDetailCategories, setLineDetailCategories] = useState<MaintenanceServiceCategory[]>([]);
  const [step, setStep] = useState<DialogStep>("dateMileage");
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => crypto.randomUUID());
  /** CR-03: discount last sent with the current save key; a changed discount needs a new key. */
  const sentDiscountRef = useRef<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [quickJobsLoading, setQuickJobsLoading] = useState(false);
  const [quickJobs, setQuickJobs] = useState<MaintenanceServiceCategory[]>([]);
  const [allSystems, setAllSystems] = useState<MaintenanceServiceCategory[]>([]);
  /** Every job (component) — powers the "Search a job" box. */
  const [allComponents, setAllComponents] = useState<MaintenanceServiceCategory[]>([]);
  /** Sections per group (F1), loaded once per open for every group on the "What was done?" screen. */
  const [sectionsBySystem, setSectionsBySystem] = useState<Map<string, SystemSections>>(new Map());
  const sectionNameByJob = useMemo(() => homeSectionNameByJob(sectionsBySystem), [sectionsBySystem]);
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
    const base =
      catalogTemplates.length > 0
        ? catalogTemplates.map(packageFromCatalog)
        : MAINTENANCE_SCHEDULE_PRESETS.map(packageFromPreset);
    if (!logServiceContext?.packages?.length) return base;
    const ctxByTpl = new Map(logServiceContext.packages.map((p) => [p.templateId, p]));
    return base.map((pkg) => {
      const ctx = pkg.templateId ? ctxByTpl.get(pkg.templateId) : undefined;
      if (!ctx) return pkg;
      return {
        ...pkg,
        dueKind: ctx.status,
        intervalText: ctx.intervalText ?? undefined,
        status: ctx.status,
        kmLabel: ctx.kmLabel,
      };
    });
  }, [catalogTemplates, logServiceContext]);

  const packageChoicesForStep = useMemo((): import("./maintenance-logging/log-service/LogServiceWhatWasDoneStep").LogServicePackageChoice[] => {
    return packageChoices.map((p) => ({
      id: p.id,
      shortLabel: p.shortLabel,
      iconKey: p.iconKey,
      dueKind: p.dueKind,
      intervalText: p.intervalText ?? null,
      status: p.status,
      kmLabel: p.kmLabel ?? null,
    }));
  }, [packageChoices]);

  const catalogById = useMemo(() => {
    const m = new Map<string, MaintenanceServiceCategory>();
    for (const s of allSystems) m.set(s.id, s);
    for (const c of allComponents) m.set(c.id, c);
    for (const c of systemComponents) m.set(c.id, c);
    for (const pkg of packageChoices) {
      for (const c of pkg.categories) m.set(c.id, c);
    }
    for (const q of quickJobs) m.set(q.id, q);
    return m;
  }, [allSystems, allComponents, systemComponents, packageChoices, quickJobs]);

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

  const subtotal = useMemo(() => sumMaintenanceLogLines(lines), [lines]);
  const netTotal = useMemo(
    () => maintenanceServiceNetTotal(lines, discountAmount),
    [lines, discountAmount],
  );
  const discountTooLarge = useMemo(
    () => discountAmount > 0 && maintenanceDiscountTooLarge(lines, discountAmount),
    [lines, discountAmount],
  );

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

  const canContinueDateStep =
    Number(formMeta.odo) > 0 &&
    Boolean(formMeta.date) &&
    (!odometerCheck?.isAnomaly || anomalyAcknowledged);

  const odometerCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open || step !== "dateMileage") return;
    const odo = Number(formMeta.odo);
    if (!formMeta.date || !Number.isFinite(odo) || odo <= 0) {
      setOdometerCheck(null);
      return;
    }
    if (odometerCheckTimer.current) clearTimeout(odometerCheckTimer.current);
    odometerCheckTimer.current = setTimeout(() => {
      setOdometerCheckLoading(true);
      api
        .checkMaintenanceOdometer({ vehicleId, date: formMeta.date, reading: odo })
        .then((res) => {
          setOdometerCheck(res);
          if (!res.isAnomaly) setAnomalyAcknowledged(false);
        })
        .catch(() => setOdometerCheck(null))
        .finally(() => setOdometerCheckLoading(false));
    }, 400);
    return () => {
      if (odometerCheckTimer.current) clearTimeout(odometerCheckTimer.current);
    };
  }, [open, step, formMeta.date, formMeta.odo, vehicleId]);

  useEffect(() => {
    if (!open || !vehicleId) return;
    let cancelled = false;
    api
      .getLogServiceContext(vehicleId)
      .then((ctx) => {
        if (!cancelled) setLogServiceContext(ctx);
      })
      .catch(() => {
        if (!cancelled) setLogServiceContext(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, vehicleId]);

  const persistDraft = useCallback(() => {
    if (!draftUserId || !open) return;
    writeLogServiceDraft(draftUserId, vehicleId, {
      version: 1,
      savedAt: new Date().toISOString(),
      step,
      formMeta: { ...formMeta },
      lines,
      logMode,
      selectedPackageId: selectedPackage?.id ?? null,
      selectedSystemId: selectedSystem?.id ?? null,
      selectedCategoryIds,
      idempotencyKey,
      anomalyAcknowledged,
      discountAmount,
      discountRowOpen,
    });
  }, [
    draftUserId,
    open,
    vehicleId,
    step,
    formMeta,
    lines,
    logMode,
    selectedPackage,
    selectedSystem,
    selectedCategoryIds,
    idempotencyKey,
    anomalyAcknowledged,
    discountAmount,
    discountRowOpen,
  ]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => persistDraft(), 500);
    return () => clearTimeout(t);
  }, [open, persistDraft]);

  const clearDraftAndClose = useCallback(() => {
    if (draftUserId) clearLogServiceDraft(draftUserId, vehicleId);
    onOpenChange(false);
  }, [draftUserId, vehicleId, onOpenChange]);

  const handleWizardStepClick = useCallback(
    (wizardStep: LogServiceWizardStep) => {
      if (wizardStep === 1) setStep("dateMileage");
      else if (wizardStep === 2) setStep("whatWasDone");
      else if (wizardStep === 3 && lineDetailCategories.length > 0) setStep("lineDetails");
    },
    [lineDetailCategories.length],
  );

  // Reset + load systems / quick jobs when dialog opens
  useEffect(() => {
    if (!open) return;
    setIdempotencyKey(crypto.randomUUID());
    sentDiscountRef.current = null;

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
    setLineDetailCategories([]);
    setAnomalyAcknowledged(false);
    setOdometerCheck(null);
    setDiscountAmount(0);
    setDiscountRowOpen(false);
    setDiscountInput("");

    const savedDraft =
      draftUserId && !initialLog?.id ? readLogServiceDraft(draftUserId, vehicleId) : null;
    // Only a draft with jobs in it is worth keeping. It reopens on Review (jobs listed,
    // "Add another job" / "Discard draft" there). A draft with no jobs is dropped so the
    // window always opens fresh on step 1 — never stranded half-way.
    const existingDraft = savedDraft && savedDraft.lines.length > 0 ? savedDraft : null;
    if (savedDraft && !existingDraft && draftUserId) clearLogServiceDraft(draftUserId, vehicleId);

    if (existingDraft && !initialLog?.id) {
      setFormMeta({ ...existingDraft.formMeta, id: existingDraft.formMeta.id ?? undefined });
      setLines(existingDraft.lines);
      setLogMode(existingDraft.logMode);
      setSelectedCategoryIds(existingDraft.selectedCategoryIds);
      setIdempotencyKey(existingDraft.idempotencyKey);
      setAnomalyAcknowledged(existingDraft.anomalyAcknowledged);
      const restoredDiscount = existingDraft.discountAmount ?? 0;
      setDiscountAmount(restoredDiscount);
      setDiscountRowOpen(
        existingDraft.discountRowOpen === true || restoredDiscount > 0,
      );
      setDiscountInput(restoredDiscount > 0 ? String(restoredDiscount) : "");
      setStep("review");
      const pkg = packageChoices.find((p) => p.id === existingDraft.selectedPackageId) ?? null;
      setSelectedPackage(pkg);
      const sys = allSystems.find((s) => s.id === existingDraft.selectedSystemId) ?? null;
      setSelectedSystem(sys);
    } else {
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
      api.listMaintenanceCategories("component").catch((err) => {
        console.error(err);
        return { items: [] as MaintenanceServiceCategory[] };
      }),
    ])
      .then(([qj, systems, comps]) => {
        if (cancelled) return;
        const qItems = qj.items || [];
        const sItems = systems.items || [];
        setAllComponents(
          (comps.items || []).filter(
            (c) => (c as { status?: string }).status !== "retired",
          ),
        );
        const pickable = qItems.length ? qItems : sItems.filter((s) => s.quick_job_eligible);
        setQuickJobs(pickable);
        // Sections for every pickable group, in parallel; a failure just means the flat grid (F4).
        void Promise.all(
          pickable.map((g) =>
            api
              .getSystemSections(g.id)
              .then((s) => [g.id, s] as const)
              .catch(() => null),
          ),
        ).then((pairs) => {
          if (cancelled) return;
          const m = new Map<string, SystemSections>();
          for (const p of pairs) if (p && p[1]?.groups?.length) m.set(p[0], p[1]);
          setSectionsBySystem(m);
        });
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

  /** A job always saves under its OWN home group (parent_id), never the group it was picked from (F2). */
  const resolveSystemForComponent = (
    cat: MaintenanceServiceCategory,
  ): MaintenanceServiceCategory | null => {
    if (cat.parent_id) {
      const fromAll = allSystems.find((s) => s.id === cat.parent_id);
      if (fromAll) return fromAll;
      const fromCat = catalogById.get(cat.parent_id);
      if (fromCat) return fromCat;
    }
    return selectedSystem ?? null;
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
      action: (existing?.action as MaintenanceLineAction) || defaultActionForCategory(cat),
      laborHours: existing?.laborHours ?? null,
      laborRate: existing?.laborRate ?? null,
      brand: existing?.brand || "",
      partNumber: existing?.partNumber || "",
      positions: existing?.positions ? [...existing.positions] : [],
      warranty: Boolean(existing?.warranty),
      complimentary: Boolean(existing?.complimentary),
      partId: existing?.partId || null,
      supplierPartOfferId: existing?.supplierPartOfferId ?? null,
      partConfirmedFit: existing?.partConfirmedFit === true,
      system,
    });
    setStep("lineDetails");
  };

  const enterLineDetailsForCategories = (
    cats: MaintenanceServiceCategory[],
    systemOverride?: MaintenanceServiceCategory | null,
  ) => {
    setLineDetailCategories(cats);
    setFormQueue([]);
    const first =
      cats.find((c) => !lines.some((l) => categoryMatchLine(c, l))) ?? cats[0];
    if (first) openCategoryForm(first, systemOverride ?? null);
    else setStep("lineDetails");
  };

  // Jobs already added stay when the user picks another group ("Add another job").
  const hasAddedJobs = lines.length > 0;

  const handlePickPackage = (pkg: PackageChoice) => {
    setLogMode("package");
    setSelectedPackage(pkg);
    setSelectedSystem(null);
    setSelectedCategoryIds([]);
    if (!hasAddedJobs) setLines([]);
    setFormQueue([]);
    setFormMeta((prev) => ({ ...prev, type: pkg.label }));
    setStep("component");
  };

  const handlePickSystem = async (system: MaintenanceServiceCategory) => {
    setLogMode("quick_job");
    if (!hasAddedJobs) {
      setSelectedPackage(null);
      setLines([]);
    }
    setSelectedSystem(system);
    setSelectedCategoryIds([]);
    setFormQueue([]);
    if (!hasAddedJobs) setFormMeta((prev) => ({ ...prev, type: system.name }));
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
    if (!hasAddedJobs) setSelectedPackage(null);
    setSelectedSystem(null);
    setSelectedCategoryIds([]);
    setFormQueue([]);
    setFormMeta((prev) => ({ ...prev, type: "Digital Inspection" }));
    setStep("inspect");
  };

  const handleToggleQuickComponent = (cat: MaintenanceServiceCategory) => {
    setSelectedCategoryIds((prev) =>
      prev.includes(cat.id) ? prev.filter((id) => id !== cat.id) : [...prev, cat.id],
    );
  };

  const handleContinueFromSystem = () => {
    // Ticked jobs may come from "Also do" chips in another group, so look them up in the full catalog.
    const cats = selectedCategoryIds
      .map((id) => catalogById.get(id) ?? systemComponents.find((c) => c.id === id))
      .filter((c): c is MaintenanceServiceCategory => Boolean(c));
    if (cats.length === 0) return;
    enterLineDetailsForCategories(cats, null);
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
    const newLines = (() => {
      const without = lines.filter((l) => !categoryMatchLine(activeCategory, l));
      return [...without, line];
    })();
    setLines(newLines);
    setSelectedCategoryIds((prev) =>
      prev.includes(activeCategory.id) ? prev : [...prev, activeCategory.id],
    );
    if (lineDetailCategories.length > 0) {
      const next = lineDetailCategories.find(
        (c) =>
          c.id !== activeCategory.id &&
          !newLines.some((l) => categoryMatchLine(c, l)),
      );
      if (next) openCategoryForm(next);
      else setActiveCategory(null);
      return;
    }
    advanceAfterForm(activeCategory);
  };

  const handleContinueFromComponents = () => {
    if (!selectedPackage || selectedCategoryIds.length < 1) return;
    const cats = selectedCategoryIds
      .map((id) => selectedPackage.categories.find((c) => c.id === id))
      .filter((cat): cat is MaintenanceServiceCategory => Boolean(cat));
    if (cats.length === 0) return;
    enterLineDetailsForCategories(cats);
  };

  const handleContinueFromLineDetails = () => {
    const pending = lineDetailCategories.filter(
      (c) => !lines.some((l) => categoryMatchLine(c, l)),
    );
    if (pending.length > 0) {
      toast.error("Save each line before continuing");
      openCategoryForm(pending[0], resolveSystemForComponent(pending[0]));
      return;
    }
    setStep("review");
  };

  const handlePickSuggested = (op: LogServiceSuggestedOp) => {
    const pkg = packageChoices.find(
      (p) => p.templateId === op.categoryId || p.id === op.categoryId,
    );
    if (pkg) {
      handlePickPackage(pkg);
      return;
    }
    const sys = quickJobs.find((s) => s.id === op.categoryId);
    if (sys) {
      void handlePickSystem(sys);
      return;
    }
    const cat = catalogById.get(op.categoryId);
    if (cat) {
      setLogMode("quick_job");
      if (!hasAddedJobs) setSelectedPackage(null);
      // Open the job inside its own group, so Back lands on that group with the job ticked.
      const parent = cat.parent_id
        ? allSystems.find((s) => s.id === cat.parent_id) ?? catalogById.get(cat.parent_id) ?? null
        : null;
      setSelectedSystem(parent);
      if (parent) {
        setSystemComponents(allComponents.filter((c) => c.parent_id === parent.id));
      }
      setSelectedCategoryIds([cat.id]);
      if (!hasAddedJobs) setFormMeta((prev) => ({ ...prev, type: cat.name }));
      enterLineDetailsForCategories([cat], parent);
    }
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
    // A package stays the main service even when extra jobs from other groups were added.
    const effectiveMode: "package" | "quick_job" =
      logMode === "package" || selectedPackage ? "package" : "quick_job";
    const advanceSchedule = effectiveMode === "package" && markPackageComplete;
    const templateId = advanceSchedule
      ? selectedPackage?.templateId || initialLog?.templateId
      : undefined;

    const packageLabel = selectedPackage?.label;
    const typeLabel =
      effectiveMode === "package"
        ? packageLabel || formMeta.type || "Regular Maintenance"
        : quickJobTypeLabel(lines) || formMeta.type;

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
        let saveKey = idempotencyKey;
        if (sentDiscountRef.current !== null && sentDiscountRef.current !== discountAmount) {
          saveKey = crypto.randomUUID();
          setIdempotencyKey(saveKey);
        }
        sentDiscountRef.current = discountAmount;
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
          idempotencyKey: saveKey,
          discount: discountAmount > 0 ? discountAmount : 0,
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
      if (draftUserId) clearLogServiceDraft(draftUserId, vehicleId);
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
      // Say why: a network failure (server unreachable) reads differently from a server refusal.
      const reason =
        error instanceof TypeError && /failed to fetch|networkerror|load failed/i.test(error.message)
          ? "could not reach the server — check your connection and try again"
          : error instanceof Error && error.message
            ? error.message
            : "";
      if (/discount changed/i.test(reason)) {
        // CR-03: the next Save starts a fresh save key with the new discount.
        setIdempotencyKey(crypto.randomUUID());
        sentDiscountRef.current = null;
      }
      const discountErr = /discount can't be more|discounts are switched|valid discount|discount changed/i.test(reason);
      toast.error(
        discountErr
          ? reason
          : reason
            ? `Failed to save service log: ${reason}`
            : "Failed to save service log",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    if (step === "whatWasDone" && hasAddedJobs) {
      setStep("review");
      return;
    }
    if (step === "whatWasDone" && lines.length === 0) {
      setStep("dateMileage");
      return;
    }
    if (step === "dateMileage") {
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
      if (lineDetailCategories.length > 0) setStep("lineDetails");
      else if (logMode === "inspect") setStep("inspect");
      // Reopened from a saved draft: no details form in memory, so go to "What was done?".
      else setStep("whatWasDone");
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

  const ALL_WHEELS = ["LF", "RF", "LR", "RR"];
  const serviceFormFor = (cat: MaintenanceServiceCategory) =>
    isServiceJob(cat)
      ? {
          costMode: (fieldValues.cost_mode === "per_wheel" ? "per_wheel" : "total") as "total" | "per_wheel",
          amount: serviceJobAmount(fieldValues),
          onCostModeChange: (mode: "total" | "per_wheel") =>
            setFieldValues((prev) => ({ ...prev, cost_mode: mode })),
          onAmountChange: (v: number | null) =>
            setFieldValues((prev) => ({ ...prev, service_amount: v })),
          onToggleAllPositions: () =>
            setLineExtras((prev) => ({
              ...prev,
              positions: ALL_WHEELS.every((p) => prev.positions.includes(p)) ? [] : [...ALL_WHEELS],
            })),
        }
      : undefined;

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
            <SelectTrigger id={id} className="bg-surface-container-lowest border-outline-variant/40">
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
            className="bg-surface-container-lowest border-outline-variant/40"
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
          className="bg-surface-container-lowest border-outline-variant/40"
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
      <ResponsiveDialogContent hideCloseButton className="sm:max-w-[720px] max-h-[90vh] flex flex-col p-0 overflow-hidden gap-0">
        <LogServiceWizardChrome
          activeStep={dialogWizardStep(step)}
          vehicle={strip}
          onClose={() => onOpenChange(false)}
          onStepClick={handleWizardStepClick}
          footer={
            <>
              <div className="flex items-center gap-2">
                {/* Cancel on every step: closes and throws the draft away, so the next open starts at step 1. */}
                <Button
                  type="button"
                  data-testid="log-service-cancel"
                  onClick={clearDraftAndClose}
                  className="bg-error text-on-error hover:bg-error/90"
                >
                  {LOG_SERVICE_COPY.cancelLabel}
                </Button>
                {step !== "dateMileage" ? (
                  <Button type="button" variant="outline" onClick={handleBack} className="text-on-surface">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    {step === "whatWasDone" && hasAddedJobs
                      ? LOG_SERVICE_COPY.backToReview(lines.length)
                      : LOG_SERVICE_COPY.backLabel}
                  </Button>
                ) : null}
              </div>
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
                {step === "system" ? (
                  <LogServiceWizardContinueButton
                    label={LOG_SERVICE_COPY.continueWithJobs(selectedCategoryIds.length)}
                    disabled={selectedCategoryIds.length < 1}
                    onClick={handleContinueFromSystem}
                  />
                ) : null}
                {step === "component" && (selectedCategoryIds.length >= 1 || lines.length >= 1) ? (
                  <>
                    <Button type="button" variant="outline" onClick={goToInspectOrReview}>
                      Inspect
                    </Button>
                    <LogServiceWizardContinueButton
                      label={LOG_SERVICE_COPY.stepFooterPattern(2, 4, LOG_SERVICE_COPY.continueToDetails)}
                      onClick={handleContinueFromComponents}
                    />
                  </>
                ) : null}
                {step === "lineDetails" && lineDetailCategories.length > 0 ? (
                  <LogServiceWizardContinueButton
                    label={LOG_SERVICE_COPY.continueToReview}
                    onClick={handleContinueFromLineDetails}
                  />
                ) : null}
                {step === "lineDetails" && lineDetailCategories.length === 0 ? (
                  <LogServiceWizardContinueButton
                    label={LOG_SERVICE_COPY.saveLineLabel}
                    onClick={handleSaveCategory}
                  />
                ) : null}
                {step === "review" ? (
                  <>
                    {!initialLog?.id ? (
                      <Button
                        type="button"
                        variant="outline"
                        data-testid="log-service-add-another-job"
                        onClick={() => {
                          setActiveCategory(null);
                          setLineDetailCategories([]);
                          setStep("whatWasDone");
                        }}
                      >
                        {LOG_SERVICE_COPY.addAnotherJob}
                      </Button>
                    ) : null}
                    <LogServiceWizardContinueButton
                      label={LOG_SERVICE_COPY.logServiceLabel}
                      disabled={
                        isLoading
                        || lines.length < 1
                        || Number(formMeta.odo) <= 0
                        || discountTooLarge
                      }
                      loading={isLoading}
                      onClick={() => void handleSave()}
                    />
                  </>
                ) : null}
              </div>
            </>
          }
        >
          {step === "dateMileage" && (
            <LogServiceDateMileageStep
              date={formMeta.date}
              odometer={formMeta.odo}
              onDateChange={(date) => {
                setAnomalyAcknowledged(false);
                setFormMeta((p) => ({ ...p, date }));
              }}
              onOdometerChange={(odo) => {
                setOdoTouched(true);
                setAnomalyAcknowledged(false);
                setFormMeta((p) => ({ ...p, odo }));
              }}
              lastTrustedReading={vehicleStrip?.odometerKm ?? defaultOdo}
              lastTrustedMeta={
                vehicleStrip?.odometerDateLabel && vehicleStrip?.sourceLabel
                  ? `${vehicleStrip.odometerDateLabel} · ${vehicleStrip.sourceLabel}`
                  : vehicleStrip?.odometerDateLabel ?? null
              }
              showOdometerError={odoTouched && Number(formMeta.odo) <= 0}
              checkLoading={odometerCheckLoading}
              checkResult={odometerCheck}
              anomalyAcknowledged={anomalyAcknowledged}
              onAcknowledgeAnomaly={() => setAnomalyAcknowledged(true)}
            />
          )}
          {step === "whatWasDone" && (
            <LogServiceWhatWasDoneStep
              packages={packageChoicesForStep}
              quickJobs={quickJobs}
              allJobs={allComponents}
              allSystems={allSystems}
              sectionNameByJob={sectionNameByJob}
              quickJobsLoading={quickJobsLoading}
              suggestedOperations={logServiceContext?.suggestedOperations}
              inspectionPointCount={logServiceContext?.inspectionPointCount}
              onPickPackage={(p) => {
                const full = packageChoices.find((x) => x.id === p.id);
                if (full) handlePickPackage(full);
              }}
              onPickSystem={handlePickSystem}
              onPickSuggested={handlePickSuggested}
              onOpenInspection={handleOpenInspection}
            />
          )}

          {step === "system" && selectedSystem && (
            <LogServiceSystemPicker
              system={selectedSystem}
              components={systemComponents}
              loading={systemComponentsLoading}
              sections={visibleSections(sectionsBySystem.get(selectedSystem.id))}
              selectedIds={selectedCategoryIds}
              isAdded={categoryHasLine}
              onToggleComponent={handleToggleQuickComponent}
              onToggleRelated={(rel) =>
                setSelectedCategoryIds((prev) =>
                  prev.includes(rel.categoryId)
                    ? prev.filter((id) => id !== rel.categoryId)
                    : [...prev, rel.categoryId],
                )
              }
            />
          )}

          {step === "component" && selectedPackage && (
            <LogServiceComponentPicker
              packageLabel={selectedPackage.shortLabel}
              selectedCount={selectedCategoryIds.length}
              loggedCount={lines.filter((l) => !l.recommended).length}
              categories={selectedPackage.categories}
              systems={allSystems}
              selectedCategoryIds={selectedCategoryIds}
              categoryHasLine={categoryHasLine}
              onComponentTap={handleComponentTap}
              onToggleCategorySelected={toggleCategorySelected}
            />
          )}

          {step === "lineDetails" && lineDetailCategories.length > 0 && (
            <LogServiceLineDetailsMultiStep
              packageLabel={selectedPackage?.shortLabel ?? null}
              componentCount={lineDetailCategories.length}
              baySessionLabel={idempotencyKey.slice(0, 8).toUpperCase()}
              configuredCount={lineDetailCategories.filter((c) => categoryHasLine(c)).length}
              subtotalLabel={`${formMeta.currency || "JMD"} ${subtotal.toLocaleString()}`}
              oemMatch={logServiceOemMatchSummary(lines)}
              homeBase={vehicleStrip?.homeBase}
              mechanicNote={formMeta.notes}
              onMechanicNoteChange={(notes) => setFormMeta((p) => ({ ...p, notes }))}
            >
              {lineDetailCategories.map((cat) => (
                <div
                  key={cat.id}
                  className={`rounded-xl border bg-surface-container-lowest p-4 shadow-sm ${
                    activeCategory?.id === cat.id ? "border-primary/50 ring-1 ring-primary/20" : "border-outline-variant/40"
                  }`}
                >
                  {activeCategory?.id === cat.id && (
                    <LogServiceLineDetailsStep
                      category={cat}
                      systemName={lineExtras.system?.name}
                      action={lineExtras.action}
                      onActionChange={(action) => setLineExtras((prev) => ({ ...prev, action }))}
                      categoryFields={(cat.field_schema?.fields || defaultFieldSchema().fields)
                        .filter((f) => !hiddenLineFieldsFor(cat).includes(f.key))
                        .map(renderField)}
                      hiddenFields={hiddenLineFieldsFor(cat)}
                      laborHours={lineExtras.laborHours}
                      laborRate={lineExtras.laborRate}
                      onLaborHoursChange={(v) => setLineExtras((prev) => ({ ...prev, laborHours: v }))}
                      onLaborRateChange={(v) => setLineExtras((prev) => ({ ...prev, laborRate: v }))}
                      brand={lineExtras.brand}
                      partNumber={lineExtras.partNumber}
                      onBrandChange={(brand) => setLineExtras((prev) => ({ ...prev, brand }))}
                      onPartNumberChange={(partNumber) => setLineExtras((prev) => ({ ...prev, partNumber }))}
                      showPositions={needsPositions(cat)}
                      sideOptions={sidePositionsFor(cat)}
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
                      onPartSelect={(partId, offerId, brand, partNumber, partConfirmedFit) =>
                        setLineExtras((prev) => ({
                          ...prev,
                          partId,
                          supplierPartOfferId: offerId,
                          partConfirmedFit: partConfirmedFit === true,
                          brand: prev.brand || brand || prev.brand,
                          partNumber: prev.partNumber || partNumber || prev.partNumber,
                        }))
                      }
                      lineTotalLabel="Line total"
                      currency={formMeta.currency || "JMD"}
                      lineTotal={draftLineTotal}
                      serviceForm={serviceFormFor(cat)}
                    />
                  )}
                  {activeCategory?.id !== cat.id && (
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-on-surface">{cat.name}</p>
                        <p className="text-xs text-stitch-secondary">
                          {categoryHasLine(cat) ? "Saved" : "Needs details"}
                        </p>
                      </div>
                      <Button type="button" size="sm" variant="outline" onClick={() => openCategoryForm(cat)}>
                        {categoryHasLine(cat) ? "Edit" : "Configure"}
                      </Button>
                    </div>
                  )}
                  {activeCategory?.id === cat.id && (
                    <div className="mt-4 flex justify-end">
                      <LogServiceWizardContinueButton
                        label={LOG_SERVICE_COPY.saveLineLabel}
                        onClick={handleSaveCategory}
                      />
                    </div>
                  )}
                </div>
              ))}
            </LogServiceLineDetailsMultiStep>
          )}

          {step === "lineDetails" && lineDetailCategories.length === 0 && activeCategory && (
            <LogServiceLineDetailsStep
              category={activeCategory}
              systemName={lineExtras.system?.name}
              action={lineExtras.action}
              onActionChange={(action) => setLineExtras((prev) => ({ ...prev, action }))}
              categoryFields={(activeCategory.field_schema?.fields || defaultFieldSchema().fields)
                .filter((f) => !hiddenLineFieldsFor(activeCategory).includes(f.key))
                .map(renderField)}
              hiddenFields={hiddenLineFieldsFor(activeCategory)}
              laborHours={lineExtras.laborHours}
              laborRate={lineExtras.laborRate}
              onLaborHoursChange={(v) => setLineExtras((prev) => ({ ...prev, laborHours: v }))}
              onLaborRateChange={(v) => setLineExtras((prev) => ({ ...prev, laborRate: v }))}
              brand={lineExtras.brand}
              partNumber={lineExtras.partNumber}
              onBrandChange={(brand) => setLineExtras((prev) => ({ ...prev, brand }))}
              onPartNumberChange={(partNumber) => setLineExtras((prev) => ({ ...prev, partNumber }))}
              showPositions={needsPositions(activeCategory)}
              sideOptions={sidePositionsFor(activeCategory)}
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
              onPartSelect={(partId, offerId, brand, partNumber, partConfirmedFit) =>
                setLineExtras((prev) => ({
                  ...prev,
                  partId,
                  supplierPartOfferId: offerId,
                  partConfirmedFit: partConfirmedFit === true,
                  brand: prev.brand || brand || prev.brand,
                  partNumber: prev.partNumber || partNumber || prev.partNumber,
                }))
              }
              lineTotalLabel="Line total"
              currency={formMeta.currency || "JMD"}
              lineTotal={draftLineTotal}
              serviceForm={serviceFormFor(activeCategory)}
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
              subtotal={subtotal}
              netTotal={netTotal}
              // CR-06: edit mode never sends a discount (D-08), so don't offer one.
              discountEnabled={!initialLog?.id && logServiceContext?.discountEnabled === true}
              discountAmount={discountAmount}
              discountInputValue={discountInput}
              discountRowOpen={discountRowOpen}
              discountTooLarge={discountTooLarge}
              onAddDiscount={() => setDiscountRowOpen(true)}
              onRemoveDiscount={() => {
                setDiscountRowOpen(false);
                setDiscountAmount(0);
                setDiscountInput("");
              }}
              onDiscountChange={(raw) => {
                if (raw !== "" && !/^[\d.,\s]*$/.test(raw)) return;
                const trimmed = raw.trim();
                if (!trimmed) {
                  setDiscountInput("");
                  setDiscountAmount(0);
                  return;
                }
                const parsed = parseMaintenanceDiscount(raw);
                if (parsed === null) return;
                setDiscountInput(raw);
                setDiscountAmount(parsed);
              }}
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
              showMarkPackageComplete={logMode === "package" || Boolean(selectedPackage)}
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
