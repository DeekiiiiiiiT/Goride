-- WRA-09: statement sources judged per week from import_batches.week_keys; no live fallback.

CREATE OR REPLACE FUNCTION recon._week_statement_received(
  p_org text,
  p_source_id text,
  p_week_key date
) RETURNS boolean
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
      AND b.week_keys[1] = p_week_key
  );
$$;

CREATE OR REPLACE FUNCTION recon._week_all_days_attest_none(
  p_org text,
  p_line text,
  p_source_id text,
  p_week_key date
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = recon, public
AS $$
  SELECT count(*)::int = 7
  FROM recon.source_attestations a
  WHERE a.organization_id = p_org
    AND a.service_line = p_line
    AND a.week_key = p_week_key
    AND a.source_id = p_source_id
    AND a.kind = 'attest_none'
    AND a.day = ANY (recon._week_day_keys(p_week_key));
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
    'indrive_trips',
    'toll_usage',
    'toll_topup',
    'fuel_card_roam',
    'fuel_card_self'
  ];
  daily_sources text[] := ARRAY[
    'roam_trips',
    'cash_tolls',
    'cash_fuel',
    'rush_deliveries'
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
    ELSE
      day_status := 'missing';
    END IF;
    out := out || jsonb_build_object(to_char(d, 'YYYY-MM-DD'), day_status);
  END LOOP;

  RETURN out;
END;
$$;

CREATE OR REPLACE FUNCTION public.compute_source_coverage(
  p_org text,
  p_line text,
  p_source_id text,
  p_week_key date
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = recon, fleet, public
AS $$
  SELECT recon.compute_source_coverage(p_org, p_line, p_source_id, p_week_key);
$$;

REVOKE ALL ON FUNCTION recon._week_statement_received(text, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION recon._week_all_days_attest_none(text, text, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION recon.compute_source_coverage(text, text, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.compute_source_coverage(text, text, text, date)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION recon._week_statement_received(text, text, date) TO service_role;
GRANT EXECUTE ON FUNCTION recon._week_all_days_attest_none(text, text, text, date) TO service_role;
GRANT EXECUTE ON FUNCTION recon.compute_source_coverage(text, text, text, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.compute_source_coverage(text, text, text, date) TO service_role;

COMMENT ON FUNCTION recon.compute_source_coverage IS
  'WRA-09: statement sources return {week: status} from week_keys; daily sources keep day map.';

NOTIFY pgrst, 'reload schema';
