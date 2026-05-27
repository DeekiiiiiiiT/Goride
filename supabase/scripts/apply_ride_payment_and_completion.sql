-- Run in Supabase SQL Editor if earnings/trips fail with:
-- "column rides_ride_requests.payment_method does not exist"
--
-- Same as migration 20260526120000_ride_payment_and_completion.sql

ALTER TABLE rides.ride_requests
  ADD COLUMN IF NOT EXISTS payment_method TEXT
    CHECK (payment_method IS NULL OR payment_method IN ('cash', 'card')),
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_rides_requests_driver_completed
  ON rides.ride_requests(assigned_driver_user_id, completed_at DESC)
  WHERE status = 'completed';

UPDATE rides.ride_requests
SET payment_method = 'cash',
    completed_at = COALESCE(completed_at, updated_at)
WHERE status = 'completed' AND payment_method IS NULL;

-- DROP required: CREATE OR REPLACE cannot insert new columns before last_online_at.
DROP VIEW IF EXISTS public.driver_directory_stats;
DROP VIEW IF EXISTS rides.driver_directory_stats;

CREATE VIEW rides.driver_directory_stats AS
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

CREATE VIEW public.driver_directory_stats AS
  SELECT * FROM rides.driver_directory_stats;

GRANT SELECT ON public.driver_directory_stats TO service_role;

-- Refresh PostgREST schema cache (public view picks up new columns via rides.ride_requests)
DROP VIEW IF EXISTS public.rides_ride_requests;
CREATE VIEW public.rides_ride_requests AS
  SELECT * FROM rides.ride_requests;

GRANT SELECT ON public.rides_ride_requests TO service_role;
GRANT SELECT ON public.rides_ride_requests TO authenticated;

NOTIFY pgrst, 'reload schema';
