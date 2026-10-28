-- Week Reconciliation P1: source coverage SQL + week summaries.
-- See WEEK_RECONCILIATION_WIZARD_AUDIT.md §4.4.

CREATE SCHEMA IF NOT EXISTS recon;

REVOKE ALL ON SCHEMA recon FROM PUBLIC;
REVOKE ALL ON SCHEMA recon FROM anon, authenticated;
GRANT USAGE ON SCHEMA recon TO service_role;
GRANT USAGE ON SCHEMA recon TO authenticated;

CREATE TABLE IF NOT EXISTS recon.source_attestations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  service_line text NOT NULL CHECK (service_line IN ('rideshare', 'rush_delivery')),
  week_key date NOT NULL CHECK (extract(isodow FROM week_key) = 1),
  source_id text NOT NULL,
  day date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('attest_none', 'waive')),
  reason text,
  actor text,
  attested_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, service_line, week_key, source_id, day, kind)
);

CREATE INDEX IF NOT EXISTS recon_source_attestations_org_week_idx
  ON recon.source_attestations (organization_id, service_line, week_key);

ALTER TABLE recon.source_attestations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recon_source_attestations_org_select ON recon.source_attestations;
CREATE POLICY recon_source_attestations_org_select ON recon.source_attestations
  FOR SELECT TO authenticated
  USING (
    organization_id = COALESCE(
      (auth.jwt() -> 'app_metadata' ->> 'organization_id'),
      (auth.jwt() -> 'user_metadata' ->> 'organization_id')
    )
  );

REVOKE ALL ON recon.source_attestations FROM PUBLIC;
REVOKE ALL ON recon.source_attestations FROM anon, authenticated;
GRANT SELECT ON recon.source_attestations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON recon.source_attestations TO service_role;

CREATE OR REPLACE FUNCTION recon._week_day_keys(p_week_key date)
RETURNS date[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT array_agg(d::date ORDER BY d)
  FROM generate_series(p_week_key, p_week_key + 6, interval '1 day') AS d;
$$;

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

CREATE OR REPLACE FUNCTION recon._day_has_daily_rows(
  p_org text,
  p_line text,
  p_source_id text,
  p_day date
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
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
        SELECT 1 FROM fleet.toll_ledger l
        WHERE l.organization_id = p_org
          AND l.date::date = p_day
          AND (
            lower(coalesce(l.payment_method, '')) = 'cash'
            OR lower(coalesce(l.type, '')) = 'cash'
          )
      );
    WHEN 'cash_fuel' THEN
      -- fuel_entries has no import_batch_id column; batch lives in payload_json.batchId
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
    ELSE
      RETURN false;
  END CASE;
END;
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
    'uber_bundle', 'toll_usage', 'toll_topup', 'fuel_card_roam', 'fuel_card_self'
  ];
  daily_sources text[] := ARRAY[
    'indrive_trips', 'roam_trips', 'cash_tolls', 'cash_fuel', 'rush_deliveries'
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

CREATE OR REPLACE FUNCTION recon.list_week_source_summaries(
  p_org text,
  p_line text,
  p_year int DEFAULT NULL
)
RETURNS TABLE (
  week_key date,
  sources jsonb,
  missing_count int,
  needs_data boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = recon, fleet, public
AS $$
DECLARE
  w date;
  src text;
  cov jsonb;
  src_rows jsonb := '[]'::jsonb;
  miss int;
  source_ids text[] := ARRAY[
    'uber_bundle', 'indrive_trips', 'roam_trips',
    'toll_usage', 'toll_topup', 'cash_tolls',
    'fuel_card_roam', 'fuel_card_self', 'cash_fuel',
    'rush_deliveries', 'cod_remittance'
  ];
  yr int := coalesce(p_year, extract(year FROM current_date)::int);
  anchor date := date_trunc('week', current_date)::date;
BEGIN
  FOR i IN 0..11 LOOP
    w := anchor - (i * 7);
    IF extract(year FROM w) <> yr AND p_year IS NOT NULL THEN
      CONTINUE;
    END IF;

    src_rows := '[]'::jsonb;
    miss := 0;

    FOREACH src IN ARRAY source_ids
    LOOP
      cov := recon.compute_source_coverage(p_org, p_line, src, w);
      IF cov <> '{}'::jsonb AND cov ?| ARRAY(SELECT jsonb_object_keys(cov)) THEN
        IF EXISTS (
          SELECT 1 FROM jsonb_each_text(cov) e WHERE e.value = 'missing'
        ) THEN
          miss := miss + 1;
        END IF;
      END IF;
      src_rows := src_rows || jsonb_build_array(
        jsonb_build_object('id', src, 'coverage', cov)
      );
    END LOOP;

    week_key := w;
    sources := src_rows;
    missing_count := miss;
    needs_data := miss > 0;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION recon.compute_source_coverage(text, text, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION recon.list_week_source_summaries(text, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION recon.compute_source_coverage(text, text, text, date) TO service_role;
GRANT EXECUTE ON FUNCTION recon.list_week_source_summaries(text, text, int) TO service_role;

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

CREATE OR REPLACE FUNCTION public.list_week_source_summaries(
  p_org text,
  p_line text,
  p_year int DEFAULT NULL
)
RETURNS TABLE (
  week_key date,
  sources jsonb,
  missing_count int,
  needs_data boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = recon, fleet, public
AS $$
  SELECT * FROM recon.list_week_source_summaries(p_org, p_line, p_year);
$$;

REVOKE ALL ON FUNCTION public.compute_source_coverage(text, text, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_week_source_summaries(text, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_source_coverage(text, text, text, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_week_source_summaries(text, text, int) TO service_role;

NOTIFY pgrst, 'reload schema';
