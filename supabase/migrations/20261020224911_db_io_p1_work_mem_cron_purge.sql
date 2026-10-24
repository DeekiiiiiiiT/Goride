-- Disk IO P1 (docs/supabase-disk-io-optimization-plan.md).
-- !! Part 1 CAUSED A FULL API OUTAGE and was reverted by 20261020231600 — see that file.
-- 1) API-role work_mem: list-path sorts (~6 MB of wide ledger/trip rows) were spilling to temp
--    files at the 2 MB default — 1.4 TB written on a 387 MB database. Role-scoped, not global.
--    PostgREST applies impersonated-role settings per request.
--    Rollback: alter role <role> reset work_mem;
alter role service_role  set work_mem = '8MB';
alter role authenticated set work_mem = '8MB';

-- 2) pg_cron history was never purged (419,813 rows; 7 jobs fire every minute).
--    Keep 7 days. A fresh database has no pg_cron, so the schedule is skipped there.
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'purge-cron-run-details-7d',
      '40 5 * * *',
      $job$delete from cron.job_run_details where end_time < now() - interval '7 days'$job$
    );
  END IF;
END
$cron$;

notify pgrst, 'reload config';
