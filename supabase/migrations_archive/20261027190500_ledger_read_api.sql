-- Phase 3: ledger read API — week_summary, page, entry_detail, driver_page.
-- Org + date range required. No OFFSET. Narrow columns on page. Limit ≤ 200.

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
  v_from_week date;
  v_to_week date;
begin
  if p_org is null then
    raise exception 'ledger.week_summary requires organization_id';
  end if;
  if p_from is null or p_to is null then
    raise exception 'ledger.week_summary requires date range';
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

revoke all on function ledger.week_summary(uuid, timestamptz, timestamptz, uuid[], text[], text, text, text[]) from public;
grant execute on function ledger.week_summary(uuid, timestamptz, timestamptz, uuid[], text[], text, text, text[]) to service_role;

create or replace function public.ledger_week_summary(
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
language sql
stable
security definer
set search_path = ledger, public
as $fn$
  select * from ledger.week_summary(
    p_org, p_from, p_to, p_driver_ids, p_entry_types, p_platform, p_direction, p_products
  );
$fn$;

revoke all on function public.ledger_week_summary(uuid, timestamptz, timestamptz, uuid[], text[], text, text, text[])
  from public, anon, authenticated;
grant execute on function public.ledger_week_summary(uuid, timestamptz, timestamptz, uuid[], text[], text, text, text[])
  to service_role;

create or replace function ledger.page(
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
      nullif(e.metadata->>'description', '') as description
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

create or replace function public.ledger_page(
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

create or replace function ledger.entry_detail(p_org uuid, p_id uuid)
returns table (
  id uuid,
  organization_id uuid,
  idempotency_key text,
  entry_type text,
  product text,
  debit_account_id uuid,
  credit_account_id uuid,
  amount_minor bigint,
  currency text,
  effective_at timestamptz,
  created_at timestamptz,
  reference_type text,
  reference_id text,
  metadata jsonb,
  driver_id uuid,
  platform text,
  batch_id text,
  created_by_user_id uuid
)
language plpgsql
stable
security definer
set search_path = ledger, public, pg_catalog
as $fn$
begin
  if p_org is null then
    raise exception 'ledger.entry_detail requires organization_id';
  end if;
  if p_id is null then
    raise exception 'ledger.entry_detail requires id';
  end if;

  return query
  select
    e.id, e.organization_id, e.idempotency_key, e.entry_type, e.product,
    e.debit_account_id, e.credit_account_id, e.amount_minor, e.currency,
    e.effective_at, e.created_at, e.reference_type, e.reference_id, e.metadata,
    e.driver_id, e.platform, e.batch_id, e.created_by_user_id
  from ledger.entries e
  where e.organization_id = p_org
    and e.id = p_id;
end;
$fn$;

revoke all on function ledger.entry_detail(uuid, uuid) from public;
grant execute on function ledger.entry_detail(uuid, uuid) to service_role;

create or replace function public.ledger_entry_detail(p_org uuid, p_id uuid)
returns table (
  id uuid,
  organization_id uuid,
  idempotency_key text,
  entry_type text,
  product text,
  debit_account_id uuid,
  credit_account_id uuid,
  amount_minor bigint,
  currency text,
  effective_at timestamptz,
  created_at timestamptz,
  reference_type text,
  reference_id text,
  metadata jsonb,
  driver_id uuid,
  platform text,
  batch_id text,
  created_by_user_id uuid
)
language sql
stable
security definer
set search_path = ledger, public
as $fn$
  select * from ledger.entry_detail(p_org, p_id);
$fn$;

revoke all on function public.ledger_entry_detail(uuid, uuid) from public, anon, authenticated;
grant execute on function public.ledger_entry_detail(uuid, uuid) to service_role;

create or replace function ledger.driver_page(
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

create or replace function public.ledger_driver_page(
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

-- Batch totals read helper
create or replace function public.ledger_batch_totals(p_org uuid, p_batch_id text)
returns table (
  organization_id uuid,
  batch_id text,
  driver_id uuid,
  entry_type text,
  entry_count bigint,
  sum_minor bigint
)
language plpgsql
stable
security definer
set search_path = ledger, public, pg_catalog
as $fn$
begin
  if p_org is null then
    raise exception 'ledger_batch_totals requires organization_id';
  end if;
  if nullif(p_batch_id, '') is null then
    raise exception 'ledger_batch_totals requires batch_id';
  end if;

  return query
  select
    t.organization_id,
    t.batch_id,
    nullif(t.driver_id, '00000000-0000-0000-0000-000000000000'::uuid),
    t.entry_type,
    t.entry_count,
    t.sum_minor
  from ledger.batch_totals t
  where t.organization_id = p_org
    and t.batch_id = p_batch_id;
end;
$fn$;

revoke all on function public.ledger_batch_totals(uuid, text) from public, anon, authenticated;
grant execute on function public.ledger_batch_totals(uuid, text) to service_role;

create or replace function public.ledger_org_version(p_org uuid)
returns table (organization_id uuid, entry_seq bigint, changed_at timestamptz)
language plpgsql
stable
security definer
set search_path = ledger, public, pg_catalog
as $fn$
begin
  if p_org is null then
    raise exception 'ledger_org_version requires organization_id';
  end if;
  return query
  select o.organization_id, o.entry_seq, o.changed_at
  from ledger.org_version o
  where o.organization_id = p_org;
end;
$fn$;

revoke all on function public.ledger_org_version(uuid) from public, anon, authenticated;
grant execute on function public.ledger_org_version(uuid) to service_role;
