-- Finish fuel closes the button queued, every 15 minutes.
-- The door checks the cron secret, then calls the sweeper with the service key.
-- A job is claimed once, so a second sweep cannot post the money twice.

ALTER TABLE public.fuel_reconciliation_period
  ADD COLUMN IF NOT EXISTS close_receipt jsonb;

COMMENT ON COLUMN public.fuel_reconciliation_period.close_receipt IS
  'Statement ids and posted ledger line ids written when a week locks.';

CREATE OR REPLACE FUNCTION private.invoke_fuel_period_job_sweep()
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
    url := 'https://csfllzzastacofsvcdsc.supabase.co/functions/v1/fleet-fuel-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Fleet-Cron-Secret', secret
    ),
    body := '{}'::jsonb
  ) INTO req_id;
  RETURN req_id;
END;
$$;

REVOKE ALL ON FUNCTION private.invoke_fuel_period_job_sweep() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.invoke_fuel_period_job_sweep() TO postgres;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('fuel-period-job-sweep');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    PERFORM cron.schedule(
      'fuel-period-job-sweep',
      '*/15 * * * *',
      $cmd$SELECT private.invoke_fuel_period_job_sweep();$cmd$
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron not available; schedule fuel-period-job-sweep manually.';
END;
$cron$;
