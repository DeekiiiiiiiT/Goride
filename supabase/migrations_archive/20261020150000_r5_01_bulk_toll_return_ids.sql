-- R5-01: bulk_insert_toll_ledger returns inserted_ids; drop WHEN others;
-- allow recon.import_staging.status = 'partial' for money-side failures.

DO $$
DECLARE
  conname text;
BEGIN
  SELECT c.conname INTO conname
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'recon'
    AND t.relname = 'import_staging'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%status%';
  IF conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE recon.import_staging DROP CONSTRAINT %I', conname);
  END IF;
END $$;

ALTER TABLE recon.import_staging
  ADD CONSTRAINT import_staging_status_check
  CHECK (status IN ('staged', 'parsed', 'committed', 'rolled_back', 'partial'));

CREATE OR REPLACE FUNCTION fleet.bulk_insert_toll_ledger(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
DECLARE
  inserted int := 0;
  skipped int := 0;
  r jsonb;
  row_id text;
  inserted_ids text[] := ARRAY[]::text[];
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RETURN jsonb_build_object(
      'inserted', 0,
      'skipped', 0,
      'inserted_ids', '[]'::jsonb
    );
  END IF;

  FOR r IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    BEGIN
      row_id := coalesce(nullif(r->>'id', ''), gen_random_uuid()::text);
      INSERT INTO fleet.toll_ledger (
        id,
        organization_id,
        date,
        amount,
        type,
        status,
        payment_method,
        vehicle_id,
        driver_id,
        toll_tag_id,
        provider_ref,
        plaza,
        plaza_id,
        batch_id,
        service_line,
        service_line_source,
        metadata,
        payload_json,
        audit_trail,
        created_at,
        updated_at,
        legacy_kv_id,
        is_reconciled
      )
      VALUES (
        row_id,
        r->>'organization_id',
        (r->>'date')::date,
        coalesce((r->>'amount')::numeric, 0),
        nullif(r->>'type', ''),
        coalesce(nullif(r->>'status', ''), 'Completed'),
        nullif(r->>'payment_method', ''),
        nullif(r->>'vehicle_id', ''),
        nullif(r->>'driver_id', ''),
        nullif(r->>'toll_tag_id', ''),
        nullif(r->>'provider_ref', ''),
        nullif(r->>'plaza', ''),
        nullif(r->>'plaza_id', ''),
        nullif(r->>'batch_id', ''),
        nullif(r->>'service_line', ''),
        nullif(r->>'service_line_source', ''),
        coalesce(r->'metadata', '{}'::jsonb),
        coalesce(r->'payload_json', r),
        coalesce(r->'audit_trail', '[]'::jsonb),
        coalesce((r->>'created_at')::timestamptz, now()),
        coalesce((r->>'updated_at')::timestamptz, now()),
        coalesce(nullif(r->>'legacy_kv_id', ''), row_id),
        coalesce((r->>'is_reconciled')::boolean, false)
      )
      ON CONFLICT DO NOTHING;
      IF FOUND THEN
        inserted := inserted + 1;
        inserted_ids := array_append(inserted_ids, row_id);
      ELSE
        skipped := skipped + 1;
      END IF;
    EXCEPTION
      -- Expected duplicate race / unique conflict after DO NOTHING miss.
      WHEN unique_violation THEN
        skipped := skipped + 1;
      -- Unexpected errors (bad cast, check violation, etc.) abort the batch.
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'inserted', inserted,
    'skipped', skipped,
    'inserted_ids', to_jsonb(inserted_ids)
  );
END;
$$;

REVOKE ALL ON FUNCTION fleet.bulk_insert_toll_ledger(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fleet.bulk_insert_toll_ledger(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.bulk_insert_toll_ledger(p_rows jsonb)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
  SELECT fleet.bulk_insert_toll_ledger(p_rows);
$$;

REVOKE ALL ON FUNCTION public.bulk_insert_toll_ledger(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_insert_toll_ledger(jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
