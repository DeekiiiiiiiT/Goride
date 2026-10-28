-- Driver Activity audit R2 (C3/M6): fix broken HTTP crons.
-- Sweeper → direct SQL (like purge). Ingest → private.invoke + fleet_ops_secrets.

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
    url := 'https://csfllzzastacofsvcdsc.supabase.co/functions/v1/fleet-core/make-server-37f42386/internal/activity/ingest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Fleet-Cron-Secret', secret
    ),
    body := '{"lanes":"rides,presence,delivery,admin"}'::jsonb
  ) INTO req_id;
  RETURN req_id;
END;
$$;

REVOKE ALL ON FUNCTION private.invoke_fleet_activity_ingest() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.invoke_fleet_activity_ingest() TO postgres;

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
    url := 'https://csfllzzastacofsvcdsc.supabase.co/functions/v1/fleet-core/make-server-37f42386/internal/activity/drift-check?day=' || day,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Fleet-Cron-Secret', secret
    ),
    body := '{}'::jsonb
  ) INTO req_id;
  RETURN req_id;
END;
$$;

REVOKE ALL ON FUNCTION private.invoke_fleet_activity_drift_check() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.invoke_fleet_activity_drift_check() TO postgres;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('fleet-activity-presence-sweep');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    BEGIN
      PERFORM cron.unschedule('fleet-activity-ingest');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    BEGIN
      PERFORM cron.unschedule('fleet-activity-drift-check');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- Direct SQL sweeper (no HTTP / app.settings dependency)
    PERFORM cron.schedule(
      'fleet-activity-presence-sweep',
      '* * * * *',
      $$SELECT fleet.sweep_stale_presence(300)$$
    );

    PERFORM cron.schedule(
      'fleet-activity-ingest',
      '* * * * *',
      $$SELECT private.invoke_fleet_activity_ingest()$$
    );

    -- Nightly drift check (ACT-20) — 05:45 UTC, after purge at 05:30
    PERFORM cron.schedule(
      'fleet-activity-drift-check',
      '45 5 * * *',
      $$SELECT private.invoke_fleet_activity_drift_check()$$
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron not available; schedule activity jobs manually.';
END;
$cron$;
