-- Matching hygiene: TTL for orphaned matching rides + global offer expiry (pg_cron).
-- Edge reconcile still advances waves; this backstop runs without rider polls or Edge cron.

ALTER TABLE rides.dispatch_settings
  ADD COLUMN IF NOT EXISTS max_matching_duration_minutes INTEGER NOT NULL DEFAULT 15
    CHECK (max_matching_duration_minutes BETWEEN 2 AND 120);

COMMENT ON COLUMN rides.dispatch_settings.max_matching_duration_minutes IS
  'Auto-cancel matching rides older than this (system, cancel_reason matching_timeout).';

-- Expire all overdue pending offers (unblocks wave advancement on next Edge reconcile).
CREATE OR REPLACE FUNCTION public.rides_expire_all_pending_offers(p_now TIMESTAMPTZ DEFAULT NOW())
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = rides, public
AS $$
  WITH updated AS (
    UPDATE rides.driver_offers
    SET status = 'expired'
    WHERE status = 'pending'
      AND expires_at <= p_now
    RETURNING 1
  )
  SELECT COUNT(*)::INTEGER FROM updated;
$$;

REVOKE ALL ON FUNCTION public.rides_expire_all_pending_offers(TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rides_expire_all_pending_offers(TIMESTAMPTZ) TO service_role;

-- Cancel matching rides that exceeded max_matching_duration_minutes.
CREATE OR REPLACE FUNCTION public.rides_cancel_stale_matching_rides(p_now TIMESTAMPTZ DEFAULT NOW())
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rides, public
AS $$
DECLARE
  max_min INTEGER;
  cancelled_count INTEGER;
BEGIN
  SELECT COALESCE(max_matching_duration_minutes, 15)
  INTO max_min
  FROM rides.dispatch_settings
  WHERE id = 1;

  max_min := GREATEST(2, LEAST(120, COALESCE(max_min, 15)));

  PERFORM public.rides_expire_all_pending_offers(p_now);

  WITH cancelled AS (
    UPDATE rides.ride_requests
    SET
      status = 'cancelled',
      cancelled_by = 'system',
      cancel_reason = 'matching_timeout',
      updated_at = p_now
    WHERE status = 'matching'
      AND created_at < p_now - (max_min || ' minutes')::INTERVAL
    RETURNING id
  )
  SELECT COUNT(*)::INTEGER INTO cancelled_count FROM cancelled;

  RETURN COALESCE(cancelled_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.rides_cancel_stale_matching_rides(TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rides_cancel_stale_matching_rides(TIMESTAMPTZ) TO service_role;

CREATE OR REPLACE FUNCTION public.rides_run_matching_hygiene()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rides, public
AS $$
DECLARE
  p_now TIMESTAMPTZ := NOW();
  expired_offers INTEGER;
  cancelled_rides INTEGER;
BEGIN
  expired_offers := public.rides_expire_all_pending_offers(p_now);
  cancelled_rides := public.rides_cancel_stale_matching_rides(p_now);
  RETURN jsonb_build_object(
    'expired_offers', expired_offers,
    'cancelled_rides', cancelled_rides,
    'ran_at', p_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rides_run_matching_hygiene() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rides_run_matching_hygiene() TO service_role;

-- Schedule every minute when pg_cron is available (Supabase hosted).
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('rides-matching-hygiene');

    PERFORM cron.schedule(
      'rides-matching-hygiene',
      '* * * * *',
      $$SELECT public.rides_run_matching_hygiene();$$
    );
  END IF;
EXCEPTION
  WHEN undefined_table OR undefined_object OR insufficient_privilege THEN
    RAISE NOTICE 'pg_cron not available; schedule rides_run_matching_hygiene manually or use Edge reconcile cron.';
  WHEN OTHERS THEN
    RAISE NOTICE 'rides-matching-hygiene cron schedule skipped: %', SQLERRM;
END;
$cron$;

NOTIFY pgrst, 'reload schema';
