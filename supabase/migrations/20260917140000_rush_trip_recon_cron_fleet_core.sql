-- F5 external callers: rush trip-recon cron → fleet-core (shim will be retired).
-- Live job was still posting to make-server-37f42386/rush/trip-recon/cron.

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('rush-trip-recon-daily');
    EXCEPTION
      WHEN OTHERS THEN NULL;
    END;
    PERFORM cron.schedule(
      'rush-trip-recon-daily',
      '30 3 * * *',
      $job$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url', true) || '/functions/v1/fleet-core/rush/trip-recon/cron',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.cron_secret', true)
        ),
        body := '{}'::jsonb
      );
      $job$
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron not available; schedule rush-trip-recon-daily on fleet-core manually.';
END;
$cron$;

NOTIFY pgrst, 'reload schema';
