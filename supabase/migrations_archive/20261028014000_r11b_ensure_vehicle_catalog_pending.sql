-- R11b: fresh-branch replay failed because vehicle_catalog_pending_requests was
-- never created under its local migration version (prod history used the same
-- timestamps for unrelated history_align migrations). Ensure the table exists
-- so later catalog migrations can apply on empty databases.

CREATE TABLE IF NOT EXISTS public.vehicle_catalog_pending_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  fleet_vehicle_id text NOT NULL,
  proposed_make text NOT NULL,
  proposed_model text NOT NULL,
  proposed_year integer CHECK (proposed_year IS NULL OR (proposed_year >= 1900 AND proposed_year <= 2100)),
  proposed_trim_series text,
  proposed_body_type text,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('scan', 'manual')),
  ocr_snapshot jsonb,
  status text NOT NULL DEFAULT 'pending',
  resolved_vehicle_catalog_id uuid,
  resolved_by uuid,
  resolved_at timestamptz,
  rejection_reason text,
  info_request_message text,
  info_requested_at timestamptz,
  info_requested_by uuid,
  proposed_production_start_year integer,
  proposed_production_end_year integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vcpending_org_status
  ON public.vehicle_catalog_pending_requests (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_vcpending_status_created
  ON public.vehicle_catalog_pending_requests (status, created_at DESC);
