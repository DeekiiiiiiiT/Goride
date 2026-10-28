-- Phase 2 / L-6 L-8: week_totals, batch_totals, org_version + statement triggers + backfill + recon_check.
-- Null driver_id is stored as sentinel 00000000-0000-0000-0000-000000000000 for a clean primary key.

create or replace function ledger.driver_grain_id(p_driver uuid)
returns uuid
language sql
immutable
as $fn$
  select coalesce(p_driver, '00000000-0000-0000-0000-000000000000'::uuid);
$fn$;

create table if not exists ledger.week_totals (
  organization_id uuid not null,
  week_start date not null,
  driver_id uuid not null default '00000000-0000-0000-0000-000000000000'::uuid,
  product text not null,
  entry_type text not null,
  platform text not null default '',
  direction text not null default 'inflow',
  sum_minor bigint not null default 0,
  abs_sum_minor bigint not null default 0,
  gross_minor bigint not null default 0,
  entry_count bigint not null default 0,
  reconciled_count bigint not null default 0,
  last_entry_at timestamptz,
  primary key (organization_id, week_start, driver_id, product, entry_type, platform, direction)
);

create index if not exists week_totals_org_week_idx
  on ledger.week_totals (organization_id, week_start);
create index if not exists week_totals_org_driver_week_idx
  on ledger.week_totals (organization_id, driver_id, week_start)
  where driver_id <> '00000000-0000-0000-0000-000000000000'::uuid;

create table if not exists ledger.batch_totals (
  organization_id uuid not null,
  batch_id text not null,
  driver_id uuid not null default '00000000-0000-0000-0000-000000000000'::uuid,
  entry_type text not null,
  entry_count bigint not null default 0,
  sum_minor bigint not null default 0,
  primary key (organization_id, batch_id, driver_id, entry_type)
);

create index if not exists batch_totals_org_batch_idx
  on ledger.batch_totals (organization_id, batch_id);

create table if not exists ledger.org_version (
  organization_id uuid primary key,
  entry_seq bigint not null default 0,
  changed_at timestamptz not null default now()
);

create or replace function ledger._week_totals_apply(
  p_org uuid,
  p_week date,
  p_driver uuid,
  p_product text,
  p_entry_type text,
  p_platform text,
  p_direction text,
  p_sum bigint,
  p_abs bigint,
  p_gross bigint,
  p_count bigint,
  p_recon bigint,
  p_last timestamptz
)
returns void
language plpgsql
security definer
set search_path = ledger, public, pg_catalog
as $fn$
declare
  v_driver uuid := ledger.driver_grain_id(p_driver);
begin
  if p_org is null or p_week is null or p_product is null or p_entry_type is null then
    return;
  end if;

  insert into ledger.week_totals as t (
    organization_id, week_start, driver_id, product, entry_type, platform, direction,
    sum_minor, abs_sum_minor, gross_minor, entry_count, reconciled_count, last_entry_at
  ) values (
    p_org, p_week, v_driver, p_product, p_entry_type,
    coalesce(p_platform, ''), coalesce(p_direction, 'inflow'),
    p_sum, p_abs, p_gross, p_count, p_recon, p_last
  )
  on conflict (organization_id, week_start, driver_id, product, entry_type, platform, direction)
  do update set
    sum_minor = t.sum_minor + excluded.sum_minor,
    abs_sum_minor = t.abs_sum_minor + excluded.abs_sum_minor,
    gross_minor = t.gross_minor + excluded.gross_minor,
    entry_count = t.entry_count + excluded.entry_count,
    reconciled_count = t.reconciled_count + excluded.reconciled_count,
    last_entry_at = greatest(t.last_entry_at, excluded.last_entry_at);

  delete from ledger.week_totals
  where organization_id = p_org
    and week_start = p_week
    and driver_id = v_driver
    and product = p_product
    and entry_type = p_entry_type
    and platform = coalesce(p_platform, '')
    and direction = coalesce(p_direction, 'inflow')
    and entry_count = 0;
end;
$fn$;

create or replace function ledger._batch_totals_apply(
  p_org uuid,
  p_batch text,
  p_driver uuid,
  p_entry_type text,
  p_count bigint,
  p_sum bigint
)
returns void
language plpgsql
security definer
set search_path = ledger, public, pg_catalog
as $fn$
declare
  v_driver uuid := ledger.driver_grain_id(p_driver);
begin
  if p_org is null or nullif(p_batch, '') is null or p_entry_type is null then
    return;
  end if;

  insert into ledger.batch_totals as t (
    organization_id, batch_id, driver_id, entry_type, entry_count, sum_minor
  ) values (
    p_org, p_batch, v_driver, p_entry_type, p_count, p_sum
  )
  on conflict (organization_id, batch_id, driver_id, entry_type)
  do update set
    entry_count = t.entry_count + excluded.entry_count,
    sum_minor = t.sum_minor + excluded.sum_minor;

  delete from ledger.batch_totals
  where organization_id = p_org
    and batch_id = p_batch
    and driver_id = v_driver
    and entry_type = p_entry_type
    and entry_count = 0;
