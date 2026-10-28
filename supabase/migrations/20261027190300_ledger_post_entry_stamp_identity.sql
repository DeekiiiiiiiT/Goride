-- Phase 1 continued: stamp driver_id / platform / batch_id inside ledger.post_entry.
-- Money logic, idempotency, and double-entry rules unchanged.

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
SET search_path = ledger, fleet, public, pg_catalog
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
  v_meta JSONB := COALESCE(p_metadata, '{}'::jsonb);
  v_driver_id UUID;
  v_platform TEXT;
  v_batch_id TEXT;
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

  v_driver_id := COALESCE(
    ledger.resolve_canonical_driver_id(NULLIF(v_meta->>'driverId', '')),
    ledger.resolve_canonical_driver_id(ledger.extract_driver_token_from_account_key(p_credit_account_key)),
    ledger.resolve_canonical_driver_id(ledger.extract_driver_token_from_account_key(p_debit_account_key))
  );
  v_platform := NULLIF(btrim(COALESCE(v_meta->>'platform', '')), '');
  v_batch_id := NULLIF(btrim(COALESCE(v_meta->>'batchId', '')), '');

  INSERT INTO ledger.entries (
    organization_id, idempotency_key, entry_type, product,
    debit_account_id, credit_account_id, amount_minor, currency, request_hash,
    effective_at, reference_type, reference_id, metadata, created_by_user_id,
    driver_id, platform, batch_id
  )
  VALUES (
    v_org_id, p_idempotency_key, p_entry_type, p_product,
    v_debit_id, v_credit_id, p_amount_minor, p_currency, p_request_hash,
    COALESCE(p_effective_at, now()), p_reference_type, p_reference_id,
    v_meta, p_created_by_user_id,
    v_driver_id, v_platform, v_batch_id
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
        NULL;
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
