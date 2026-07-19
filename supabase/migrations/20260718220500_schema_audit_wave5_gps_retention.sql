-- Schema audit Wave 5: GPS retention purge + nightly cron

CREATE OR REPLACE FUNCTION rides.purge_old_location_updates(p_keep_days int DEFAULT 30)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rides, pg_temp
AS $$
DECLARE
  deleted_count bigint;
BEGIN
  IF p_keep_days IS NULL OR p_keep_days < 1 THEN
    RAISE EXCEPTION 'p_keep_days must be >= 1';
  END IF;

  DELETE FROM rides.ride_location_updates
  WHERE recorded_at < (now() - make_interval(days => p_keep_days));

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION rides.purge_old_location_updates(int) IS
  'Deletes ride GPS pings older than p_keep_days (default 30). Service-role / cron only.';

REVOKE ALL ON FUNCTION rides.purge_old_location_updates(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rides.purge_old_location_updates(int) TO service_role;

-- Nightly purge at 05:15 UTC when pg_cron is available
DO $cron$
DECLARE
  existing_jobid bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    SELECT jobid INTO existing_jobid FROM cron.job WHERE jobname = 'purge_ride_location_updates_30d';
    IF existing_jobid IS NOT NULL THEN
      PERFORM cron.unschedule(existing_jobid);
    END IF;

    PERFORM cron.schedule(
      'purge_ride_location_updates_30d',
      '15 5 * * *',
      'SELECT rides.purge_old_location_updates(30)'
    );
  END IF;
END
$cron$;
