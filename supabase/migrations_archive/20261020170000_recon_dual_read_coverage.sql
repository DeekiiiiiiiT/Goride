-- Week Recon coverage truth: dual-read statement sources (batch OR live Fleet evidence)
-- + zero-day rule when the week already has a batch or any live evidence for that source.
-- See plan: Recon Coverage Truth (Driver Ops ↔ landing cards).

CREATE OR REPLACE FUNCTION recon._week_batch_overlaps(
  p_org text,
  p_source_id text,
  p_week_key date
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
      AND b.coverage_start <= (p_week_key + 6)
      AND b.coverage_end >= p_week_key
  );
$$;

CREATE OR REPLACE FUNCTION recon._day_has_statement_live(
  p_org text,
  p_source_id text,
  p_day date
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  CASE p_source_id
    WHEN 'uber_bundle' THEN
      RETURN EXISTS (
        SELECT 1 FROM fleet.trips t
        WHERE t.organization_id = p_org
          AND t.date::date = p_day
          AND lower(coalesce(t.platform, '')) LIKE '%uber%'
          AND coalesce(t.service_line, 'rideshare') <> 'rush_delivery'
      );
    WHEN 'indrive_trips' THEN
      RETURN EXISTS (
        SELECT 1 FROM fleet.trips t
        WHERE t.organization_id = p_org
          AND t.date::date = p_day
          AND lower(coalesce(t.platform, '')) LIKE '%indrive%'
          AND coalesce(t.service_line, 'rideshare') <> 'rush_delivery'
      );
    WHEN 'toll_usage' THEN
      RETURN EXISTS (
        SELECT 1 FROM fleet.toll_ledger l
        WHERE l.organization_id = p_org
          AND l.date::date = p_day
          AND lower(coalesce(l.type, '')) IN ('usage', 'toll_usage')
          AND lower(coalesce(l.payment_method, '')) NOT LIKE '%cash%'
      );
    WHEN 'toll_topup' THEN
      RETURN EXISTS (
        SELECT 1 FROM fleet.toll_ledger l
        WHERE l.organization_id = p_org
          AND l.date::date = p_day
          AND lower(coalesce(l.type, '')) IN ('top_up', 'topup')
      );
    WHEN 'fuel_card_roam' THEN
      -- Roam-issued cards only — never generic / JAA self-serve fills.
      RETURN EXISTS (
        SELECT 1
        FROM fleet.fuel_entries f
        LEFT JOIN fleet.fuel_cards c
          ON c.organization_id = f.organization_id
         AND (
           c.id = nullif(trim(coalesce(f.payload_json->>'cardId', '')), '')
           OR c.legacy_kv_id = nullif(trim(coalesce(f.payload_json->>'cardId', '')), '')
         )
        WHERE f.organization_id = p_org
          AND f.date::date = p_day
          AND (
            lower(coalesce(c.payload_json->>'provider', '')) LIKE '%roam%'
            OR lower(coalesce(f.payload_json->>'cardProvider', '')) LIKE '%roam%'
            OR lower(coalesce(f.payload_json->>'issuer', '')) LIKE '%roam%'
            OR lower(coalesce(f.payload_json->>'program', '')) LIKE '%roam%'
          )
      );
    WHEN 'fuel_card_self' THEN
      -- Own / JAA (self-serve) card statement fills.
      RETURN EXISTS (
        SELECT 1
        FROM fleet.fuel_entries f
        LEFT JOIN fleet.fuel_cards c
          ON c.organization_id = f.organization_id
         AND (
           c.id = nullif(trim(coalesce(f.payload_json->>'cardId', '')), '')
           OR c.legacy_kv_id = nullif(trim(coalesce(f.payload_json->>'cardId', '')), '')
         )
        WHERE f.organization_id = p_org
          AND f.date::date = p_day
          AND (
            lower(coalesce(c.payload_json->>'provider', '')) LIKE '%jaa%'
            OR lower(coalesce(c.payload_json->>'provider', '')) LIKE '%automobile%'
            OR nullif(trim(coalesce(c.payload_json->>'jaaCardType', '')), '') IS NOT NULL
            OR lower(coalesce(f.payload_json->>'importSource', '')) LIKE '%jaa%'
            OR (
              coalesce(f.type, '') = 'Card_Transaction'
              AND lower(coalesce(c.payload_json->>'provider', '')) NOT LIKE '%roam%'
              AND nullif(trim(coalesce(f.payload_json->>'cardId', '')), '') IS NOT NULL
            )
          )
      );
    ELSE
      RETURN false;
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION recon._week_has_statement_live(
  p_org text,
  p_source_id text,
  p_week_key date
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  d date;
BEGIN
  FOREACH d IN ARRAY recon._week_day_keys(p_week_key)
  LOOP
    IF recon._day_has_statement_live(p_org, p_source_id, d) THEN
      RETURN true;
    END IF;
  END LOOP;
  RETURN false;
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
    'uber_bundle', 'indrive_trips', 'toll_usage', 'toll_topup', 'fuel_card_roam', 'fuel_card_self'
  ];
  daily_sources text[] := ARRAY[
    'roam_trips', 'cash_tolls', 'cash_fuel', 'rush_deliveries'
  ];
  week_anchor boolean := false;
BEGIN
  IF extract(isodow FROM p_week_key) <> 1 THEN
    RAISE EXCEPTION 'week_key must be a Monday (ADR 0007)';
  END IF;

  IF p_source_id = 'cod_remittance' THEN
    RETURN '{}'::jsonb;
  END IF;

  IF p_source_id = ANY (stmt_sources) THEN
    week_anchor :=
      recon._week_batch_overlaps(p_org, p_source_id, p_week_key)
      OR recon._week_has_statement_live(p_org, p_source_id, p_week_key);
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
    ELSIF p_source_id = ANY (stmt_sources) AND week_anchor THEN
      -- Statement-period: batch and/or live evidence anchors the week → all Mon–Sun covered
      -- (empty days = zero activity, not missing uploads).
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

-- Keep public wrapper pointing at recon (definition unchanged, refresh grants).
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

REVOKE ALL ON FUNCTION recon._week_batch_overlaps(text, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION recon._day_has_statement_live(text, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION recon._week_has_statement_live(text, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION recon.compute_source_coverage(text, text, text, date) FROM PUBLIC;
-- R6-02: REVOKE FROM PUBLIC alone leaves Supabase default grants to anon + authenticated.
REVOKE ALL ON FUNCTION public.compute_source_coverage(text, text, text, date)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION recon._week_batch_overlaps(text, text, date) TO service_role;
GRANT EXECUTE ON FUNCTION recon._day_has_statement_live(text, text, date) TO service_role;
GRANT EXECUTE ON FUNCTION recon._week_has_statement_live(text, text, date) TO service_role;
GRANT EXECUTE ON FUNCTION recon.compute_source_coverage(text, text, text, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.compute_source_coverage(text, text, text, date) TO service_role;

NOTIFY pgrst, 'reload schema';
