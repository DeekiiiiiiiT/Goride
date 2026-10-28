-- Unified ledger Disk IO audit Phase 0 / L-12.
-- Hourly snapshots of temp IO + top temp-writing statements so spikes are attributable.
-- Replaces ad-hoc private.io_baseline_20261020 (dropped below). Purge > 14 days (rule 5/6).

create table if not exists private.io_snapshots (
  id bigserial primary key,
  captured_at timestamptz not null default now(),
  temp_bytes bigint not null,
  temp_files bigint not null default 0,
  top_statements jsonb not null default '[]'::jsonb
);

create index if not exists io_snapshots_captured_at_idx
  on private.io_snapshots (captured_at desc);

comment on table private.io_snapshots is
  'Hourly Disk IO attribution: pg_stat_database.temp_bytes + top-20 pg_stat_statements by temp_blks_written.';

create or replace function private.capture_io_snapshot()
returns void
language plpgsql
security definer
set search_path = public, private, extensions, pg_catalog
as $fn$
declare
  v_temp_bytes bigint;
  v_temp_files bigint;
  v_top jsonb;
begin
  select coalesce(temp_bytes, 0), coalesce(temp_files, 0)
  into v_temp_bytes, v_temp_files
  from pg_stat_database
  where datname = current_database();

  select coalesce(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
  into v_top
  from (
    select
      calls,
      total_exec_time::bigint as total_exec_ms,
      (temp_blks_written * 8192)::bigint as temp_bytes,
      left(query, 240) as query
    from extensions.pg_stat_statements
    where temp_blks_written > 0
    order by temp_blks_written desc
    limit 20
  ) t;

  insert into private.io_snapshots (temp_bytes, temp_files, top_statements)
  values (v_temp_bytes, v_temp_files, v_top);

  delete from private.io_snapshots
  where captured_at < now() - interval '14 days';
end;
$fn$;

revoke all on function private.capture_io_snapshot() from public;
grant execute on function private.capture_io_snapshot() to postgres;

-- Daily temp growth helper used by finance-recon alert (L-12).
create or replace function private.io_daily_temp_bytes()
returns bigint
language sql
stable
security definer
set search_path = public, private, pg_catalog
as $fn$
  select greatest(
    0,
    coalesce(
      (select temp_bytes from private.io_snapshots order by captured_at desc limit 1),
      0
    ) - coalesce(
      (
        select temp_bytes
        from private.io_snapshots
        where captured_at <= now() - interval '24 hours'
        order by captured_at desc
        limit 1
      ),
      (
        select temp_bytes from private.io_snapshots order by captured_at asc limit 1
      ),
      0
    )
  );
$fn$;

revoke all on function private.io_daily_temp_bytes() from public;
grant execute on function private.io_daily_temp_bytes() to postgres, service_role;

drop table if exists private.io_baseline_20261020;

do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule('ledger-io-snapshots-hourly');
    exception when others then
      null;
    end;
    perform cron.schedule(
      'ledger-io-snapshots-hourly',
      '7 * * * *',
      $job$select private.capture_io_snapshot();$job$
    );
  end if;
end
$cron$;

-- Seed first row immediately so Phase 0 done-when is satisfied.
select private.capture_io_snapshot();
