-- Schedule Driver Activity presence sweeper + ingest every minute (when pg_cron + net available).

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('fleet-activity-presence-sweep');
    EXCEPTION
      WHEN OTHERS THEN NULL;
    END;
    BEGIN
      PERFORM cron.unschedule('fleet-activity-ingest');
    EXCEPTION
      WHEN OTHERS THEN NULL;
    END;

    PERFORM cron.schedule(
      'fleet-activity-presence-sweep',
      '* * * * *',
      $job$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url', true) || '/functions/v1/fleet-core/make-server-37f42386/internal/activity/presence-sweep',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.cron_secret', true),
          'X-Fleet-Cron-Secret', current_setting('app.settings.cron_secret', true)
        ),
        body := '{}'::jsonb
      );
      $job$
    );

    PERFORM cron.schedule(
      'fleet-activity-ingest',
      '* * * * *',
      $job$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url', true) || '/functions/v1/fleet-core/make-server-37f42386/internal/activity/ingest',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.cron_secret', true),
          'X-Fleet-Cron-Secret', current_setting('app.settings.cron_secret', true)
        ),
        body := '{"lanes":"rides,presence,delivery,admin"}'::jsonb
      );
      $job$
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron not available; schedule activity presence-sweep/ingest on fleet-core manually.';
END;
$cron$;
