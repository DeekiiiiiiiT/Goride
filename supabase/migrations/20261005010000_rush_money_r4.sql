-- Carry unpaid weeks forward, net restaurant charges, and refuse a second capture on an order.

ALTER TABLE payments.refunds ADD COLUMN IF NOT EXISTS fault text;

ALTER TABLE rush_money.lines
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();

UPDATE rush_money.lines SET id = gen_random_uuid() WHERE id IS NULL;

ALTER TABLE rush_money.lines
  ALTER COLUMN id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS rush_money_lines_id_uidx ON rush_money.lines (id);

DROP FUNCTION IF EXISTS public.rush_week_payable(text, date, date);
DROP FUNCTION IF EXISTS rush_money.week_payable(text, date, date) CASCADE;

CREATE FUNCTION rush_money.week_payable(p_kind text, p_start date, p_end date)
RETURNS TABLE(party_id uuid, amount_minor bigint, line_ids uuid[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = rush_money, public
AS $$
  WITH unlocked AS (
    SELECT a.party_id, a.kind, l.id AS line_id, l.amount_minor
    FROM rush_money.lines l
    JOIN rush_money.journals j ON j.id = l.journal_id
    JOIN rush_money.accounts a ON a.id = l.account_id
    WHERE a.party_id IS NOT NULL
      AND l.payout_batch_id IS NULL
      AND j.event_type IS DISTINCT FROM 'payout_in_flight'
      AND j.created_at < (p_end + 1)::timestamptz
      AND (
        a.kind = p_kind
        OR (p_kind = 'merchant_payable' AND a.kind = 'merchant_receivable')
      )
  )
  SELECT party_id,
    (-SUM(amount_minor))::bigint AS amount_minor,
    array_agg(line_id) AS line_ids
  FROM unlocked
  GROUP BY party_id
  HAVING SUM(amount_minor) < 0;
$$;

CREATE FUNCTION public.rush_week_payable(p_kind text, p_start date, p_end date)
RETURNS TABLE(party_id uuid, amount_minor bigint, line_ids uuid[])
LANGUAGE sql
SECURITY DEFINER
SET search_path = rush_money, public
AS $$
  SELECT * FROM rush_money.week_payable(p_kind, p_start, p_end);
$$;

REVOKE ALL ON FUNCTION public.rush_week_payable(text, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rush_week_payable(text, date, date) TO service_role;

CREATE OR REPLACE FUNCTION rush_money.lock_lines(p_batch_id uuid, p_line_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rush_money, public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE rush_money.lines
  SET payout_batch_id = p_batch_id
  WHERE id = ANY(p_line_ids)
    AND payout_batch_id IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.rush_lock_lines(p_batch_id uuid, p_line_ids uuid[])
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = rush_money, public
AS $$
  SELECT rush_money.lock_lines(p_batch_id, p_line_ids);
$$;

REVOKE ALL ON FUNCTION public.rush_lock_lines(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rush_lock_lines(uuid, uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION rush_money.lock_week(p_batch_id uuid, p_kind text, p_start date, p_end date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rush_money, public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE rush_money.lines l
  SET payout_batch_id = p_batch_id
  FROM rush_money.journals j, rush_money.accounts a
  WHERE l.journal_id = j.id
    AND l.account_id = a.id
    AND l.payout_batch_id IS NULL
    AND a.party_id IS NOT NULL
    AND j.event_type IS DISTINCT FROM 'payout_in_flight'
    AND j.created_at < (p_end + 1)::timestamptz
    AND (
      a.kind = p_kind
      OR (p_kind = 'merchant_payable' AND a.kind = 'merchant_receivable')
    )
    AND a.party_id IN (
      SELECT party_id FROM rush_money.week_payable(p_kind, p_start, p_end)
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

CREATE OR REPLACE FUNCTION payments.refuse_second_capture()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_prior uuid;
BEGIN
  IF NEW.status IS DISTINCT FROM 'completed' OR NEW.order_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT id INTO v_prior
  FROM payments.transactions
  WHERE order_id = NEW.order_id
    AND status = 'completed'
    AND intent_id IS DISTINCT FROM NEW.intent_id
  LIMIT 1;
  IF v_prior IS NULL THEN
    RETURN NEW;
  END IF;
  NEW.status := 'duplicate_superseded';
  NEW.failure_reason := 'second_capture';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payments_refuse_second_capture ON payments.transactions;
CREATE TRIGGER payments_refuse_second_capture
  BEFORE INSERT ON payments.transactions
  FOR EACH ROW EXECUTE FUNCTION payments.refuse_second_capture();

CREATE OR REPLACE FUNCTION payments.refund_superseded_capture()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'duplicate_superseded' AND NEW.failure_reason = 'second_capture' THEN
    INSERT INTO payments.refunds (transaction_id, order_id, amount, currency, reason, status, idempotency_key)
    SELECT NEW.id, NEW.order_id, NEW.amount, 'JMD', 'Duplicate capture refund', 'pending', 'dup-capture:' || NEW.id::text
    WHERE NOT EXISTS (
      SELECT 1 FROM payments.refunds r WHERE r.idempotency_key = 'dup-capture:' || NEW.id::text
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payments_refund_superseded_capture ON payments.transactions;
CREATE TRIGGER payments_refund_superseded_capture
  AFTER INSERT ON payments.transactions
  FOR EACH ROW EXECUTE FUNCTION payments.refund_superseded_capture();

-- Refund drain and morning books were scheduled with empty app.settings, so the job never reached the app.
CREATE OR REPLACE FUNCTION private.invoke_rush_delivery(p_path text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'net', 'private'
AS $$
DECLARE
  secret text;
  req_id bigint;
BEGIN
  SELECT value INTO secret FROM private.fleet_ops_secrets WHERE name = 'fleet_cron_secret';
  IF secret IS NULL OR length(secret) < 8 THEN
    RAISE EXCEPTION 'fleet_cron_secret missing';
  END IF;
  IF p_path IS NULL OR left(p_path, 1) <> '/' THEN
    RAISE EXCEPTION 'rush path must start with /';
  END IF;
  SELECT net.http_post(
    url := 'https://csfllzzastacofsvcdsc.supabase.co/functions/v1/delivery' || p_path,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Fleet-Cron-Secret', secret
    ),
    body := '{}'::jsonb
  ) INTO req_id;
  RETURN req_id;
END;
$$;

REVOKE ALL ON FUNCTION private.invoke_rush_delivery(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.invoke_rush_delivery(text) TO postgres;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN PERFORM cron.unschedule('rush-pending-refunds'); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN PERFORM cron.unschedule('rush-money-recon'); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN PERFORM cron.unschedule('rush-money-scores'); EXCEPTION WHEN OTHERS THEN NULL; END;
    PERFORM cron.schedule('rush-pending-refunds', '*/15 * * * *', $job$SELECT private.invoke_rush_delivery('/internal/disputes/process-pending-refunds');$job$);
    PERFORM cron.schedule('rush-money-recon', '30 6 * * *', $job$SELECT private.invoke_rush_delivery('/internal/rush-money/recon');$job$);
    PERFORM cron.schedule('rush-money-scores', '45 6 * * *', $job$SELECT private.invoke_rush_delivery('/internal/rush-money/scores');$job$);
  END IF;
END;
$cron$;
