/** How the template translates into next-due scheduling (vendor-independent). */
export type MaintenanceFrequencyKind = "recurring" | "once_milestone" | "manual_only";

export type MaintenanceTemplateScope = "global" | "catalog";

/** Package due classification (service interval vs statutory inspection e.g. 車検). */
export type MaintenanceDueKind = "service_package" | "statutory_inspection";

/** System (parent) vs component (loggable leaf). */
export type MaintenanceCategoryKind = "system" | "component";

/** Garage action on a job line. */
export type MaintenanceLineAction =
  | "inspect"
  | "replace"
  | "rotate"
  | "balance"
  | "flush"
  | "top_up"
  | "repair"
  | "other";

export const MAINTENANCE_LINE_ACTIONS: { value: MaintenanceLineAction; label: string }[] = [
  { value: "inspect", label: "Inspect" },
  { value: "replace", label: "Replace" },
  { value: "rotate", label: "Rotate" },
  { value: "balance", label: "Balance" },
  { value: "flush", label: "Flush" },
  { value: "top_up", label: "Top-up" },
  { value: "repair", label: "Repair" },
  { value: "other", label: "Other" },
];

export type MaintenanceWorkOrderStatus = "draft" | "in_progress" | "completed" | "cancelled";

export type MaintenanceInspectionStatus = "pass" | "attention" | "fail";

/** Field definition inside a category's field_schema. */
export interface MaintenanceCategoryFieldDef {
  key: string;
  type: "number" | "text" | "select" | "boolean";
  label: string;
  required?: boolean;
  options?: string[];
}

export interface MaintenanceCategoryFieldSchema {
  fields: MaintenanceCategoryFieldDef[];
}

/** Reusable service category — system (parent) or component (leaf). */
export interface MaintenanceServiceCategory {
  id: string;
  code: string;
  name: string;
  icon_key: string;
  field_schema: MaintenanceCategoryFieldSchema;
  quick_job_eligible: boolean;
  sort_order: number;
  kind: MaintenanceCategoryKind;
  parent_id?: string | null;
  op_code?: string | null;
  /** When true, Fleet tracks LF/RF/LR/RR separately for outstanding work. */
  position_aware?: boolean;
  /** Fallback interval when component is not in a package. */
  default_interval_miles?: number | null;
  default_interval_months?: number | null;
  created_at: string;
  updated_at: string;
  /** Populated when listing tree. */
  children?: MaintenanceServiceCategory[];
  parent?: MaintenanceServiceCategory | null;
}

export type MaintenanceComponentChecklistStatus =
  | "outstanding"
  | "satisfied"
  | "partial"
  | "ok";

export interface MaintenancePackageChecklistItem {
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  required: boolean;
  positionAware: boolean;
  status: MaintenanceComponentChecklistStatus;
  outstandingPositions: string[];
  satisfiedPositions: string[];
  lastPerformedDate: string | null;
  lastPerformedMiles: number | null;
}

export interface MaintenanceServiceLedgerEntry {
  id: string;
  organizationId: string;
  vehicleId: string;
  performedAtDate: string;
  performedAtMiles: number | null;
  categoryId?: string | null;
  categoryCode?: string | null;
  categoryName?: string | null;
  position?: string | null;
  action?: string | null;
  templateId?: string | null;
  maintenanceRecordId?: string | null;
  workOrderId?: string | null;
  notes?: string | null;
  createdAt?: string;
}

export interface VehicleComponentScheduleRow {
  id: string;
  organizationId: string;
  vehicleId: string;
  categoryId: string;
  position?: string | null;
  lastPerformedMiles?: number | null;
  lastPerformedDate?: string | null;
  nextDueMiles?: number | null;
  nextDueMilesMax?: number | null;
  nextDueDate?: string | null;
  scheduleStatus?: "active" | "fulfilled";
  category?: MaintenanceServiceCategory | null;
}

/** Package ↔ category membership row (components only). */
export interface MaintenancePackageCategory {
  id: string;
  template_id: string;
  category_id: string;
  sort_order: number;
  required: boolean;
  created_at?: string;
  category?: MaintenanceServiceCategory;
}

/** Structured line on a service log / work order. */
export interface MaintenanceLogLine {
  id?: string;
  categoryId?: string;
  categoryCode: string;
  categoryName: string;
  systemId?: string;
  systemCode?: string;
  systemName?: string;
  action?: MaintenanceLineAction;
  qty?: number;
  unitPrice?: number;
  material?: number;
  labor?: number;
  laborHours?: number;
  laborRate?: number;
  condition?: "new" | "used" | string;
  positions?: string[];
  brand?: string;
  partNumber?: string;
  warranty?: boolean;
  complimentary?: boolean;
  partId?: string;
  notes?: string;
  recommended?: boolean;
  declined?: boolean;
  /** Raw field values from the category form. */
  values?: Record<string, string | number | boolean | null>;
}

/** Work order (job card) for a vehicle visit. */
export interface MaintenanceWorkOrder {
  id: string;
  organizationId?: string;
  vehicleId: string;
  status: MaintenanceWorkOrderStatus;
  openedAt: string;
  closedAt?: string | null;
  performedAtDate?: string | null;
  odometer?: number | null;
  provider?: string | null;
  currency: string;
  templateId?: string | null;
  packageComplete?: boolean;
  logMode?: "package" | "quick_job";
  notes?: string | null;
  invoiceUrl?: string | null;
  totalCost?: number | null;
  maintenanceRecordId?: string | null;
  lines?: MaintenanceLogLine[];
  createdAt?: string;
  updatedAt?: string;
}

export interface MaintenanceInspectionTemplate {
  id: string;
  system_id: string | null;
  code: string;
  name: string;
  sort_order: number;
  items?: MaintenanceInspectionItem[];
}

