-- Rush Fleet remediation: fix RLS JWT claim, tighten invite INSERT, security_invoker views, V18 backfill

-- V18: Enterprise delivery orgs should not get rush_delivery backfill
UPDATE public.organizations
SET service_lines = ARRAY['rideshare']
WHERE product_line = 'enterprise'
  AND business_type = 'delivery'
  AND service_lines = ARRAY['rush_delivery'];

-- V7: Correct JWT claim (organizationId camelCase)
DROP POLICY IF EXISTS fleet_delivery_details_org_select ON fleet.delivery_details;
CREATE POLICY fleet_delivery_details_org_select ON fleet.delivery_details
  FOR SELECT TO authenticated
  USING (
    organization_id = (auth.jwt() -> 'app_metadata' ->> 'organizationId')
  );

DROP POLICY IF EXISTS fleet_workforce_invites_org_select ON fleet.workforce_invites;
CREATE POLICY fleet_workforce_invites_org_select ON fleet.workforce_invites
  FOR SELECT TO authenticated
  USING (
    organization_id = (auth.jwt() -> 'app_metadata' ->> 'organizationId')
  );

DROP POLICY IF EXISTS fleet_workforce_invites_org_insert ON fleet.workforce_invites;
CREATE POLICY fleet_workforce_invites_org_insert ON fleet.workforce_invites
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = (auth.jwt() -> 'app_metadata' ->> 'organizationId')
    AND COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') IN ('fleet_owner', 'fleet_manager')
  );

-- security_invoker on public views so underlying RLS applies
DROP VIEW IF EXISTS public.fleet_delivery_details;
CREATE VIEW public.fleet_delivery_details
  WITH (security_invoker = true) AS
  SELECT * FROM fleet.delivery_details;

DROP VIEW IF EXISTS public.fleet_workforce_invites;
CREATE VIEW public.fleet_workforce_invites
  WITH (security_invoker = true) AS
  SELECT * FROM fleet.workforce_invites;

GRANT SELECT ON public.fleet_delivery_details TO authenticated, service_role;
GRANT SELECT, INSERT ON public.fleet_workforce_invites TO authenticated, service_role;

COMMENT ON POLICY fleet_workforce_invites_org_insert ON fleet.workforce_invites IS
  'Only fleet_owner and fleet_manager may create workforce invites';

NOTIFY pgrst, 'reload schema';
