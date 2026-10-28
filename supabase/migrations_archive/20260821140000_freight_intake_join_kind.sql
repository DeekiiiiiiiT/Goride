-- Company join requests: picking a listed warehouse now waits for admin approval.
-- One pending request per listing so two companies cannot queue the same building.

ALTER TABLE freight.intake_claim_requests
  DROP CONSTRAINT IF EXISTS intake_claim_requests_kind_check;

ALTER TABLE freight.intake_claim_requests
  ADD CONSTRAINT intake_claim_requests_kind_check
  CHECK (kind IN ('join', 'claim_edit', 'new_listing'));

ALTER TABLE freight.intake_claim_requests
  DROP CONSTRAINT IF EXISTS intake_claim_edit_needs_catalog;

ALTER TABLE freight.intake_claim_requests
  ADD CONSTRAINT intake_claim_needs_catalog
  CHECK (kind = 'new_listing' OR catalog_id IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS idx_freight_intake_claims_one_pending_catalog
  ON freight.intake_claim_requests (catalog_id)
  WHERE status = 'pending' AND catalog_id IS NOT NULL;

COMMENT ON TABLE freight.intake_claim_requests IS
  'Freight Forwarder Setup: join, address corrections, and new companies wait here until Enterprise Admin approves.';
