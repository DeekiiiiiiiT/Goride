-- Read-only: open driver weeks where period toll_* disagrees with closed toll seal.
-- Product path is Close Week silent sync (POST …/sync or open the week on Close), not UPDATE.
-- ε matches close invariants (0.01).

with latest_toll as (
  select distinct on (ws.organization_id, ws.driver_id, ws.week_key)
    ws.organization_id,
    ws.driver_id,
    ws.week_key,
    (ws.amounts_minor->>'totalSpend')::bigint as seal_spend_minor,
    (ws.amounts_minor->>'chargedToDriver')::bigint as seal_charged_minor,
    ws.status,
    ws.version
  from ledger.week_statements ws
  where ws.kind = 'toll'
    and ws.status = 'closed'
  order by ws.organization_id, ws.driver_id, ws.week_key, ws.version desc
)
select
  p.organization_id,
  p.period_anchor as week_key,
  p.driver_id,
  p.toll_spend as period_spend,
  (lt.seal_spend_minor::numeric / 100.0) as seal_spend,
  p.toll_charged_to_driver as period_charged,
  (lt.seal_charged_minor::numeric / 100.0) as seal_charged,
  round(abs(coalesce(p.toll_spend, 0) - (lt.seal_spend_minor::numeric / 100.0)), 4) as spend_delta,
  round(
    abs(coalesce(p.toll_charged_to_driver, 0) - (lt.seal_charged_minor::numeric / 100.0)),
    4
  ) as charged_delta
from public.driver_financial_periods p
join latest_toll lt
  on lt.organization_id = p.organization_id
 and lt.driver_id = p.driver_id
 and lt.week_key = p.period_anchor
where coalesce((p.metadata->'financeCore'->>'signedAt'), '') = ''
  and coalesce(p.settlement_status, '') is distinct from 'signed'
  and (
    abs(coalesce(p.toll_spend, 0) - (lt.seal_spend_minor::numeric / 100.0)) > 0.01
    or abs(coalesce(p.toll_charged_to_driver, 0) - (lt.seal_charged_minor::numeric / 100.0)) > 0.01
  )
order by p.period_anchor, p.driver_id;
