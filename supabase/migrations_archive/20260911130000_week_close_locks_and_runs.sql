-- Phase 3 close integrity (C-3): org-week close lock + idempotent close runs.
-- Edge cannot hold a single Postgres transaction across prepare/verify/freeze,
-- so we use a claimable lock row (TTL) instead of pg_try_advisory_xact_lock.

CREATE TABLE IF NOT EXISTS ledger.week_close_locks (
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  week_key TEXT NOT NULL,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_by TEXT NOT NULL,
  PRIMARY KEY (organization_id, week_key)
);

COMMENT ON TABLE ledger.week_close_locks IS
  'C-3: mutual exclusion for prepare/close/retry-freeze of an org-week (TTL reclaim).';

CREATE TABLE IF NOT EXISTS ledger.week_close_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  week_key TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL
    CHECK (status IN ('in_progress', 'completed', 'failed')),
  result JSONB,
  actor_id TEXT,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE (organization_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_week_close_runs_org_week
  ON ledger.week_close_runs (organization_id, week_key, created_at DESC);

COMMENT ON TABLE ledger.week_close_runs IS
  'C-3: idempotent POST /week-close outcomes keyed by (org, idempotency_key).';

-- Public views for PostgREST / service client
CREATE OR REPLACE VIEW public.week_close_locks
WITH (security_invoker = true)
AS
  SELECT * FROM ledger.week_close_locks;

CREATE OR REPLACE VIEW public.week_close_runs
WITH (security_invoker = true)
AS
  SELECT * FROM ledger.week_close_runs;

-- ── Claim lock (expired OR same actor) ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.try_claim_week_close(
  p_org_id uuid,
  p_week_key text,
  p_actor text,
  p_ttl_seconds int DEFAULT 120
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, ledger
AS $$
DECLARE
  claimed boolean := false;
  ttl int := GREATEST(COALESCE(p_ttl_seconds, 120), 1);
BEGIN
  IF p_org_id IS NULL OR NULLIF(trim(p_week_key), '') IS NULL OR NULLIF(trim(p_actor), '') IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO ledger.week_close_locks (organization_id, week_key, locked_at, locked_by)
  VALUES (p_org_id, trim(p_week_key), now(), trim(p_actor))
  ON CONFLICT (organization_id, week_key) DO UPDATE
  SET
    locked_at = now(),
    locked_by = EXCLUDED.locked_by
  WHERE ledger.week_close_locks.locked_at < now() - make_interval(secs => ttl)
     OR ledger.week_close_locks.locked_by = EXCLUDED.locked_by
  RETURNING true INTO claimed;

  RETURN COALESCE(claimed, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_week_close_lock(
  p_org_id uuid,
  p_week_key text,
  p_actor text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, ledger
AS $$
BEGIN
  DELETE FROM ledger.week_close_locks
  WHERE organization_id = p_org_id
    AND week_key = trim(p_week_key)
    AND locked_by = trim(p_actor);
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.try_claim_week_close(uuid, text, text, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_week_close_lock(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.try_claim_week_close(uuid, text, text, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_week_close_lock(uuid, text, text) TO service_role;

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE ledger.week_close_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.week_close_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS week_close_locks_service ON ledger.week_close_locks;
CREATE POLICY week_close_locks_service ON ledger.week_close_locks
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS week_close_runs_service ON ledger.week_close_runs;
CREATE POLICY week_close_runs_service ON ledger.week_close_runs
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS week_close_runs_org_select ON ledger.week_close_runs;
CREATE POLICY week_close_runs_org_select ON ledger.week_close_runs
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

GRANT SELECT, INSERT, UPDATE, DELETE ON ledger.week_close_locks TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ledger.week_close_runs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.week_close_locks TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.week_close_runs TO service_role;
GRANT SELECT ON public.week_close_runs TO authenticated;

NOTIFY pgrst, 'reload schema';
