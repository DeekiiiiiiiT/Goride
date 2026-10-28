-- C2 follow-up: strip residual authenticated DML on activity views.
-- Cron: raise pg_net timeout so full ingest (rides lookback) does not 5s-timeout.

REVOKE ALL ON TABLE public.fleet_driver_activity_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.fleet_activity_source_coverage FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.fleet_driver_presence_log FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.fleet_activity_ingest_watermarks FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.fleet_driver_activity_events TO service_role;
GRANT ALL ON TABLE public.fleet_activity_source_coverage TO service_role;
GRANT ALL ON TABLE public.fleet_driver_presence_log TO service_role;
GRANT ALL ON TABLE public.fleet_activity_ingest_watermarks TO service_role;

REVOKE SELECT ON TABLE fleet.driver_activity_events FROM authenticated, anon, PUBLIC;
REVOKE SELECT ON TABLE fleet.activity_source_coverage FROM authenticated, anon, PUBLIC;
GRANT ALL ON TABLE fleet.driver_activity_events TO service_role;
GRANT ALL ON TABLE fleet.activity_source_coverage TO service_role;

CREATE OR REPLACE FUNCTION private.invoke_fleet_activity_ingest()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'net', 'private'
AS $$
DECLARE
  secret text;
  req_id bigint;
BEGIN
  SELECT value INTO secret FROM private.fleet_ops_secrets WHERE name = 'fleet_cron_secret';
  IF secret IS NULL OR length(secret) < 8 THEN
    RAISE EXCEPTION 'fleet_cron_secret missing';
  END IF;
  SELECT net.http_post(
    url := 'https://csfllzzastacofsvcdsc.supabase.co/functions/v1/fleet-activity-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Fleet-Cron-Secret', secret
    ),
    body := '{"lanes":"rides,presence,delivery,admin"}'::jsonb,
    timeout_milliseconds := 120000
  ) INTO req_id;
  RETURN req_id;
END;
$$;

CREATE OR REPLACE FUNCTION private.invoke_fleet_activity_drift_check()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'net', 'private'
AS $$
DECLARE
  secret text;
  req_id bigint;
  day text := (timezone('utc', now())::date - 1)::text;
BEGIN
  SELECT value INTO secret FROM private.fleet_ops_secrets WHERE name = 'fleet_cron_secret';
  IF secret IS NULL OR length(secret) < 8 THEN
    RAISE EXCEPTION 'fleet_cron_secret missing';
  END IF;
  SELECT net.http_post(
    url := 'https://csfllzzastacofsvcdsc.supabase.co/functions/v1/fleet-activity-cron/drift-check?day=' || day,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Fleet-Cron-Secret', secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) INTO req_id;
  RETURN req_id;
END;
$$;

NOTIFY pgrst, 'reload schema';
