-- Ledger unification: pre-change baseline snapshot (SELECT-only, no writes).
--
-- Run this once, before any code in the unified-ledger plan lands, and save the
-- output. Every later phase's verification step (dual-write reconciliation,
-- migration-reorder fix, atomic-RPC fix) diffs against this baseline to prove
-- nothing existing changed. Re-run and diff at each phase checkpoint.
--
-- Run in Supabase Dashboard -> SQL Editor, or `psql` against the project.

-- 1. Rides cash-settlement journal (the double-entry subsystem Phase 4 makes atomic).
select
  'rides.payment_accounts' as source,
  count(*) as row_count,
  sum(balance_minor) as balance_minor_sum,
  count(*) filter (where balance_minor < 0) as negative_balance_count
from rides.payment_accounts;

select
  'rides.payment_journal_entries' as source,
  count(*) as row_count,
  sum(amount_minor) as amount_minor_sum,
  count(distinct entry_type) as distinct_entry_types,
  min(created_at) as earliest_row,
  max(created_at) as latest_row
from rides.payment_journal_entries;

select
  entry_type,
  count(*) as row_count,
  sum(amount_minor) as amount_minor_sum
from rides.payment_journal_entries
group by entry_type
order by entry_type;

-- 2. KV canonical ledger events (driver/fleet earnings) + legacy toll ledger,
--    both stored as JSONB blobs in the generic kv_store_37f42386 table.
select
  'kv_store_37f42386 ledger_event:*' as source,
  count(*) as row_count,
  sum((value->>'netAmount')::numeric) as net_amount_sum
from kv_store_37f42386
where key like 'ledger_event:%';

select
  value->>'eventType' as event_type,
  count(*) as row_count,
  sum((value->>'netAmount')::numeric) as net_amount_sum
from kv_store_37f42386
where key like 'ledger_event:%'
group by value->>'eventType'
order by event_type;

select
  'kv_store_37f42386 toll_ledger:*' as source,
  count(*) as row_count,
  sum((value->>'amount')::numeric) as amount_sum
from kv_store_37f42386
where key like 'toll_ledger:%';

-- 3. rides.ledger_lines (fare-breakdown reporting rows).
select
  'rides.ledger_lines' as source,
  count(*) as row_count,
  sum(paid_to_you_minor) as paid_to_you_minor_sum,
  sum(earnings_gross_minor) as earnings_gross_minor_sum
from rides.ledger_lines;

-- 4. Dash payments schema.
select 'payments.transactions' as source, count(*) as row_count, sum(amount) as amount_sum from payments.transactions;
select 'payments.refunds' as source, count(*) as row_count, sum(amount) as amount_sum from payments.refunds;
select 'payments.merchant_payouts' as source, count(*) as row_count, sum(amount) as amount_sum from payments.merchant_payouts;
select 'payments.courier_payouts' as source, count(*) as row_count, sum(amount) as amount_sum from payments.courier_payouts;

-- 5. Schema fingerprint for the migration-replay bug fix (Phase 3) — confirm this
--    constraint definition is unchanged before/after the file rename.
select
  conname as constraint_name,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'rides.payment_journal_entries'::regclass
  and conname = 'payment_journal_entries_entry_type_check';

-- 6. Currently-applied migration versions, for comparing against a fresh-replay
--    run's `supabase migration list` output.
select version, name
from supabase_migrations.schema_migrations
order by version;
