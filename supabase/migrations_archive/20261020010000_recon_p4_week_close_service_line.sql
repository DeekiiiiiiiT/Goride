-- Week Reconciliation P4: scope org-week close locks/runs by service_line (default rideshare).

ALTER TABLE ledger.week_close_locks
  ADD COLUMN IF NOT EXISTS service_line text NOT NULL DEFAULT 'rideshare';

ALTER TABLE ledger.week_close_runs
  ADD COLUMN IF NOT EXISTS service_line text NOT NULL DEFAULT 'rideshare';

UPDATE ledger.week_close_locks SET service_line = 'rideshare' WHERE service_line IS NULL;
UPDATE ledger.week_close_runs SET service_line = 'rideshare' WHERE service_line IS NULL;

ALTER TABLE ledger.week_close_locks
  DROP CONSTRAINT IF EXISTS week_close_locks_pkey;

ALTER TABLE ledger.week_close_locks
  ADD PRIMARY KEY (organization_id, service_line, week_key);

CREATE INDEX IF NOT EXISTS idx_week_close_runs_org_line_week
  ON ledger.week_close_runs (organization_id, service_line, week_key, created_at DESC);

DROP INDEX IF EXISTS ledger.idx_week_close_runs_org_week;

CREATE OR REPLACE VIEW public.week_close_locks
WITH (security_invoker = true)
AS
  SELECT * FROM ledger.week_close_locks;

CREATE OR REPLACE VIEW public.week_close_runs
WITH (security_invoker = true)
AS
  SELECT * FROM ledger.week_close_runs;

DROP FUNCTION IF EXISTS public.try_claim_week_close(uuid, text, text, int);
DROP FUNCTION IF EXISTS public.release_week_close_lock(uuid, text, text);

CREATE OR REPLACE FUNCTION public.try_claim_week_close(
  p_org_id uuid,
  p_week_key text,
  p_actor text,
  p_ttl_seconds int DEFAULT 120,
  p_service_line text DEFAULT 'rideshare'
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, ledger
AS $$
DECLARE
  claimed boolean := false;
  ttl int := GREATEST(COALESCE(p_ttl_seconds, 120), 1);
  line text := COALESCE(NULLIF(trim(p_service_line), ''), 'rideshare');
BEGIN
  IF p_org_id IS NULL OR NULLIF(trim(p_week_key), '') IS NULL OR NULLIF(trim(p_actor), '') IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO ledger.week_close_locks (organization_id, service_line, week_key, locked_at, locked_by)
  VALUES (p_org_id, line, trim(p_week_key), now(), trim(p_actor))
  ON CONFLICT (organization_id, service_line, week_key) DO UPDATE
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
  p_actor text,
  p_service_line text DEFAULT 'rideshare'
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, ledger
AS $$
DECLARE
  line text := COALESCE(NULLIF(trim(p_service_line), ''), 'rideshare');
BEGIN
  DELETE FROM ledger.week_close_locks
  WHERE organization_id = p_org_id
    AND service_line = line
    AND week_key = trim(p_week_key)
    AND locked_by = trim(p_actor);
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.try_claim_week_close(uuid, text, text, int, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_week_close_lock(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.try_claim_week_close(uuid, text, text, int, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_week_close_lock(uuid, text, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
