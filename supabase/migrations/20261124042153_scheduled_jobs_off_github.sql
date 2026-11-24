-- Move the three scheduled jobs that ran on GitHub Actions into pg_cron (24 Nov 2026).
-- GitHub stopped running them when the repo went private and the free minutes ran out.
-- Same times as the old GitHub schedules (UTC). Same calls: each job only wakes an edge
-- function that already ran on Supabase.
--   fuel-period-auto-close  daily 14:00   fleet-fuel-cron {"job":"auto-close"} -> /fuel/periods/auto-close?orgId=all
--   rush-pass-renew         daily 13:00   rush-cron /internal/pricing/rush-pass/renew (Growth Guarantee stays manual)
--   petrojam-weekly-sync    Thu   17:00   petrojam-prices /cron/sync-latest (accepts the fleet cron secret itself)

CREATE OR REPLACE FUNCTION private.invoke_fuel_period_auto_close()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'net', 'private'
AS $function$
DECLARE
  secret text;
  req_id bigint;
BEGIN
  SELECT value INTO secret FROM private.fleet_ops_secrets WHERE name = 'fleet_cron_secret';
  IF secret IS NULL OR length(secret) < 8 THEN
    RAISE EXCEPTION 'fleet_cron_secret missing';
  END IF;
  SELECT net.http_post(
    url := 'https://csfllzzastacofsvcdsc.supabase.co/functions/v1/fleet-fuel-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Fleet-Cron-Secret', secret
    ),
    body := jsonb_build_object('job', 'auto-close'),
    timeout_milliseconds := 120000
  ) INTO req_id;
  RETURN req_id;
END;
$function$;

CREATE OR REPLACE FUNCTION private.invoke_petrojam_sync()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'net', 'private'
AS $function$
DECLARE
  secret text;
  req_id bigint;
BEGIN
  SELECT value INTO secret FROM private.fleet_ops_secrets WHERE name = 'fleet_cron_secret';
  IF secret IS NULL OR length(secret) < 8 THEN
    RAISE EXCEPTION 'fleet_cron_secret missing';
  END IF;
  SELECT net.http_post(
    url := 'https://csfllzzastacofsvcdsc.supabase.co/functions/v1/petrojam-prices/cron/sync-latest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Fleet-Cron-Secret', secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) INTO req_id;
  RETURN req_id;
END;
$function$;

REVOKE ALL ON FUNCTION private.invoke_fuel_period_auto_close() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.invoke_petrojam_sync() FROM PUBLIC, anon, authenticated, service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed; skipping schedules';
    RETURN;
  END IF;
  PERFORM cron.unschedule(jobid) FROM cron.job
    WHERE jobname IN ('fuel-period-auto-close', 'rush-pass-renew', 'petrojam-weekly-sync');
  PERFORM cron.schedule('fuel-period-auto-close', '0 14 * * *',
    $c$SELECT private.invoke_fuel_period_auto_close();$c$);
  PERFORM cron.schedule('rush-pass-renew', '0 13 * * *',
    $c$SELECT private.invoke_rush_delivery('/internal/pricing/rush-pass/renew');$c$);
  PERFORM cron.schedule('petrojam-weekly-sync', '0 17 * * 4',
    $c$SELECT private.invoke_petrojam_sync();$c$);
END;
$$;
