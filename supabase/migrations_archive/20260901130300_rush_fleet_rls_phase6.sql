-- RoamFleet × Roam Rush Phase 6: RLS hardening for cross-schema Rush views

ALTER TABLE fleet.delivery_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE fleet.workforce_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fleet_delivery_details_org_select ON fleet.delivery_details;
CREATE POLICY fleet_delivery_details_org_select ON fleet.delivery_details
  FOR SELECT TO authenticated
  USING (
    organization_id = COALESCE(
      (auth.jwt() -> 'app_metadata' ->> 'organization_id'),
      (auth.jwt() -> 'user_metadata' ->> 'organization_id')
    )
  );

DROP POLICY IF EXISTS fleet_workforce_invites_org_select ON fleet.workforce_invites;
CREATE POLICY fleet_workforce_invites_org_select ON fleet.workforce_invites
  FOR SELECT TO authenticated
  USING (
    organization_id = COALESCE(
      (auth.jwt() -> 'app_metadata' ->> 'organization_id'),
      (auth.jwt() -> 'user_metadata' ->> 'organization_id')
    )
  );

DROP POLICY IF EXISTS fleet_workforce_invites_org_insert ON fleet.workforce_invites;
CREATE POLICY fleet_workforce_invites_org_insert ON fleet.workforce_invites
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = COALESCE(
      (auth.jwt() -> 'app_metadata' ->> 'organization_id'),
      (auth.jwt() -> 'user_metadata' ->> 'organization_id')
    )
  );

COMMENT ON POLICY fleet_delivery_details_org_select ON fleet.delivery_details IS
  'Fleet orgs read only their projected Rush delivery_details rows';
