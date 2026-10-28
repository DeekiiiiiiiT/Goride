-- Round 4: org-scoped lifetime SUM (L-1) + org-wide operational period rebuild + nightly cron.

-- ─── L-1: cheap lifetime totals (org-scoped) ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.fleet_driver_lifetime_totals(
  p_driver_id text,
  p_org_id text
)
RETURNS TABLE (
  lifetime_earnings numeric,
  lifetime_trip_count bigint,
  lifetime_cash_collected numeric,
  lifetime_tolls numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ledger, public
AS $$
  SELECT
    ROUND(COALESCE(SUM(d.earnings_gross), 0)::numeric, 2) AS lifetime_earnings,
    COALESCE(SUM(d.trip_count), 0)::bigint AS lifetime_trip_count,
    ROUND(COALESCE(SUM(d.cash_collected), 0)::numeric, 2) AS lifetime_cash_collected,
    ROUND(COALESCE(SUM(d.toll_spend), 0)::numeric, 2) AS lifetime_tolls
  FROM ledger.driver_financial_periods d
  WHERE d.driver_id = p_driver_id
    AND p_org_id IS NOT NULL
    AND length(trim(p_org_id)) > 0
    AND d.organization_id::text = trim(p_org_id);
$$;

REVOKE ALL ON FUNCTION public.fleet_driver_lifetime_totals(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fleet_driver_lifetime_totals(text, text) TO service_role;

-- ─── Org-wide operational periods rebuild from fleet.trips ───────────────────
-- Week anchors: Monday–Sunday (Postgres date_trunc('week') = Monday).
CREATE OR REPLACE FUNCTION public.fleet_rebuild_operational_periods(
  p_org_id text,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL
)
RETURNS TABLE (
  weeks_upserted bigint,
  drivers_touched bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ledger, fleet, public
AS $$
DECLARE
  v_from date := COALESCE(p_from, (CURRENT_DATE - 400));
  v_to date := COALESCE(p_to, CURRENT_DATE);
  v_weeks bigint := 0;
  v_drivers bigint := 0;
BEGIN
  IF p_org_id IS NULL OR length(trim(p_org_id)) = 0 THEN
    RAISE EXCEPTION 'p_org_id required';
  END IF;

  WITH trip_norm AS (
    SELECT
      t.driver_id,
      COALESCE(
        t.date,
        CASE
          WHEN left(COALESCE(t.payload_json->>'date', ''), 10) ~ '^\d{4}-\d{2}-\d{2}$'
          THEN left(t.payload_json->>'date', 10)::date
          ELSE NULL
        END
      ) AS trip_date,
      lower(COALESCE(t.status, t.payload_json->>'status', '')) AS status_l,
      COALESCE(NULLIF(trim(COALESCE(t.platform, t.payload_json->>'platform', '')), ''), 'Other') AS platform,
      COALESCE(
        NULLIF(t.payload_json->>'distance', '')::numeric,
        NULLIF(t.payload_json->>'distanceKm', '')::numeric,
        NULLIF(t.payload_json->>'tripDistance', '')::numeric,
        0
      ) AS distance_km,
      COALESCE(
        NULLIF(t.payload_json->>'durationMinutes', '')::numeric,
        NULLIF(t.payload_json->>'duration', '')::numeric,
        NULLIF(t.payload_json->>'tripDuration', '')::numeric,
        0
      ) AS duration_minutes,
      COALESCE(
        NULLIF(t.payload_json->>'rating', '')::numeric,
        NULLIF(t.payload_json->>'driverRating', '')::numeric,
        0
      ) AS rating
    FROM fleet.trips t
    WHERE t.driver_id IS NOT NULL
      AND length(trim(t.driver_id)) > 0
      AND (t.organization_id IS NULL OR t.organization_id = trim(p_org_id))
      AND COALESCE(
        t.date,
        CASE
          WHEN left(COALESCE(t.payload_json->>'date', ''), 10) ~ '^\d{4}-\d{2}-\d{2}$'
          THEN left(t.payload_json->>'date', 10)::date
          ELSE NULL
        END
      ) BETWEEN v_from AND v_to
  ),
  trip_week AS (
    SELECT
      driver_id,
      (date_trunc('week', trip_date::timestamp))::date AS period_anchor,
      ((date_trunc('week', trip_date::timestamp))::date + 6) AS period_end,
      status_l,
      platform,
      distance_km,
      duration_minutes,
      rating,
      CASE
        WHEN (status_l LIKE '%complet%' OR status_l = 'complete')
          AND status_l NOT LIKE '%cancel%'
        THEN true
        ELSE false
      END AS is_completed,
      (status_l LIKE '%cancel%') AS is_cancelled
    FROM trip_norm
    WHERE trip_date IS NOT NULL
  ),
  week_agg AS (
    SELECT
      driver_id,
      period_anchor,
      period_end,
      COUNT(*)::int AS trip_count,
      COUNT(*) FILTER (WHERE is_completed)::int AS completed_count,
      COUNT(*) FILTER (WHERE is_cancelled)::int AS cancelled_count,
      ROUND(SUM(distance_km)::numeric, 2) AS distance_km,
      ROUND(SUM(duration_minutes)::numeric, 2) AS duration_minutes,
      ROUND(SUM(CASE WHEN rating > 0 THEN rating ELSE 0 END)::numeric, 2) AS rating_sum,
      COUNT(*) FILTER (WHERE rating > 0)::int AS rating_count
    FROM trip_week
    GROUP BY driver_id, period_anchor, period_end
  ),
  platform_agg AS (
    SELECT
      driver_id,
      period_anchor,
      jsonb_object_agg(
        platform,
        jsonb_build_object(
          'trips', trips,
          'completed', completed,
          'cancelled', cancelled,
          'distanceKm', distance_km,
          'ratingSum', rating_sum,
          'ratingCount', rating_count
        )
      ) AS platform_breakdown
    FROM (
      SELECT
        driver_id,
        period_anchor,
        platform,
        COUNT(*)::int AS trips,
        COUNT(*) FILTER (WHERE is_completed)::int AS completed,
        COUNT(*) FILTER (WHERE is_cancelled)::int AS cancelled,
        ROUND(SUM(distance_km)::numeric, 2) AS distance_km,
        ROUND(SUM(CASE WHEN rating > 0 THEN rating ELSE 0 END)::numeric, 2) AS rating_sum,
        COUNT(*) FILTER (WHERE rating > 0)::int AS rating_count
      FROM trip_week
      GROUP BY driver_id, period_anchor, platform
    ) p
    GROUP BY driver_id, period_anchor
  ),
  upserted AS (
    INSERT INTO ledger.driver_operational_periods AS dop (
      organization_id,
      driver_id,
      period_anchor,
      period_end,
      timezone,
      trip_count,
      completed_count,
      cancelled_count,
      distance_km,
      duration_minutes,
      rating_sum,
      rating_count,
      acceptance_rate,
      cancellation_rate,
      platform_breakdown,
      projected_at,
      updated_at,
      projection_version
    )
    SELECT
      trim(p_org_id)::uuid,
      w.driver_id,
      w.period_anchor,
      w.period_end,
      'America/Jamaica',
      w.trip_count,
      w.completed_count,
      w.cancelled_count,
      w.distance_km,
      w.duration_minutes,
      w.rating_sum,
      w.rating_count,
      CASE
        WHEN (w.completed_count + w.cancelled_count) > 0
        THEN ROUND(
          w.completed_count::numeric / NULLIF(w.completed_count + w.cancelled_count, 0),
          4
        )
        ELSE NULL
      END,
      CASE
        WHEN (w.completed_count + w.cancelled_count) > 0
        THEN ROUND(
          w.cancelled_count::numeric / NULLIF(w.completed_count + w.cancelled_count, 0),
          4
        )
        ELSE NULL
      END,
      COALESCE(pa.platform_breakdown, '{}'::jsonb),
      now(),
      now(),
      1
    FROM week_agg w
    LEFT JOIN platform_agg pa
      ON pa.driver_id = w.driver_id AND pa.period_anchor = w.period_anchor
    ON CONFLICT (driver_id, period_anchor) DO UPDATE SET
      organization_id = EXCLUDED.organization_id,
      period_end = EXCLUDED.period_end,
      trip_count = EXCLUDED.trip_count,
      completed_count = EXCLUDED.completed_count,
      cancelled_count = EXCLUDED.cancelled_count,
      distance_km = EXCLUDED.distance_km,
      duration_minutes = EXCLUDED.duration_minutes,
      rating_sum = EXCLUDED.rating_sum,
      rating_count = EXCLUDED.rating_count,
      acceptance_rate = EXCLUDED.acceptance_rate,
      cancellation_rate = EXCLUDED.cancellation_rate,
      platform_breakdown = EXCLUDED.platform_breakdown,
      projected_at = EXCLUDED.projected_at,
      updated_at = EXCLUDED.updated_at,
      projection_version = EXCLUDED.projection_version
    RETURNING dop.driver_id
  )
  SELECT COUNT(*), COUNT(DISTINCT driver_id)
  INTO v_weeks, v_drivers
  FROM upserted;

  RETURN QUERY SELECT COALESCE(v_weeks, 0), COALESCE(v_drivers, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.fleet_rebuild_operational_periods(text, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fleet_rebuild_operational_periods(text, date, date) TO service_role;

-- Nightly rebuild for every active org (trailing 400 days).
CREATE OR REPLACE FUNCTION private.fleet_rebuild_all_org_operational_periods()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, ledger
AS $$
DECLARE
  r record;
  n integer := 0;
BEGIN
  FOR r IN
    SELECT id::text AS org_id
    FROM public.organizations
    WHERE COALESCE(lower(status), 'active') NOT IN ('archived', 'deleted', 'inactive', 'suspended')
  LOOP
    PERFORM public.fleet_rebuild_operational_periods(r.org_id, CURRENT_DATE - 400, CURRENT_DATE);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION private.fleet_rebuild_all_org_operational_periods() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.fleet_rebuild_all_org_operational_periods() TO postgres;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('fleet-ops-periods-nightly');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    PERFORM cron.schedule(
      'fleet-ops-periods-nightly',
      '20 4 * * *',
      $cmd$SELECT private.fleet_rebuild_all_org_operational_periods();$cmd$
    );
  ELSE
    RAISE NOTICE 'pg_cron not available; run SELECT private.fleet_rebuild_all_org_operational_periods(); manually.';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron schedule skipped: %', SQLERRM;
END;
$cron$;
