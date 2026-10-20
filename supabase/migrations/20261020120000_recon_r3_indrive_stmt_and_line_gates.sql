-- R3-07: InDrive coverage = statement period (import batch range), not daily trip rows.
-- R3-11: Toll/Fuel period gates are per service_line (before Delivery unlock).
-- R3-12: Atomic bulk insert for staged toll commit.

-- ── R3-07: move indrive_trips into stmt_sources ─────────────────────────────
CREATE OR REPLACE FUNCTION recon.compute_source_coverage(
  p_org text,
  p_line text,
  p_source_id text,
  p_week_key date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = recon, fleet, public
AS $$
DECLARE
  d date;
  days date[];
  day_status text;
  out jsonb := '{}'::jsonb;
  stmt_sources text[] := ARRAY[
    'uber_bundle', 'indrive_trips', 'toll_usage', 'toll_topup', 'fuel_card_roam', 'fuel_card_self'
  ];
  daily_sources text[] := ARRAY[
    'roam_trips', 'cash_tolls', 'cash_fuel', 'rush_deliveries'
  ];
BEGIN
  IF extract(isodow FROM p_week_key) <> 1 THEN
    RAISE EXCEPTION 'week_key must be a Monday (ADR 0007)';
  END IF;

  IF p_source_id = 'cod_remittance' THEN
    RETURN '{}'::jsonb;
  END IF;

  days := recon._week_day_keys(p_week_key);
  FOREACH d IN ARRAY days
  LOOP
    IF EXISTS (
      SELECT 1 FROM recon.source_attestations a
      WHERE a.organization_id = p_org
        AND a.service_line = p_line
        AND a.week_key = p_week_key
        AND a.source_id = p_source_id
        AND a.day = d
        AND a.kind = 'attest_none'
    ) THEN
      day_status := 'zero_attested';
    ELSIF p_source_id = ANY (stmt_sources)
      AND recon._day_covered_by_batch(p_org, p_source_id, d) THEN
      day_status := 'covered';
    ELSIF p_source_id = ANY (daily_sources)
      AND recon._day_has_daily_rows(p_org, p_line, p_source_id, d) THEN
      day_status := 'covered';
    ELSE
      day_status := 'missing';
    END IF;
    out := out || jsonb_build_object(to_char(d, 'YYYY-MM-DD'), day_status);
  END LOOP;

  RETURN out;
END;
$$;

-- ── R3-11: per-line period rows ─────────────────────────────────────────────
ALTER TABLE public.toll_reconciliation_period
  ADD COLUMN IF NOT EXISTS service_line text NOT NULL DEFAULT 'rideshare';

ALTER TABLE public.toll_reconciliation_period
  DROP CONSTRAINT IF EXISTS toll_reconciliation_period_service_line_check;
ALTER TABLE public.toll_reconciliation_period
  ADD CONSTRAINT toll_reconciliation_period_service_line_check
  CHECK (service_line IN ('rideshare', 'rush_delivery'));

UPDATE public.toll_reconciliation_period
  SET service_line = 'rideshare'
  WHERE service_line IS NULL OR service_line = '';

ALTER TABLE public.toll_reconciliation_period
  DROP CONSTRAINT IF EXISTS toll_reconciliation_period_organization_id_week_key_key;
ALTER TABLE public.toll_reconciliation_period
  DROP CONSTRAINT IF EXISTS toll_reconciliation_period_org_week_key;

-- Prefer dropping unique index/constraint by scanning
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.toll_reconciliation_period'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) ILIKE '%week_key%'
      AND pg_get_constraintdef(oid) NOT ILIKE '%service_line%'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE public.toll_reconciliation_period DROP CONSTRAINT ' || quote_ident(conname)
      FROM pg_constraint
      WHERE conrelid = 'public.toll_reconciliation_period'::regclass
        AND contype = 'u'
        AND pg_get_constraintdef(oid) ILIKE '%week_key%'
        AND pg_get_constraintdef(oid) NOT ILIKE '%service_line%'
      LIMIT 1
    );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS toll_recon_period_org_week_line_uidx
  ON public.toll_reconciliation_period (organization_id, week_key, service_line);

-- Named constraint so PostgREST upsert onConflict works reliably.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'toll_reconciliation_period_org_week_line_key'
  ) THEN
    ALTER TABLE public.toll_reconciliation_period
      ADD CONSTRAINT toll_reconciliation_period_org_week_line_key
      UNIQUE USING INDEX toll_recon_period_org_week_line_uidx;
  END IF;
EXCEPTION
  WHEN others THEN
    -- Index may already back a constraint; ignore.
    NULL;
END $$;

ALTER TABLE public.fuel_reconciliation_period
  ADD COLUMN IF NOT EXISTS service_line text NOT NULL DEFAULT 'rideshare';

ALTER TABLE public.fuel_reconciliation_period
  DROP CONSTRAINT IF EXISTS fuel_reconciliation_period_service_line_check;
ALTER TABLE public.fuel_reconciliation_period
  ADD CONSTRAINT fuel_reconciliation_period_service_line_check
  CHECK (service_line IN ('rideshare', 'rush_delivery'));

UPDATE public.fuel_reconciliation_period
  SET service_line = 'rideshare'
  WHERE service_line IS NULL OR service_line = '';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.fuel_reconciliation_period'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) ILIKE '%week_start%'
      AND pg_get_constraintdef(oid) NOT ILIKE '%service_line%'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE public.fuel_reconciliation_period DROP CONSTRAINT ' || quote_ident(conname)
      FROM pg_constraint
      WHERE conrelid = 'public.fuel_reconciliation_period'::regclass
        AND contype = 'u'
        AND pg_get_constraintdef(oid) ILIKE '%week_start%'
        AND pg_get_constraintdef(oid) NOT ILIKE '%service_line%'
      LIMIT 1
    );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS fuel_recon_period_org_week_line_uidx
  ON public.fuel_reconciliation_period (org_id, week_start, service_line);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fuel_reconciliation_period_org_week_line_key'
  ) THEN
    ALTER TABLE public.fuel_reconciliation_period
      ADD CONSTRAINT fuel_reconciliation_period_org_week_line_key
      UNIQUE USING INDEX fuel_recon_period_org_week_line_uidx;
  END IF;
EXCEPTION
  WHEN others THEN
    NULL;
END $$;

-- ── R3-12: atomic bulk toll ledger insert (one transaction) ─────────────────
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
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RETURN jsonb_build_object('inserted', 0, 'skipped', 0);
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
      ELSE
        skipped := skipped + 1;
      END IF;
    EXCEPTION
      WHEN unique_violation THEN
        skipped := skipped + 1;
      WHEN others THEN
        skipped := skipped + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object('inserted', inserted, 'skipped', skipped);
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

REVOKE ALL ON FUNCTION public.bulk_insert_toll_ledger(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bulk_insert_toll_ledger(jsonb) TO service_role;
