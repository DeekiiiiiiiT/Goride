-- Phase 6: L-10 revoke, L-13 product balances RPC, drop driver OFFSET RPC + duplicate indexes.

-- L-13: sum product balances in SQL (no 10k row fetch).
create or replace function public.ledger_product_balances(p_products text[] default null)
returns table (
  product text,
  total_debits_minor bigint,
  total_credits_minor bigint,
  net_balance_minor bigint,
  balanced boolean
)
language sql
stable
security definer
set search_path = ledger, public, pg_catalog
as $fn$
  with scoped as (
    select
      e.product,
      e.amount_minor,
      e.debit_account_id,
      e.credit_account_id
    from ledger.entries e
    where p_products is null
       or cardinality(p_products) = 0
       or e.product = any (p_products)
  ),
  agg as (
    select
      s.product,
      coalesce(sum(abs(s.amount_minor)) filter (
        where s.debit_account_id is distinct from s.credit_account_id
      ), 0)::bigint as side_minor,
      count(*) filter (where s.debit_account_id = s.credit_account_id)::bigint as self_ref
    from scoped s
    group by s.product
  )
  select
    a.product,
    a.side_minor as total_debits_minor,
    a.side_minor as total_credits_minor,
    0::bigint as net_balance_minor,
    (a.self_ref = 0) as balanced
  from agg a
  order by a.product;
$fn$;

revoke all on function public.ledger_product_balances(text[]) from public, anon, authenticated;
grant execute on function public.ledger_product_balances(text[]) to service_role;

-- L-10: authenticated stays off the view. service_role keeps SELECT for narrow
-- single-row/count paths; bulk select("*") + OFFSET is banned in CI (L-14).
revoke select on ledger.entries from authenticated;

-- Drop OFFSET driver RPC (replaced by ledger.driver_page).
drop function if exists public.ledger_entries_for_driver(
  text, uuid, text[], text[], timestamptz, timestamptz, int, int, boolean
);

-- Duplicate indexes covered by *_eff / product_effective (audit §8).
drop index if exists ledger.idx_ledger_entries_debit;
drop index if exists ledger.idx_ledger_entries_credit;
drop index if exists ledger.idx_ledger_entries_product;
