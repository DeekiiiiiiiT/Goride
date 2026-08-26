-- Vehicle remediation Phase 5: soft-archive templates + fleet parts requests queue

ALTER TABLE public.maintenance_task_templates
  ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_maintenance_task_templates_archived_at
  ON public.maintenance_task_templates (archived_at)
  WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS public.parts_sourcing_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  vehicle_id text NOT NULL,
  need_text text NOT NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'resolved', 'rejected')),
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz NULL,
  admin_note text NULL
);

CREATE INDEX IF NOT EXISTS idx_parts_sourcing_requests_status_created
  ON public.parts_sourcing_requests (status, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_parts_sourcing_requests_org
  ON public.parts_sourcing_requests (organization_id, created_at DESC);

ALTER TABLE public.parts_sourcing_requests ENABLE ROW LEVEL SECURITY;

-- Edge service role bypasses RLS; keep policies tight for direct client access.
DROP POLICY IF EXISTS parts_sourcing_requests_select_own ON public.parts_sourcing_requests;
CREATE POLICY parts_sourcing_requests_select_own
  ON public.parts_sourcing_requests
  FOR SELECT
  TO authenticated
  USING (
    organization_id = coalesce(
      auth.jwt() -> 'app_metadata' ->> 'organizationId',
      auth.uid()::text
    )
    OR coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') IN (
      'platform_owner', 'platform_support', 'platform_analyst', 'superadmin'
    )
  );
