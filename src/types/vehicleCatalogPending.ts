/** Row shape for `vehicle_catalog_pending_requests` (admin queue). */
export type VehicleCatalogPendingStatus =
  | "pending"
  | "needs_info"
  | "approved"
  | "rejected"
  | "superseded";

export interface VehicleCatalogPendingRequest {
  id: string;
  organization_id: string;
  fleet_vehicle_id: string;
  proposed_make: string;
  proposed_model: string;
  proposed_production_start_year: number;
  proposed_production_end_year: number | null;
  proposed_production_start_month?: number | null;
  proposed_production_end_month?: number | null;
  proposed_engine_code?: string | null;
  /** Trim / series / facelift hint (same meaning as `vehicle_catalog.trim_series`). */
  proposed_trim_series: string | null;
  proposed_full_model_code?: string | null;
  proposed_catalog_trim?: string | null;
  proposed_emissions_prefix?: string | null;
  proposed_trim_suffix_code?: string | null;
  proposed_fuel_category?: string | null;
  proposed_fuel_grade?: string | null;
  proposed_body_type: string | null;
  source: "scan" | "manual";
  ocr_snapshot: Record<string, unknown> | null;
  status: VehicleCatalogPendingStatus;
  resolved_vehicle_catalog_id: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  rejection_reason: string | null;
  /** Admin message when status is `needs_info` (customer-visible). */
  info_request_message: string | null;
  info_requested_at: string | null;
  info_requested_by: string | null;
  created_at: string;
  updated_at: string;
}
