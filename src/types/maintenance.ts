/** How the template translates into next-due scheduling (vendor-independent). */
export type MaintenanceFrequencyKind = "recurring" | "once_milestone" | "manual_only";

export type MaintenanceTemplateScope = "global" | "catalog";

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
  checklistLines: string[];
}
