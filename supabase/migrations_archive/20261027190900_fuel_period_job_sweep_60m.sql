-- After L-7 (fuel hash uses org_version + week_totals): re-enable fuel-period-job-sweep
-- at every 60 minutes instead of */15 (unified-ledger-disk-io-audit §8).

do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule('fuel-period-job-sweep');
    exception when others then
      null;
    end;
    perform cron.schedule(
      'fuel-period-job-sweep',
      '17 * * * *',
      $cmd$select private.invoke_fuel_period_job_sweep();$cmd$
    );
  end if;
end
$cron$;
