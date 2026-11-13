-- Toll rebuild Phase 2 P2-R6: run the matcher sweep on a schedule (Part F, P2-R5 starting brief item 3).
-- Same door pattern as the fuel / recon timers: pg_cron → fleet-toll-cron (cron secret) → fleet-toll
-- /internal/toll-matcher-sweep (service key). The database only wakes the door when the matcher queue has work,
-- so an empty queue costs one indexed read and no HTTP call.

CREATE OR REPLACE FUNCTION private.invoke_toll_matcher_sweep()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'net', 'private'
AS $$
DECLARE
  secret text;
  req_id bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM toll.match_queue) THEN
    RETURN NULL;
  END IF;
  SELECT value INTO secret FROM private.fleet_ops_secrets WHERE name = 'fleet_cron_secret';
  IF secret IS NULL OR length(secret) < 8 THEN
    RAISE EXCEPTION 'fleet_cron_secret missing';
  END IF;
  SELECT net.http_post(
    url := 'https://csfllzzastacofsvcdsc.supabase.co/functions/v1/fleet-toll-cron',
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

ALTER FUNCTION private.invoke_toll_matcher_sweep() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.invoke_toll_matcher_sweep() FROM PUBLIC, anon, authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'toll-v2-matcher-sweep';
    PERFORM cron.schedule('toll-v2-matcher-sweep', '*/10 * * * *', $cron$SELECT private.invoke_toll_matcher_sweep()$cron$);
  ELSE
    RAISE NOTICE 'pg_cron missing; skipped toll-v2-matcher-sweep';
  END IF;
END $$;
