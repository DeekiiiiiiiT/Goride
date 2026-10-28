-- Driver Activity Wave 3: retention purge for projection + presence log (400 days).

CREATE OR REPLACE FUNCTION fleet.purge_old_activity_data(p_keep_days int DEFAULT 400)
RETURNS TABLE(deleted_events bigint, deleted_presence bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, pg_temp
AS $$
DECLARE
  v_events bigint;
  v_presence bigint;
BEGIN
  IF p_keep_days IS NULL OR p_keep_days < 30 THEN
    RAISE EXCEPTION 'p_keep_days must be >= 30';
  END IF;

  DELETE FROM fleet.driver_activity_events
  WHERE occurred_at < (now() - make_interval(days => p_keep_days));
  GET DIAGNOSTICS v_events = ROW_COUNT;

  DELETE FROM fleet.driver_presence_log
  WHERE occurred_at < (now() - make_interval(days => p_keep_days));
  GET DIAGNOSTICS v_presence = ROW_COUNT;

  deleted_events := v_events;
  deleted_presence := v_presence;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION fleet.purge_old_activity_data(int) IS
  'Deletes activity projection + presence log rows older than p_keep_days (default 400). Cron / service_role only.';

REVOKE ALL ON FUNCTION fleet.purge_old_activity_data(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fleet.purge_old_activity_data(int) TO service_role;

CREATE OR REPLACE FUNCTION public.purge_old_activity_data(p_keep_days int DEFAULT 400)
RETURNS TABLE(deleted_events bigint, deleted_presence bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
  SELECT * FROM fleet.purge_old_activity_data(p_keep_days);
$$;
GRANT EXECUTE ON FUNCTION public.purge_old_activity_data(int) TO service_role;

DO $cron$
DECLARE
  existing_jobid bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    SELECT jobid INTO existing_jobid FROM cron.job WHERE jobname = 'purge_fleet_activity_400d';
    IF existing_jobid IS NOT NULL THEN
      PERFORM cron.unschedule(existing_jobid);
    END IF;

    PERFORM cron.schedule(
      'purge_fleet_activity_400d',
      '30 5 * * *',
      'SELECT fleet.purge_old_activity_data(400)'
    );
  END IF;
END
$cron$;
