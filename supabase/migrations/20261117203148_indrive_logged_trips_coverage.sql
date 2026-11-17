-- WRA-71: indrive_trips = per-day coverage (logged trips or export batch per day).

CREATE OR REPLACE FUNCTION recon._day_covered_by_batch(
  p_org text,
  p_source_id text,
  p_day date
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = fleet, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM fleet.import_batches b
    WHERE b.organization_id = p_org
      AND b.source_id = p_source_id
      AND b.status IN ('completed', 'committed')
      AND b.coverage_start IS NOT NULL
      AND b.coverage_end IS NOT NULL
      AND p_day BETWEEN b.coverage_start AND b.coverage_end
  );
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
SET search_path = recon, fleet, public
AS $$
DECLARE
  d date;
  days date[];
  day_status text;
  out jsonb := '{}'::jsonb;
  week_status text;
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
    'cash_tolls',
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

  IF p_source_id = ANY (stmt_sources) THEN
    IF recon._week_all_days_attest_none(p_org, p_line, p_source_id, p_week_key) THEN
      week_status := 'zero_attested';
    ELSIF recon._week_statement_received(p_org, p_source_id, p_week_key) THEN
      week_status := 'covered';
    ELSE
      week_status := 'missing';
    END IF;
    RETURN jsonb_build_object('week', week_status);
  END IF;

  days := recon._week_day_keys(p_week_key);
  FOREACH d IN ARRAY days
  LOOP
    IF EXISTS (
      SELECT 1
      FROM recon.source_attestations a
      WHERE a.organization_id = p_org
        AND a.service_line = p_line
        AND a.week_key = p_week_key
        AND a.source_id = p_source_id
        AND a.day = d
        AND a.kind = 'attest_none'
    ) THEN
      day_status := 'zero_attested';
    ELSIF p_source_id = ANY (daily_sources)
      AND recon._day_has_daily_rows(p_org, p_line, p_source_id, d) THEN
      day_status := 'covered';
    ELSIF p_source_id = 'indrive_trips'
      AND recon._day_covered_by_batch(p_org, p_source_id, d) THEN
      day_status := 'covered';
    ELSE
      day_status := 'missing';
    END IF;
    out := out || jsonb_build_object(to_char(d, 'YYYY-MM-DD'), day_status);
  END LOOP;

  RETURN out;
END;
$$;

REVOKE ALL ON FUNCTION recon._day_covered_by_batch(text, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION recon._day_covered_by_batch(text, text, date)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION recon._day_covered_by_batch(text, text, date) TO service_role;

NOTIFY pgrst, 'reload schema';