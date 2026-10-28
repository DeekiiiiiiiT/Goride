-- Ops backstop: auto-complete abandoned awaiting_cash_settlement rides after 7 days.
-- Secondary to mandatory driver UX; normal drivers should never hit this timeout.

CREATE OR REPLACE FUNCTION rides._ensure_payment_account(
  p_user_id UUID,
  p_role TEXT,
  p_account_key TEXT,
  p_currency TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rides, public
AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id
  FROM rides.payment_accounts
  WHERE account_key = p_account_key AND currency = p_currency;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO rides.payment_accounts (user_id, role, account_key, currency, balance_minor)
  VALUES (p_user_id, p_role, p_account_key, p_currency, 0)
  ON CONFLICT (account_key, currency) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id
    FROM rides.payment_accounts
    WHERE account_key = p_account_key AND currency = p_currency;
  END IF;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rides_run_cash_settlement_timeout(p_now TIMESTAMPTZ DEFAULT NOW())
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rides, public
AS $$
DECLARE
  v_ride RECORD;
  v_settled INTEGER := 0;
  v_rider_acct UUID;
  v_receivable_acct UUID;
  v_owed BIGINT;
  v_currency TEXT;
  v_idempotency TEXT;
  v_inserted INTEGER;
BEGIN
  FOR v_ride IN
    SELECT *
    FROM rides.ride_requests
    WHERE status = 'awaiting_cash_settlement'
      AND fare_locked_at IS NOT NULL
      AND fare_locked_at < p_now - INTERVAL '7 days'
      AND fare_final_minor IS NOT NULL
    FOR UPDATE SKIP LOCKED
  LOOP
    v_currency := COALESCE(v_ride.currency, 'JMD');
    v_owed := GREATEST(0, COALESCE(v_ride.fare_final_minor, 0));
    v_idempotency := 'timeout:' || v_ride.id::TEXT;

    IF v_owed > 0 AND v_ride.rider_user_id IS NOT NULL THEN
      v_rider_acct := rides._ensure_payment_account(
        v_ride.rider_user_id,
        'rider',
        'user:' || v_ride.rider_user_id::TEXT || ':rider',
        v_currency
      );
      v_receivable_acct := rides._ensure_payment_account(
        NULL,
        'system',
        'platform:receivable',
        v_currency
      );

      INSERT INTO rides.payment_journal_entries (
        ride_request_id,
        idempotency_key,
        entry_type,
        debit_account_id,
        credit_account_id,
        amount_minor,
        currency,
        request_hash,
        metadata,
        created_by_user_id
      )
      VALUES (
        v_ride.id,
        v_idempotency,
        'cash_trip_arrears',
        v_rider_acct,
        v_receivable_acct,
        v_owed,
        v_currency,
        'timeout_unpaid',
        jsonb_build_object(
          'outcome', 'unpaid',
          'owed_minor', v_owed,
          'cash_received_minor', 0,
          'auto_timeout', true
        ),
        NULL
      )
      ON CONFLICT (ride_request_id, idempotency_key) DO NOTHING;

      GET DIAGNOSTICS v_inserted = ROW_COUNT;
      IF v_inserted > 0 THEN
        UPDATE rides.payment_accounts
        SET balance_minor = balance_minor - v_owed
        WHERE id = v_rider_acct;

        UPDATE rides.payment_accounts
        SET balance_minor = balance_minor + v_owed
        WHERE id = v_receivable_acct;
      END IF;
    END IF;

    UPDATE rides.ride_requests
    SET
      status = 'completed',
      cash_received_minor = 0,
      cash_settlement_status = 'settled',
      cash_settlement_outcome = 'unpaid',
      settled_at = p_now,
      completed_at = p_now,
      updated_at = p_now
    WHERE id = v_ride.id;

    INSERT INTO rides.audit_events (ride_request_id, actor_user_id, event_type, payload)
    VALUES (
      v_ride.id,
      NULL,
      'cash_settlement_auto_unpaid',
      jsonb_build_object(
        'owed_minor', v_owed,
        'cash_received_minor', 0,
        'outcome', 'unpaid',
        'fare_locked_at', v_ride.fare_locked_at
      )
    );

    v_settled := v_settled + 1;
  END LOOP;

  RETURN jsonb_build_object('settled', v_settled, 'ran_at', p_now);
END;
$$;

REVOKE ALL ON FUNCTION rides._ensure_payment_account(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rides._ensure_payment_account(UUID, TEXT, TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.rides_run_cash_settlement_timeout(TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rides_run_cash_settlement_timeout(TIMESTAMPTZ) TO service_role;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('rides-cash-settlement-timeout');

    PERFORM cron.schedule(
      'rides-cash-settlement-timeout',
      '0 4 * * *',
      $$SELECT public.rides_run_cash_settlement_timeout();$$
    );
  END IF;
EXCEPTION
  WHEN undefined_table OR undefined_object OR insufficient_privilege THEN
    RAISE NOTICE 'pg_cron not available; schedule rides_run_cash_settlement_timeout manually.';
  WHEN OTHERS THEN
    RAISE NOTICE 'rides-cash-settlement-timeout cron schedule skipped: %', SQLERRM;
END;
$cron$;

NOTIFY pgrst, 'reload schema';
