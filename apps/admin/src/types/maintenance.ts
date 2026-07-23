/** How the template translates into next-due scheduling (vendor-independent). */
export type MaintenanceFrequencyKind = "recurring" | "once_milestone" | "manual_only";

export type MaintenanceTemplateScope = "global" | "catalog";

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

/** Reusable service category (Tires, Oil, Brakes, …). */
export interface MaintenanceServiceCategory {
  id: string;
  code: string;
  name: string;
  icon_key: string;
  field_schema: MaintenanceCategoryFieldSchema;
  quick_job_eligible: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** Package ↔ category membership row. */
export interface MaintenancePackageCategory {
  id: string;
  template_id: string;
  category_id: string;
  sort_order: number;
  required: boolean;
  created_at?: string;
  category?: MaintenanceServiceCategory;
}

/** Structured line on a service log (commercial fields for one category). */
export interface MaintenanceLogLine {
  categoryId?: string;
  categoryCode: string;
  categoryName: string;
  qty?: number;
  unitPrice?: number;
  material?: number;
  labor?: number;
  condition?: "new" | "used" | string;
  notes?: string;
  /** Raw field values from the category form. */
  values?: Record<string, string | number | boolean | null>;
}

/** Row from `maintenance_task_templates` (Super Admin). */
export interface MaintenanceTaskTemplate {
  id: string;
  /** Null when `template_scope` is `global`. */
  vehicle_catalog_id: string | null;
  /** Fleet-wide defaults vs per–vehicle-catalog overlay. */
  template_scope?: MaintenanceTemplateScope;
  /** Optional stable slug; bootstrap merges global ∪ catalog with catalog winning on same code or normalized name. */
  task_code?: string | null;
  task_name: string;
  description: string | null;
  /** Icon key for fleet package picker. */
  icon_key?: string | null;
  /** Lower bound / nominal odometer delta between services (km in Roam; same unit as vehicle odometer). */
  interval_miles: number | null;
  /** Optional upper bound for an acceptable odometer window (e.g. 7500 when lower is 5000). */
  interval_miles_max?: number | null;
  interval_months: number | null;
  /** Defaults to `recurring` when omitted (pre-migration rows). */
  frequency_kind?: MaintenanceFrequencyKind;
  frequency_label?: string | null;
  priority: "critical" | "standard" | "optional";
  sort_order: number;
  created_at: string;
  updated_at: string;
  /** Populated when admin/fleet loads package with memberships. */
  categories?: MaintenanceServiceCategory[];
}

/** Enriched schedule row from GET `/maintenance-schedule/:vehicleId` (tenant). */
export interface VehicleMaintenanceScheduleRowApi {
  template_id?: string | null;
  template?: MaintenanceTaskTemplate | null;
  schedule_status?: "active" | "fulfilled";
  computed_status?: string;
  next_due_miles?: number | null;
  /** Upper end of due window when template uses interval_miles_max. */
  next_due_miles_max?: number | null;
  next_due_date?: string | null;
  [key: string]: unknown;
}

/** Mapped option for logging UI (links save payload to `templateId`). */
export interface CatalogMaintenanceTaskOption {
  templateId: string;
  label: string;
  /** @deprecated Prefer `categories`; kept for unmigrated templates. */
  checklistLines: string[];
  iconKey?: string;
  categories?: MaintenanceServiceCategory[];
}

/** Saved maintenance record shape (UI + API payload). */
export interface MaintenanceLog {
  id: string;
  vehicleId: string;
  date: string;
  type: string;
  /** When set with logMode=package, server advances `vehicle_maintenance_schedule`. */
  templateId?: string;
  /** package = full schedule visit; quick_job = mid-cycle category work (no schedule advance). */
  logMode?: "package" | "quick_job";
  serviceInterval?: "A" | "B" | "C" | "D";
  cost: number;
  odo: number;
  provider: string;
  providerLocationUrl?: string;
  notes: string;
  checklist?: string[];
  itemCosts?: Record<string, { material: number; labor: number }>;
  /** Structured category lines (source of truth for cost rollup). */
  lines?: MaintenanceLogLine[];
  inspectionFee?: number;
  inspectionResults?: {
    issues: string[];
    notes: string;
  };
  invoiceUrl?: string;
  /** ISO currency for cost; defaults JMD on the server. */
  currency?: string;
  status?: "Requested" | "Scheduled" | "In Progress" | "Completed" | "Cancelled";
}

/** Sum parts + labor from structured lines (qty×unitPrice + material + labor). */
export function sumMaintenanceLogLines(lines: MaintenanceLogLine[] | undefined | null): number {
  if (!lines?.length) return 0;
  let total = 0;
  for (const line of lines) {
    const qty = Number(line.qty ?? line.values?.qty ?? 0) || 0;
    const unit = Number(line.unitPrice ?? line.values?.unit_price ?? 0) || 0;
    const material = Number(line.material ?? line.values?.material ?? 0) || 0;
    const labor = Number(line.labor ?? line.values?.labor ?? 0) || 0;
    if (qty > 0 && unit > 0) total += qty * unit;
    else total += material;
    total += labor;
  }
  return Math.round(total * 100) / 100;
}
