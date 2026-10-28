-- N-2 / H-8: exact settlement queue aggregates in SQL (count + SUM)
-- with service-line predicate matching periodMetadataMatchesServiceLine.

CREATE OR REPLACE FUNCTION public.dfp_service_line_matches(
  p_metadata jsonb,
  p_service_line text
) RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_service_line IS NULL OR btrim(p_service_line) = '' THEN true
    WHEN COALESCE((p_metadata->>'rushTripCount')::numeric, 0) = 0
      AND COALESCE((p_metadata->>'rideshareTripCount')::numeric, 0) = 0 THEN true
    WHEN p_service_line = 'rush_delivery'
      THEN COALESCE((p_metadata->>'rushTripCount')::numeric, 0) > 0
    WHEN p_service_line = 'rideshare'
      THEN COALESCE((p_metadata->>'rideshareTripCount')::numeric, 0) > 0
    ELSE true
  END;
$$;

COMMENT ON FUNCTION public.dfp_service_line_matches(jsonb, text) IS
  'H-8: true when period metadata matches rideshare|rush_delivery (both-zero = match all).';

CREATE OR REPLACE FUNCTION public.sum_settlement_queue_totals(
  p_organization_id uuid,
  p_lane text,
  p_period_start date DEFAULT NULL,
  p_period_end date DEFAULT NULL,
  p_period_anchor date DEFAULT NULL,
  p_min_amount numeric DEFAULT NULL,
  p_service_line text DEFAULT NULL
) RETURNS TABLE(row_count bigint, amount_owed_minor bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, ledger
AS $$
DECLARE
  v_lane text := lower(btrim(COALESCE(p_lane, '')));
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'ORG_REQUIRED';
  END IF;

  IF v_lane = 'pay' OR v_lane = 'company_owes' THEN
    RETURN QUERY
    SELECT
      COUNT(*)::bigint,
      COALESCE(SUM(ROUND((ABS(p.settlement_amount) * 100)::numeric)), 0)::bigint
    FROM ledger.driver_financial_periods p
    WHERE p.organization_id = p_organization_id
      AND p.settlement_status = 'company_owes'
      AND p.settlement_amount > 0.005
      AND (p_period_anchor IS NULL OR p.period_anchor = p_period_anchor)
      AND (p_period_start IS NULL OR p.period_anchor >= p_period_start)
      AND (p_period_end IS NULL OR p.period_anchor <= p_period_end)
      AND (p_min_amount IS NULL OR p_min_amount <= 0 OR p.settlement_amount >= p_min_amount)
      AND public.dfp_service_line_matches(p.metadata, p_service_line);

  ELSIF v_lane = 'driver_owes' THEN
    RETURN QUERY
    SELECT
      COUNT(*)::bigint,
      COALESCE(SUM(ROUND((ABS(p.settlement_amount) * 100)::numeric)), 0)::bigint
    FROM ledger.driver_financial_periods p
    WHERE p.organization_id = p_organization_id
      AND p.settlement_status = 'driver_owes'
      AND p.settlement_amount < -0.005
      AND (p_period_anchor IS NULL OR p.period_anchor = p_period_anchor)
      AND (p_period_start IS NULL OR p.period_anchor >= p_period_start)
      AND (p_period_end IS NULL OR p.period_anchor <= p_period_end)
      AND (p_min_amount IS NULL OR p_min_amount <= 0 OR p.settlement_amount <= -p_min_amount)
      AND public.dfp_service_line_matches(p.metadata, p_service_line);

  ELSIF v_lane = 'cash_held' THEN
    RETURN QUERY
    SELECT
      COUNT(*)::bigint,
      COALESCE(SUM(ROUND((GREATEST(p.cash_still_held, 0) * 100)::numeric)), 0)::bigint
    FROM ledger.driver_financial_periods p
    WHERE p.organization_id = p_organization_id
      AND COALESCE(p.cash_still_held, 0) > 0.005
      AND (
        COALESCE(p.settlement_status, '') = 'pending'
        OR COALESCE(p.fuel_finalized, false) = false
      )
      AND COALESCE(p.settlement_status, '') NOT IN ('company_owes', 'driver_owes', 'settled')
      AND (p_period_anchor IS NULL OR p.period_anchor = p_period_anchor)
      AND (p_period_start IS NULL OR p.period_anchor >= p_period_start)
      AND (p_period_end IS NULL OR p.period_anchor <= p_period_end)
      AND (p_min_amount IS NULL OR p_min_amount <= 0 OR p.cash_still_held >= p_min_amount)
      AND public.dfp_service_line_matches(p.metadata, p_service_line);

  ELSE
    RAISE EXCEPTION 'UNKNOWN_LANE: %', p_lane;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.sum_settlement_queue_totals(uuid, text, date, date, date, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sum_settlement_queue_totals(uuid, text, date, date, date, numeric, text) TO service_role;

COMMENT ON FUNCTION public.sum_settlement_queue_totals IS
  'N-2: exact count + SUM minor for settlement desk queue totals (no PostgREST row cap).';