end;
$fn$;

create or replace function ledger._entry_gross_minor(p_metadata jsonb, p_amount_minor bigint)
returns bigint
language sql
immutable
as $fn$
  select case
    when nullif(p_metadata->>'grossAmount', '') ~ '^-?[0-9]+(\\.[0-9]+)?$'
      then round((p_metadata->>'grossAmount')::numeric * 100)::bigint
    else abs(p_amount_minor)
  end;
$fn$;

create or replace function ledger._entry_reconciled(p_metadata jsonb)
returns boolean
language sql
immutable
as $fn$
  select lower(coalesce(p_metadata->>'isReconciled', '')) in ('true', 't', '1');
$fn$;

create or replace function ledger._bump_org_version(p_org uuid)
returns void
language plpgsql
security definer
set search_path = ledger, public, pg_catalog
as $fn$
begin
  if p_org is null then
    return;
  end if;
  insert into ledger.org_version as o (organization_id, entry_seq, changed_at)
  values (p_org, 1, now())
  on conflict (organization_id) do update
    set entry_seq = o.entry_seq + 1, changed_at = now();
end;
$fn$;

create or replace function ledger.entries_maintain_read_models()
returns trigger
language plpgsql
security definer
set search_path = ledger, public, pg_catalog
as $fn$
declare
  r record;
  v_gross bigint;
  v_recon int;
begin
  if tg_op in ('DELETE', 'UPDATE') then
    for r in
      select
        d.organization_id,
        ledger.jamaica_week_start(d.effective_at) as week_start,
        d.driver_id,
        d.product,
        d.entry_type,
        coalesce(d.platform, '') as platform,
        ledger.entry_direction(d.metadata, da.account_key, ca.account_key) as direction,
        d.amount_minor,
        d.metadata,
        d.batch_id,
        d.effective_at
      from old_table d
      join ledger.accounts da on da.id = d.debit_account_id
      join ledger.accounts ca on ca.id = d.credit_account_id
    loop
      v_gross := ledger._entry_gross_minor(r.metadata, r.amount_minor);
      v_recon := case when ledger._entry_reconciled(r.metadata) then 1 else 0 end;
      perform ledger._week_totals_apply(
        r.organization_id, r.week_start, r.driver_id, r.product, r.entry_type,
        r.platform, r.direction,
        -r.amount_minor, -abs(r.amount_minor), -v_gross, -1, -v_recon, null
      );
      perform ledger._batch_totals_apply(
        r.organization_id, r.batch_id, r.driver_id, r.entry_type, -1, -r.amount_minor
      );
      perform ledger._bump_org_version(r.organization_id);
    end loop;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    for r in
      select
        n.organization_id,
        ledger.jamaica_week_start(n.effective_at) as week_start,
        n.driver_id,
        n.product,
        n.entry_type,
        coalesce(n.platform, '') as platform,
        ledger.entry_direction(n.metadata, da.account_key, ca.account_key) as direction,
        n.amount_minor,
        n.metadata,
        n.batch_id,
        n.effective_at
      from new_table n
      join ledger.accounts da on da.id = n.debit_account_id
      join ledger.accounts ca on ca.id = n.credit_account_id
    loop
      v_gross := ledger._entry_gross_minor(r.metadata, r.amount_minor);
      v_recon := case when ledger._entry_reconciled(r.metadata) then 1 else 0 end;
      perform ledger._week_totals_apply(
        r.organization_id, r.week_start, r.driver_id, r.product, r.entry_type,
        r.platform, r.direction,
        r.amount_minor, abs(r.amount_minor), v_gross, 1, v_recon, r.effective_at
      );
      perform ledger._batch_totals_apply(
        r.organization_id, r.batch_id, r.driver_id, r.entry_type, 1, r.amount_minor
      );
      perform ledger._bump_org_version(r.organization_id);
    end loop;
  end if;

  return null;
end;
$fn$;

drop trigger if exists trg_ledger_entries_rm_ins on ledger.entries;
drop trigger if exists trg_ledger_entries_rm_upd on ledger.entries;
drop trigger if exists trg_ledger_entries_rm_del on ledger.entries;

create trigger trg_ledger_entries_rm_ins
  after insert on ledger.entries
  referencing new table as new_table
  for each statement
  execute function ledger.entries_maintain_read_models();

create trigger trg_ledger_entries_rm_upd
  after update on ledger.entries
  referencing old table as old_table new table as new_table
  for each statement
  execute function ledger.entries_maintain_read_models();

create trigger trg_ledger_entries_rm_del
  after delete on ledger.entries
  referencing old table as old_table
  for each statement
  execute function ledger.entries_maintain_read_models();

