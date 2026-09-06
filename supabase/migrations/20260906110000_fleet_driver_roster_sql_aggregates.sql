-- P-2 / N-3: SQL aggregates for Drivers roster & ledger/drivers-summary (no 100k JS fold).

CREATE OR REPLACE FUNCTION public.fleet_fare_earnings_by_driver(
  p_org_id text DEFAULT NULL,
  p_today date DEFAULT (CURRENT_DATE),
  p_month_start date DEFAULT NULL,
  p_month_end date DEFAULT NULL
)
RETURNS TABLE (
  driver_id text,
  lifetime_earnings numeric,
  monthly_earnings numeric,
  today_earnings numeric,
  lifetime_trip_count bigint,
  monthly_trip_count bigint,
  today_trip_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ledger, public
AS $$
  WITH bounds AS (
    SELECT
      p_today AS today,
      COALESCE(
        p_month_start,
        date_trunc('month', p_today::timestamp)::date
      ) AS month_start,
      COALESCE(
        p_month_end,
        (date_trunc('month', p_today::timestamp) + interval '1 month' - interval '1 day')::date
      ) AS month_end
  ),
  fare AS (
    SELECT
      NULLIF(trim(COALESCE(e.metadata->>'driverId', '')), '') AS driver_id,
      e.organization_id::text AS organization_id,
      (e.effective_at AT TIME ZONE 'UTC')::date AS entry_date,
      COALESCE(
        NULLIF(e.metadata->>'grossAmount', '')::numeric,
        abs(e.amount_minor::numeric) / 100.0
      ) AS gross
    FROM ledger.entries e
    WHERE e.entry_type = 'fare_earning'
      AND e.product = ANY (ARRAY['roam_driver', 'roam_fleet'])
  )
  SELECT
    f.driver_id,
    ROUND(COALESCE(SUM(f.gross), 0)::numeric, 2) AS lifetime_earnings,
    ROUND(COALESCE(SUM(f.gross) FILTER (
      WHERE f.entry_date >= b.month_start AND f.entry_date <= b.month_end
    ), 0)::numeric, 2) AS monthly_earnings,
    ROUND(COALESCE(SUM(f.gross) FILTER (WHERE f.entry_date = b.today), 0)::numeric, 2) AS today_earnings,
    COUNT(*)::bigint AS lifetime_trip_count,
    COUNT(*) FILTER (
      WHERE f.entry_date >= b.month_start AND f.entry_date <= b.month_end
    )::bigint AS monthly_trip_count,
    COUNT(*) FILTER (WHERE f.entry_date = b.today)::bigint AS today_trip_count
  FROM fare f
  CROSS JOIN bounds b
  WHERE f.driver_id IS NOT NULL
    AND f.driver_id <> 'unknown'
    AND (
      p_org_id IS NULL
      OR f.organization_id IS NULL
      OR lower(f.organization_id) = 'roam-default-org'
      OR f.organization_id = p_org_id
    )
  GROUP BY f.driver_id;
$$;

REVOKE ALL ON FUNCTION public.fleet_fare_earnings_by_driver(text, date, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fleet_fare_earnings_by_driver(text, date, date, date) TO service_role;

-- Prefer periods SUM when rebuilt weeks cover roster earnings (lifetime / month / trip_count).
CREATE OR REPLACE FUNCTION public.fleet_period_earnings_by_driver(
  p_org_id text DEFAULT NULL,
  p_today date DEFAULT (CURRENT_DATE),
  p_month_start date DEFAULT NULL,
  p_month_end date DEFAULT NULL
)
RETURNS TABLE (
  driver_id text,
  lifetime_earnings numeric,
  monthly_earnings numeric,
  lifetime_trip_count bigint,
  monthly_trip_count bigint,
  period_row_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ledger, public
AS $$
  WITH bounds AS (
    SELECT
      COALESCE(
        p_month_start,
        date_trunc('month', p_today::timestamp)::date
      ) AS month_start,
      COALESCE(
        p_month_end,
        (date_trunc('month', p_today::timestamp) + interval '1 month' - interval '1 day')::date
      ) AS month_end
  )
  SELECT
    p.driver_id,
    ROUND(COALESCE(SUM(p.earnings_gross), 0)::numeric, 2) AS lifetime_earnings,
    ROUND(COALESCE(SUM(p.earnings_gross) FILTER (
      WHERE p.period_end >= b.month_start AND p.period_anchor <= b.month_end
    ), 0)::numeric, 2) AS monthly_earnings,
    COALESCE(SUM(p.trip_count), 0)::bigint AS lifetime_trip_count,
    COALESCE(SUM(p.trip_count) FILTER (
      WHERE p.period_end >= b.month_start AND p.period_anchor <= b.month_end
    ), 0)::bigint AS monthly_trip_count,
    COUNT(*)::bigint AS period_row_count
  FROM ledger.driver_financial_periods p
  CROSS JOIN bounds b
  WHERE p.driver_id IS NOT NULL
    AND trim(p.driver_id) <> ''
    AND (
      p_org_id IS NULL
      OR p.organization_id IS NULL
      OR lower(p.organization_id::text) = 'roam-default-org'
      OR p.organization_id::text = p_org_id
    )
  GROUP BY p.driver_id;
$$;

REVOKE ALL ON FUNCTION public.fleet_period_earnings_by_driver(text, date, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fleet_period_earnings_by_driver(text, date, date, date) TO service_role;

-- N-3: trip status buckets without transferring full trip JSON.
CREATE OR REPLACE FUNCTION public.fleet_trip_status_buckets_by_driver(
  p_org_id text DEFAULT NULL,
  p_today date DEFAULT (CURRENT_DATE)
)
RETURNS TABLE (
  driver_id text,
  total bigint,
  completed bigint,
  cancelled bigint,
  todays_trips bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = fleet, public
AS $$
  SELECT
    NULLIF(trim(t.driver_id), '') AS driver_id,
    COUNT(*)::bigint AS total,
    COUNT(*) FILTER (WHERE t.status = 'Completed')::bigint AS completed,
    COUNT(*) FILTER (WHERE t.status = 'Cancelled')::bigint AS cancelled,
    COUNT(*) FILTER (WHERE t.date = p_today)::bigint AS todays_trips
  FROM fleet.trips t
  WHERE t.driver_id IS NOT NULL
    AND trim(t.driver_id) <> ''
    AND trim(t.driver_id) <> 'unknown'
    AND (
      p_org_id IS NULL
      OR t.organization_id IS NULL
      OR lower(t.organization_id) = 'roam-default-org'
      OR t.organization_id = p_org_id
    )
  GROUP BY NULLIF(trim(t.driver_id), '');
$$;

REVOKE ALL ON FUNCTION public.fleet_trip_status_buckets_by_driver(text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fleet_trip_status_buckets_by_driver(text, date) TO service_role;
