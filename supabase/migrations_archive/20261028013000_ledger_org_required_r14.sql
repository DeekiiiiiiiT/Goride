-- R14: every ledger entry must carry organization_id.
-- 1) post_entry rejects null org
-- 2) backfill sole fleet org on legacy null rows (trigger refreshes week_totals)
-- 3) NOT NULL on ledger.entries.organization_id
-- 4) recon_check also reports global count/sum drift vs week_totals

-- ---------------------------------------------------------------------------
-- 1) ledger.post_entry — require p_organization_id
-- ---------------------------------------------------------------------------
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

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id required for ledger.post_entry';
  END IF;
  v_org_id := p_organization_id;

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

-- ---------------------------------------------------------------------------
-- 2) Backfill null-org rows → sole fleet org (trigger maintains week_totals)
-- ---------------------------------------------------------------------------
UPDATE ledger.entries
SET organization_id = '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823'::uuid
WHERE organization_id IS NULL;

-- ---------------------------------------------------------------------------
-- 3) Enforce NOT NULL
-- ---------------------------------------------------------------------------
ALTER TABLE ledger.entries
  ALTER COLUMN organization_id SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 4) recon_check: keep per-grain drift + add global count/sum vs week_totals
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ledger.recon_check(p_org uuid)
RETURNS TABLE (
  week_start date,
  driver_id uuid,
  product text,
  entry_type text,
  platform text,
  direction text,
  totals_sum_minor bigint,
  live_sum_minor bigint,
  totals_count bigint,
  live_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ledger, public, pg_catalog
AS $fn$
  WITH live AS (
    SELECT
      e.organization_id,
      ledger.jamaica_week_start(e.effective_at) AS week_start,
      ledger.driver_grain_id(e.driver_id) AS driver_id,
      e.product,
      e.entry_type,
      coalesce(e.platform, '') AS platform,
      ledger.entry_direction(e.metadata, da.account_key, ca.account_key) AS direction,
      sum(ledger._entry_signed_minor(e.metadata, e.amount_minor))::bigint AS live_sum_minor,
      count(*)::bigint AS live_count
    FROM ledger.entries e
    JOIN ledger.accounts da ON da.id = e.debit_account_id
    JOIN ledger.accounts ca ON ca.id = e.credit_account_id
    WHERE e.organization_id = p_org
    GROUP BY 1, 2, 3, 4, 5, 6, 7
  ),
  totals AS (
    SELECT *
    FROM ledger.week_totals t
    WHERE t.organization_id = p_org
  ),
  grain_drift AS (
    SELECT
      coalesce(t.week_start, l.week_start) AS week_start,
      nullif(coalesce(t.driver_id, l.driver_id), '00000000-0000-0000-0000-000000000000'::uuid) AS driver_id,
      coalesce(t.product, l.product) AS product,
      coalesce(t.entry_type, l.entry_type) AS entry_type,
      coalesce(t.platform, l.platform) AS platform,
      coalesce(t.direction, l.direction) AS direction,
      coalesce(t.sum_minor, 0)::bigint AS totals_sum_minor,
      coalesce(l.live_sum_minor, 0)::bigint AS live_sum_minor,
      coalesce(t.entry_count, 0)::bigint AS totals_count,
      coalesce(l.live_count, 0)::bigint AS live_count
    FROM totals t
    FULL OUTER JOIN live l
      ON t.organization_id = l.organization_id
     AND t.week_start = l.week_start
     AND t.driver_id = l.driver_id
     AND t.product = l.product
     AND t.entry_type = l.entry_type
     AND t.platform = l.platform
     AND t.direction = l.direction
    WHERE coalesce(t.sum_minor, 0) IS DISTINCT FROM coalesce(l.live_sum_minor, 0)
       OR coalesce(t.entry_count, 0) IS DISTINCT FROM coalesce(l.live_count, 0)
  ),
  global_live AS (
    SELECT
      count(*)::bigint AS live_count,
      coalesce(sum(ledger._entry_signed_minor(e.metadata, e.amount_minor)), 0)::bigint AS live_sum
    FROM ledger.entries e
  ),
  global_totals AS (
    SELECT
      coalesce(sum(entry_count), 0)::bigint AS totals_count,
      coalesce(sum(sum_minor), 0)::bigint AS totals_sum
    FROM ledger.week_totals
  ),
  global_drift AS (
    SELECT
      DATE '1970-01-01' AS week_start,
      NULL::uuid AS driver_id,
      'integrity'::text AS product,
      'global'::text AS entry_type,
      ''::text AS platform,
      ''::text AS direction,
      g.totals_sum AS totals_sum_minor,
      l.live_sum AS live_sum_minor,
      g.totals_count,
      l.live_count
    FROM global_live l
    CROSS JOIN global_totals g
    WHERE g.totals_count IS DISTINCT FROM l.live_count
       OR g.totals_sum IS DISTINCT FROM l.live_sum
  )
  SELECT * FROM grain_drift
  UNION ALL
  SELECT * FROM global_drift;
$fn$;

CREATE OR REPLACE FUNCTION public.ledger_recon_check(p_org uuid)
RETURNS TABLE (
  week_start date,
  driver_id uuid,
  product text,
  entry_type text,
  platform text,
  direction text,
  totals_sum_minor bigint,
  live_sum_minor bigint,
  totals_count bigint,
  live_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ledger, public, pg_catalog
AS $fn$
  SELECT * FROM ledger.recon_check(p_org);
$fn$;

REVOKE ALL ON FUNCTION ledger.recon_check(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ledger.recon_check(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.ledger_recon_check(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ledger_recon_check(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