truncate ledger.week_totals;
truncate ledger.batch_totals;
truncate ledger.org_version;

insert into ledger.week_totals (
  organization_id, week_start, driver_id, product, entry_type, platform, direction,
  sum_minor, abs_sum_minor, gross_minor, entry_count, reconciled_count, last_entry_at
)
select
  e.organization_id,
  ledger.jamaica_week_start(e.effective_at),
  ledger.driver_grain_id(e.driver_id),
  e.product,
  e.entry_type,
  coalesce(e.platform, ''),
  ledger.entry_direction(e.metadata, da.account_key, ca.account_key),
  sum(e.amount_minor),
  sum(abs(e.amount_minor)),
  sum(ledger._entry_gross_minor(e.metadata, e.amount_minor)),
  count(*),
  count(*) filter (where ledger._entry_reconciled(e.metadata)),
  max(e.effective_at)
from ledger.entries e
join ledger.accounts da on da.id = e.debit_account_id
join ledger.accounts ca on ca.id = e.credit_account_id
where e.organization_id is not null
group by 1, 2, 3, 4, 5, 6, 7;

insert into ledger.batch_totals (
  organization_id, batch_id, driver_id, entry_type, entry_count, sum_minor
)
select
  e.organization_id,
  e.batch_id,
  ledger.driver_grain_id(e.driver_id),
  e.entry_type,
  count(*),
  sum(e.amount_minor)
from ledger.entries e
where e.organization_id is not null
  and nullif(e.batch_id, '') is not null
group by 1, 2, 3, 4;

insert into ledger.org_version (organization_id, entry_seq, changed_at)
select organization_id, count(*), max(created_at)
from ledger.entries
where organization_id is not null
group by organization_id;

create or replace function ledger.recon_check(p_org uuid)
returns table (
  week_start date,
  driver_id uuid,
  product text,
  entry_type text,
  platform text,
  direction text,
  totals_sum_minor bigint,
  live_sum_minor bigint,
  totals_count bigint,
  live_count bigint
)
language sql
stable
security definer
set search_path = ledger, public, pg_catalog
as $fn$
  with live as (
    select
      e.organization_id,
      ledger.jamaica_week_start(e.effective_at) as week_start,
      ledger.driver_grain_id(e.driver_id) as driver_id,
      e.product,
      e.entry_type,
      coalesce(e.platform, '') as platform,
      ledger.entry_direction(e.metadata, da.account_key, ca.account_key) as direction,
      sum(e.amount_minor)::bigint as live_sum_minor,
      count(*)::bigint as live_count
    from ledger.entries e
    join ledger.accounts da on da.id = e.debit_account_id
    join ledger.accounts ca on ca.id = e.credit_account_id
    where e.organization_id = p_org
    group by 1, 2, 3, 4, 5, 6, 7
  ),
  totals as (
    select *
    from ledger.week_totals t
    where t.organization_id = p_org
  )
  select
    coalesce(t.week_start, l.week_start) as week_start,
    nullif(coalesce(t.driver_id, l.driver_id), '00000000-0000-0000-0000-000000000000'::uuid) as driver_id,
    coalesce(t.product, l.product) as product,
    coalesce(t.entry_type, l.entry_type) as entry_type,
    coalesce(t.platform, l.platform) as platform,
    coalesce(t.direction, l.direction) as direction,
    coalesce(t.sum_minor, 0)::bigint as totals_sum_minor,
    coalesce(l.live_sum_minor, 0)::bigint as live_sum_minor,
    coalesce(t.entry_count, 0)::bigint as totals_count,
    coalesce(l.live_count, 0)::bigint as live_count
  from totals t
  full outer join live l
    on t.organization_id = l.organization_id
   and t.week_start = l.week_start
   and t.driver_id = l.driver_id
   and t.product = l.product
   and t.entry_type = l.entry_type
   and t.platform = l.platform
   and t.direction = l.direction
  where coalesce(t.sum_minor, 0) is distinct from coalesce(l.live_sum_minor, 0)
     or coalesce(t.entry_count, 0) is distinct from coalesce(l.live_count, 0);
$fn$;

revoke all on function ledger.recon_check(uuid) from public;
grant execute on function ledger.recon_check(uuid) to service_role;

create or replace function public.ledger_recon_check(p_org uuid)
returns table (
  week_start date,
  driver_id uuid,
  product text,
  entry_type text,
  platform text,
  direction text,
  totals_sum_minor bigint,
  live_sum_minor bigint,
  totals_count bigint,
  live_count bigint
)
language sql
stable
security definer
set search_path = ledger, public
as $fn$
  select * from ledger.recon_check(p_org);
$fn$;

revoke all on function public.ledger_recon_check(uuid) from public, anon, authenticated;
grant execute on function public.ledger_recon_check(uuid) to service_role;
