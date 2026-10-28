-- Driver ledger pages were still sorting full rows, including metadata, before the page cut.
-- Sort and de-dupe on the narrow columns, then load the full row only for the page.
-- Same arguments, grants, and row shape as 20261021023000. No role settings. No schema reload.

create or replace function public.ledger_entries_for_driver(
  p_driver_id    text,
  p_org          uuid        default null,
  p_products     text[]      default null,
  p_entry_types  text[]      default null,
  p_from         timestamptz default null,
  p_to           timestamptz default null,
  p_limit        int         default 50,
  p_offset       int         default 0,
  p_skip_count   boolean     default false
)
returns table (
  id uuid, organization_id uuid, idempotency_key text, entry_type text, product text,
  debit_account_id uuid, credit_account_id uuid, amount_minor bigint, currency text,
  request_hash text, effective_at timestamptz, reference_type text, reference_id text,
  metadata jsonb, created_by_user_id uuid, created_at timestamptz, total_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 50), 0), 1000);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
begin
  if p_skip_count then
    return query
    with accts as (
      select a.id
      from public.ledger_accounts a
      where starts_with(a.account_key, 'user:' || p_driver_id || ':driver:')
    ),
    narrow as (
      select e.id, e.effective_at, e.product, e.entry_type, e.organization_id
      from ledger.entries e
      where e.debit_account_id in (select accts.id from accts)
      union
      select e.id, e.effective_at, e.product, e.entry_type, e.organization_id
      from ledger.entries e
      where e.credit_account_id in (select accts.id from accts)
    ),
    page as (
      select n.id, n.effective_at
      from narrow n
      where (p_org is null or n.organization_id = p_org)
        and (p_products is null or n.product = any (p_products))
        and (p_entry_types is null or n.entry_type = any (p_entry_types))
        and (p_from is null or n.effective_at >= p_from)
        and (p_to is null or n.effective_at <= p_to)
      order by n.effective_at desc, n.id desc
      limit v_limit
      offset v_offset
    )
    select
      e.id, e.organization_id, e.idempotency_key, e.entry_type, e.product,
      e.debit_account_id, e.credit_account_id, e.amount_minor, e.currency,
      e.request_hash, e.effective_at, e.reference_type, e.reference_id,
      e.metadata, e.created_by_user_id, e.created_at, 0::bigint
    from page p
    join public.ledger_entries e on e.id = p.id
    order by p.effective_at desc, p.id desc;
    return;
  end if;

  return query
  with accts as (
    select a.id
    from public.ledger_accounts a
    where starts_with(a.account_key, 'user:' || p_driver_id || ':driver:')
  ),
  narrow as (
    select e.id, e.effective_at, e.product, e.entry_type, e.organization_id
    from ledger.entries e
    where e.debit_account_id in (select accts.id from accts)
    union
    select e.id, e.effective_at, e.product, e.entry_type, e.organization_id
    from ledger.entries e
    where e.credit_account_id in (select accts.id from accts)
  ),
  page as (
    select n.id, n.effective_at, count(*) over () as total
    from narrow n
    where (p_org is null or n.organization_id = p_org)
      and (p_products is null or n.product = any (p_products))
      and (p_entry_types is null or n.entry_type = any (p_entry_types))
      and (p_from is null or n.effective_at >= p_from)
      and (p_to is null or n.effective_at <= p_to)
    order by n.effective_at desc, n.id desc
    limit v_limit
    offset v_offset
  )
  select
    e.id, e.organization_id, e.idempotency_key, e.entry_type, e.product,
    e.debit_account_id, e.credit_account_id, e.amount_minor, e.currency,
    e.request_hash, e.effective_at, e.reference_type, e.reference_id,
    e.metadata, e.created_by_user_id, e.created_at, p.total
  from page p
  join public.ledger_entries e on e.id = p.id
  order by p.effective_at desc, p.id desc;
end;
$$;

revoke all on function public.ledger_entries_for_driver(text, uuid, text[], text[], timestamptz, timestamptz, int, int, boolean)
  from public, anon, authenticated;
grant execute on function public.ledger_entries_for_driver(text, uuid, text[], text[], timestamptz, timestamptz, int, int, boolean)
  to service_role;
