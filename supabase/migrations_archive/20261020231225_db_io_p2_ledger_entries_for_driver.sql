-- Disk IO P2 (docs/supabase-disk-io-optimization-plan.md).
-- listEntriesForDriver filtered `debit_account_id IN (…) OR credit_account_id IN (…)` through
-- PostgREST: the OR defeated both single-column indexes, so every page seq-scanned all of
-- ledger.entries, sorted ~6 MB of wide rows (spilling to temp at 2 MB work_mem) and, with
-- count=exact, scanned again. ~85 GB of temp writes; ~1.7 s per request.
--
-- Fix: one index per side (ordered like the read), and an RPC that resolves the driver's
-- accounts, takes each side through its own index, unions (dedupes rows where the driver is
-- on both sides — same rows the OR returned), and sorts only the driver's rows.
-- Same columns as public.ledger_entries plus total_count (window count of the filtered set).
-- Order adds id as a tie-break so OFFSET pages are stable (effective_at alone was not).

create index if not exists idx_ledger_entries_debit_eff
  on ledger.entries (debit_account_id, effective_at desc, id desc);
create index if not exists idx_ledger_entries_credit_eff
  on ledger.entries (credit_account_id, effective_at desc, id desc);

create or replace function public.ledger_entries_for_driver(
  p_driver_id    text,
  p_org          uuid        default null,
  p_products     text[]      default null,
  p_entry_types  text[]      default null,
  p_from         timestamptz default null,
  p_to           timestamptz default null,
  p_limit        int         default 50,
  p_offset       int         default 0
)
returns table (
  id uuid, organization_id uuid, idempotency_key text, entry_type text, product text,
  debit_account_id uuid, credit_account_id uuid, amount_minor bigint, currency text,
  request_hash text, effective_at timestamptz, reference_type text, reference_id text,
  metadata jsonb, created_by_user_id uuid, created_at timestamptz, total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with accts as (
    select a.id
    from public.ledger_accounts a
    where starts_with(a.account_key, 'user:' || p_driver_id || ':driver:')
  ),
  hits as (
    select e.* from public.ledger_entries e where e.debit_account_id  in (select id from accts)
    union
    select e.* from public.ledger_entries e where e.credit_account_id in (select id from accts)
  ),
  filtered as (
    select h.* from hits h
    where (p_org         is null or h.organization_id = p_org)
      and (p_products    is null or h.product    = any (p_products))
      and (p_entry_types is null or h.entry_type = any (p_entry_types))
      and (p_from        is null or h.effective_at >= p_from)
      and (p_to          is null or h.effective_at <= p_to)
  )
  select f.*, count(*) over () as total_count
  from filtered f
  order by f.effective_at desc, f.id desc
  limit least(greatest(coalesce(p_limit, 50), 0), 1000)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

revoke all on function public.ledger_entries_for_driver(text, uuid, text[], text[], timestamptz, timestamptz, int, int)
  from public, anon, authenticated;
grant execute on function public.ledger_entries_for_driver(text, uuid, text[], text[], timestamptz, timestamptz, int, int)
  to service_role;
