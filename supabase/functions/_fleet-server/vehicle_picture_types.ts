export type PictureRowStatus = "queued" | "generating" | "ready" | "failed";

export type VehiclePictureRow = {
  id: string;
  look_key: string;
  make: string;
  model: string;
  generation: string;
  body_type: string;
  facelift_stage: string;
  start_year: number | null;
  end_year: number | null;
  color: string;
  example_catalog_id: string | null;
  status: PictureRowStatus;
  lane: "live" | "remake";
  r2_key: string | null;
  version: number;
  source: string;
  provider: string | null;
  ai_model: string | null;
  prompt: string | null;
  prompt_version: number | null;
  cost_usd: number | null;
  attempts: number;
  next_attempt_at: string | null;
  lease_until: string | null;
  last_error: string | null;
  staff_rating: string | null;
  made_at: string | null;
  made_by: string | null;
  deleted_at: string | null;
  stale: boolean;
  queued_by_org: string | null;
  created_at: string;
  updated_at: string;
};

export type PictureDisplayStatus =
  | "ready"
  | "queued"
  | "generating"
  | "paused"
  | "limited"
  | "failed"
  | "none";

export type PicturePayload = {
  status: PictureDisplayStatus;
  url: string | null;
};

export type FleetVehiclePictureContext = {
  vehicleId: string;
  organizationId: string;
  vehicleCatalogId: string | null;
  colorStandard: string | null;
  pictureId: string | null;
  catalogStatus?: string | null;
};