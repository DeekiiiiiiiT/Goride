-- Lock payout lines, not whole journals, so a restaurant batch cannot hide courier pay.
-- A restaurant that owes Roam keeps that debt for the next week.
-- The person who prepares a batch cannot be one of the approvers.

ALTER TABLE rush_money.lines
  ADD COLUMN IF NOT EXISTS payout_batch_id uuid;

CREATE OR REPLACE FUNCTION rush_money.reject_line_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.journal_id = OLD.journal_id
     AND NEW.account_id = OLD.account_id
     AND NEW.amount_minor = OLD.amount_minor
     AND NEW.payout_batch_id IS DISTINCT FROM OLD.payout_batch_id
     AND OLD.payout_batch_id IS NULL THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'rush_money_append_only';
END;
$$;

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
    AND l.payout_batch_id IS NULL
    AND j.event_type IS DISTINCT FROM 'payout_in_flight'
    AND j.created_at >= p_start::timestamptz
    AND j.created_at < (p_end + 1)::timestamptz
  GROUP BY a.party_id
  HAVING SUM(l.amount_minor) < 0;
$$;

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
    AND a.kind = p_kind
    AND a.party_id IS NOT NULL
    AND j.event_type IS DISTINCT FROM 'payout_in_flight'
    AND j.created_at >= p_start::timestamptz
    AND j.created_at < (p_end + 1)::timestamptz
    AND a.party_id IN (
      SELECT party_id FROM rush_money.week_payable(p_kind, p_start, p_end)
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION rush_money.enforce_two_person_payout()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_approvers int;
BEGIN
  IF NEW.status IN ('approved', 'exported', 'paid') THEN
    SELECT count(DISTINCT actor_id) INTO v_approvers
    FROM rush_money.payout_approvals
    WHERE batch_id = NEW.id
      AND actor_id IS DISTINCT FROM NEW.created_by;
    IF v_approvers < 2 THEN
      RAISE EXCEPTION 'payout_two_person_required';
    END IF;
    IF NEW.created_by IS NOT NULL AND EXISTS (
      SELECT 1 FROM rush_money.payout_approvals
      WHERE batch_id = NEW.id AND actor_id = NEW.created_by
    ) THEN
      RAISE EXCEPTION 'payout_preparer_cannot_approve';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    BEGIN
      PERFORM cron.unschedule('rush-money-recon');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    PERFORM cron.schedule(
      'rush-money-scores',
      '45 6 * * *',
      $job$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url', true) || '/functions/v1/delivery/internal/rush-money/scores',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.cron_secret', true)
        ),
        body := '{}'::jsonb
      );
      $job$
    );
    PERFORM cron.schedule(
      'rush-money-recon',
      '30 6 * * *',
      $job$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url', true) || '/functions/v1/delivery/internal/rush-money/recon',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.cron_secret', true)
        ),
        body := '{}'::jsonb
      );
      $job$
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron not available; schedule rush money recon manually.';
END;
$cron$;
