-- Customer claim/edit/new-listing requests for freight-forwarder buildings.
-- Master catalog stays public.intake_warehouse_catalog; customers never write it directly.
-- One active warehouse facility per catalog listing (exclusive claim).

CREATE TABLE IF NOT EXISTS freight.intake_claim_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('claim_edit', 'new_listing')),
  catalog_id UUID REFERENCES public.intake_warehouse_catalog(id) ON DELETE SET NULL,
  proposed_name TEXT NOT NULL,
  proposed_address_line TEXT NOT NULL,
  proposed_city TEXT NOT NULL,
  proposed_state TEXT NOT NULL DEFAULT '',
  proposed_postal_code TEXT NOT NULL,
  proposed_country_code TEXT NOT NULL,
  proposed_timezone TEXT NOT NULL DEFAULT 'America/New_York',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  review_note TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT intake_claim_edit_needs_catalog CHECK (
    kind <> 'claim_edit' OR catalog_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_freight_intake_claims_org_status
  ON freight.intake_claim_requests (organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_freight_intake_claims_pending
  ON freight.intake_claim_requests (created_at DESC)
  WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS idx_freight_intake_claims_one_pending
  ON freight.intake_claim_requests (organization_id)
  WHERE status = 'pending';

COMMENT ON TABLE freight.intake_claim_requests IS
  'Freight-forwarder Setup: edits and new companies wait here until Enterprise Admin approves.';

ALTER TABLE freight.intake_claim_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS freight_intake_claim_requests_select ON freight.intake_claim_requests;
CREATE POLICY freight_intake_claim_requests_select
  ON freight.intake_claim_requests
  FOR SELECT TO authenticated
  USING (freight.user_owns_org(organization_id));

DROP POLICY IF EXISTS freight_intake_claim_requests_no_insert ON freight.intake_claim_requests;
CREATE POLICY freight_intake_claim_requests_no_insert
  ON freight.intake_claim_requests
  FOR INSERT TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS freight_intake_claim_requests_no_update ON freight.intake_claim_requests;
CREATE POLICY freight_intake_claim_requests_no_update
  ON freight.intake_claim_requests
  FOR UPDATE TO authenticated
  USING (false);

DROP POLICY IF EXISTS freight_intake_claim_requests_no_delete ON freight.intake_claim_requests;
CREATE POLICY freight_intake_claim_requests_no_delete
  ON freight.intake_claim_requests
  FOR DELETE TO authenticated
  USING (false);

GRANT SELECT ON freight.intake_claim_requests TO authenticated;
GRANT ALL ON freight.intake_claim_requests TO service_role;

-- One freight-forwarder org per catalog building.
CREATE UNIQUE INDEX IF NOT EXISTS idx_freight_facilities_catalog_exclusive
  ON freight.facilities (intake_catalog_id)
  WHERE intake_catalog_id IS NOT NULL AND facility_type = 'warehouse';

COMMENT ON TABLE public.intake_warehouse_catalog IS
  'Master freight-forwarder buildings; managed in Roam Enterprise Admin. Customers pick or request changes.';
