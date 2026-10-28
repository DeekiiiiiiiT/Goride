-- Perf audit Wave 4: driver_directory_stats as materialized view + hourly refresh

DROP VIEW IF EXISTS public.driver_directory_stats;
DROP VIEW IF EXISTS rides.driver_directory_stats;

CREATE MATERIALIZED VIEW rides.driver_directory_stats AS
WITH trips AS (
  SELECT
    assigned_driver_user_id AS driver_user_id,
    COUNT(*)::INTEGER AS total_trips,
    COUNT(*) FILTER (WHERE status = 'completed')::INTEGER AS completed_trips,
    COUNT(*) FILTER (WHERE status = 'cancelled')::INTEGER AS cancelled_trips,
    MAX(created_at) AS last_ride_at,
    COALESCE(
      SUM(COALESCE(fare_final_minor, fare_estimate_minor))
        FILTER (WHERE status = 'completed'),
      0
    )::BIGINT AS lifetime_earnings_minor,
    COALESCE(
      SUM(COALESCE(fare_final_minor, fare_estimate_minor))
        FILTER (WHERE status = 'completed' AND payment_method = 'cash'),
      0
    )::BIGINT AS lifetime_cash_earnings_minor,
    COALESCE(
      SUM(COALESCE(fare_final_minor, fare_estimate_minor))
        FILTER (WHERE status = 'completed' AND payment_method = 'card'),
      0
    )::BIGINT AS lifetime_digital_earnings_minor
  FROM rides.ride_requests
  WHERE assigned_driver_user_id IS NOT NULL
  GROUP BY assigned_driver_user_id
),
offers AS (
  SELECT
    driver_user_id,
    COUNT(*)::INTEGER AS offers_sent,
    COUNT(*) FILTER (WHERE status = 'accepted')::INTEGER AS offers_accepted,
    COUNT(*) FILTER (WHERE status = 'declined')::INTEGER AS offers_declined
  FROM rides.driver_offers
  GROUP BY driver_user_id
)
SELECT
  dp.user_id AS driver_user_id,
  COALESCE(t.total_trips, 0) AS total_trips,
  COALESCE(t.completed_trips, 0) AS completed_trips,
  COALESCE(t.cancelled_trips, 0) AS cancelled_trips,
  COALESCE(o.offers_sent, 0) AS offers_sent,
  COALESCE(o.offers_accepted, 0) AS offers_accepted,
  COALESCE(o.offers_declined, 0) AS offers_declined,
  CASE
    WHEN COALESCE(o.offers_sent, 0) > 0 THEN
      ROUND(100.0 * COALESCE(o.offers_accepted, 0)::NUMERIC / o.offers_sent, 1)
    ELSE NULL
  END AS acceptance_rate_pct,
  CASE
    WHEN COALESCE(t.total_trips, 0) > 0 THEN
      ROUND(100.0 * COALESCE(t.completed_trips, 0)::NUMERIC / t.total_trips, 1)
    ELSE NULL
  END AS completion_rate_pct,
  t.last_ride_at,
  COALESCE(t.lifetime_earnings_minor, 0) AS lifetime_earnings_minor,
  COALESCE(t.lifetime_cash_earnings_minor, 0) AS lifetime_cash_earnings_minor,
  COALESCE(t.lifetime_digital_earnings_minor, 0) AS lifetime_digital_earnings_minor,
  dl.updated_at AS last_online_at
FROM public.driver_profiles dp
LEFT JOIN trips t ON t.driver_user_id = dp.user_id
LEFT JOIN offers o ON o.driver_user_id = dp.user_id
LEFT JOIN rides.driver_locations dl ON dl.user_id = dp.user_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_driver_directory_stats_driver_user_id
  ON rides.driver_directory_stats (driver_user_id);

CREATE OR REPLACE VIEW public.driver_directory_stats
  WITH (security_invoker = true)
AS
  SELECT * FROM rides.driver_directory_stats;

GRANT SELECT ON rides.driver_directory_stats TO service_role;
GRANT SELECT ON public.driver_directory_stats TO service_role;

CREATE OR REPLACE FUNCTION rides.refresh_driver_directory_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rides, public, pg_temp
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY rides.driver_directory_stats;
END;
$$;

REVOKE ALL ON FUNCTION rides.refresh_driver_directory_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rides.refresh_driver_directory_stats() TO service_role;

-- Initial non-concurrent refresh already done by CREATE MATERIALIZED VIEW.
-- Schedule hourly concurrent refresh.
DO $cron$
DECLARE
  existing_jobid bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    SELECT jobid INTO existing_jobid FROM cron.job WHERE jobname = 'refresh_driver_directory_stats_hourly';
    IF existing_jobid IS NOT NULL THEN
      PERFORM cron.unschedule(existing_jobid);
    END IF;
    PERFORM cron.schedule(
      'refresh_driver_directory_stats_hourly',
      '20 * * * *',
      'SELECT rides.refresh_driver_directory_stats()'
    );
  END IF;
END
$cron$;

NOTIFY pgrst, 'reload schema';
