-- Disk IO wave 1. Does not touch work_mem.
-- Resets work_mem (same as 20261020231600, which production applied by hand),
-- adds the transactions index, slows only the Rush config cron, revokes anon
-- on the ledger view, and replaces the unused driver-ledger function with a
-- skip-count flag. The hand-applied revert version is recorded separately so
-- this migration does not write schema_migrations while the runner does.

alter role service_role reset work_mem;
alter role authenticated reset work_mem;

create index if not exists fleet_transactions_driver_date_idx
  on fleet.transactions (driver_id, date, id);

do $cron$
declare
  jid bigint;
begin
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;
  select jobid into jid from cron.job where jobname = 'rush-config-apply-pending';
  if jid is not null then
    perform cron.alter_job(jid, schedule := '*/5 * * * *');
  end if;
end
$cron$;

-- Screens read the ledger through the edge function (service_role). Anon must
-- not hold the default public-view grants. Authenticated already lost SELECT;
-- drop the leftover write grants and do not grant SELECT back.
revoke all on table public.ledger_entries from anon, public;
revoke insert, update, delete, truncate, references, trigger on table public.ledger_entries from authenticated;

drop function if exists public.ledger_entries_for_driver(text, uuid, text[], text[], timestamptz, timestamptz, int, int);

create function public.ledger_entries_for_driver(
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
    hits as (
      select e.* from public.ledger_entries e
      where e.debit_account_id in (select accts.id from accts)
      union
      select e.* from public.ledger_entries e
      where e.credit_account_id in (select accts.id from accts)
    ),
    filtered as (
      select h.* from hits h
      where (p_org is null or h.organization_id = p_org)
        and (p_products is null or h.product = any (p_products))
        and (p_entry_types is null or h.entry_type = any (p_entry_types))
        and (p_from is null or h.effective_at >= p_from)
        and (p_to is null or h.effective_at <= p_to)
    )
    select
      f.id, f.organization_id, f.idempotency_key, f.entry_type, f.product,
      f.debit_account_id, f.credit_account_id, f.amount_minor, f.currency,
      f.request_hash, f.effective_at, f.reference_type, f.reference_id,
      f.metadata, f.created_by_user_id, f.created_at, 0::bigint
    from filtered f
    order by f.effective_at desc, f.id desc
    limit v_limit
    offset v_offset;
    return;
  end if;

  return query
  with accts as (
    select a.id
    from public.ledger_accounts a
    where starts_with(a.account_key, 'user:' || p_driver_id || ':driver:')
  ),
  hits as (
    select e.* from public.ledger_entries e
    where e.debit_account_id in (select accts.id from accts)
    union
    select e.* from public.ledger_entries e
    where e.credit_account_id in (select accts.id from accts)
  ),
  filtered as (
    select h.* from hits h
    where (p_org is null or h.organization_id = p_org)
      and (p_products is null or h.product = any (p_products))
      and (p_entry_types is null or h.entry_type = any (p_entry_types))
      and (p_from is null or h.effective_at >= p_from)
      and (p_to is null or h.effective_at <= p_to)
  )
  select
    f.id, f.organization_id, f.idempotency_key, f.entry_type, f.product,
    f.debit_account_id, f.credit_account_id, f.amount_minor, f.currency,
    f.request_hash, f.effective_at, f.reference_type, f.reference_id,
    f.metadata, f.created_by_user_id, f.created_at, count(*) over ()
  from filtered f
  order by f.effective_at desc, f.id desc
  limit v_limit
  offset v_offset;
end;
$$;

revoke all on function public.ledger_entries_for_driver(text, uuid, text[], text[], timestamptz, timestamptz, int, int, boolean)
  from public, anon, authenticated;
grant execute on function public.ledger_entries_for_driver(text, uuid, text[], text[], timestamptz, timestamptz, int, int, boolean)
  to service_role;

notify pgrst, 'reload schema';
