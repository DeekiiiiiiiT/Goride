-- Part-picture worker cron (docs/part-pictures-audit.md §3.3, PP-20).
--
-- A database job has no login token, so a direct call to platform-catalog is refused (401). The job therefore
-- goes through fleet-picture-cron, which has verify_jwt = false, checks the fleet cron secret and forwards to
-- platform-catalog with the service-role key. Same pattern as 20261117050423_vehicle_picture_cron_relay.sql.
--
-- Additive only. The logbook line lives in the SQL pasted on production (docs/part_pictures_LIVE_apply.sql).

CREATE OR REPLACE FUNCTION private.part_picture_functions_url(path text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'private'
AS $$
DECLARE
  base text;
BEGIN
  SELECT value INTO base FROM private.fleet_ops_secrets WHERE name = 'functions_base_url';
  base := COALESCE(
    NULLIF(rtrim(base, '/'), ''),
    'https://csfllzzastacofsvcdsc.supabase.co/functions/v1'
  );
  RETURN base || '/' || ltrim(path, '/');
END;
$$;

ALTER FUNCTION private.part_picture_functions_url(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.part_picture_functions_url(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.part_picture_functions_url(text) TO postgres;

-- Every 2 minutes: the relay forwards to platform-catalog's internal part-pictures run route.
CREATE OR REPLACE FUNCTION private.invoke_part_picture_worker()
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
    url := private.part_picture_functions_url('fleet-picture-cron/parts-run'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Fleet-Cron-Secret', secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) INTO req_id;
  RETURN req_id;
END;
$$;

ALTER FUNCTION private.invoke_part_picture_worker() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.invoke_part_picture_worker() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.invoke_part_picture_worker() TO postgres;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'part-picture-worker';
    PERFORM cron.schedule(
      'part-picture-worker',
      '*/2 * * * *',
      $cron$SELECT private.invoke_part_picture_worker();$cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron missing; skipped part-picture-worker cron job';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
