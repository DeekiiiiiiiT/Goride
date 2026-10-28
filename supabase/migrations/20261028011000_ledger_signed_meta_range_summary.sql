-- R3/R4/R6: signed reversals in read models, narrow meta on page, week_summary
-- Mon–Sun guard + ledger.range_summary (day grain). One pgrst reload at end (R9).

-- ---------------------------------------------------------------------------
-- R3 helpers
-- ---------------------------------------------------------------------------
create or replace function ledger._entry_is_reversal(p_metadata jsonb)
returns boolean
language sql
immutable
as $fn$
  select lower(coalesce(p_metadata->>'reversal', '')) in ('true', 't', '1');
$fn$;

create or replace function ledger._entry_signed_minor(p_metadata jsonb, p_amount_minor bigint)
returns bigint
language sql
immutable
as $fn$
  select case
    when ledger._entry_is_reversal(p_metadata) then -abs(p_amount_minor)
    else p_amount_minor
  end;
$fn$;

create or replace function ledger._entry_signed_gross_minor(p_metadata jsonb, p_amount_minor bigint)
returns bigint
language sql
immutable
as $fn$
  select case
    when ledger._entry_is_reversal(p_metadata)
      then -abs(ledger._entry_gross_minor(p_metadata, p_amount_minor))
    else ledger._entry_gross_minor(p_metadata, p_amount_minor)
  end;
$fn$;

revoke all on function ledger._entry_is_reversal(jsonb) from public;
revoke all on function ledger._entry_signed_minor(jsonb, bigint) from public;
revoke all on function ledger._entry_signed_gross_minor(jsonb, bigint) from public;
grant execute on function ledger._entry_is_reversal(jsonb) to service_role;
grant execute on function ledger._entry_signed_minor(jsonb, bigint) to service_role;
grant execute on function ledger._entry_signed_gross_minor(jsonb, bigint) to service_role;

-- Narrow meta for page rows (R4) — not full metadata.
create or replace function ledger._entry_page_meta(p_metadata jsonb)
returns jsonb
language sql
immutable
as $fn$
  select jsonb_build_object(
    'reversal', case when ledger._entry_is_reversal(p_metadata) then true else null end,
    'grossAmount', nullif(p_metadata->>'grossAmount', ''),
    'periodStart', nullif(p_metadata->>'periodStart', ''),
    'periodEnd', nullif(p_metadata->>'periodEnd', ''),
    'paymentMethod', nullif(p_metadata->>'paymentMethod', ''),
    'category', nullif(p_metadata->>'category', ''),
    'bankRole', nullif(p_metadata->>'bankRole', ''),
    'recipient', nullif(p_metadata->>'recipient', ''),
    'source', nullif(p_metadata->>'source', ''),
    'organizationUuid', nullif(p_metadata->>'organizationUuid', ''),
    'weekKey', nullif(p_metadata->>'weekKey', '')
  );
$fn$;

