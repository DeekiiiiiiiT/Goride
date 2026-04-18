/** How the template translates into next-due scheduling (vendor-independent). */
export type MaintenanceFrequencyKind = "recurring" | "once_milestone" | "manual_only";

/** Row from `maintenance_task_templates` (Super Admin). */
export interface MaintenanceTaskTemplate {
  id: string;
  vehicle_catalog_id: string;
  task_name: string;
  description: string | null;
  interval_miles: number | null;
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
  next_due_date?: string | null;
  [key: string]: unknown;
}

/** Mapped option for logging UI (links save payload to `templateId`). */
export interface CatalogMaintenanceTaskOption {
  templateId: string;
  label: string;
  checklistLines: string[];
}
