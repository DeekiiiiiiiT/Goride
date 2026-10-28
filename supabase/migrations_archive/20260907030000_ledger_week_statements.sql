-- Phase 4: signed weekly statements (fuel / toll / earnings) per driver-week.
-- Immutable, versioned facts. Projection reads statements behind a flag; close
-- signs them. Restatement creates version n+1 superseding a prior closed row.
-- Lives in ledger.* beside driver_financial_periods; public view for PostgREST.

CREATE TABLE IF NOT EXISTS ledger.week_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('fuel', 'toll', 'earnings')),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  driver_id TEXT NOT NULL,
  week_key DATE NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'closed', 'restated')),
  amounts_minor JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_row_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_hash TEXT,
  engine_version TEXT,
  closed_at TIMESTAMPTZ,
  closed_by TEXT,
  close_reason TEXT,
  supersedes UUID REFERENCES ledger.week_statements(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, driver_id, week_key, kind, version)
);

CREATE INDEX IF NOT EXISTS idx_week_statements_org_week_driver
  ON ledger.week_statements (organization_id, week_key, driver_id);

CREATE INDEX IF NOT EXISTS idx_week_statements_lookup_latest
  ON ledger.week_statements (organization_id, driver_id, week_key, kind, version DESC);

CREATE INDEX IF NOT EXISTS idx_week_statements_supersedes
  ON ledger.week_statements (supersedes)
  WHERE supersedes IS NOT NULL;

-- ── Public view (PostgREST / edge service client) ───────────────────────────
CREATE OR REPLACE VIEW public.week_statements
WITH (security_invoker = true)
AS
  SELECT * FROM ledger.week_statements;

-- ── RLS (matches settlement_movements pattern) ──────────────────────────────
ALTER TABLE ledger.week_statements ENABLE ROW LEVEL SECURITY;

-- service_role full access (edge writes: publish / close / restate)
DROP POLICY IF EXISTS week_statements_service ON ledger.week_statements;
CREATE POLICY week_statements_service ON ledger.week_statements
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- authenticated: platform user, org owner, or JWT organizationId claim (read only)
DROP POLICY IF EXISTS week_statements_org_select ON ledger.week_statements;
CREATE POLICY week_statements_org_select ON ledger.week_statements
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

-- ── Grants ──────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON ledger.week_statements TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.week_statements TO service_role;
GRANT SELECT ON public.week_statements TO authenticated;

NOTIFY pgrst, 'reload schema';
