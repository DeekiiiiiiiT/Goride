-- WRA-72: cash tolls from toll v2 (driver_cash); data beats "No activity" attest.

CREATE OR REPLACE FUNCTION recon._day_has_daily_rows(
  p_org text,
  p_line text,
  p_source_id text,
  p_day date
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = recon, fleet, toll, public
AS $$
BEGIN
  CASE p_source_id
    WHEN 'indrive_trips' THEN
      RETURN EXISTS (
        SELECT 1 FROM fleet.trips t
        WHERE t.organization_id = p_org
          AND t.date::date = p_day
          AND lower(coalesce(t.platform, '')) LIKE '%indrive%'
          AND (p_line <> 'rideshare' OR coalesce(t.service_line, 'rideshare') = 'rideshare')
      );
    WHEN 'roam_trips' THEN
      RETURN EXISTS (
        SELECT 1 FROM fleet.trips t
        WHERE t.organization_id = p_org
          AND t.date::date = p_day
          AND coalesce(t.platform, '') = 'Roam'
          AND coalesce(t.service_line, 'rideshare') = 'rideshare'
      );
    WHEN 'cash_tolls' THEN
      RETURN EXISTS (
        SELECT 1
        FROM toll.charges c
        WHERE c.organization_id = btrim(p_org)::uuid
          AND c.source = 'driver_cash'
          AND c.duplicate_of IS NULL
          AND (c.occurred_at AT TIME ZONE 'America/Jamaica')::date = p_day
      );
    WHEN 'cash_fuel' THEN
      RETURN EXISTS (
        SELECT 1 FROM fleet.fuel_entries f
        WHERE f.organization_id = p_org
          AND f.date::date = p_day
          AND (
            nullif(trim(coalesce(f.payload_json->>'batchId', '')), '') IS NULL
            OR coalesce(f.payload_json->>'source', '') IN ('driver', 'receipt', 'ocr')
          )
      );
    WHEN 'rush_deliveries' THEN
      RETURN EXISTS (
        SELECT 1 FROM fleet.trips t
        WHERE t.organization_id = p_org
          AND t.date::date = p_day
          AND coalesce(t.service_line, '') = 'rush_delivery'
      );
    WHEN 'uber_activity_timeline' THEN
      RETURN EXISTS (
        SELECT 1
        FROM fleet.driver_activity_events e
        WHERE e.organization_id = p_org
          AND e.source = 'uber_app_activity'
          AND (e.occurred_at AT TIME ZONE 'America/Jamaica')::date = p_day
      );
    ELSE
      RETURN false;
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION recon.cash_tolls_week_volume(p_org text, p_week date)
RETURNS TABLE (charge_count bigint, amount_minor bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = toll, public
AS $$
  SELECT count(*)::bigint,
         coalesce(sum(c.amount_minor), 0)::bigint
  FROM toll.charges c
  WHERE c.organization_id = btrim(p_org)::uuid
    AND c.source = 'driver_cash'
    AND c.duplicate_of IS NULL
    AND c.week_key = p_week;
$$;

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
SET search_path = recon, fleet, toll, public
AS $$
DECLARE
  d date;
  days date[];
  day_status text;
  out jsonb := '{}'::jsonb;
  week_status text;
  v_stmt boolean;
  v_attest_week boolean;
  v_has_rows boolean;
  v_has_attest boolean;
  stmt_sources text[] := ARRAY[
    'uber_bundle',
    'toll_usage',
    'toll_topup',
    'fuel_card_roam',
    'fuel_card_self'
  ];
  daily_sources text[] := ARRAY[
    'indrive_trips',
    'roam_trips',
    'cash_fuel',
    'rush_deliveries',
    'uber_activity_timeline'
  ];
BEGIN
  IF extract(isodow FROM p_week_key) <> 1 THEN
    RAISE EXCEPTION 'week_key must be a Monday (ADR 0007)';
  END IF;

  IF p_source_id = 'cod_remittance' THEN
    RETURN '{}'::jsonb;
  END IF;

  -- WRA-72(a): driver-reported; never uses attest; empty week is still covered.
  IF p_source_id = 'cash_tolls' THEN
    days := recon._week_day_keys(p_week_key);
    FOREACH d IN ARRAY days
    LOOP
      out := out || jsonb_build_object(to_char(d, 'YYYY-MM-DD'), 'covered');
    END LOOP;
    RETURN out;
  END IF;

  IF p_source_id = ANY (stmt_sources) THEN
  -- WRA-72(b): real statement beats attest when both exist.
    v_stmt := recon._week_statement_received(p_org, p_source_id, p_week_key);
    v_attest_week := recon._week_all_days_attest_none(p_org, p_line, p_source_id, p_week_key);
    IF v_stmt AND v_attest_week THEN
      week_status := 'covered_over_attest';
    ELSIF v_stmt THEN
      week_status := 'covered';
    ELSIF v_attest_week THEN
      week_status := 'zero_attested';
    ELSE
      week_status := 'missing';
    END IF;
    RETURN jsonb_build_object('week', week_status);
  END IF;

  days := recon._week_day_keys(p_week_key);
  FOREACH d IN ARRAY days
  LOOP
    v_has_attest := EXISTS (
      SELECT 1
      FROM recon.source_attestations a
      WHERE a.organization_id = p_org
        AND a.service_line = p_line
        AND a.week_key = p_week_key
        AND a.source_id = p_source_id
        AND a.day = d
        AND a.kind = 'attest_none'
    );
    v_has_rows := (
      p_source_id = ANY (daily_sources)
      AND recon._day_has_daily_rows(p_org, p_line, p_source_id, d)
    ) OR (
      p_source_id = 'indrive_trips'
      AND recon._day_covered_by_batch(p_org, p_source_id, d)
    );

    IF v_has_rows AND v_has_attest THEN
      day_status := 'covered_over_attest';
    ELSIF v_has_rows THEN
      day_status := 'covered';
    ELSIF v_has_attest THEN
      day_status := 'zero_attested';
    ELSE
      day_status := 'missing';
    END IF;
    out := out || jsonb_build_object(to_char(d, 'YYYY-MM-DD'), day_status);
  END LOOP;

  RETURN out;
END;
$$;

CREATE OR REPLACE FUNCTION public.cash_tolls_week_volume(p_org text, p_week date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = recon, toll, public
AS $$
  SELECT jsonb_build_object(
    'charge_count', v.charge_count,
    'amount_minor', v.amount_minor
  )
  FROM recon.cash_tolls_week_volume(p_org, p_week) v;
$$;

REVOKE ALL ON FUNCTION recon.cash_tolls_week_volume(text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION recon.cash_tolls_week_volume(text, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION recon.cash_tolls_week_volume(text, date) TO service_role;

REVOKE ALL ON FUNCTION public.cash_tolls_week_volume(text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cash_tolls_week_volume(text, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cash_tolls_week_volume(text, date) TO service_role;

NOTIFY pgrst, 'reload schema';