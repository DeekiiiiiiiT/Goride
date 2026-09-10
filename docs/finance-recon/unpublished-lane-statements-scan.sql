-- Read-only: open driver weeks where fuel/toll/earnings seal is missing or not closed.
-- Product path is Close Week silent sync (POST prepare), not UPDATE.
-- Pair with toll-period-seal-drift-scan.sql for the heal backlog.

with open_periods as (
  select organization_id, period_anchor as week_key, driver_id
  from public.driver_financial_periods
  where coalesce((metadata->'financeCore'->>'signedAt'), '') = ''
    and coalesce(settlement_status, '') is distinct from 'signed'
),
latest_stmt as (
  select distinct on (organization_id, driver_id, week_key, kind)
    organization_id, driver_id, week_key, kind, status, version
  from ledger.week_statements
  order by organization_id, driver_id, week_key, kind, version desc
)
select
  op.week_key,
  count(*) filter (
    where ls_fuel.status is null or ls_fuel.status is distinct from 'closed'
  )::int as fuel_unpublished,
  count(*) filter (
    where ls_toll.status is null or ls_toll.status is distinct from 'closed'
  )::int as toll_unpublished,
  count(*) filter (
    where ls_earn.status is null or ls_earn.status is distinct from 'closed'
  )::int as earnings_unpublished,
  count(*)::int as open_drivers
from open_periods op
left join latest_stmt ls_fuel
  on ls_fuel.organization_id = op.organization_id
 and ls_fuel.driver_id = op.driver_id
 and ls_fuel.week_key = op.week_key
 and ls_fuel.kind = 'fuel'
left join latest_stmt ls_toll
  on ls_toll.organization_id = op.organization_id
 and ls_toll.driver_id = op.driver_id
 and ls_toll.week_key = op.week_key
 and ls_toll.kind = 'toll'
left join latest_stmt ls_earn
  on ls_earn.organization_id = op.organization_id
 and ls_earn.driver_id = op.driver_id
 and ls_earn.week_key = op.week_key
 and ls_earn.kind = 'earnings'
where (ls_fuel.status is null or ls_fuel.status is distinct from 'closed')
   or (ls_toll.status is null or ls_toll.status is distinct from 'closed')
   or (ls_earn.status is null or ls_earn.status is distinct from 'closed')
group by op.week_key
order by op.week_key;
