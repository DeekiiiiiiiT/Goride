-- Disk IO P1 (docs/supabase-disk-io-optimization-plan.md / unified-ledger-disk-io-audit.md).
-- !! Original Part 1 used work_mem = '8MB' and caused a full API outage (PostgREST lowercases
--    unit suffixes → '8mb' rejected). Reverted by 20261020231600. This file is patched to
--    unitless 8192 (kB) so fresh branch replay stays API-safe. Do NOT reintroduce unit suffixes.
-- 1) API-role work_mem: list-path sorts spill to temp at the 2 MB default. Role-scoped.
--    Rollback: alter role <role> reset work_mem;
alter role service_role  set work_mem = 8192;
alter role authenticated set work_mem = 8192;

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
