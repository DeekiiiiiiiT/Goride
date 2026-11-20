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
  JobSearchBox,
  LogServiceLineDetailsStep,
  PLANNED_HINTS,
  LogServiceLineDetailsMultiStep,
  LogServiceReviewStep,
  LogServiceSystemPicker,
  LogServiceComponentPicker,
  LogServiceWizardChrome,
  LogServiceWizardContinueButton,
  LOG_SERVICE_COPY,
} from "./maintenance-logging/log-service";
import { LS, LT, splitPlate } from "./maintenance-logging/log-service/logServiceStitch";
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
import { ItemsUsedSection } from "./maintenance-logging/log-service/ItemsUsedSection";
import { PickPartDialog } from "./maintenance-logging/log-service/PickPartDialog";
import { useJobItems } from "./maintenance-logging/log-service/useJobItems";
import {
  keepAllowedPositions,
  positionMissing,
  positionsForWire,
  positionUiFor,
  togglePositionCode,
} from "./maintenance-logging/log-service/positionChips";
import { SaveLineHint, WhereOnCarChips } from "./maintenance-logging/log-service/WhereOnCarChips";
import { PartsThatFitPanel } from "./maintenance-logging/log-service/PartsThatFitPanel";
import { PLAN_COPY, PlanJobDialog } from "./maintenance-logging/log-service/PlanJobDialog";
import { AlsoDoneOnVisit } from "./maintenance-logging/log-service/AlsoDoneOnVisit";
import { QUOTE_MODE_COPY } from "./maintenance-logging/log-service/LogServiceLineDetailsStep";
import { recommendedByJob, type RecommendedWith } from "./maintenance-logging/log-service/systemSections";
import {
  ADD_TO_INSPECTION_COPY,
  AddToInspectionReview,
  addFoundErrorText,
} from "./maintenance-logging/log-service/addToInspection";
import { jobWithPlaces, shortDate, type FitPart } from "./maintenance-logging/log-service/partsThatFit";
import {
  isNotUsual,
  jobFitFromResponse,
  powertrainPill,
  type JobFitState,
} from "./maintenance-logging/log-service/jobFit";
import { draftFromSavedItem, linesHaveItemErrors, money } from "./maintenance-logging/log-service/itemsUsed";
import {
  AddFoundJobDialog,
  FoundCollapsedInspectionRow,
  FoundFromInspectionBanner,
  FoundWorkSection,
  FromInspectionChip,
} from "./maintenance-logging/log-service/FoundWorkSection";
import {
  FOUND_COPY,
  applyFoundDrafts,
  draftsFromLines,
  foundBannerText,
  foundByJob,
  foundLineFromDraft,
  openFoundCountFor,
  foundLineFromDraft as foundLineFromDraftFn,
  isFoundLine as isFoundLineFn,
  lineJobId,
  quoteDetailOfLine,
  quoteSnapshotOf,
  searchFoundJobs,
  withQuoteOnFoundLine,
  type QuoteSnapshot,
  type FoundDraft,
  type FoundMode,
} from "./maintenance-logging/log-service/foundWork";
import {
  NotFinishedBanner,
  SaveFailedBanner,
  ServiceChangedDialog,
  type FinishState,
} from "./maintenance-logging/ServiceSaveStates";
import { finishFailureText, MaintenanceSaveError } from "../../services/maintenanceSaveError";
import type {
  CatalogMaintenanceTaskOption,
  FoundWorkItem,
  LineItemDraft,
  MaintenanceCategoryFieldDef,
  MaintenanceLineAction,
  MaintenanceLog,
  MaintenanceLogLine,
  MaintenanceServiceCategory,
} from "../../types/maintenance";
import {
  formatMaintenanceLineLabel,
  groupCategoriesBySystem,
  lineItemForWire,
  lineItemsAmount,
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
  /** Powertrain job fit: "Link this car" opens the car's page (only where the host can). */
  onLinkCar?: () => void;
  /**
   * Opened from "Log it now" on a found job (inspection findings): after Date & mileage the dialog goes
   * straight to that job's details, shows the "From inspection" banner and saves with fromFoundLineId.
   */
  fromFoundWork?: FoundWorkItem | null;
  /**
   * LC-14 "Add a job to this inspection": the same window, but the jobs are what a saved inspection found (not done
   * yet, J$ 0). No Date & mileage, no prices; Review adds them to that inspection. What was paid never changes.
   */
  addToInspection?: AddToInspectionTarget | null;
}

export type AddToInspectionTarget = {
  workOrderId: string;
  /** LC-17: Add / Edit quote on this one waiting job (opens straight on its form, saves only its quote). */
  editLine?: FoundWorkItem | null;
  /** "Inspection / diagnostic fee · 22 Aug 2026 · Whol-Hearted Car Service Ltd" */
  inspectionLine: string;
};

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

type LineExtras = {
  action: MaintenanceLineAction;
  laborHours: number | null;
  laborRate: number | null;
  brand: string;
  partNumber: string;
  positions: string[];
  /** A position chip or wheel button was tapped (LS-05: an untouched saved line keeps its positions). */
  positionsTouched: boolean;
  warranty: boolean;
  complimentary: boolean;
  partId: string | null;
  supplierPartOfferId: string | null;
  partConfirmedFit: boolean;
  system: MaintenanceServiceCategory | null;
  /** Items used on this job (never pre-ticked). */
  items: LineItemDraft[];
  /** "Done today" job: the inspection job it came from (saved as values.found_today + found_by_job). */
  foundToday: string | null;
  /** Opened from "Log it now": the found job this line closes. */
  fromFoundLineId: string | null;
};

function defaultExtras(system: MaintenanceServiceCategory | null = null): LineExtras {
  return {
    items: [],
    foundToday: null,
    fromFoundLineId: null,
    action: "replace",
    laborHours: null,
    laborRate: null,
    brand: "",
    partNumber: "",
    positions: [],
    positionsTouched: false,
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
      positions: [...extras.positions],
      positionsTouched: extras.positionsTouched,
      positionScheme: cat.position_scheme ?? null,
      positionAware: cat.position_aware ?? null,
      complimentary: extras.complimentary || undefined,
      notes: typeof values.notes === "string" ? values.notes : undefined,
      values: {
        cost_mode: values.cost_mode === "per_wheel" ? "per_wheel" : "total",
        service_amount: serviceJobAmount(values),
        ...(extras.foundToday ? { found_today: true, found_by_job: extras.foundToday } : {}),
      },
      items: extras.items.length ? extras.items.map((i) => ({ ...i })) : undefined,
      ...(extras.fromFoundLineId ? { fromFoundLineId: extras.fromFoundLineId } : {}),
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
    positions: [...extras.positions],
    positionsTouched: extras.positionsTouched,
    positionScheme: cat.position_scheme ?? null,
    positionAware: cat.position_aware ?? null,
    brand: extras.brand.trim() || undefined,
    partNumber: extras.partNumber.trim() || undefined,
    warranty: extras.warranty || undefined,
    complimentary: extras.complimentary || undefined,
    partId: extras.partId || undefined,
    supplierPartOfferId: extras.supplierPartOfferId || undefined,
    partConfirmedFit: extras.partId ? extras.partConfirmedFit : undefined,
    notes: typeof values.notes === "string" ? values.notes : undefined,
    values: extras.foundToday ? { ...values, found_today: true, found_by_job: extras.foundToday } : { ...values },
    items: extras.items.length ? extras.items.map((i) => ({ ...i })) : undefined,
    ...(extras.fromFoundLineId ? { fromFoundLineId: extras.fromFoundLineId } : {}),
  };
}

/**
 * Lines as the server takes them: items reduced to the keys it reads. With the switch known to be off,
 * unsaved items are dropped; items already saved are still sent, so the server refuses rather than
 * this screen silently deleting them.
 */
