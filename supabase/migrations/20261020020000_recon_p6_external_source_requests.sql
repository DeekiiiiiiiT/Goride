-- Week Reconciliation P6: Roam external-source request queue (fuel_card_roam).

CREATE TABLE IF NOT EXISTS recon.external_source_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  week_key date NOT NULL CHECK (extract(isodow FROM week_key) = 1),
  source_id text NOT NULL,
  service_line text NOT NULL DEFAULT 'rideshare'
    CHECK (service_line IN ('rideshare', 'rush_delivery')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  requested_by text NOT NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'fulfilled', 'cancelled')),
  note text
);

CREATE INDEX IF NOT EXISTS recon_external_source_requests_open_idx
  ON recon.external_source_requests (status, source_id, week_key DESC)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS recon_external_source_requests_org_week_idx
  ON recon.external_source_requests (organization_id, week_key DESC, source_id);

ALTER TABLE recon.external_source_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recon_external_source_requests_org_select ON recon.external_source_requests;
CREATE POLICY recon_external_source_requests_org_select ON recon.external_source_requests
  FOR SELECT TO authenticated
  USING (
    organization_id = COALESCE(
      (auth.jwt() -> 'app_metadata' ->> 'organization_id'),
      (auth.jwt() -> 'user_metadata' ->> 'organization_id')
    )
  );

REVOKE ALL ON recon.external_source_requests FROM PUBLIC;
REVOKE ALL ON recon.external_source_requests FROM anon, authenticated;
GRANT SELECT ON recon.external_source_requests TO authenticated;
GRANT ALL ON recon.external_source_requests TO service_role;

COMMENT ON TABLE recon.external_source_requests IS
  'Fleet reminders / Roam ops queue for external reconciliation sources (e.g. fuel_card_roam). Writes: service role only.';

NOTIFY pgrst, 'reload schema';
