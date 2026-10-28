-- R22. Keep pg_stat_statements small so the metrics exporter stops spilling.
-- supabase_admin is reserved; we cannot raise its work_mem. The exporter
-- scans this store every 1-2 minutes. Nothing had cleared it since 20 Oct.
-- 04:08 UTC is one minute after ledger-io-snapshots-hourly (minute 7), so
-- each day's top statements are already in private.io_snapshots.

select extensions.pg_stat_statements_reset();

do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule('pgss-daily-reset');
    exception when others then
      null;
    end;
    perform cron.schedule(
      'pgss-daily-reset',
      '8 4 * * *',
      $job$select extensions.pg_stat_statements_reset()$job$
    );
  else
    raise notice 'pg_cron missing; skipped pgss-daily-reset';
  end if;
end
$cron$;
