-- Maintenance rebuild step 3: the minute cron that wakes the manual page worker.
--
-- A database job has no login token, so the worker function (maintenance-manual-worker) is deployed with
-- verify_jwt = false and checks this secret itself. Same shape as 20261126090807_part_picture_cron.sql.

CREATE OR REPLACE FUNCTION private.maintenance_manual_functions_url(path text)
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

ALTER FUNCTION private.maintenance_manual_functions_url(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.maintenance_manual_functions_url(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.maintenance_manual_functions_url(text) TO postgres;

-- Every minute: the worker reads a few pages, inside its own time budget.
CREATE OR REPLACE FUNCTION private.invoke_maintenance_manual_worker()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'net', 'private'
AS $$
DECLARE
  secret text;
  req_id bigint;
BEGIN
  -- Nothing to read: no call, no net row. Only a due queued page or a dead lease wakes the worker.
  IF NOT EXISTS (
    SELECT 1 FROM public.maintenance_manual_page_job j
    WHERE (j.status = 'queued' AND j.next_attempt_at <= now())
       OR (j.status = 'reading' AND j.lease_until < now())
  ) THEN
    RETURN NULL;
  END IF;

  SELECT value INTO secret FROM private.fleet_ops_secrets WHERE name = 'fleet_cron_secret';
  IF secret IS NULL OR length(secret) < 8 THEN
    RAISE EXCEPTION 'fleet_cron_secret missing';
  END IF;

  SELECT net.http_post(
    url := private.maintenance_manual_functions_url('maintenance-manual-worker/run'),
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

ALTER FUNCTION private.invoke_maintenance_manual_worker() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.invoke_maintenance_manual_worker() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.invoke_maintenance_manual_worker() TO postgres;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'maintenance-manual-worker';
    PERFORM cron.schedule(
      'maintenance-manual-worker',
      '* * * * *',
      $cron$SELECT private.invoke_maintenance_manual_worker();$cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron missing; skipped maintenance-manual-worker cron job';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
