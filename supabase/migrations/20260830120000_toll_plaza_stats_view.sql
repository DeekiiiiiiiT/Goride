-- Per-plaza toll aggregates, computed in SQL instead of shipped as a dead
-- zero-initialised object on every plaza record.
--
-- Only real passages count: top-ups are money into the tag, not a plaza
-- crossing, and voided rows were reversed so they never belong in a total.

create or replace view fleet.v_toll_plaza_stats as
select
  l.organization_id,
  l.plaza_id,
  count(*)::bigint                         as total_transactions,
  coalesce(sum(abs(l.amount)), 0)::numeric as total_spend,
  coalesce(avg(abs(l.amount)), 0)::numeric as avg_amount,
  max(l.date)                              as last_transaction_date,
  max(l.updated_at)                        as last_updated
from fleet.toll_ledger l
where l.plaza_id is not null
  and coalesce(l.type, 'usage') = 'usage'
  and coalesce(l.status, '') <> 'voided'
  and coalesce((l.metadata ->> 'voided')::boolean, false) = false
group by l.organization_id, l.plaza_id;

comment on view fleet.v_toll_plaza_stats is
  'Toll passage counts and spend per plaza. Excludes top-ups and voided rows. Source of truth for TollPlaza.stats.';

-- The view inherits fleet.toll_ledger RLS through security_invoker.
alter view fleet.v_toll_plaza_stats set (security_invoker = on);

grant select on fleet.v_toll_plaza_stats to authenticated, service_role;

-- Aggregating by plaza is the hot path for the Toll Database page.
create index if not exists idx_toll_ledger_org_plaza
  on fleet.toll_ledger (organization_id, plaza_id)
  where plaza_id is not null;