function linesForSave(lines: MaintenanceLogLine[], itemsEnabled: boolean | null): MaintenanceLogLine[] {
  return lines.map((line) => {
    const l = positionsForWire(line);
    const { items, itemsAmount: _ia, lineTotal: _lt, voidedAt: _va, ...rest } = l;
    if (l.declined || !items?.length) return rest;
    if (itemsEnabled === false && !items.some((i) => i.id)) return rest;
    return { ...rest, items: items.map(lineItemForWire) as unknown as LineItemDraft[] };
  });
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
  onLinkCar,
  fromFoundWork = null,
  addToInspection = null,
}: LogMaintenanceServiceDialogProps) {
  const addMode = Boolean(addToInspection);
  // Powertrain job fit (audit PT-1 / PT-7): one answer per open; "off" until the server says otherwise.
  const [jobFit, setJobFit] = useState<JobFitState>({ status: "off" });
  const [jobFitTick, setJobFitTick] = useState(0);
  const [showAllJobs, setShowAllJobs] = useState(false);
  const [showAllInGroup, setShowAllInGroup] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!open || !vehicleId) return;
    let live = true;
    setShowAllJobs(false);
    setShowAllInGroup(new Set());
    setJobFit((prev) => (prev.status === "off" && jobFitTick === 0 ? prev : { status: "loading" }));
    api
      .getJobFitForVehicle(vehicleId)
      .then((res) => live && setJobFit(jobFitFromResponse(res)))
      .catch(() => live && setJobFit({ status: "error" }));
    return () => {
      live = false;
    };
  }, [open, vehicleId, jobFitTick]);
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
  /** "Also do" per job from EVERY loaded group (groups without sections too, e.g. Brakes). */
  const [alsoDoByJob, setAlsoDoByJob] = useState<Map<string, RecommendedWith[]>>(new Map());
  /** Groups whose "also do" list is loaded (or loading), so a job's own group is fetched once if it wasn't. */
  const alsoDoGroupsRef = useRef<Set<string>>(new Set());
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

  /** May-need items per job + the fleet's service-items switch. */
  const jobItems = useJobItems();
  const itemsEnabled = jobItems.enabled === true;
  /** Inspection findings (audit section 5): only on inspection jobs, only with the fleet's switch on. */
  const isInspectionJob = useCallback(
    (jobId: string | null | undefined) =>
      Boolean(jobId) && jobItems.findingsEnabled && jobItems.findingsJobIds.has(String(jobId)),
    [jobItems.findingsEnabled, jobItems.findingsJobIds],
  );
  /** "What the inspection found" on the open inspection job; written into `lines` on Save line. */
  const [foundDrafts, setFoundDrafts] = useState<FoundDraft[]>([]);
  const [foundPickerOpen, setFoundPickerOpen] = useState(false);
  /**
   * LC-16 quote cards: a "Not done yet" job of an inspection gets its own job card (the same form) for the garage's
   * quote. Job id -> the inspection job it belongs to. Saving it writes the quote onto the J$ 0 found line.
   */
  const [quoteCards, setQuoteCards] = useState<Map<string, string>>(new Map());
  const quoteCardsRef = useRef<Map<string, string>>(new Map());
  /** LC-15 Done: the car's other pending jobs, and the ones ticked as "Also done on this visit". */
  const [otherFound, setOtherFound] = useState<FoundWorkItem[]>([]);
  const [extraFound, setExtraFound] = useState<FoundWorkItem[]>([]);
  useEffect(() => {
    setExtraFound([]);
    setOtherFound([]);
    if (!open || !fromFoundWork || !vehicleId) return;
    let live = true;
    api
      .listFoundWork(vehicleId)
      .then((res) => live && setOtherFound(res.items.filter((i) => i.lineId !== fromFoundWork.lineId)))
      .catch(() => undefined); // the list is a helper; Done still works without it
    return () => {
      live = false;
    };
  }, [open, fromFoundWork, vehicleId]);
  /** "Done today" jobs waiting for their own card (so their form opens with the From inspection chip). */
  /** Done-today job id → the inspection job it came from. */
  const foundTodayIdsRef = useRef<Map<string, string>>(new Map());
  /** Which open job the found list was loaded for (the inspection flag can arrive after the form opens). */
  const foundDraftsForRef = useRef<string | null>(null);
  /** The ticked part item whose "Pick a part" dialog is open. */
  const [pickingItem, setPickingItem] = useState<LineItemDraft | null>(null);
  /** Slice C "Plan it" overlay: the job (and part) being planned. */
  const [planTarget, setPlanTarget] = useState<{ cat: MaintenanceServiceCategory; part: FitPart | null } | null>(null);
  const [planBusy, setPlanBusy] = useState(false);
  const planKeyRef = useRef<string>(crypto.randomUUID());
  /** Version of the service being edited (edits send it back; a mismatch → "This service was changed"). */
  const [editVersion, setEditVersion] = useState<number | null>(null);
  const [saveProblem, setSaveProblem] = useState<
    null | { kind: "failed"; reason: string } | { kind: "notFinished"; finish: FinishState }
  >(null);
  const [changedOpen, setChangedOpen] = useState(false);
  const [reloading, setReloading] = useState(false);

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
      ({
        ...(vehicleStrip ?? {
          vehicleLabel: vehicleId,
          odometerKm: defaultOdo ?? (formMeta.odo > 0 ? formMeta.odo : null),
        }),
        powertrainLabel: powertrainPill(jobFit),
      }),
    [vehicleStrip, vehicleId, defaultOdo, formMeta.odo, jobFit],
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
    if (!draftUserId || !open || addMode) return;
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
    addMode,
  ]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => persistDraft(), 500);
    return () => clearTimeout(t);
  }, [open, persistDraft]);

  const clearDraftAndClose = useCallback(() => {
    if (draftUserId && !addMode) clearLogServiceDraft(draftUserId, vehicleId);
    onOpenChange(false);
  }, [draftUserId, vehicleId, onOpenChange, addMode]);

  const handleWizardStepClick = useCallback(
    (wizardStep: LogServiceWizardStep) => {
      if (wizardStep === 1) {
        if (!addMode) setStep("dateMileage");
      } else if (wizardStep === 2) setStep("whatWasDone");
      else if (wizardStep === 3 && lineDetailCategories.length > 0) setStep("lineDetails");
    },
    [lineDetailCategories.length, addMode],
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
    jobItems.reset();
    setPickingItem(null);
    setSaveProblem(null);
    setChangedOpen(false);
    setFoundDrafts([]);
    setFoundPickerOpen(false);
    foundTodayIdsRef.current = new Map();
    setEditVersion(typeof initialLog?.version === "number" ? initialLog.version : null);

    // "Log it now" always starts fresh on step 1 for that job; an unrelated saved draft is left alone.
    const savedDraft =
      draftUserId && !initialLog?.id && !fromFoundWork && !addToInspection ? readLogServiceDraft(draftUserId, vehicleId) : null;
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
        // Adding to a saved inspection: its date and mileage are already set — start on Work done.
        setStep(addToInspection ? "whatWasDone" : "dateMileage");
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
        // The same answer carries each job's May-need items and the service-items switch.
        void Promise.all(
          pickable.map((g) =>
            api
              .getSystemSections(g.id)
              .then((s) => [g.id, s] as const)
              .catch(() => {
                if (!cancelled) jobItems.fail(g.id);
                return null;
              }),
          ),
        ).then((pairs) => {
          if (cancelled) return;
          const m = new Map<string, SystemSections>();
          const all = new Map<string, SystemSections>();
          for (const p of pairs) {
            if (!p) continue;
            jobItems.ingest(p[0], p[1]);
            if (p[1]) all.set(p[0], p[1]);
            if (p[1]?.groups?.length) m.set(p[0], p[1]);
          }
          setSectionsBySystem(m);
          for (const id of all.keys()) alsoDoGroupsRef.current.add(id);
          const loaded = recommendedByJob(all);
          setAlsoDoByJob((prev) => new Map([...prev, ...loaded]));
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
  }, [open, vehicleId, defaultOdo, catalogTemplates, initialLog, fromFoundWork]);

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

  /** The found job a card closes: the one Done was pressed on, or one ticked under "Also done on this visit?". */
  const foundFor = (catId: string): FoundWorkItem | null =>
    [fromFoundWork, ...extraFound, addToInspection?.editLine ?? null].find((f): f is FoundWorkItem => Boolean(f) && f!.jobId === catId) ?? null;
  const openCategoryForm = (
    cat: MaintenanceServiceCategory,
    systemOverride?: MaintenanceServiceCategory | null,
  ) => {
    const existing = lines.find((l) => categoryMatchLine(cat, l));
    const system = systemOverride ?? resolveSystemForComponent(cat);
    const found = foundFor(cat.id);
    // LC-16: a quote card reads its found line; Done reads the found job's saved quote. Either fills the form.
    const quoteInsp = quoteCards.get(cat.id);
    const quoteLine = quoteInsp
      ? lines.find((l) => isFoundLineFn(l) && lineJobId(l) === cat.id && foundByJob(l) === quoteInsp)
      : undefined;
    const snap: QuoteSnapshot | null = quoteLine
      ? quoteDetailOfLine(quoteLine)
      : !existing
        ? ((found?.quoteDetail as QuoteSnapshot | null | undefined) ?? null)
        : null;
    setActiveCategory(cat);
    setFieldValues(
      existing?.values
        ? { ...emptyValuesForCategory(cat), ...existing.values }
        : {
            ...emptyValuesForCategory(cat),
            // LC-15: Done on a quoted job — the quote is the price to confirm (a service's charge box).
            ...(found?.quoteAmount && isServiceJob(cat) ? { service_amount: found.quoteAmount } : {}),
            ...(snap?.values ?? {}),
            ...(quoteLine?.notes ? { notes: quoteLine.notes } : {}),
            // LC-17 Edit quote: the waiting job's own note comes back too.
            ...(addToInspection?.editLine && found?.lineId === addToInspection.editLine.lineId && found.note
              ? { notes: found.note }
              : {}),
          },
    );
    setLineExtras({
      action: (existing?.action as MaintenanceLineAction) || defaultActionForCategory(cat),
      laborHours: existing?.laborHours ?? null,
      laborRate: existing?.laborRate ?? null,
      brand: existing?.brand || "",
      partNumber: existing?.partNumber || "",
      ...(() => {
        if (existing) {
          return {
            positions: existing.positions ? [...existing.positions] : [],
            positionsTouched: existing.positionsTouched === true,
          };
        }
        // "Log it now" (LS-06): open with the found job's position picked, minus codes the job no longer has.
        if (quoteLine?.positions?.length) {
          return { positions: [...quoteLine.positions], positionsTouched: true };
        }
        if (found) {
          const kept = keepAllowedPositions(positionUiFor(cat, true), found.positions);
          return { positions: kept, positionsTouched: kept.length > 0 };
        }
        return { positions: [] as string[], positionsTouched: false };
      })(),
      warranty: Boolean(existing?.warranty),
      complimentary: Boolean(existing?.complimentary),
      partId: existing?.partId || null,
      supplierPartOfferId: existing?.supplierPartOfferId ?? null,
      partConfirmedFit: existing?.partConfirmedFit === true,
      // "Log it now" on a planned job (LC-05): opens with the part picked when it was planned.
      ...(!existing && found?.partId
        ? {
            partId: found.partId,
            brand: found.partBrand ?? "",
            partNumber: found.partNumber ?? "",
          }
        : {}),
      ...(!existing && snap
        ? {
            laborHours: snap.laborHours ?? null,
            laborRate: snap.laborRate ?? null,
            brand: snap.brand ?? "",
            partNumber: snap.partNumber ?? "",
            warranty: snap.warranty === true,
            complimentary: snap.complimentary === true,
            ...(snap.partId ? { partId: snap.partId } : {}),
          }
        : {}),
      system,
      items: existing?.items
        ? existing.items.map((i) => draftFromSavedItem(i))
        : (snap?.items ?? []).map((i) => ({ ...i })),
      foundToday:
        (existing?.values as Record<string, unknown> | undefined)?.found_today === true
          ? (existing ? foundByJob(existing) : null) ?? foundTodayIdsRef.current.get(cat.id) ?? null
          : (foundTodayIdsRef.current.get(cat.id) ?? null),
      fromFoundLineId: existing?.fromFoundLineId ?? found?.lineId ?? null,
    });
    // The found list is (re)loaded from the lines by the effect below once this job is known to be an inspection.
    foundDraftsForRef.current = null;
    setFoundDrafts([]);
    setFoundPickerOpen(false);
    void jobItems.ensure(cat.parent_id);
    setStep("lineDetails");
  };

  // ---- Inspection findings: "What the inspection found" on the inspection job ----
  // Load the found list from the saved lines once the open job is known to be an inspection. Opening a
  // saved inspection before its group's answer arrives must not start with an empty list (Save line would
  // otherwise drop its found jobs).
  useEffect(() => {
    if (!activeCategory || !isInspectionJob(activeCategory.id)) return;
    if (foundDraftsForRef.current === activeCategory.id) return;
    foundDraftsForRef.current = activeCategory.id;
    setFoundDrafts(draftsFromLines(lines, activeCategory.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per opened inspection, not on every line edit
  }, [activeCategory, isInspectionJob]);
  const setFoundMode = (jobId: string, mode: FoundMode) =>
    setFoundDrafts((prev) => prev.map((d) => (d.jobId === jobId ? { ...d, mode } : d)));
  const setFoundNote = (jobId: string, note: string) =>
    setFoundDrafts((prev) => prev.map((d) => (d.jobId === jobId ? { ...d, note } : d)));
  const removeFoundDraft = (jobId: string) => {
    let removed: { draft: FoundDraft; index: number } | null = null;
    setFoundDrafts((prev) => {
      const index = prev.findIndex((d) => d.jobId === jobId);
      if (index < 0) return prev;
      removed = { draft: prev[index], index };
      return prev.filter((d) => d.jobId !== jobId);
    });
    const name = foundDrafts.find((d) => d.jobId === jobId)?.name ?? "Job";
    toast(FOUND_COPY.removedToast(name), {
      action: {
        label: FOUND_COPY.undo,
        onClick: () => {
          const r = removed as { draft: FoundDraft; index: number } | null;
          if (!r) return;
          setFoundDrafts((prev) => {
            if (prev.some((d) => d.jobId === r.draft.jobId)) return prev;
            const next = [...prev];
            next.splice(Math.min(r.index, next.length), 0, r.draft);
            return next;
          });
        },
      },
    });
  };
  const addFoundJob = (job: MaintenanceServiceCategory) => {
    setFoundDrafts((prev) =>
      prev.some((d) => d.jobId === job.id) ? prev : [...prev, { jobId: job.id, name: job.name, mode: "later", note: "" }],
    );
    setFoundPickerOpen(false);
  };
  const searchFoundPicker = useCallback(
    (query: string) =>
      searchFoundJobs({
        query,
        jobs: allComponents,
        groupName: (job) => (job.parent_id ? catalogById.get(job.parent_id)?.name ?? "" : ""),
        jobFit,
        isInspectionJob: (id) => isInspectionJob(id),
      }),
    [allComponents, catalogById, jobFit, isInspectionJob],
  );
  const foundSlotFor = (cat: MaintenanceServiceCategory) =>
    isInspectionJob(cat.id) ? (
      <FoundWorkSection
        drafts={foundDrafts}
        currency={formMeta.currency || "JMD"}
        onAdd={() => setFoundPickerOpen(true)}
        onModeChange={setFoundMode}
        onNoteChange={setFoundNote}
        onRemove={removeFoundDraft}
        renderWhere={renderFoundWhere}
        renderParts={renderFoundParts}
      />
    ) : undefined;
  const fromInspectionChipFor = (cat: MaintenanceServiceCategory) =>
    activeCategory?.id === cat.id && (lineExtras.foundToday || lineExtras.fromFoundLineId) ? (
      <FromInspectionChip />
    ) : undefined;
  /** Open found jobs on this service (not declined) — the collapsed row's amber chip. */
  const openFoundCountFor_ = (inspectionJobId: string) => openFoundCountFor(lines, inspectionJobId);

  /** Where this job's May-need list stands: its own group's load, or "none" for preset jobs. */
  const jobItemsStatusFor = (cat: MaintenanceServiceCategory) => {
    if (cat.id.startsWith("synthetic-") || !cat.parent_id) return "none" as const;
    return jobItems.statusBySystem.get(cat.parent_id) ?? ("loading" as const);
  };

  const itemsSlotFor = (cat: MaintenanceServiceCategory) => {
    if (!itemsEnabled) return undefined;
    const charge = draftLine ? lineTotalPreview(draftLine) - lineItemsAmount(draftLine) : 0;
    return (
      <ItemsUsedSection
        jobItems={jobItems.itemsByJob.get(cat.id) ?? []}
        status={jobItemsStatusFor(cat)}
        onRetry={() => void jobItems.ensure(cat.parent_id, { force: true })}
        items={lineExtras.items}
        onChange={(items) => setLineExtras((prev) => ({ ...prev, items }))}
        currency={formMeta.currency || "JMD"}
        jobCharge={Math.round(charge * 100) / 100}
        onPickPart={(item) => setPickingItem(item)}
        beforeTotal={foundSlotFor(cat)}
        gapsEnabled={jobItems.gapsEnabled}
        quoteTotal={isQuoteCard(cat)}
      />
    );
  };

  /** Phone: "Job J$ 3,000 + items J$ 2,000 = J$ 5,000" pinned above the footer on Step 3 (Stitch screen 9). */
  const mobileItemsSummary = (() => {
    if (!itemsEnabled || step !== "lineDetails" || !activeCategory || !draftLine) return undefined;
    const total = lineTotalPreview(draftLine);
    const items = lineItemsAmount(draftLine);
    const cur = formMeta.currency || "JMD";
    return (
      <div className="flex items-baseline justify-between gap-2 tabular-nums">
        <span className="text-[13px] text-on-surface-variant">
          Job {money(cur, Math.round((total - items) * 100) / 100)} + items {money(cur, items)}
        </span>
        <span className="text-lg font-bold text-[#a73a00]">= {money(cur, total)}</span>
      </div>
    );
  })();

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

  /** LC-14: an inspection can't be a job an inspection found. */
  const isInspectionCat = (c: MaintenanceServiceCategory) =>
    isInspectionJob(c.id) || (c as { records_findings?: boolean }).records_findings === true;
  const handleContinueFromSystem = () => {
    // Ticked jobs may come from "Also do" chips in another group, so look them up in the full catalog.
    let cats = selectedCategoryIds
      .map((id) => catalogById.get(id) ?? systemComponents.find((c) => c.id === id))
      .filter((c): c is MaintenanceServiceCategory => Boolean(c));
    if (addMode && cats.some(isInspectionCat)) {
      toast.error(ADD_TO_INSPECTION_COPY.noInspectionJobs);
      cats = cats.filter((c) => !isInspectionCat(c));
    }
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
    if (saveLineBlocked(activeCategory)) return;
    const line = lineFromCategoryValues(activeCategory, fieldValues, lineExtras);
    if (linesHaveItemErrors([line])) {
      toast.error("Fix the items marked in red first");
      return;
    }
    const quoteInsp = quoteCards.get(activeCategory.id);
    if (quoteInsp) {
      // LC-16: the form is the garage's quote -> onto the J$ 0 found line (never a done job, never spend).
      const quoted = withQuoteOnFoundLine(lines, quoteInsp, activeCategory.id, {
        snapshot: quoteSnapshotOf(line),
        total: lineTotalPreview(line),
        notes: line.notes,
        positions: line.positions,
      });
      setLines(quoted);
      const nextCard = lineDetailCategories.find(
        (c) => c.id !== activeCategory.id && !quoteCards.has(c.id) && !quoted.some((l) => categoryMatchLine(c, l)),
      );
      if (nextCard) openCategoryForm(nextCard);
      else setActiveCategory(null);
      return;
    }
    let newLines = (() => {
      const without = lines.filter((l) => !categoryMatchLine(activeCategory, l));
      return [...without, line];
    })();
    let detailCats = lineDetailCategories;
    if (isInspectionJob(activeCategory.id) && foundDraftsForRef.current === activeCategory.id) {
      // "Not done yet" → found lines (J$ 0, note). "Done today" → its own job card after this one.
      const foundLines = foundDrafts
        .filter((d) => d.mode === "later")
        .map((d) => {
          const cat = catalogById.get(d.jobId);
          return foundLineFromDraft(d, cat, cat ? resolveSystemForComponent(cat) : null, activeCategory.id);
        });
      newLines = applyFoundDrafts(newLines, foundDrafts, foundLines, activeCategory.id);
      const todayIds = new Set(foundDrafts.filter((d) => d.mode === "today").map((d) => d.jobId));
      const prevTodayIds = foundTodayIdsRef.current;
      // Other inspection jobs keep their Done-today jobs; this one's are replaced.
      const nextToday = new Map([...prevTodayIds].filter(([, insp]) => insp !== activeCategory.id));
      for (const id of todayIds) nextToday.set(id, activeCategory.id);
      foundTodayIdsRef.current = nextToday;
      const todayCats = [...todayIds]
        .map((id) => catalogById.get(id))
        .filter((c): c is MaintenanceServiceCategory => Boolean(c));
      const base = detailCats.length ? detailCats : [activeCategory];
      // Drop the card of a job switched back to "Not done yet" (or removed) when it was only there as "Done today".
      const cameFromInspection = (c: MaintenanceServiceCategory) =>
        prevTodayIds.get(c.id) === activeCategory.id ||
        lines.some(
          (l) =>
            categoryMatchLine(c, l) &&
            (l.values as Record<string, unknown> | undefined)?.found_today === true &&
            foundByJob(l) === activeCategory.id,
        );
      const keptBase = base.filter(
        (c) => c.id === activeCategory.id || todayIds.has(c.id) || !cameFromInspection(c),
      );
      detailCats = [...keptBase, ...todayCats.filter((c) => !keptBase.some((b) => b.id === c.id))];
      // LC-16: each "Not done yet" job gets its own card for the garage's quote (optional).
      const laterIds = new Set(foundDrafts.filter((d) => d.mode === "later").map((d) => d.jobId));
      const nextQuote = new Map([...quoteCards].filter(([, insp]) => insp !== activeCategory.id));
      for (const id of laterIds) nextQuote.set(id, activeCategory.id);
      detailCats = detailCats.filter(
        (c) => !(quoteCards.get(c.id) === activeCategory.id && !laterIds.has(c.id)),
      );
      const laterCats = [...laterIds]
        .map((id) => catalogById.get(id))
        .filter((c): c is MaintenanceServiceCategory => Boolean(c) && !detailCats.some((b) => b.id === c!.id));
      detailCats = [...detailCats, ...laterCats];
      setQuoteCards(nextQuote);
      quoteCardsRef.current = nextQuote;
      setLineDetailCategories(detailCats);
      setFoundPickerOpen(false);
    }
    setLines(newLines);
    setSelectedCategoryIds((prev) =>
      prev.includes(activeCategory.id) ? prev : [...prev, activeCategory.id],
    );
    if (detailCats.length > 0) {
      const next = detailCats.find(
        (c) =>
          c.id !== activeCategory.id &&
          !quoteCardsRef.current.has(c.id) &&
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
    // Quote cards are optional (a quote may not be known yet).
    const pending = lineDetailCategories.filter(
      (c) => !quoteCards.has(c.id) && !lines.some((l) => categoryMatchLine(c, l)),
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
    if (cat && addMode && isInspectionCat(cat)) {
      toast.error(ADD_TO_INSPECTION_COPY.noInspectionJobs);
      return;
    }
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

  const buildSavePayload = (logId: string, invoiceUrl: string, version: number | null = editVersion) => {
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
      lines: linesForSave(lines, jobItems.enabled),
      ...(initialLog?.id && version != null ? { expectedVersion: version } : {}),
      cost: sumMaintenanceLogLines(lines),
      currency: formMeta.currency || "JMD",
      odo: Number(formMeta.odo) || 0,
      status: "Completed" as const,
      logMode: advanceSchedule ? ("package" as const) : ("quick_job" as const),
      ...(advanceSchedule && templateId ? { templateId } : {}),
      type: typeLabel,
      // Found ("not done yet") jobs were not done, so they are not on the checklist.
      checklist: lines.filter((l) => !l.declined && !l.recommended).map((l) => formatMaintenanceLineLabel(l)),
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
    if (linesHaveItemErrors(lines)) {
      toast.error("Fix the items marked in red first");
      return;
    }

    const retryingFinish = saveProblem?.kind === "notFinished";
    setIsLoading(true);
    setSaveProblem((p) => (p?.kind === "notFinished" ? { kind: "notFinished", finish: { kind: "busy" } } : null));
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

      const payload = buildSavePayload(logId, invoiceUrl, editVersion);
      let result: {
        ledgerPosted?: boolean;
        ledgerWarning?: string;
      } = {};

      if (initialLog?.id && retryingFinish && initialLog.workOrderId) {
        // The edit already saved (and moved the version on); only finishing failed. Finish that
        // saved service instead of re-sending the edit with a version that is now out of date.
        const done = await api.completeWorkOrder(initialLog.workOrderId);
        result = { ledgerPosted: done.ledgerPosted, ledgerWarning: done.ledgerWarning };
      } else if (initialLog?.id) {
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
          lines: linesForSave(lines, jobItems.enabled),
          completeNow: true,
          idempotencyKey: saveKey,
          discount: discountAmount > 0 ? discountAmount : 0,
        });
        result = {
          ledgerPosted: woRes.ledgerPosted,
          ledgerWarning: woRes.ledgerWarning,
        };
        const woId = woRes.item?.id;
        // IF-12 / IF-21: an inspection job's found jobs (tagged found_by_job) are already saved as lines,
        // so the old DVI route skips them. Lines from the old Digital inspection step still get their record.
        if (woId) {
          try {
            const findings = lines
              .filter((l) => l.recommended && !foundByJob(l))
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
      if (error instanceof MaintenanceSaveError && error.isStale) {
        // Someone else saved this service first (plan 3: stale_edit → "This service was changed").
        setSaveProblem(null);
        setChangedOpen(true);
        return;
      }
      if (error instanceof MaintenanceSaveError && (error.isNotFinished || error.isStillFinishing)) {
        // The service is saved (in progress) but a finishing step failed. Keep the same save key:
        // "Finish saving" sends it again and the server finishes the saved service, never a second one.
        setSaveProblem({
          kind: "notFinished",
          finish: error.isStillFinishing ? { kind: "still" } : { kind: "failed", why: finishFailureText(error) },
        });
        onSaved?.();
        return;
      }
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
      if (discountErr) toast.error(reason);
      else setSaveProblem({ kind: "failed", reason });
    } finally {
      setIsLoading(false);
    }
  };

  /** "This service was changed" → Reload: take the saved service as it is now, then edit again. */
  const handleReloadChanged = async () => {
    if (!initialLog?.id) {
      setChangedOpen(false);
      return;
    }
    setReloading(true);
    try {
      const logs = (await api.getMaintenanceLogs(vehicleId)) as MaintenanceLog[];
      const fresh = logs.find((l) => l.id === initialLog.id);
      if (!fresh || fresh.status === "Completed" || fresh.status === "Cancelled") {
        toast.message(fresh ? `This service is already ${String(fresh.status).toLowerCase()}.` : "This service no longer exists.");
        setChangedOpen(false);
        onSaved?.();
        onOpenChange(false);
        return;
      }
      setLines(fresh.lines ?? []);
      setFormMeta((prev) => ({
        ...prev,
        date: fresh.date || prev.date,
        odo: fresh.odo ?? prev.odo,
        provider: fresh.provider ?? "",
        notes: fresh.notes ?? "",
        currency: fresh.currency || prev.currency,
        invoiceUrl: fresh.invoiceUrl ?? "",
      }));
      setEditVersion(typeof fresh.version === "number" ? fresh.version : null);
      setActiveCategory(null);
      setLineDetailCategories([]);
      setStep(fresh.lines?.length ? "review" : "dateMileage");
      setChangedOpen(false);
    } catch {
      toast.error("Couldn't reload this service. Try again.");
    } finally {
      setReloading(false);
    }
  };

  /** A job picked from search can come from a group that isn't loaded yet: load its group once for "Also do". */
  useEffect(() => {
    const groupId = activeCategory?.parent_id;
    if (!open || !groupId || alsoDoGroupsRef.current.has(groupId)) return;
    alsoDoGroupsRef.current.add(groupId);
    api
      .getSystemSections(groupId)
      .then((sec) => {
        const loaded = recommendedByJob(new Map([[groupId, sec]]));
        if (loaded.size) setAlsoDoByJob((prev) => new Map([...prev, ...loaded]));
      })
      .catch(() => alsoDoGroupsRef.current.delete(groupId));
  }, [open, activeCategory?.parent_id]);

  /** LC-15: tick / untick a pending job done on the same visit (its own card; closes its own found line). */
  const toggleAlsoDone = (item: FoundWorkItem) => {
    const cat = catalogById.get(item.jobId);
    if (!cat) return;
    if (extraFound.some((i) => i.lineId === item.lineId)) {
      setExtraFound((prev) => prev.filter((i) => i.lineId !== item.lineId));
      setLineDetailCategories((prev) => prev.filter((c) => c.id !== cat.id));
      setLines((prev) => prev.filter((l) => !categoryMatchLine(cat, l)));
      setSelectedCategoryIds((prev) => prev.filter((id) => id !== cat.id));
      if (activeCategory?.id === cat.id) setActiveCategory(null);
      return;
    }
    if (lineDetailCategories.some((c) => c.id === cat.id)) return;
    setExtraFound((prev) => [...prev, item]);
    setLineDetailCategories((prev) => [...prev, cat]);
    setSelectedCategoryIds((prev) => (prev.includes(cat.id) ? prev : [...prev, cat.id]));
  };

  // ---- LC-14 "Add a job to this inspection" (the same window, found jobs only) ----
  /** LC-16: the job form is the garage's quote (add-to-inspection jobs, and an inspection's Not done yet cards). */
  const isQuoteCard = (cat: MaintenanceServiceCategory) => addMode || quoteCards.has(cat.id);
  const quoteModeFor = (cat: MaintenanceServiceCategory) =>
    isQuoteCard(cat)
      ? {
          note: typeof fieldValues.notes === "string" ? fieldValues.notes : "",
          onNoteChange: (v: string) => setFieldValues((prev) => ({ ...prev, notes: v })),
        }
      : undefined;
  /** "Also do" on the job card (e.g. Throttle Body Relearn after cleaning), so search-picked jobs get it too. */
  const addAlsoDo = (from: MaintenanceServiceCategory, relId: string) => {
    const rel = catalogById.get(relId);
    if (!rel || lineDetailCategories.some((c) => c.id === rel.id)) return;
    const insp = quoteCards.get(from.id);
    if (insp) {
      // An inspection's Not done yet job -> the also-do is found too: its own J$ 0 line + quote card.
      const draft = { jobId: rel.id, name: rel.name, mode: "later" as const, note: "" };
      setLines((prev) => [...prev, foundLineFromDraftFn(draft, rel, resolveSystemForComponent(rel), insp)]);
      const next = new Map(quoteCards).set(rel.id, insp);
      setQuoteCards(next);
      quoteCardsRef.current = next;
    }
    setLineDetailCategories((prev) => [...prev, rel]);
    setSelectedCategoryIds((prev) => (prev.includes(rel.id) ? prev : [...prev, rel.id]));
  };
  const alsoDoSlotFor = (cat: MaintenanceServiceCategory) => {
    if (step !== "lineDetails" || lineDetailCategories.length === 0 || editQuoteLine) return undefined;
    const recs = (alsoDoByJob.get(cat.id) ?? []).filter(
      (r) => !lineDetailCategories.some((c) => c.id === r.categoryId) && catalogById.has(r.categoryId),
    );
    if (!recs.length) return undefined;
    return (
      <div className="rounded-lg p-3 bg-[#eef2ff]/70 dark:bg-[#312e81]/25 flex flex-col gap-2" data-testid="details-also-do">
        {recs.map((r) => (
          <div key={r.categoryId} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className={`${LT.labelMd} font-semibold ${LS.text}`}>Also do: {r.name}</p>
              {r.note ? <p className={`${LT.bodySm} ${LS.muted}`}>{r.note}</p> : null}
            </div>
            <Button type="button" size="sm" variant="outline" data-testid="details-also-do-add" onClick={() => addAlsoDo(cat, r.categoryId)}>
              Add
            </Button>
          </div>
        ))}
      </div>
    );
  };
  const [addingFound, setAddingFound] = useState(false);
  const editQuoteLine = addToInspection?.editLine ?? null;
  // LC-17: open straight on the job's form once the catalogue has it.
  useEffect(() => {
    if (!open || !editQuoteLine || step !== "whatWasDone" || lines.length > 0) return;
    const cat = catalogById.get(editQuoteLine.jobId);
    if (!cat) return;
    setLogMode("quick_job");
    setSelectedCategoryIds([cat.id]);
    enterLineDetailsForCategories([cat], resolveSystemForComponent(cat));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editQuoteLine, step, lines.length, catalogById]);
  const saveEditedQuote = async () => {
    const l = lines.find((x) => !x.recommended && x.categoryId === editQuoteLine?.jobId);
    if (!editQuoteLine || !l || addingFound) return;
    setAddingFound(true);
    try {
      await api.setFoundQuote(editQuoteLine.lineId, {
        quote: lineTotalPreview(l) > 0 ? lineTotalPreview(l) : null,
        quoteDetail: quoteSnapshotOf(l),
        note: typeof l.notes === "string" ? l.notes : null,
      });
      toast.success(ADD_TO_INSPECTION_COPY.quoteSaved(editQuoteLine.jobName));
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(addFoundErrorText(e));
    } finally {
      setAddingFound(false);
    }
  };
  const addJobsToInspection = async () => {
    if (editQuoteLine) return saveEditedQuote();
    if (!addToInspection || addingFound) return;
    const todo = lines.filter((l) => !l.recommended && l.categoryId);
    if (!todo.length) return;
    setAddingFound(true);
    let added = 0;
    let listed = 0;
    const failed: string[] = [];
    let firstError: string | null = null;
    const left: MaintenanceLogLine[] = [];
    for (const l of todo) {
      try {
        const res = await api.addFoundJobToInspection(addToInspection.workOrderId, {
          jobId: String(l.categoryId),
          places: [...(l.positions ?? [])],
          note: typeof l.notes === "string" && l.notes.trim() ? l.notes.trim() : null,
          quote: lineTotalPreview(l) > 0 ? lineTotalPreview(l) : null,
          quoteDetail: quoteSnapshotOf(l),
        });
        if (res.alreadyListed) listed += 1;
        else added += 1;
      } catch (e) {
        failed.push(l.categoryName || "Job");
        left.push(l);
        firstError ??= addFoundErrorText(e);
      }
    }
    setAddingFound(false);
    if (added || listed) onSaved?.();
    if (failed.length) {
      // Keep only what didn't go in, so a retry never adds a job twice.
      setLines(left);
      toast.error(`${ADD_TO_INSPECTION_COPY.failed(failed)} ${firstError ?? ""}`.trim());
      return;
    }
    toast.success(ADD_TO_INSPECTION_COPY.done(added, listed));
    onOpenChange(false);
  };

  const handleBack = () => {
    if (step === "whatWasDone" && hasAddedJobs) {
      setStep("review");
      return;
    }
    if (step === "whatWasDone" && lines.length === 0) {
      if (addMode) onOpenChange(false);
      else setStep("dateMileage");
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
      positionsTouched: true,
      positions: prev.positions.includes(pos)
        ? prev.positions.filter((p) => p !== pos)
        : [...prev.positions, pos],
    }));
  };

  // ---- "Where on the car" (LS-01/03/04/06) ----
  const positionUi = (cat: MaintenanceServiceCategory) => positionUiFor(cat, jobItems.gapsEnabled);
  const toggleWhere = (code: string) =>
    setLineExtras((prev) => ({
      ...prev,
      positionsTouched: true,
      positions: togglePositionCode(prev.positions, code),
    }));
  const whereSlotFor = (cat: MaintenanceServiceCategory) => {
    const ui = positionUi(cat);
    if (ui.kind !== "chips") return undefined;
    return (
      <WhereOnCarChips
        options={ui.options}
        picked={lineExtras.positions}
        onToggle={toggleWhere}
        showHelper={lineExtras.positions.length === 0}
      />
    );
  };
  // ---- Slice C "Parts that fit this car" + "Plan it" (LC-01, LC-02, LC-05) ----
  /** Places in words: chip labels, or the wheel / side buttons' own labels. */
  const placeLabelsFor = (cat: MaintenanceServiceCategory, codes: string[]): string[] => {
    const ui = positionUi(cat);
    if (ui.kind === "chips") return codes.map((c) => ui.options.find((o) => o.code === c)?.label ?? c);
    const sides = sidePositionsFor(cat);
    return codes.map((c) => sides?.find((s) => s.value === c)?.label ?? c);
  };
  const pickFitPart = (part: FitPart | null) =>
    setLineExtras((prev) => {
      if (!part) {
        // Only a part picked from the panel is cleared; an old typed brand / number re-saves unchanged (rule 7).
        if (!prev.partId) return prev;
        return { ...prev, partId: null, supplierPartOfferId: null, partConfirmedFit: false, brand: "", partNumber: "" };
      }
      return {
        ...prev,
        partId: part.partId,
        supplierPartOfferId: null,
        partConfirmedFit: part.verified,
        brand: part.brand,
        partNumber: part.number,
      };
    });
  // A planned job lives on the Not done yet list, which needs the inspection findings switch (code review #2).
  const canPlanJobs = !initialLog?.id && !fromFoundWork && jobItems.findingsEnabled;
  const partsPanelFor = (cat: MaintenanceServiceCategory) => {
    if (!jobItems.gapsEnabled || isServiceJob(cat) || cat.id.startsWith("synthetic-") || !vehicleId) return undefined;
    const ui = positionUi(cat);
    if (isQuoteCard(cat)) {
      // LC-14/16: not bought yet — show what to buy (read-only, Copy part info).
      return (
        <PartsThatFitPanel
          key={`find-${cat.id}`}
          vehicleId={vehicleId}
          jobId={cat.id}
          jobName={(cat.name || "part").toLowerCase()}
          places={lineExtras.positions}
          placeLabels={placeLabelsFor(cat, lineExtras.positions)}
          needsPlace={ui.kind !== "none" && ui.kind !== "wheels" && lineExtras.positions.length === 0}
          partId={null}
          onPick={() => undefined}
          toBuy
        />
      );
    }
    return (
      <PartsThatFitPanel
        key={cat.id}
        vehicleId={vehicleId}
        jobId={cat.id}
        jobName={(cat.name || "part").toLowerCase()}
        places={lineExtras.positions}
        placeLabels={placeLabelsFor(cat, lineExtras.positions)}
        needsPlace={ui.kind !== "none" && lineExtras.positions.length === 0}
        partId={lineExtras.partId}
        chosenInfo={
          lineExtras.partId
            ? { name: cat.name, brand: lineExtras.brand, number: lineExtras.partNumber }
            : null
        }
        onPick={pickFitPart}
        onPlanIt={canPlanJobs ? (part) => setPlanTarget({ cat, part }) : undefined}
      />
    );
  };
  /** The planned job leaves this service: drop its card / line; close when nothing else is left. */
  const afterJobPlanned = (cat: MaintenanceServiceCategory) => {
    const otherLines = lines.filter((l) => !categoryMatchLine(cat, l));
    const remaining = lineDetailCategories.filter((c) => c.id !== cat.id);
    setLines(otherLines);
    setSelectedCategoryIds((prev) => prev.filter((id) => id !== cat.id));
    setLineDetailCategories(remaining);
    if (otherLines.length === 0 && remaining.length === 0) {
      onSaved?.();
      onOpenChange(false);
      return;
    }
    onSaved?.();
    const next = remaining.find((c) => !otherLines.some((l) => categoryMatchLine(c, l)));
    if (next) {
      openCategoryForm(next);
      return;
    }
    setActiveCategory(null);
    setStep("review");
  };
  const confirmPlan = async (note: string | null) => {
    if (!planTarget) return;
    const { cat, part } = planTarget;
    setPlanBusy(true);
    try {
      const res = await api.planMaintenanceJob({
        vehicleId,
        jobId: cat.id,
        places: lineExtras.positions,
        partId: part?.partId ?? null,
        note,
        idempotencyKey: planKeyRef.current,
      });
      planKeyRef.current = crypto.randomUUID();
      const label = jobWithPlaces(cat.name, placeLabelsFor(cat, lineExtras.positions));
      toast.success(res.alreadyListed ? PLAN_COPY.alreadyListed(label) : PLAN_COPY.added(label));
      setPlanTarget(null);
      afterJobPlanned(cat);
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Could not plan this job. Try again.");
    } finally {
      setPlanBusy(false);
    }
  };
  /** Log it now on a planned job: the two cost hints under the price boxes (Stitch screen 7). */
  const plannedHintsOn = (cat: MaintenanceServiceCategory) => Boolean(foundFor(cat.id));
  /** Jobs with their own Parts box get that hint under it (the fitting hint sits under the labour row). */
  const plannedCostHint = (key: string): string | null => {
    if (!activeCategory || !plannedHintsOn(activeCategory)) return null;
    if (key === "material" || key === "unit_price") return PLANNED_HINTS.part;
    return null;
  };

  /** Found "Not done yet" rows that still need a chip (same rule as the job itself, LS-06). */
  const foundRowsMissingPosition = (cat: MaintenanceServiceCategory) =>
    isInspectionJob(cat.id) &&
    foundDrafts.some((d) => {
      if (d.mode !== "later") return false;
      return positionMissing(positionUiFor(catalogById.get(d.jobId), jobItems.gapsEnabled), d.positions ?? []);
    });
  /** Save line waits until each "Where on the car" has a pick ("Not sure" counts). Wheel jobs never wait. */
  const saveLineBlocked = (cat: MaintenanceServiceCategory) =>
    positionMissing(positionUi(cat), lineExtras.positions) || foundRowsMissingPosition(cat);
  const toggleFoundWhere = (jobId: string, code: string) =>
    setFoundDrafts((prev) =>
      prev.map((d) =>
        d.jobId === jobId
          ? { ...d, positionsTouched: true, positions: togglePositionCode(d.positions ?? [], code) }
          : d,
      ),
    );
  const renderFoundWhere = (d: FoundDraft) => {
    const ui = positionUiFor(catalogById.get(d.jobId), jobItems.gapsEnabled);
    if (ui.kind !== "chips") return null;
    const picked = d.positions ?? [];
    return (
      <WhereOnCarChips
        options={ui.options}
        picked={picked}
        onToggle={(code) => toggleFoundWhere(d.jobId, code)}
        showHelper={picked.length === 0}
        testId="found-where-on-car"
      />
    );
  };
  /** LC-10: an inspection's "Not done yet" job shows the parts to buy (read-only, Copy part info). */
  const renderFoundParts = (d: FoundDraft) => {
    const cat = catalogById.get(d.jobId);
    if (!jobItems.gapsEnabled || !cat || isServiceJob(cat) || !vehicleId) return null;
    const ui = positionUi(cat);
    const picked = d.positions ?? [];
    return (
      <PartsThatFitPanel
        key={`found-${d.jobId}`}
        vehicleId={vehicleId}
        jobId={d.jobId}
        jobName={(cat.name || "part").toLowerCase()}
        places={picked}
        placeLabels={placeLabelsFor(cat, picked)}
        needsPlace={ui.kind === "chips" && picked.length === 0}
        partId={null}
        onPick={() => undefined}
        toBuy
      />
    );
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
              positionsTouched: true,
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
          {plannedCostHint(field.key) ? (
            <p className="flex items-center gap-1 text-[13px] text-on-surface-variant" data-testid="planned-cost-hint">
              <span className="material-symbols-outlined text-[15px] text-[#4b41e1] dark:text-[#c3c0ff]" aria-hidden>info</span>
              {plannedCostHint(field.key)}
            </p>
          ) : null}
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
      <ResponsiveDialogContent hideCloseButton className="sm:max-w-[760px] max-h-[90vh] flex flex-col p-0 overflow-hidden gap-0 sm:rounded-2xl">
        <LogServiceWizardChrome
          activeStep={dialogWizardStep(step)}
          vehicle={strip}
          onClose={() => onOpenChange(false)}
          onStepClick={handleWizardStepClick}
          mobileSummary={mobileItemsSummary}
          footer={
            <>
              {/* Stitch powertrain 01 footer: soft red Cancel left; grey Back + black Continue right. */}
              <button
                type="button"
                data-testid="log-service-cancel"
                onClick={clearDraftAndClose}
                className={`h-10 px-4 max-sm:h-12 rounded-lg ${LT.titleSm} transition-colors ${LS.btnCancel}`}
              >
                {LOG_SERVICE_COPY.cancelLabel}
              </button>
              <div className="flex items-center gap-2 max-sm:flex-1 max-sm:justify-end">
                {step !== "dateMileage" ? (
                  <button
                    type="button"
                    onClick={handleBack}
                    aria-label={LOG_SERVICE_COPY.backLabel}
                    className={`h-10 flex items-center gap-1 px-4 max-sm:h-12 max-sm:w-12 max-sm:justify-center max-sm:p-0 rounded-lg ${LT.titleSm} transition-colors bg-[#e8e7f1] text-[#1a1b22] hover:bg-[#eeedf7] dark:bg-[#2a2b36] dark:text-[#e4e1ec]`}
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span className="hidden sm:inline">
                      {step === "whatWasDone" && hasAddedJobs
                        ? LOG_SERVICE_COPY.backToReview(lines.length)
                        : LOG_SERVICE_COPY.backLabel}
                    </span>
                  </button>
                ) : null}
                {step === "dateMileage" ? (
                  <LogServiceWizardContinueButton
                    label={LOG_SERVICE_COPY.continueLabel}
                    disabled={!canContinueDateStep}
                    onClick={() => {
                      setOdoTouched(true);
                      if (!canContinueDateStep) return;
                      // "Log it now": straight to that job's details (Stitch screen 10).
                      const foundCat = fromFoundWork ? catalogById.get(fromFoundWork.jobId) : undefined;
                      if (fromFoundWork && foundCat && lines.length === 0) {
                        setLogMode("quick_job");
                        setSelectedPackage(null);
                        const parent = resolveSystemForComponent(foundCat);
                        setSelectedSystem(parent);
                        setSelectedCategoryIds([foundCat.id]);
                        setFormMeta((prev) => ({ ...prev, type: foundCat.name }));
                        enterLineDetailsForCategories([foundCat], parent);
                        return;
                      }
                      setStep("whatWasDone");
                    }}
                  />
                ) : null}
                {step === "whatWasDone" ? (
                  <LogServiceWizardContinueButton label="Continue" disabled onClick={() => {}} />
                ) : null}
                {step === "system" ? (
                  <LogServiceWizardContinueButton
                    label={LOG_SERVICE_COPY.continueToDetails}
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
                  <>
                  {activeCategory ? <SaveLineHint show={saveLineBlocked(activeCategory)} /> : null}
                  <LogServiceWizardContinueButton
                    label={LOG_SERVICE_COPY.saveLineLabel}
                    disabled={activeCategory ? saveLineBlocked(activeCategory) : false}
                    onClick={handleSaveCategory}
                  />
                  </>
                ) : null}
                {step === "review" ? (
                  <>
                    {!initialLog?.id && !editQuoteLine ? (
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
                    {addMode ? (
                      <LogServiceWizardContinueButton
                        label={
                          editQuoteLine
                            ? ADD_TO_INSPECTION_COPY.saveQuote
                            : ADD_TO_INSPECTION_COPY.confirm(lines.filter((l) => !l.recommended).length)
                        }
                        disabled={addingFound || lines.length < 1}
                        loading={addingFound}
                        onClick={() => void addJobsToInspection()}
                      />
                    ) : (
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
                    )}
                  </>
                ) : null}
              </div>
            </>
          }
        >
          {addToInspection ? (
            <div
              className="mb-4 rounded-xl p-3 bg-[#eef2ff]/80 dark:bg-[#312e81]/30 flex items-start gap-2"
              data-testid="add-to-inspection-banner"
            >
              <span className="material-symbols-outlined text-[#4338ca] dark:text-[#a5b4fc] mt-0.5" style={{ fontSize: 18 }} aria-hidden>
                search
              </span>
              <div className="flex flex-col min-w-0">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-[#4338ca] dark:text-[#c7d2fe]">
                  {editQuoteLine ? ADD_TO_INSPECTION_COPY.bannerEditLabel : ADD_TO_INSPECTION_COPY.bannerLabel}
                </span>
                <span className="text-[13px] leading-snug text-[#1e1b4b] dark:text-[#e0e7ff]">{addToInspection.inspectionLine}</span>
                <span className="text-[12px] text-[#312e81]/80 dark:text-[#c7d2fe]/80">{ADD_TO_INSPECTION_COPY.bannerHelper}</span>
              </div>
            </div>
          ) : null}
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
              packages={addMode ? [] : packageChoicesForStep}
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
              jobFit={jobFit}
              onRetryJobFit={() => setJobFitTick((n) => n + 1)}
              onLinkCar={onLinkCar}
              showAllJobs={showAllJobs}
              onToggleShowAllJobs={() => setShowAllJobs((v) => !v)}
              keepGroupIds={[
                ...new Set(
                  [...lines.map((l) => l.categoryId), ...selectedCategoryIds]
                    .map((id) => allComponents.find((c) => c.id === id)?.parent_id)
                    .filter((x): x is string => Boolean(x)),
                ),
              ]}
            />
          )}

          {step === "system" && selectedSystem && (
            <LogServiceSystemPicker
              system={selectedSystem}
              components={systemComponents}
              loading={systemComponentsLoading}
              sections={visibleSections(sectionsBySystem.get(selectedSystem.id))}
              mayNeedByJob={itemsEnabled ? jobItems.itemsByJob : undefined}
              selectedIds={selectedCategoryIds}
              isAdded={categoryHasLine}
              jobFit={jobFit}
              onBack={handleBack}
              groups={quickJobs}
              allJobs={allComponents}
              onPickGroup={(g) => void handlePickSystem(g)}
              onRetryJobFit={() => setJobFitTick((n) => n + 1)}
              onLinkCar={onLinkCar}
              searchSlot={
                <JobSearchBox
                  jobs={allComponents}
                  systems={allSystems}
                  pickableGroups={quickJobs}
                  packages={packageChoicesForStep}
                  suggestedOperations={logServiceContext?.suggestedOperations}
                  sectionNameByJob={sectionNameByJob}
                  jobFit={jobFit}
                  onPick={handlePickSuggested}
                />
              }
              showAll={showAllJobs || showAllInGroup.has(selectedSystem.id)}
              onToggleShowAll={() => {
                const on = showAllJobs || showAllInGroup.has(selectedSystem.id);
                if (on) setShowAllJobs(false);
                setShowAllInGroup((prev) => {
                  const next = new Set(prev);
                  if (on) next.delete(selectedSystem.id);
                  else next.add(selectedSystem.id);
                  return next;
                });
              }}
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
              banner={
                fromFoundWork ? (
                  <FoundFromInspectionBanner
                    text={
                      fromFoundWork.source === "planned"
                        ? `From your Not done yet list (planned ${shortDate(fromFoundWork.foundDate)})`
                        : foundBannerText(fromFoundWork)
                    }
                    note={fromFoundWork.note}
                    quote={fromFoundWork.quoteAmount ? FOUND_COPY.bannerQuote(fromFoundWork.quoteAmount) : null}
                  />
                ) : undefined
              }
              afterBanner={
                fromFoundWork && !addMode ? (
                  <AlsoDoneOnVisit
                    items={otherFound}
                    tickedLineIds={new Set(extraFound.map((i) => i.lineId))}
                    blockedJobIds={new Set(lineDetailCategories.map((c) => c.id))}
                    placesText={(i) => {
                      const cat = catalogById.get(i.jobId);
                      return cat ? placeLabelsFor(cat, i.positions ?? []).join(", ") : "";
                    }}
                    onToggle={toggleAlsoDone}
                  />
                ) : undefined
              }
              packageLabel={selectedPackage?.shortLabel ?? null}
              findOnly={addMode}
              componentCount={lineDetailCategories.length}
              baySessionLabel={idempotencyKey.slice(0, 8).toUpperCase()}
              configuredCount={lineDetailCategories.filter((c) => categoryHasLine(c)).length}
              subtotalLabel={`${formMeta.currency || "JMD"} ${subtotal.toLocaleString()}`}
              oemMatch={logServiceOemMatchSummary(lines)}
              homeBase={vehicleStrip?.homeBase}
              mechanicNote={formMeta.notes}
              onMechanicNoteChange={(notes) => setFormMeta((p) => ({ ...p, notes }))}
              onAddAnotherJob={
                !initialLog?.id && !editQuoteLine
                  ? () => {
                      setActiveCategory(null);
                      setLineDetailCategories([]);
                      setStep("whatWasDone");
                    }
                  : undefined
              }
              addAnotherDisabledReason={
                !initialLog?.id &&
                (activeCategory != null || lineDetailCategories.some((c) => !categoryHasLine(c)))
                  ? LOG_SERVICE_COPY.addAnotherJobSaveFirst
                  : null
              }
            >
              {lineDetailCategories.map((cat) => (
                <div
                  key={cat.id}
                  className={`relative overflow-hidden rounded-xl p-6 shadow-sm transition-shadow hover:shadow-md ${LS.lowest} ${
                    activeCategory?.id === cat.id ? "ring-1 ring-black/10 dark:ring-white/15" : ""
                  }`}
                >
                  {/* Stitch powertrain 06: a thin top strip marks a job that isn't usual for this car (grey, audit 9). */}
                  {isNotUsual(jobFit, cat.id) ? <div className="absolute inset-x-0 top-0 h-1 bg-slate-300 dark:bg-slate-600" /> : null}
                  {activeCategory?.id === cat.id && (
                    <LogServiceLineDetailsStep
                      hideHeading
                      notUsual={isNotUsual(jobFit, cat.id)}
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
                      showPositions={positionUi(cat).kind === "wheels"}
                      whereSlot={whereSlotFor(cat)}
                      partsPanel={partsPanelFor(cat)}
                      plannedHints={plannedHintsOn(cat)}
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
                      lineTotalLabel={activeCategory && isQuoteCard(activeCategory) ? QUOTE_MODE_COPY.totalLabel : "Line total"}
                      currency={formMeta.currency || "JMD"}
                      lineTotal={draftLineTotal}
                      serviceForm={serviceFormFor(cat)}
                      itemsSlot={itemsSlotFor(cat)}
                      foundSlot={itemsEnabled ? undefined : foundSlotFor(cat)}
                      headerChip={fromInspectionChipFor(cat)}
                      quoteMode={quoteModeFor(cat)}
                      alsoDoSlot={alsoDoSlotFor(cat)}
                    />
                  )}
                  {activeCategory?.id !== cat.id && isInspectionJob(cat.id) && categoryHasLine(cat) ? (
                    // Stitch screen 4: the saved inspection collapses to one row with its found count.
                    <FoundCollapsedInspectionRow
                      name={cat.name}
                      amountLabel={money(
                        formMeta.currency || "JMD",
                        lineTotalPreview(lines.find((l) => categoryMatchLine(cat, l)) as MaintenanceLogLine),
                      )}
                      foundCount={openFoundCountFor_(cat.id)}
                      onEdit={() => openCategoryForm(cat)}
                    />
                  ) : null}
                  {activeCategory?.id !== cat.id && !(isInspectionJob(cat.id) && categoryHasLine(cat)) && (
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className={`${LT.titleMd} ${LS.text}`}>{cat.name}</p>
                        <p className={`${LT.bodySm} ${LS.muted}`}>
                          {quoteCards.has(cat.id)
                            ? quoteDetailOfLine(lines.find((l) => isFoundLineFn(l) && lineJobId(l) === cat.id) ?? ({} as MaintenanceLogLine))
                              ? "Garage quote saved · not done yet"
                              : "Not done yet · add the garage's quote (optional)"
                            : categoryHasLine(cat) ? "Saved" : "Needs details"}
                        </p>
                      </div>
                      <Button type="button" size="sm" variant="outline" onClick={() => openCategoryForm(cat)}>
                        {quoteCards.has(cat.id) ? "Quote" : categoryHasLine(cat) ? "Edit" : "Configure"}
                      </Button>
                    </div>
                  )}
                  {activeCategory?.id === cat.id && (
                    <div className="mt-4 flex items-center justify-end gap-3">
                      <SaveLineHint show={saveLineBlocked(cat)} />
                      <LogServiceWizardContinueButton
                        label={LOG_SERVICE_COPY.saveLineLabel}
                        disabled={saveLineBlocked(cat)}
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
              notUsual={isNotUsual(jobFit, activeCategory.id)}
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
              showPositions={positionUi(activeCategory).kind === "wheels"}
              whereSlot={whereSlotFor(activeCategory)}
              partsPanel={partsPanelFor(activeCategory)}
              plannedHints={plannedHintsOn(activeCategory)}
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
              lineTotalLabel={activeCategory && isQuoteCard(activeCategory) ? QUOTE_MODE_COPY.totalLabel : "Line total"}
              currency={formMeta.currency || "JMD"}
              lineTotal={draftLineTotal}
              serviceForm={serviceFormFor(activeCategory)}
              itemsSlot={itemsSlotFor(activeCategory)}
              foundSlot={itemsEnabled ? undefined : foundSlotFor(activeCategory)}
              headerChip={fromInspectionChipFor(activeCategory)}
              quoteMode={quoteModeFor(activeCategory)}
              alsoDoSlot={alsoDoSlotFor(activeCategory)}
            />
          )}

          <PlanJobDialog
            open={Boolean(planTarget)}
            carName={splitPlate(strip.vehicleLabel).name.replace(/\s*\(\d{4}\)\s*$/, "") || "car"}
            jobLine={
              planTarget ? jobWithPlaces(planTarget.cat.name, placeLabelsFor(planTarget.cat, lineExtras.positions)) : ""
            }
            part={planTarget?.part ?? null}
            busy={planBusy}
            onCancel={() => setPlanTarget(null)}
            onConfirm={(note) => void confirmPlan(note)}
          />

          <AddFoundJobDialog
            open={foundPickerOpen}
            onOpenChange={setFoundPickerOpen}
            search={searchFoundPicker}
            addedIds={new Set(foundDrafts.map((d) => d.jobId))}
            onAdd={addFoundJob}
          />

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

          {step === "review" && saveProblem?.kind === "failed" ? (
            <div className="mb-4">
              <SaveFailedBanner reason={saveProblem.reason} busy={isLoading} onRetry={() => void handleSave()} />
            </div>
          ) : null}
          {step === "review" && saveProblem?.kind === "notFinished" ? (
            <div className="mb-4">
              <NotFinishedBanner state={saveProblem.finish} onFinish={() => void handleSave()} />
            </div>
          ) : null}
          {step === "review" && addMode ? (
            <AddToInspectionReview
              lines={lines.filter((l) => !l.recommended)}
              quoteOf={lineTotalPreview}
              placesText={(l) => {
                const cat = l.categoryId ? catalogById.get(l.categoryId) : undefined;
                return cat ? placeLabelsFor(cat, l.positions ?? []).join(", ") : (l.positions ?? []).join(", ");
              }}
              onEdit={(l) => {
                const cat = l.categoryId ? catalogById.get(l.categoryId) : undefined;
                if (cat) enterLineDetailsForCategories([cat], resolveSystemForComponent(cat));
              }}
              onRemove={(l) => setLines((prev) => prev.filter((x) => x !== l))}
            />
          ) : null}
          {step === "review" && !addMode && (
            <LogServiceReviewStep
              lineFit={(line) => ({
                // A saved line keeps the answer frozen when it was logged (PT-8); a new one uses today's.
                notUsual: line.fitAtLog
                  ? line.fitAtLog === "no"
                  : Boolean(line.categoryId && isNotUsual(jobFit, line.categoryId)),
                highVoltage:
                  line.isHighVoltage ??
                  Boolean(allComponents.find((c) => c.id === line.categoryId)?.is_high_voltage),
              })}
              itemsEnabled={itemsEnabled || lines.some((l) => (l.items?.length ?? 0) > 0)}
              gapsEnabled={jobItems.gapsEnabled}
              vehicleLabel={strip.vehicleLabel}
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
              onRemoveFoundLine={(line) => {
                const index = lines.indexOf(line);
                if (index < 0) return;
                setLines((prev) => prev.filter((l) => l !== line));
                toast(FOUND_COPY.removedToast(line.categoryName || "Job"), {
                  action: {
                    label: FOUND_COPY.undo,
                    onClick: () =>
                      setLines((prev) => {
                        if (prev.includes(line)) return prev;
                        const next = [...prev];
                        next.splice(Math.min(index, next.length), 0, line);
                        return next;
                      }),
                  },
                });
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
      <PickPartDialog
        gapsEnabled={jobItems.gapsEnabled}
        open={Boolean(pickingItem)}
        onClose={() => setPickingItem(null)}
        vehicleId={vehicleId}
        vehicleLabel={strip.vehicleLabel}
        partTypeId={pickingItem?.partTypeId ?? null}
        partTypeName={pickingItem?.itemName ?? ""}
        current={pickingItem}
        onUse={(picked) => {
          const target = pickingItem;
          setPickingItem(null);
          if (!target) return;
          setLineExtras((prev) => ({
            ...prev,
            items: prev.items.map((it) =>
              // A new pick replaces the saved partSource, so the wire works it out from this pick.
              it.source === "suggested" && it.jobItemId === target.jobItemId ? { ...it, ...picked, partSource: undefined } : it,
            ),
          }));
        }}
      />
      <ServiceChangedDialog
        open={changedOpen}
        reloading={reloading}
        onCancel={() => setChangedOpen(false)}
        onReload={() => void handleReloadChanged()}
      />
    </ResponsiveDialog>
  );
}
