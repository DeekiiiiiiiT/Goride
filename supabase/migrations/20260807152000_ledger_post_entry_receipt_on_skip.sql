-- On idempotent skip, still try to attach source_receipt for a new source_id.
-- If source_idempotency_key already receipted, treat as logical duplicate (no second receipt).
CREATE OR REPLACE FUNCTION ledger.post_entry(
  p_idempotency_key TEXT,
  p_entry_type TEXT,
  p_debit_account_key TEXT,
  p_credit_account_key TEXT,
  p_amount_minor BIGINT,
  p_currency TEXT,
  p_request_hash TEXT DEFAULT NULL,
  p_organization_id UUID DEFAULT NULL,
  p_product TEXT DEFAULT 'platform',
  p_effective_at TIMESTAMPTZ DEFAULT now(),
  p_reference_type TEXT DEFAULT NULL,
  p_reference_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_created_by_user_id UUID DEFAULT NULL,
  p_source_system TEXT DEFAULT NULL,
  p_source_id TEXT DEFAULT NULL,
  p_source_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ledger, public
AS $$
DECLARE
  v_debit_id UUID;
  v_credit_id UUID;
  v_first_id UUID;
  v_second_id UUID;
  v_inserted INTEGER;
  v_existing_hash TEXT;
  v_entry_id UUID;
  v_org_id UUID;
BEGIN
  IF p_amount_minor IS NULL OR p_amount_minor <= 0 THEN
    RAISE EXCEPTION 'invalid_amount_minor';
  END IF;

  v_debit_id := ledger._resolve_account_id(p_debit_account_key, p_currency);
  v_credit_id := ledger._resolve_account_id(p_credit_account_key, p_currency);

  IF v_debit_id < v_credit_id THEN
    v_first_id := v_debit_id;
    v_second_id := v_credit_id;
  ELSE
    v_first_id := v_credit_id;
    v_second_id := v_debit_id;
  END IF;

  PERFORM id FROM ledger.accounts WHERE id = v_first_id FOR UPDATE;
  PERFORM id FROM ledger.accounts WHERE id = v_second_id FOR UPDATE;

  SELECT organization_id INTO v_org_id FROM ledger.accounts WHERE id = v_debit_id;
  v_org_id := COALESCE(p_organization_id, v_org_id);

  INSERT INTO ledger.entries (
    organization_id, idempotency_key, entry_type, product,
    debit_account_id, credit_account_id, amount_minor, currency, request_hash,
    effective_at, reference_type, reference_id, metadata, created_by_user_id
  )
  VALUES (
    v_org_id, p_idempotency_key, p_entry_type, p_product,
    v_debit_id, v_credit_id, p_amount_minor, p_currency, p_request_hash,
    COALESCE(p_effective_at, now()), p_reference_type, p_reference_id,
    COALESCE(p_metadata, '{}'::jsonb), p_created_by_user_id
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_entry_id;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 0 THEN
    SELECT id, request_hash INTO v_entry_id, v_existing_hash
    FROM ledger.entries WHERE idempotency_key = p_idempotency_key;

    IF v_existing_hash IS NOT NULL AND p_request_hash IS NOT NULL
       AND v_existing_hash IS DISTINCT FROM p_request_hash THEN
      RETURN jsonb_build_object('inserted', false, 'skipped', false, 'conflict', true, 'entry_id', NULL);
    END IF;

    IF p_source_system IS NOT NULL AND p_source_id IS NOT NULL AND v_entry_id IS NOT NULL THEN
      BEGIN
        INSERT INTO ledger.source_receipts (
          ledger_entry_id, source_system, source_id, source_idempotency_key
        )
        VALUES (v_entry_id, p_source_system, p_source_id, p_source_idempotency_key)
        ON CONFLICT (source_system, source_id) DO NOTHING;
      EXCEPTION WHEN unique_violation THEN
        NULL; -- logical duplicate already receipted via source_idempotency_key
      END;
    END IF;

    RETURN jsonb_build_object(
      'inserted', false, 'skipped', true, 'conflict', false, 'entry_id', v_entry_id
    );
  END IF;

  UPDATE ledger.accounts SET balance_minor = balance_minor - p_amount_minor WHERE id = v_debit_id;
  UPDATE ledger.accounts SET balance_minor = balance_minor + p_amount_minor WHERE id = v_credit_id;

  IF p_source_system IS NOT NULL AND p_source_id IS NOT NULL THEN
    INSERT INTO ledger.source_receipts (
      ledger_entry_id, source_system, source_id, source_idempotency_key
    )
    VALUES (v_entry_id, p_source_system, p_source_id, p_source_idempotency_key)
    ON CONFLICT (source_system, source_id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'inserted', true, 'skipped', false, 'conflict', false, 'entry_id', v_entry_id
  );
END;
$$;
