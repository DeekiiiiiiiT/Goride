-- Fleet Tag (permanent org handle) + join-request queue for drivers/couriers.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS fleet_tag text,
  ADD COLUMN IF NOT EXISTS fleet_tag_internal_id text;

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_fleet_tag_format;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_fleet_tag_format CHECK (
    fleet_tag IS NULL OR (
      char_length(fleet_tag) >= 3
      AND char_length(fleet_tag) <= 24
      AND fleet_tag ~ '^[a-z0-9_]+$'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS organizations_fleet_tag_uidx
  ON public.organizations (fleet_tag)
  WHERE fleet_tag IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS organizations_fleet_tag_internal_uidx
  ON public.organizations (fleet_tag_internal_id)
  WHERE fleet_tag_internal_id IS NOT NULL;

COMMENT ON COLUMN public.organizations.fleet_tag IS
  'Public Fleet Tag handle (no @). Drivers/couriers use this to request join.';
COMMENT ON COLUMN public.organizations.fleet_tag_internal_id IS
  'Opaque FT-… id for ops; never returned to clients.';

-- Join requests (request + approve/deny). Separate from one-shot workforce_invites.
CREATE TABLE IF NOT EXISTS fleet.join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  requester_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_line text NOT NULL CHECK (service_line IN ('rideshare', 'rush_delivery')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'denied', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS fleet_join_requests_pending_uidx
  ON fleet.join_requests (organization_id, requester_user_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS fleet_join_requests_org_status_idx
  ON fleet.join_requests (organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS fleet_join_requests_requester_idx
  ON fleet.join_requests (requester_user_id, status);

ALTER TABLE fleet.join_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fleet_join_requests_org_select ON fleet.join_requests;
CREATE POLICY fleet_join_requests_org_select ON fleet.join_requests
  FOR SELECT TO authenticated
  USING (
    organization_id = (auth.jwt() -> 'app_metadata' ->> 'organizationId')
    OR requester_user_id = auth.uid()
  );

-- Writes go through edge/service_role only.
DROP POLICY IF EXISTS fleet_join_requests_no_direct_insert ON fleet.join_requests;
CREATE POLICY fleet_join_requests_no_direct_insert ON fleet.join_requests
  FOR INSERT TO authenticated WITH CHECK (false);
DROP POLICY IF EXISTS fleet_join_requests_no_direct_update ON fleet.join_requests;
CREATE POLICY fleet_join_requests_no_direct_update ON fleet.join_requests
  FOR UPDATE TO authenticated USING (false);
DROP POLICY IF EXISTS fleet_join_requests_no_direct_delete ON fleet.join_requests;
CREATE POLICY fleet_join_requests_no_direct_delete ON fleet.join_requests
  FOR DELETE TO authenticated USING (false);

GRANT ALL ON fleet.join_requests TO service_role;
GRANT SELECT ON fleet.join_requests TO authenticated;

DROP VIEW IF EXISTS public.fleet_join_requests;
CREATE VIEW public.fleet_join_requests
  WITH (security_invoker = true) AS
  SELECT * FROM fleet.join_requests;

GRANT SELECT ON public.fleet_join_requests TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.fleet_join_requests TO service_role;

COMMENT ON TABLE fleet.join_requests IS
  'Driver/courier requests to join a fleet via Fleet Tag; owner approves or denies.';

NOTIFY pgrst, 'reload schema';
