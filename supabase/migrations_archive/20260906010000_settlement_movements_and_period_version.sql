-- Phase 3: append-only settlement_movements + batch runs + DFP row_version.
-- Lives in ledger.* beside driver_financial_periods (public views for PostgREST).

-- ── Optimistic concurrency on period projection ─────────────────────────────
ALTER TABLE ledger.driver_financial_periods
  ADD COLUMN IF NOT EXISTS row_version INTEGER NOT NULL DEFAULT 1;

COMMENT ON COLUMN ledger.driver_financial_periods.row_version IS
  'Settlement command optimistic lock (independent of projection_version).';

-- ── Append-only settlement movements ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ledger.settlement_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  driver_id TEXT NOT NULL,
  period_anchor DATE NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('collect', 'pay', 'write_off', 'reverse', 'verify')),
  amount_minor BIGINT NOT NULL,
  method TEXT,
  reference TEXT,
  reason TEXT,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  idempotency_key TEXT NOT NULL,
  reverses_movement_id UUID NULL REFERENCES ledger.settlement_movements(id),
  approval_state TEXT NOT NULL DEFAULT 'none'
    CHECK (approval_state IN ('none', 'pending', 'approved', 'rejected')),
  status TEXT NOT NULL DEFAULT 'posted'
    CHECK (status IN ('posted', 'pending', 'void')),
  source_transaction_id TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_settlement_movements_org_driver_anchor
  ON ledger.settlement_movements (organization_id, driver_id, period_anchor);

CREATE INDEX IF NOT EXISTS idx_settlement_movements_org_created
  ON ledger.settlement_movements (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_settlement_movements_reverses
  ON ledger.settlement_movements (reverses_movement_id)
  WHERE reverses_movement_id IS NOT NULL;

-- ── Batch settlement runs ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ledger.settlement_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  method TEXT,
  effective_date DATE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'partial')),
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (organization_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS ledger.settlement_run_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES ledger.settlement_runs(id) ON DELETE CASCADE,
  driver_id TEXT NOT NULL,
  period_anchor DATE NOT NULL,
  amount_minor BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'posted', 'failed', 'skipped')),
  error_message TEXT,
  movement_id UUID NULL REFERENCES ledger.settlement_movements(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_settlement_run_rows_run
  ON ledger.settlement_run_rows (run_id);

-- ── Public views (PostgREST / edge service client) ──────────────────────────
CREATE OR REPLACE VIEW public.settlement_movements
WITH (security_invoker = true)
AS
  SELECT * FROM ledger.settlement_movements;

CREATE OR REPLACE VIEW public.settlement_runs
WITH (security_invoker = true)
AS
  SELECT * FROM ledger.settlement_runs;

CREATE OR REPLACE VIEW public.settlement_run_rows
WITH (security_invoker = true)
AS
  SELECT * FROM ledger.settlement_run_rows;

-- Refresh DFP public view so row_version is visible.
CREATE OR REPLACE VIEW public.driver_financial_periods
WITH (security_invoker = true)
AS
  SELECT * FROM ledger.driver_financial_periods;

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE ledger.settlement_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.settlement_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.settlement_run_rows ENABLE ROW LEVEL SECURITY;

-- service_role full access (edge writes)
DROP POLICY IF EXISTS settlement_movements_service ON ledger.settlement_movements;
CREATE POLICY settlement_movements_service ON ledger.settlement_movements
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS settlement_runs_service ON ledger.settlement_runs;
CREATE POLICY settlement_runs_service ON ledger.settlement_runs
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS settlement_run_rows_service ON ledger.settlement_run_rows;
CREATE POLICY settlement_run_rows_service ON ledger.settlement_run_rows
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- authenticated: org owner (DFP style) OR JWT organizationId claim (team seats)
DROP POLICY IF EXISTS settlement_movements_org_select ON ledger.settlement_movements;
CREATE POLICY settlement_movements_org_select ON ledger.settlement_movements
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

DROP POLICY IF EXISTS settlement_runs_org_select ON ledger.settlement_runs;
CREATE POLICY settlement_runs_org_select ON ledger.settlement_runs
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

DROP POLICY IF EXISTS settlement_run_rows_org_select ON ledger.settlement_run_rows;
CREATE POLICY settlement_run_rows_org_select ON ledger.settlement_run_rows
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ledger.settlement_runs r
      WHERE r.id = run_id
        AND (
          public.rbac_is_platform_user(auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.organizations o
            WHERE o.id = r.organization_id AND o.owner_id = auth.uid()
          )
          OR r.organization_id::text = COALESCE(
            (auth.jwt() -> 'app_metadata' ->> 'organizationId'),
            (auth.jwt() -> 'app_metadata' ->> 'organization_id'),
            (auth.jwt() -> 'user_metadata' ->> 'organizationId'),
            (auth.jwt() -> 'user_metadata' ->> 'organization_id')
          )
        )
    )
  );

-- ── Grants ──────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON ledger.settlement_movements TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ledger.settlement_runs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ledger.settlement_run_rows TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.settlement_movements TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.settlement_runs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.settlement_run_rows TO service_role;

GRANT SELECT ON public.settlement_movements TO authenticated;
GRANT SELECT ON public.settlement_runs TO authenticated;
GRANT SELECT ON public.settlement_run_rows TO authenticated;

GRANT SELECT ON public.driver_financial_periods TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
