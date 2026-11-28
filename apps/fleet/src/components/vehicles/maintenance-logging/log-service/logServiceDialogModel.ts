/**
 * Maintenance rebuild step 9 (MER-23): the Log service wizard's types and plain helpers, moved out of
 * LogMaintenanceServiceDialog.tsx unchanged (no behaviour change). The dialog imports them from here.
 */
import { MAINTENANCE_SCHEDULE_PRESETS } from "../../../../constants/maintenanceSchedulePresets";
import { inferPackageIconKey } from "../../../../constants/maintenanceCategoryIcons";
import type { LogServiceVehicleStrip, LogServiceWizardStep } from "./index";
import { isServiceJob, serviceJobAmount, serviceJobCost } from "./logServiceJobCost";
import { positionsForWire } from "./positionChips";
import type {
  CatalogMaintenanceTaskOption,
  FoundWorkItem,
  LineItemDraft,
  MaintenanceLineAction,
  MaintenanceLog,
  MaintenanceLogLine,
  MaintenanceServiceCategory,
} from "../../../../types/maintenance";
import { lineItemForWire, sumMaintenanceLogLines } from "../../../../types/maintenance";

export type DialogStep =
  | "dateMileage"
  | "whatWasDone"
  | "lineDetails"
  | "review"
  | "system"
  | "component"
  | "inspect";
export type LogMode = "package" | "quick_job" | "inspect";

export type LogServicePackageStatus = "overdue" | "due_soon" | "ok" | "mandatory";

export type PackageChoice = {
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

export const TIRE_BRAKE_POSITIONS = ["LF", "RF", "LR", "RR"] as const;

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
   * Step 10 "Log this" on a due line: after Date & mileage the dialog goes straight to that part's details
   * (same shortcut as "Log it now", without the inspection banner).
   */
  startOnPart?: { categoryId: string } | null;
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

export function stripEverySuffix(label: string): string {
  return label.replace(/\s*\(Every[^)]*\)\s*$/i, "").trim() || label;
}

export function defaultFieldSchema(): MaintenanceServiceCategory["field_schema"] {
  return {
    fields: [
      { key: "material", type: "number", label: "Parts / materials", required: false },
      { key: "labor", type: "number", label: "Labor", required: false },
    ],
  };
}

export function syntheticCategoriesFromNames(names: string[]): MaintenanceServiceCategory[] {
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

export function packageFromCatalog(t: CatalogMaintenanceTaskOption): PackageChoice {
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

export function packageFromPreset(p: (typeof MAINTENANCE_SCHEDULE_PRESETS)[number]): PackageChoice {
  return {
    id: `preset-${p.id}`,
    label: p.label,
    shortLabel: stripEverySuffix(p.label),
    iconKey: inferPackageIconKey(p.label, p.id),
    templateId: undefined,
    categories: syntheticCategoriesFromNames(p.items),
  };
}

export function emptyValuesForCategory(cat: MaintenanceServiceCategory): Record<string, string | number | boolean | null> {
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

export function numFrom(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export type LineExtras = {
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

export function defaultExtras(system: MaintenanceServiceCategory | null = null): LineExtras {
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

export function lineFromCategoryValues(
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
export function linesForSave(lines: MaintenanceLogLine[], itemsEnabled: boolean | null): MaintenanceLogLine[] {
  return lines.map((line) => {
    const l = positionsForWire(line);
    const { items, itemsAmount: _ia, lineTotal: _lt, voidedAt: _va, ...rest } = l;
    if (l.declined || !items?.length) return rest;
    if (itemsEnabled === false && !items.some((i) => i.id)) return rest;
    return { ...rest, items: items.map(lineItemForWire) as unknown as LineItemDraft[] };
  });
}

export function lineTotalPreview(line: MaintenanceLogLine): number {
  return sumMaintenanceLogLines([line]);
}

export function lineMatchKey(line: MaintenanceLogLine): string {
  return `${line.categoryId || ""}|${line.categoryCode}|${line.categoryName}|${line.recommended ? "r" : "n"}`;
}

export function categoryMatchLine(cat: MaintenanceServiceCategory, line: MaintenanceLogLine): boolean {
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

export function dialogWizardStep(step: DialogStep): LogServiceWizardStep {
  if (step === "dateMileage") return 1;
  if (step === "lineDetails") return 3;
  if (step === "review") return 4;
  return 2;
}
