-- R6-01 / R6-02: Coverage truth (per-day batch + pre-bridge live fallback) + anon revoke.
-- Bridge go-live week = 2026-10-19 (Monday of the week recon_batch_bridge started writing
-- coverage onto fleet.import_batches). Live-row evidence only applies before that week,
-- and only for the day that has rows — never paints the whole week Covered.

-- Per-day batch intersection (replaces week-wide _week_batch_overlaps as coverage driver).
CREATE OR REPLACE FUNCTION recon._day_covered_by_batch(
  p_org text,
  p_source_id text,
  p_day date
)
RETURNS boolean
LANGUAGE sql
STABLE
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
  stmt_sources text[] := ARRAY[
    'uber_bundle', 'indrive_trips', 'toll_usage', 'toll_topup', 'fuel_card_roam', 'fuel_card_self'
  ];
  daily_sources text[] := ARRAY[
    'roam_trips', 'cash_tolls', 'cash_fuel', 'rush_deliveries'
  ];
  -- Monday of the week recon_batch_bridge began writing import_batches coverage.
  c_bridge_go_live_week constant date := date '2026-10-19';
  allow_live_fallback boolean;
BEGIN
  IF extract(isodow FROM p_week_key) <> 1 THEN
    RAISE EXCEPTION 'week_key must be a Monday (ADR 0007)';
  END IF;

  IF p_source_id = 'cod_remittance' THEN
    RETURN '{}'::jsonb;
  END IF;

  allow_live_fallback := p_week_key < c_bridge_go_live_week;

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
    ELSIF p_source_id = ANY (stmt_sources)
      AND allow_live_fallback
      AND recon._day_has_statement_live(p_org, p_source_id, d) THEN
      -- Pre-bridge only: live evidence covers that single day, never the whole week.
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

REVOKE ALL ON FUNCTION recon._day_covered_by_batch(text, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION recon.compute_source_coverage(text, text, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.compute_source_coverage(text, text, text, date)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION recon._day_covered_by_batch(text, text, date) TO service_role;
GRANT EXECUTE ON FUNCTION recon.compute_source_coverage(text, text, text, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.compute_source_coverage(text, text, text, date) TO service_role;

-- Week-wide live helper is unused by coverage (kept for any ad-hoc SQL; lock it down).
REVOKE ALL ON FUNCTION recon._week_has_statement_live(text, text, date)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION recon._week_batch_overlaps(text, text, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION recon._week_has_statement_live(text, text, date) TO service_role;
GRANT EXECUTE ON FUNCTION recon._week_batch_overlaps(text, text, date) TO service_role;

NOTIFY pgrst, 'reload schema';