export interface MaintenanceInspectionItem {
  id: string;
  template_id: string;
  component_id?: string | null;
  label: string;
  default_action?: string | null;
  sort_order: number;
}

export interface MaintenanceInspectionFinding {
  id: string;
  organizationId: string;
  vehicleId: string;
  workOrderId?: string | null;
  itemId?: string | null;
  systemId?: string | null;
  componentId?: string | null;
  status: MaintenanceInspectionStatus;
  notes?: string | null;
  photoUrl?: string | null;
  declined?: boolean;
}

/** Row from `maintenance_task_templates` (Super Admin). */
export interface MaintenanceTaskTemplate {
  id: string;
  vehicle_catalog_id: string | null;
  template_scope?: MaintenanceTemplateScope;
  task_code?: string | null;
  task_name: string;
  description: string | null;
  icon_key?: string | null;
  interval_miles: number | null;
  interval_miles_max?: number | null;
  interval_months: number | null;
  frequency_kind?: MaintenanceFrequencyKind;
  frequency_label?: string | null;
  due_kind?: MaintenanceDueKind;
  priority: "critical" | "standard" | "optional";
  sort_order: number;
  created_at: string;
  updated_at: string;
  categories?: MaintenanceServiceCategory[];
}

export interface VehicleMaintenanceScheduleRowApi {
  template_id?: string | null;
  template?: MaintenanceTaskTemplate | null;
  schedule_status?: "active" | "fulfilled";
  computed_status?: string;
  next_due_miles?: number | null;
  next_due_miles_max?: number | null;
  next_due_date?: string | null;
  [key: string]: unknown;
}

export interface CatalogMaintenanceTaskOption {
  templateId: string;
  label: string;
  checklistLines: string[];
  iconKey?: string;
  categories?: MaintenanceServiceCategory[];
  dueKind?: MaintenanceDueKind;
}

export interface MaintenanceLog {
  id: string;
  vehicleId: string;
  date: string;
  type: string;
  templateId?: string;
  logMode?: "package" | "quick_job";
  workOrderId?: string;
  serviceInterval?: "A" | "B" | "C" | "D";
  cost: number;
  odo: number;
  provider: string;
  providerLocationUrl?: string;
  notes: string;
  checklist?: string[];
  itemCosts?: Record<string, { material: number; labor: number }>;
  lines?: MaintenanceLogLine[];
  inspectionFee?: number;
  inspectionResults?: {
    issues: string[];
    notes: string;
  };
  invoiceUrl?: string;
  currency?: string;
  status?: "Requested" | "Scheduled" | "In Progress" | "Completed" | "Cancelled";
}

/** Line amount: qty×unitPrice (or material) + labor amount (or hours×rate). */
export function sumMaintenanceLogLines(lines: MaintenanceLogLine[] | undefined | null): number {
  if (!lines?.length) return 0;
  let total = 0;
  for (const line of lines) {
    if (line.declined) continue;
    const qty = Number(line.qty ?? line.values?.qty ?? 0) || 0;
    const unit = Number(line.unitPrice ?? line.values?.unit_price ?? 0) || 0;
    const material = Number(line.material ?? line.values?.material ?? 0) || 0;
    let labor = Number(line.labor ?? line.values?.labor ?? 0) || 0;
    const hours = Number(line.laborHours ?? line.values?.labor_hours ?? 0) || 0;
    const rate = Number(line.laborRate ?? line.values?.labor_rate ?? 0) || 0;
    if (hours > 0 && rate > 0) labor = hours * rate;
    if (line.complimentary) labor = 0;
    if (qty > 0 && unit > 0) total += qty * unit;
    else total += material;
    total += labor;
  }
  return Math.round(total * 100) / 100;
}

export function formatMaintenanceLineLabel(line: MaintenanceLogLine): string {
  const parts = [
    line.systemName,
    line.categoryName,
    line.action ? line.action.replace(/_/g, " ") : null,
  ].filter(Boolean);
  if (parts.length) return parts.join(" · ");
  return line.categoryName || "Service line";
}

/** Group components under their parent systems for UI. */
export function groupCategoriesBySystem(
  categories: MaintenanceServiceCategory[],
): { system: MaintenanceServiceCategory; components: MaintenanceServiceCategory[] }[] {
  const systems = categories
    .filter((c) => c.kind === "system" || (!c.parent_id && c.code?.startsWith("sys_")))
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order);
  const byParent = new Map<string, MaintenanceServiceCategory[]>();
  for (const c of categories) {
    if (c.kind === "system") continue;
    const pid = c.parent_id || "";
    if (!pid) continue;
    const list = byParent.get(pid) || [];
    list.push(c);
    byParent.set(pid, list);
  }
  const out = systems.map((system) => ({
    system,
    components: (byParent.get(system.id) || []).sort((a, b) => a.sort_order - b.sort_order),
  }));
  // Orphan components (no parent match)
  const known = new Set(systems.map((s) => s.id));
  const orphans = categories.filter(
    (c) => c.kind !== "system" && c.parent_id && !known.has(c.parent_id),
  );
  const noParent = categories.filter(
    (c) => c.kind !== "system" && !c.parent_id && !c.code?.startsWith("sys_"),
  );
  if (orphans.length || noParent.length) {
    out.push({
      system: {
        id: "__other__",
        code: "sys_other",
        name: "Other",
        icon_key: "wrench",
        field_schema: { fields: [] },
        quick_job_eligible: true,
        sort_order: 9999,
        kind: "system",
        parent_id: null,
        created_at: "",
        updated_at: "",
      },
      components: [...orphans, ...noParent].sort((a, b) => a.sort_order - b.sort_order),
    });
  }
  return out;
}