revoke all on function ledger._entry_page_meta(jsonb) from public;
grant execute on function ledger._entry_page_meta(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- R3: statement trigger uses signed amounts
-- ---------------------------------------------------------------------------
create or replace function ledger.entries_maintain_read_models()
returns trigger
language plpgsql
security definer
set search_path = ledger, public, pg_catalog
as $fn$
declare
  r record;
  v_signed bigint;
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
      v_signed := ledger._entry_signed_minor(r.metadata, r.amount_minor);
      v_gross := ledger._entry_signed_gross_minor(r.metadata, r.amount_minor);
      v_recon := case when ledger._entry_reconciled(r.metadata) then 1 else 0 end;
      perform ledger._week_totals_apply(
        r.organization_id, r.week_start, r.driver_id, r.product, r.entry_type,
        r.platform, r.direction,
        -v_signed, -abs(r.amount_minor), -v_gross, -1, -v_recon, null
      );
      perform ledger._batch_totals_apply(
        r.organization_id, r.batch_id, r.driver_id, r.entry_type, -1, -v_signed
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
      v_signed := ledger._entry_signed_minor(r.metadata, r.amount_minor);
      v_gross := ledger._entry_signed_gross_minor(r.metadata, r.amount_minor);
      v_recon := case when ledger._entry_reconciled(r.metadata) then 1 else 0 end;
      perform ledger._week_totals_apply(
        r.organization_id, r.week_start, r.driver_id, r.product, r.entry_type,
        r.platform, r.direction,
        v_signed, abs(r.amount_minor), v_gross, 1, v_recon, r.effective_at
      );
      perform ledger._batch_totals_apply(
        r.organization_id, r.batch_id, r.driver_id, r.entry_type, 1, v_signed
      );
      perform ledger._bump_org_version(r.organization_id);
    end loop;
  end if;

  return null;
end;
$fn$;

-- Rebuild week_totals + batch_totals with signed sums
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
  sum(ledger._entry_signed_minor(e.metadata, e.amount_minor)),
  sum(abs(e.amount_minor)),
  sum(ledger._entry_signed_gross_minor(e.metadata, e.amount_minor)),
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
  sum(ledger._entry_signed_minor(e.metadata, e.amount_minor))
from ledger.entries e
where e.organization_id is not null
  and nullif(e.batch_id, '') is not null
group by 1, 2, 3, 4;

insert into ledger.org_version (organization_id, entry_seq, changed_at)
select organization_id, count(*), max(created_at)
from ledger.entries
where organization_id is not null
group by organization_id;

-- recon_check: live side uses signed sums (totals already signed after rebuild)
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
      sum(ledger._entry_signed_minor(e.metadata, e.amount_minor))::bigint as live_sum_minor,
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

-- ---------------------------------------------------------------------------
-- R6: week_summary Mon–Sun guard
-- ---------------------------------------------------------------------------
create or replace function ledger.week_summary(
  p_org uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_driver_ids uuid[] default null,
  p_entry_types text[] default null,
  p_platform text default null,
  p_direction text default null,
  p_products text[] default null
)
returns table (
  organization_id uuid,
  week_start date,
  driver_id uuid,
  product text,
  entry_type text,
  platform text,
  direction text,
  sum_minor bigint,
  abs_sum_minor bigint,
  gross_minor bigint,
  entry_count bigint,
  reconciled_count bigint,
  last_entry_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ledger, public, pg_catalog
as $fn$
declare
  v_from_ymd date;
  v_to_ymd date;
  v_from_week date;
  v_to_week date;
begin
  if p_org is null then
    raise exception 'ledger.week_summary requires organization_id';
  end if;
  if p_from is null or p_to is null then
    raise exception 'ledger.week_summary requires date range';
  end if;

  -- Callers pass Mon/Sun as UTC calendar dates (…T00:00:00Z / …T23:59:59Z).
  v_from_ymd := p_from::date;
  v_to_ymd := p_to::date;
  if extract(dow from v_from_ymd)::int is distinct from 1 then
    raise exception 'ledger.week_summary requires from to be a Jamaica Monday';
  end if;
  if extract(dow from v_to_ymd)::int is distinct from 0 then
    raise exception 'ledger.week_summary requires to to be a Jamaica Sunday';
  end if;

  v_from_week := ledger.jamaica_week_start(p_from);
  v_to_week := ledger.jamaica_week_start(p_to);

  return query
  select
    t.organization_id,
    t.week_start,
    nullif(t.driver_id, '00000000-0000-0000-0000-000000000000'::uuid) as driver_id,
    t.product,
    t.entry_type,
    nullif(t.platform, '') as platform,
    t.direction,
    t.sum_minor,
    t.abs_sum_minor,
    t.gross_minor,
    t.entry_count,
    t.reconciled_count,
    t.last_entry_at
  from ledger.week_totals t
  where t.organization_id = p_org
    and t.week_start >= v_from_week
    and t.week_start <= v_to_week
    and (
      p_driver_ids is null
      or cardinality(p_driver_ids) = 0
      or t.driver_id = any (select ledger.driver_grain_id(x) from unnest(p_driver_ids) as x)
    )
    and (
      p_entry_types is null
      or cardinality(p_entry_types) = 0
      or t.entry_type = any (p_entry_types)
    )
    and (p_platform is null or t.platform = p_platform)
    and (p_direction is null or t.direction = p_direction)
    and (
      p_products is null
      or cardinality(p_products) = 0
      or t.product = any (p_products)
    )
  order by t.week_start desc, t.entry_type, t.driver_id;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- R6: range_summary — entry_type × day, signed
-- ---------------------------------------------------------------------------
create or replace function ledger.range_summary(
  p_org uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_entry_types text[] default null,
  p_products text[] default null,
  p_driver_ids uuid[] default null,
  p_platform text default null,
  p_direction text default null
)
returns table (
  organization_id uuid,
  day date,
  driver_id uuid,
  product text,
  entry_type text,
  platform text,
  direction text,
  sum_minor bigint,
  abs_sum_minor bigint,
  gross_minor bigint,
  entry_count bigint
)
language plpgsql
stable
security definer
set search_path = ledger, public, pg_catalog
as $fn$
begin
  if p_org is null then
    raise exception 'ledger.range_summary requires organization_id';
  end if;
  if p_from is null or p_to is null then
    raise exception 'ledger.range_summary requires date range';
  end if;

  return query
  select
    e.organization_id,
    (e.effective_at at time zone 'America/Jamaica')::date as day,
    e.driver_id,
    e.product,
    e.entry_type,
    e.platform,
    ledger.entry_direction(e.metadata, da.account_key, ca.account_key) as direction,
    sum(ledger._entry_signed_minor(e.metadata, e.amount_minor))::bigint as sum_minor,
    sum(abs(e.amount_minor))::bigint as abs_sum_minor,
    sum(ledger._entry_signed_gross_minor(e.metadata, e.amount_minor))::bigint as gross_minor,
    count(*)::bigint as entry_count
  from ledger.entries e
  join ledger.accounts da on da.id = e.debit_account_id
  join ledger.accounts ca on ca.id = e.credit_account_id
  where e.organization_id = p_org
    and e.effective_at >= p_from
    and e.effective_at <= p_to
    and (
      p_entry_types is null or cardinality(p_entry_types) = 0
      or e.entry_type = any (p_entry_types)
    )
    and (
      p_products is null or cardinality(p_products) = 0
      or e.product = any (p_products)
    )
    and (
      p_driver_ids is null or cardinality(p_driver_ids) = 0
      or e.driver_id = any (p_driver_ids)
    )
    and (p_platform is null or e.platform = p_platform)
    and (
      p_direction is null
      or ledger.entry_direction(e.metadata, da.account_key, ca.account_key) = p_direction
    )
  group by 1, 2, 3, 4, 5, 6, 7
  order by 2 desc, 5, 3;
end;
$fn$;

revoke all on function ledger.range_summary(uuid, timestamptz, timestamptz, text[], text[], uuid[], text, text) from public;
grant execute on function ledger.range_summary(uuid, timestamptz, timestamptz, text[], text[], uuid[], text, text) to service_role;

create or replace function public.ledger_range_summary(
  p_org uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_entry_types text[] default null,
  p_products text[] default null,
  p_driver_ids uuid[] default null,
  p_platform text default null,
  p_direction text default null
)
returns table (
  organization_id uuid,
  day date,
  driver_id uuid,
  product text,
  entry_type text,
  platform text,
  direction text,
  sum_minor bigint,
  abs_sum_minor bigint,
  gross_minor bigint,
  entry_count bigint
)
language sql
stable
security definer
set search_path = ledger, public
as $fn$
  select * from ledger.range_summary(
    p_org, p_from, p_to, p_entry_types, p_products, p_driver_ids, p_platform, p_direction
  );
$fn$;

revoke all on function public.ledger_range_summary(uuid, timestamptz, timestamptz, text[], text[], uuid[], text, text)
  from public, anon, authenticated;
grant execute on function public.ledger_range_summary(uuid, timestamptz, timestamptz, text[], text[], uuid[], text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- R4: ledger.page / driver_page return meta jsonb
-- ---------------------------------------------------------------------------
drop function if exists public.ledger_page(
  uuid, timestamptz, timestamptz, text[], text[], text, text, uuid[], text, text, boolean, text, bigint, bigint, timestamptz, uuid, int
);
drop function if exists public.ledger_driver_page(
  uuid, timestamptz, timestamptz, uuid[], text[], text[], text, text, timestamptz, uuid, int
);
drop function if exists ledger.driver_page(
  uuid, timestamptz, timestamptz, uuid[], text[], text[], text, text, timestamptz, uuid, int
);
drop function if exists ledger.page(
  uuid, timestamptz, timestamptz, text[], text[], text, text, uuid[], text, text, boolean, text, bigint, bigint, timestamptz, uuid, int
);

create function ledger.page(
  p_org uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_entry_types text[] default null,
  p_products text[] default null,
  p_platform text default null,
  p_direction text default null,
  p_driver_ids uuid[] default null,
  p_batch_id text default null,
  p_vehicle_id text default null,
  p_reconciled boolean default null,
  p_search text default null,
  p_amount_min_minor bigint default null,
  p_amount_max_minor bigint default null,
  p_after_effective_at timestamptz default null,
  p_after_id uuid default null,
  p_limit int default 50
)
returns table (
  id uuid,
  organization_id uuid,
  entry_type text,
  product text,
  amount_minor bigint,
  currency text,
  effective_at timestamptz,
  created_at timestamptz,
  reference_type text,
  reference_id text,
  driver_id uuid,
  platform text,
  batch_id text,
  direction text,
  is_reconciled boolean,
  vehicle_id text,
  description text,
  meta jsonb,
  has_more boolean
)
language plpgsql
stable
security definer
set search_path = ledger, public, pg_catalog
as $fn$
declare
  v_limit int := greatest(1, least(coalesce(p_limit, 50), 200));
begin
  if p_org is null then
    raise exception 'ledger.page requires organization_id';
  end if;
  if p_from is null or p_to is null then
    raise exception 'ledger.page requires date range';
  end if;

  return query
  with filtered as (
    select
      e.id,
      e.organization_id,
      e.entry_type,
      e.product,
      e.amount_minor,
      e.currency,
      e.effective_at,
      e.created_at,
      e.reference_type,
      e.reference_id,
      e.driver_id,
      e.platform,
      e.batch_id,
      ledger.entry_direction(e.metadata, da.account_key, ca.account_key) as direction,
      ledger._entry_reconciled(e.metadata) as is_reconciled,
      nullif(e.metadata->>'vehicleId', '') as vehicle_id,
      nullif(e.metadata->>'description', '') as description,
      ledger._entry_page_meta(e.metadata) as meta
    from ledger.entries e
    join ledger.accounts da on da.id = e.debit_account_id
    join ledger.accounts ca on ca.id = e.credit_account_id
    where e.organization_id = p_org
      and e.effective_at >= p_from
      and e.effective_at <= p_to
      and (
        p_entry_types is null or cardinality(p_entry_types) = 0
        or e.entry_type = any (p_entry_types)
      )
      and (
        p_products is null or cardinality(p_products) = 0
        or e.product = any (p_products)
      )
      and (p_platform is null or e.platform = p_platform)
      and (
        p_driver_ids is null or cardinality(p_driver_ids) = 0
        or e.driver_id = any (p_driver_ids)
      )
      and (p_batch_id is null or e.batch_id = p_batch_id)
      and (
        p_vehicle_id is null
        or e.metadata->>'vehicleId' = p_vehicle_id
      )
      and (
        p_reconciled is null
        or ledger._entry_reconciled(e.metadata) = p_reconciled
      )
      and (
        p_search is null
        or e.metadata->>'description' ilike '%' || p_search || '%'
        or e.reference_id ilike '%' || p_search || '%'
        or e.batch_id ilike '%' || p_search || '%'
      )
      and (p_amount_min_minor is null or e.amount_minor >= p_amount_min_minor)
      and (p_amount_max_minor is null or e.amount_minor <= p_amount_max_minor)
      and (
        p_after_effective_at is null
        or (e.effective_at, e.id) < (p_after_effective_at, p_after_id)
      )
      and (
        p_direction is null
        or ledger.entry_direction(e.metadata, da.account_key, ca.account_key) = p_direction
      )
    order by e.effective_at desc, e.id desc
    limit v_limit + 1
  )
  select
    f.id,
    f.organization_id,
    f.entry_type,
    f.product,
    f.amount_minor,
    f.currency,
    f.effective_at,
    f.created_at,
    f.reference_type,
    f.reference_id,
    f.driver_id,
    f.platform,
    f.batch_id,
    f.direction,
    f.is_reconciled,
    f.vehicle_id,
    f.description,
    f.meta,
    (count(*) over () > v_limit) as has_more
  from filtered f
  order by f.effective_at desc, f.id desc
  limit v_limit;
end;
$fn$;

revoke all on function ledger.page(
  uuid, timestamptz, timestamptz, text[], text[], text, text, uuid[], text, text, boolean, text, bigint, bigint, timestamptz, uuid, int
) from public;
grant execute on function ledger.page(
  uuid, timestamptz, timestamptz, text[], text[], text, text, uuid[], text, text, boolean, text, bigint, bigint, timestamptz, uuid, int
) to service_role;

create function public.ledger_page(
  p_org uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_entry_types text[] default null,
  p_products text[] default null,
  p_platform text default null,
  p_direction text default null,
  p_driver_ids uuid[] default null,
  p_batch_id text default null,
  p_vehicle_id text default null,
  p_reconciled boolean default null,
  p_search text default null,
  p_amount_min_minor bigint default null,
  p_amount_max_minor bigint default null,
  p_after_effective_at timestamptz default null,
  p_after_id uuid default null,
  p_limit int default 50
)
returns table (
  id uuid,
  organization_id uuid,
  entry_type text,
  product text,
  amount_minor bigint,
  currency text,
  effective_at timestamptz,
  created_at timestamptz,
  reference_type text,
  reference_id text,
  driver_id uuid,
  platform text,
  batch_id text,
  direction text,
  is_reconciled boolean,
  vehicle_id text,
  description text,
  meta jsonb,
  has_more boolean
)
language sql
stable
security definer
set search_path = ledger, public
as $fn$
  select * from ledger.page(
    p_org, p_from, p_to, p_entry_types, p_products, p_platform, p_direction,
    p_driver_ids, p_batch_id, p_vehicle_id, p_reconciled, p_search,
    p_amount_min_minor, p_amount_max_minor, p_after_effective_at, p_after_id, p_limit
  );
$fn$;

revoke all on function public.ledger_page(
  uuid, timestamptz, timestamptz, text[], text[], text, text, uuid[], text, text, boolean, text, bigint, bigint, timestamptz, uuid, int
) from public, anon, authenticated;
grant execute on function public.ledger_page(
  uuid, timestamptz, timestamptz, text[], text[], text, text, uuid[], text, text, boolean, text, bigint, bigint, timestamptz, uuid, int
) to service_role;

create function ledger.driver_page(
  p_org uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_driver_ids uuid[],
  p_entry_types text[] default null,
  p_products text[] default null,
  p_platform text default null,
  p_direction text default null,
  p_after_effective_at timestamptz default null,
  p_after_id uuid default null,
  p_limit int default 50
)
returns table (
  id uuid,
  organization_id uuid,
  entry_type text,
  product text,
  amount_minor bigint,
  currency text,
  effective_at timestamptz,
  created_at timestamptz,
  reference_type text,
  reference_id text,
  driver_id uuid,
  platform text,
  batch_id text,
  direction text,
  is_reconciled boolean,
  vehicle_id text,
  description text,
  meta jsonb,
  has_more boolean
)
language plpgsql
stable
security definer
set search_path = ledger, public, pg_catalog
as $fn$
begin
  if p_org is null then
    raise exception 'ledger.driver_page requires organization_id';
  end if;
  if p_from is null or p_to is null then
    raise exception 'ledger.driver_page requires date range';
  end if;
  if p_driver_ids is null or cardinality(p_driver_ids) = 0 then
    raise exception 'ledger.driver_page requires driver_ids';
  end if;

  return query
  select * from ledger.page(
    p_org, p_from, p_to, p_entry_types, p_products, p_platform, p_direction,
    p_driver_ids, null, null, null, null, null, null,
    p_after_effective_at, p_after_id, p_limit
  );
end;
$fn$;

revoke all on function ledger.driver_page(
  uuid, timestamptz, timestamptz, uuid[], text[], text[], text, text, timestamptz, uuid, int
) from public;
grant execute on function ledger.driver_page(
  uuid, timestamptz, timestamptz, uuid[], text[], text[], text, text, timestamptz, uuid, int
) to service_role;

create function public.ledger_driver_page(
  p_org uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_driver_ids uuid[],
  p_entry_types text[] default null,
  p_products text[] default null,
  p_platform text default null,
  p_direction text default null,
  p_after_effective_at timestamptz default null,
  p_after_id uuid default null,
  p_limit int default 50
)
returns table (
  id uuid,
  organization_id uuid,
  entry_type text,
  product text,
  amount_minor bigint,
  currency text,
  effective_at timestamptz,
  created_at timestamptz,
  reference_type text,
  reference_id text,
  driver_id uuid,
  platform text,
  batch_id text,
  direction text,
  is_reconciled boolean,
  vehicle_id text,
  description text,
  meta jsonb,
  has_more boolean
)
language sql
stable
security definer
set search_path = ledger, public
as $fn$
  select * from ledger.driver_page(
    p_org, p_from, p_to, p_driver_ids, p_entry_types, p_products,
    p_platform, p_direction, p_after_effective_at, p_after_id, p_limit
  );
$fn$;

revoke all on function public.ledger_driver_page(
  uuid, timestamptz, timestamptz, uuid[], text[], text[], text, text, timestamptz, uuid, int
) from public, anon, authenticated;
grant execute on function public.ledger_driver_page(
  uuid, timestamptz, timestamptz, uuid[], text[], text[], text, text, timestamptz, uuid, int
) to service_role;

-- R9: one reload at end of this batch
NOTIFY pgrst, 'reload schema';
