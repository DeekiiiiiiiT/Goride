-- H-2: atomic batch freeze for Close Week — all ready periods in one transaction.

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
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'FREEZE_BATCH_INVALID';
  END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    UPDATE ledger.driver_financial_periods p
    SET
      status = 'closed',
      closed_at = COALESCE((r->>'closed_at')::timestamptz, now()),
      reopened_at = NULL,
      source_event_hash = COALESCE(NULLIF(r->>'close_hash', ''), ''),
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
  'H-2: apply all Close Week freezes in one transaction so a mid-loop throw cannot leave a half-closed week.';
