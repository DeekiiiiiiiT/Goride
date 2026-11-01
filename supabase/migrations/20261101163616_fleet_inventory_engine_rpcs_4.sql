-- pg_cron: 06:30 UTC integrity + chain verify
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'fleet-inventory-nightly-integrity';
    PERFORM cron.schedule(
      'fleet-inventory-nightly-integrity',
      '30 6 * * *',
      $cron$SELECT fleet.inv_nightly_integrity(NULL)$cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron missing; skipped fleet-inventory-nightly-integrity';
  END IF;
END $$;
;
