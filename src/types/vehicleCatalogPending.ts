/** Row shape for `vehicle_catalog_pending_requests` (admin queue). */
export type VehicleCatalogPendingStatus = "pending" | "approved" | "rejected" | "superseded";

export interface VehicleCatalogPendingRequest {
  id: string;
  organization_id: string;
  fleet_vehicle_id: string;
  proposed_make: string;
  proposed_model: string;
  proposed_year: number;
  proposed_trim_series: string | null;
  proposed_body_type: string | null;
  source: "scan" | "manual";
  ocr_snapshot: Record<string, unknown> | null;
  status: VehicleCatalogPendingStatus;
  resolved_vehicle_catalog_id: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}
