-- One week of unpaid earnings, then lock those journals so the next batch cannot pay them again.
-- Also write a capture journal for every completed card charge that never had one.

CREATE OR REPLACE FUNCTION rush_money.week_payable(p_kind text, p_start date, p_end date)
RETURNS TABLE(party_id uuid, amount_minor bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = rush_money, public
AS $$
  SELECT a.party_id, (-SUM(l.amount_minor))::bigint AS amount_minor
  FROM rush_money.lines l
  JOIN rush_money.journals j ON j.id = l.journal_id
  JOIN rush_money.accounts a ON a.id = l.account_id
  WHERE a.kind = p_kind
    AND a.party_id IS NOT NULL
    AND j.period_id IS NULL
    AND j.event_type IS DISTINCT FROM 'payout_in_flight'
    AND j.created_at >= p_start::timestamptz
    AND j.created_at < (p_end + 1)::timestamptz
  GROUP BY a.party_id
  HAVING SUM(l.amount_minor) < 0;
$$;

CREATE OR REPLACE FUNCTION public.rush_week_payable(p_kind text, p_start date, p_end date)
RETURNS TABLE(party_id uuid, amount_minor bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = rush_money, public
AS $$
  SELECT * FROM rush_money.week_payable(p_kind, p_start, p_end);
$$;

REVOKE ALL ON FUNCTION public.rush_week_payable(text, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rush_week_payable(text, date, date) TO service_role;

CREATE OR REPLACE FUNCTION rush_money.lock_week(p_batch_id uuid, p_kind text, p_start date, p_end date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rush_money, public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE rush_money.journals j
  SET period_id = p_batch_id
  WHERE j.period_id IS NULL
    AND j.created_at >= p_start::timestamptz
    AND j.created_at < (p_end + 1)::timestamptz
    AND (
      j.event_type = 'payout_in_flight' AND j.correlation_id = p_batch_id
      OR EXISTS (
        SELECT 1
        FROM rush_money.lines l
        JOIN rush_money.accounts a ON a.id = l.account_id
        WHERE l.journal_id = j.id
          AND a.kind = p_kind
          AND j.event_type IS DISTINCT FROM 'payout_in_flight'
      )
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.rush_lock_week(p_batch_id uuid, p_kind text, p_start date, p_end date)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = rush_money, public
AS $$
  SELECT rush_money.lock_week(p_batch_id, p_kind, p_start, p_end);
$$;

REVOKE ALL ON FUNCTION public.rush_lock_week(uuid, text, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rush_lock_week(uuid, text, date, date) TO service_role;

DO $$
DECLARE
  r record;
  minor bigint;
BEGIN
  FOR r IN
    SELECT t.id, t.order_id, t.amount
    FROM payments.transactions t
    WHERE t.status = 'completed'
      AND t.order_id IS NOT NULL
      AND COALESCE(t.amount, 0) > 0
      AND NOT EXISTS (
        SELECT 1 FROM rush_money.journals j
        WHERE j.idempotency_key = 'capture:' || t.id::text
      )
  LOOP
    minor := ROUND(r.amount * 100);
    IF minor > 0 THEN
      PERFORM rush_money.post_journal(
        'capture:' || r.id::text,
        'capture',
        r.order_id,
        r.id,
        jsonb_build_array(
          jsonb_build_object('kind', 'gateway_clearing', 'party_type', 'platform', 'party_id', NULL, 'component', 'wipay', 'amount_minor', minor),
          jsonb_build_object('kind', 'order_clearing', 'party_type', 'order', 'party_id', r.order_id, 'component', 'holding', 'amount_minor', -minor)
        ),
        NULL,
        'system',
        'Backfill capture',
        '{}'::jsonb,
        NULL
      );
    END IF;
  END LOOP;
END $$;
