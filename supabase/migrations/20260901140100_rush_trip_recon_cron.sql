-- Daily Rush trip reconciliation cron (03:30 UTC)

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('rush-trip-recon-daily');
    PERFORM cron.schedule(
      'rush-trip-recon-daily',
      '30 3 * * *',
      $job$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url', true) || '/functions/v1/make-server-37f42386/rush/trip-recon/cron',
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
  WHEN OTHERS THEN NULL;
END;
$cron$;

COMMENT ON EXTENSION pg_cron IS 'Includes rush-trip-recon-daily when pg_cron and pg_net are available';

NOTIFY pgrst, 'reload schema';
