-- Phase 4 (ADR 0002 B1): atomic per-line payment journal posting via Postgres RPC.

CREATE OR REPLACE FUNCTION rides._resolve_payment_account_id(
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
  v_user_id UUID;
BEGIN
  IF p_account_key IN ('platform:receivable', 'platform:clearing') THEN
    RETURN rides._ensure_payment_account(NULL, 'system', p_account_key, p_currency);
  END IF;

  IF p_account_key ~ '^user:[0-9a-fA-F-]{36}:driver:(digital|cash|debt)$' THEN
    v_user_id := (regexp_match(p_account_key, '^user:([0-9a-fA-F-]{36}):driver:'))[1]::UUID;
    RETURN rides._ensure_payment_account(v_user_id, 'driver', p_account_key, p_currency);
  END IF;

  IF p_account_key ~ '^user:[0-9a-fA-F-]{36}:rider$' THEN
    v_user_id := (regexp_match(p_account_key, '^user:([0-9a-fA-F-]{36}):rider$'))[1]::UUID;
    RETURN rides._ensure_payment_account(v_user_id, 'rider', p_account_key, p_currency);
  END IF;

  IF p_account_key ~ '^user:[0-9a-fA-F-]{36}:driver$' THEN
    v_user_id := (regexp_match(p_account_key, '^user:([0-9a-fA-F-]{36}):driver$'))[1]::UUID;
    RETURN rides._ensure_payment_account(v_user_id, 'driver', p_account_key, p_currency);
  END IF;

  SELECT id INTO v_id
  FROM rides.payment_accounts
  WHERE account_key = p_account_key
    AND currency = p_currency;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'account_not_found:%', p_account_key;
  END IF;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION rides.post_payment_journal_line(
  p_ride_request_id UUID,
  p_idempotency_key TEXT,
  p_entry_type TEXT,
  p_debit_account_key TEXT,
  p_credit_account_key TEXT,
  p_amount_minor BIGINT,
  p_currency TEXT,
  p_request_hash TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_created_by_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rides, public
AS $$
DECLARE
  v_debit_id UUID;
  v_credit_id UUID;
  v_first_id UUID;
  v_second_id UUID;
  v_inserted INTEGER;
  v_existing_hash TEXT;
BEGIN
  IF p_amount_minor IS NULL OR p_amount_minor <= 0 THEN
    RAISE EXCEPTION 'invalid_amount_minor';
  END IF;

  v_debit_id := rides._resolve_payment_account_id(p_debit_account_key, p_currency);
  v_credit_id := rides._resolve_payment_account_id(p_credit_account_key, p_currency);

  IF v_debit_id < v_credit_id THEN
    v_first_id := v_debit_id;
    v_second_id := v_credit_id;
  ELSE
    v_first_id := v_credit_id;
    v_second_id := v_debit_id;
  END IF;

  PERFORM id
  FROM rides.payment_accounts
  WHERE id = v_first_id
  FOR UPDATE;

  PERFORM id
  FROM rides.payment_accounts
  WHERE id = v_second_id
  FOR UPDATE;

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
    p_ride_request_id,
    p_idempotency_key,
    p_entry_type,
    v_debit_id,
    v_credit_id,
    p_amount_minor,
    p_currency,
    p_request_hash,
    COALESCE(p_metadata, '{}'::jsonb),
    p_created_by_user_id
  )
  ON CONFLICT (ride_request_id, idempotency_key) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 0 THEN
    SELECT request_hash INTO v_existing_hash
    FROM rides.payment_journal_entries
    WHERE ride_request_id IS NOT DISTINCT FROM p_ride_request_id
      AND idempotency_key = p_idempotency_key;

    IF v_existing_hash IS NOT NULL AND v_existing_hash IS DISTINCT FROM p_request_hash THEN
      RETURN jsonb_build_object('inserted', false, 'skipped', false, 'conflict', true);
    END IF;

    RETURN jsonb_build_object('inserted', false, 'skipped', true, 'conflict', false);
  END IF;

  UPDATE rides.payment_accounts
  SET balance_minor = balance_minor - p_amount_minor
  WHERE id = v_debit_id;

  UPDATE rides.payment_accounts
  SET balance_minor = balance_minor + p_amount_minor
  WHERE id = v_credit_id;

  RETURN jsonb_build_object('inserted', true, 'skipped', false, 'conflict', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.rides_post_payment_journal_line(
  p_ride_request_id UUID,
  p_idempotency_key TEXT,
  p_entry_type TEXT,
  p_debit_account_key TEXT,
  p_credit_account_key TEXT,
  p_amount_minor BIGINT,
  p_currency TEXT,
  p_request_hash TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_created_by_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = rides, public
AS $$
  SELECT rides.post_payment_journal_line(
    p_ride_request_id,
    p_idempotency_key,
    p_entry_type,
    p_debit_account_key,
    p_credit_account_key,
    p_amount_minor,
    p_currency,
    p_request_hash,
    p_metadata,
    p_created_by_user_id
  );
$$;

REVOKE ALL ON FUNCTION rides._resolve_payment_account_id(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rides._resolve_payment_account_id(TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION rides.post_payment_journal_line(
  UUID, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, JSONB, UUID
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rides.post_payment_journal_line(
  UUID, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, JSONB, UUID
) TO service_role;

REVOKE ALL ON FUNCTION public.rides_post_payment_journal_line(
  UUID, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, JSONB, UUID
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rides_post_payment_journal_line(
  UUID, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, JSONB, UUID
) TO service_role;

NOTIFY pgrst, 'reload schema';
