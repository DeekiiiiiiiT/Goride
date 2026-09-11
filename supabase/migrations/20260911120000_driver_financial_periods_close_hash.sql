-- Phase 1 close integrity: dedicated close_hash column + dual-write freeze RPC.
-- Rebuild/projection must never write close_hash (app-enforced).

ALTER TABLE ledger.driver_financial_periods
  ADD COLUMN IF NOT EXISTS close_hash TEXT;

COMMENT ON COLUMN ledger.driver_financial_periods.close_hash IS
  'Authoritative week-close seal (H-4). Distinct from source_event_hash (projection). Written only by freeze_settlement_periods_batch / reopen.';

-- H-3: allow NULL after reopen so empty string is not mistaken for "never sealed".
ALTER TABLE ledger.driver_financial_periods
  ALTER COLUMN source_event_hash DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.freeze_settlement_periods_batch(
  p_rows jsonb
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, ledger
AS $$
DECLARE
  r jsonb;
  n int := 0;
  v_close text;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'FREEZE_BATCH_INVALID';
  END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_close := NULLIF(r->>'close_hash', '');
    UPDATE ledger.driver_financial_periods p
    SET
      status = 'closed',
      closed_at = COALESCE((r->>'closed_at')::timestamptz, now()),
      reopened_at = NULL,
      -- Dual-write: legacy column + dedicated close_hash (Phase 1).
      source_event_hash = COALESCE(v_close, ''),
      close_hash = v_close,
      metadata = COALESCE(r->'metadata', p.metadata)
    WHERE p.id = (r->>'id')::uuid;
    IF FOUND THEN
      n := n + 1;
    END IF;
  END LOOP;

  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.freeze_settlement_periods_batch(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.freeze_settlement_periods_batch(jsonb) TO service_role;

COMMENT ON FUNCTION public.freeze_settlement_periods_batch IS
  'H-2/Phase1: atomic calendar freeze; dual-writes source_event_hash + close_hash + metadata.';

-- N-1: MUST keep security_invoker — CREATE OR REPLACE without WITH resets reloptions.
CREATE OR REPLACE VIEW public.driver_financial_periods
WITH (security_invoker = true)
AS
  SELECT * FROM ledger.driver_financial_periods;

GRANT SELECT ON public.driver_financial_periods TO authenticated, service_role;
