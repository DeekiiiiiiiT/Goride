-- Pass 5: durable statement↔engine drift (post-cutover integrity).
-- Nightly finance-recon + close preview upsert open rows; resolve when clear.

CREATE TABLE IF NOT EXISTS ledger.finance_recon_drift (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  driver_id TEXT NOT NULL,
  week_key DATE NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('fuel', 'toll', 'earnings')),
  field TEXT NOT NULL,
  statement_minor BIGINT NOT NULL DEFAULT 0,
  engine_minor BIGINT NOT NULL DEFAULT 0,
  delta_minor BIGINT NOT NULL DEFAULT 0,
  statement_version INTEGER,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'resolved')),
  source TEXT NOT NULL DEFAULT 'nightly'
    CHECK (source IN ('close_preview', 'rebuild', 'nightly', 'close')),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  UNIQUE (organization_id, driver_id, week_key, kind, field)
);

CREATE INDEX IF NOT EXISTS idx_finance_recon_drift_open
  ON ledger.finance_recon_drift (organization_id, week_key, status)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_finance_recon_drift_org_week
  ON ledger.finance_recon_drift (organization_id, week_key, driver_id);

CREATE OR REPLACE VIEW public.finance_recon_drift
WITH (security_invoker = true)
AS
  SELECT * FROM ledger.finance_recon_drift;

ALTER TABLE ledger.finance_recon_drift ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS finance_recon_drift_service ON ledger.finance_recon_drift;
CREATE POLICY finance_recon_drift_service ON ledger.finance_recon_drift
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS finance_recon_drift_org_select ON ledger.finance_recon_drift;
CREATE POLICY finance_recon_drift_org_select ON ledger.finance_recon_drift
  FOR SELECT TO authenticated
  USING (
    public.rbac_is_platform_user(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = organization_id AND o.owner_id = auth.uid()
    )
    OR organization_id::text = COALESCE(
      (auth.jwt() -> 'app_metadata' ->> 'organizationId'),
      (auth.jwt() -> 'app_metadata' ->> 'organization_id'),
      (auth.jwt() -> 'user_metadata' ->> 'organizationId'),
      (auth.jwt() -> 'user_metadata' ->> 'organization_id')
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON ledger.finance_recon_drift TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_recon_drift TO service_role;
GRANT SELECT ON public.finance_recon_drift TO authenticated;

NOTIFY pgrst, 'reload schema';
