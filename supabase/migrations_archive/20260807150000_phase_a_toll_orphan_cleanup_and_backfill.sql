-- Phase A: remove bogus toll dual-writes (debit=credit platform:clearing, no KV SSOT)
-- and add idempotent backfill RPCs for kv_ledger_event + rides_payment_journal.

-- 1) Orphan toll receipts/entries (net balance already 0 because debit=credit)
DELETE FROM ledger.entries
WHERE id IN (
  '28d28a2c-1115-4aaa-b0f3-ce3343af8065',
  '29f3d2bd-65c4-4db0-bf5e-55e00e1d226a'
);

-- 2) Batch backfill: money KV ledger_event misses → unified
CREATE OR REPLACE FUNCTION public.ledger_backfill_kv_ledger_event_batch(
  p_limit integer DEFAULT 200
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, ledger
AS $$
DECLARE
  r record;
  v_processed int := 0;
  v_inserted int := 0;
  v_skipped int := 0;
  v_failed int := 0;
  v_errors jsonb := '[]'::jsonb;
  v_driver_id text;
  v_org_id text;
  v_idem text;
  v_event_id text;
  v_direction text;
  v_net numeric;
  v_amount_minor bigint;
  v_currency text;
  v_date text;
  v_event_type text;
  v_source_type text;
  v_source_ref text;
  v_driver_key text;
  v_product text;
  v_debit text;
  v_credit text;
  v_inflow boolean;
  v_result jsonb;
  v_uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
BEGIN
  IF p_limit IS NULL OR p_limit < 1 THEN
    p_limit := 200;
  END IF;
  IF p_limit > 500 THEN
    p_limit := 500;
  END IF;

  FOR r IN
    SELECT k.key, k.value
    FROM public.kv_store_37f42386 k
    WHERE k.key LIKE 'ledger_event:%'
      AND coalesce(k.value->>'direction', '') <> 'neutral'
      AND coalesce(
            nullif(k.value->>'netAmount', '')::numeric,
            nullif(k.value->>'amount', '')::numeric,
            0
          ) <> 0
      AND NOT EXISTS (
        SELECT 1
        FROM ledger.source_receipts sr
        WHERE sr.source_system = 'kv_ledger_event'
          AND sr.source_id = coalesce(k.value->>'id', split_part(k.key, ':', 2))
      )
    ORDER BY k.key
    LIMIT p_limit
  LOOP
    v_processed := v_processed + 1;
    BEGIN
      v_event_id := coalesce(r.value->>'id', split_part(r.key, ':', 2));
      v_idem := nullif(r.value->>'idempotencyKey', '');
      IF v_idem IS NULL THEN
        v_idem := v_event_id;
      END IF;
      v_direction := coalesce(r.value->>'direction', '');
      v_net := coalesce(
        nullif(r.value->>'netAmount', '')::numeric,
        nullif(r.value->>'amount', '')::numeric,
        0
      );
      v_amount_minor := round(abs(v_net) * 100)::bigint;
      IF v_amount_minor <= 0 THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      v_currency := coalesce(nullif(r.value->>'currency', ''), 'JMD');
      v_date := nullif(r.value->>'date', '');
      v_event_type := coalesce(nullif(r.value->>'eventType', ''), 'unknown');
      v_source_type := coalesce(nullif(r.value->>'sourceType', ''), 'ledger_event');
      v_source_ref := coalesce(nullif(r.value->>'sourceId', ''), v_event_id);
      v_driver_id := coalesce(r.value->>'driverId', '');
      v_org_id := nullif(r.value->>'organizationId', '');

      IF v_driver_id ~* v_uuid_re THEN
        v_driver_key := 'user:' || v_driver_id || ':driver:digital';
        v_product := 'roam_driver';
      ELSIF v_org_id ~* v_uuid_re THEN
        v_driver_key := 'org:' || v_org_id || ':fleet';
        v_product := 'roam_fleet';
      ELSE
        v_driver_key := 'platform:clearing';
        v_product := 'roam_fleet';
      END IF;

      -- Skip no-op same-account posts
      IF v_driver_key = 'platform:clearing' THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      v_inflow := (v_direction = 'inflow');
      IF v_inflow THEN
        v_debit := 'platform:clearing';
        v_credit := v_driver_key;
      ELSE
        v_debit := v_driver_key;
        v_credit := 'platform:clearing';
      END IF;

      v_result := public.ledger_post_entry(
        'kv_ledger_event:' || v_idem,
        v_event_type,
        v_debit,
        v_credit,
        v_amount_minor,
        v_currency,
        NULL,
        CASE WHEN v_org_id ~* v_uuid_re THEN v_org_id::uuid ELSE NULL END,
        v_product,
        CASE WHEN v_date IS NOT NULL THEN (v_date || 'T12:00:00.000Z')::timestamptz ELSE now() END,
        v_source_type,
        v_source_ref,
        coalesce(r.value->'metadata', '{}'::jsonb),
        NULL,
        'kv_ledger_event',
        v_event_id,
        v_idem
      );

      IF coalesce((v_result->>'inserted')::boolean, false)
         OR coalesce((v_result->>'skipped')::boolean, false) THEN
        IF coalesce((v_result->>'inserted')::boolean, false) THEN
          v_inserted := v_inserted + 1;
        ELSE
          v_skipped := v_skipped + 1;
        END IF;
      ELSE
        v_failed := v_failed + 1;
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'source_id', v_event_id,
          'result', v_result
        ));
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'source_id', coalesce(r.value->>'id', r.key),
        'error', SQLERRM
      ));
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', v_processed,
    'inserted', v_inserted,
    'skipped', v_skipped,
    'failed', v_failed,
    'errors', v_errors
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ledger_backfill_kv_ledger_event_batch(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ledger_backfill_kv_ledger_event_batch(integer) TO service_role;

-- 3) Batch backfill: rides payment journal money rows
CREATE OR REPLACE FUNCTION public.ledger_backfill_rides_payment_journal_batch(
  p_limit integer DEFAULT 200
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, ledger, rides
AS $$
DECLARE
  r record;
  v_processed int := 0;
  v_inserted int := 0;
  v_skipped int := 0;
  v_failed int := 0;
  v_errors jsonb := '[]'::jsonb;
  v_product text;
  v_result jsonb;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 THEN
    p_limit := 200;
  END IF;
  IF p_limit > 500 THEN
    p_limit := 500;
  END IF;

  FOR r IN
    SELECT
      j.id,
      j.ride_request_id,
      j.idempotency_key,
      j.entry_type,
      j.amount_minor,
      j.currency,
      j.request_hash,
      j.metadata,
      j.created_by_user_id,
      j.created_at,
      da.account_key AS debit_key,
      ca.account_key AS credit_key
    FROM rides.payment_journal_entries j
    JOIN rides.payment_accounts da ON da.id = j.debit_account_id
    JOIN rides.payment_accounts ca ON ca.id = j.credit_account_id
    WHERE abs(coalesce(j.amount_minor, 0)) > 0
      AND NOT EXISTS (
        SELECT 1
        FROM ledger.source_receipts sr
        WHERE sr.source_system = 'rides_payment_journal'
          AND sr.source_id = j.id::text
      )
    ORDER BY j.created_at
    LIMIT p_limit
  LOOP
    v_processed := v_processed + 1;
    BEGIN
      IF r.debit_key LIKE '%:rider%' OR r.credit_key LIKE '%:rider%' THEN
        v_product := 'roam_rides';
      ELSIF r.debit_key LIKE '%:driver%' OR r.credit_key LIKE '%:driver%' THEN
        v_product := 'roam_driver';
      ELSE
        v_product := 'roam_rides';
      END IF;

      v_result := public.ledger_post_entry(
        'rides_payment_journal:' || r.id::text,
        r.entry_type,
        r.debit_key,
        r.credit_key,
        abs(r.amount_minor),
        coalesce(nullif(r.currency, ''), 'JMD'),
        r.request_hash,
        NULL,
        v_product,
        r.created_at,
        CASE WHEN r.ride_request_id IS NOT NULL THEN 'ride' ELSE NULL END,
        CASE WHEN r.ride_request_id IS NOT NULL THEN r.ride_request_id::text ELSE NULL END,
        coalesce(r.metadata, '{}'::jsonb),
        r.created_by_user_id,
        'rides_payment_journal',
        r.id::text,
        r.idempotency_key
      );

      IF coalesce((v_result->>'inserted')::boolean, false) THEN
        v_inserted := v_inserted + 1;
      ELSIF coalesce((v_result->>'skipped')::boolean, false)
         OR coalesce((v_result->>'conflict')::boolean, false) THEN
        v_skipped := v_skipped + 1;
      ELSE
        v_failed := v_failed + 1;
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'source_id', r.id,
          'result', v_result
        ));
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'source_id', r.id,
        'error', SQLERRM
      ));
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', v_processed,
    'inserted', v_inserted,
    'skipped', v_skipped,
    'failed', v_failed,
    'errors', v_errors
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ledger_backfill_rides_payment_journal_batch(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ledger_backfill_rides_payment_journal_batch(integer) TO service_role;

NOTIFY pgrst, 'reload schema';
