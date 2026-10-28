-- Ledgers audit: deposit weeks, carried-from labels, platform fee on the rollup,
-- and SQL totals for fuel expenses and fills. Safe to re-run.

-- Monday bank deposits pay the previous Monday–Sunday. Tag only when the
-- amount matches that week's statement net.
update ledger.entries e
set metadata = e.metadata || jsonb_build_object(
  'bankRole', 'actual_deposit',
  'periodStart', to_char((e.effective_at at time zone 'UTC')::date - 7, 'YYYY-MM-DD'),
  'periodEnd', to_char((e.effective_at at time zone 'UTC')::date - 1, 'YYYY-MM-DD')
)
where e.entry_type = 'payout_bank'
  and e.idempotency_key like 'kv_ledger_event:payment_line:%'
  and coalesce(e.metadata->>'bankRole', '') = ''
  and e.metadata->>'driverId' like '00000000%'
  and exists (
    select 1
    from ledger.entries s
    where s.entry_type = 'payout_bank'
      and s.metadata->>'bankRole' in ('org_deposit', 'statement_net')
      and left(coalesce(s.metadata->>'periodStart', ''), 10)
        = to_char((e.effective_at at time zone 'UTC')::date - 7, 'YYYY-MM-DD')
      and s.amount_minor = e.amount_minor
  );

-- Older organisation bank rows that were recognised only by a hard-coded id.
update ledger.entries
set metadata = metadata || jsonb_build_object('bankRole', 'statement_net')
where entry_type = 'payout_bank'
  and coalesce(metadata->>'bankRole', '') = ''
  and lower(coalesce(metadata->>'driverId', '')) = '73dfc14d-3798-4a00-8d86-b2a3eb632f54';

-- Closed-week Uber gaps that were posted into the open week of 19 Oct.
update ledger.entries
set entry_type = 'prior_period_adjustment',
    metadata = metadata || jsonb_build_object(
      'carriedFromWeek', left(coalesce(metadata->>'sourceWeek', ''), 10)
    )
where metadata->>'recognitionBasis' = 'prior_period_adjustment'
  and left(coalesce(metadata->>'periodStart', ''), 10) = '2026-10-19'
  and coalesce(metadata->>'carriedFromWeek', '') = '';

-- Roam trips whose net was copied from the gross because no commission was stored.
update fleet.trip_facts f
set net_to_driver = null,
    platform_fee = null
from fleet.trips t
where t.id = f.trip_id
  and f.platform in ('Roam', 'GoRide')
  and f.net_to_driver is not distinct from f.amount
  and fleet.trip_num(t.payload_json->>'roamCommission') is null
  and fleet.trip_num(t.payload_json->>'platformFee') is null;

create or replace function fleet.statement_week_rollup(p_org text, p_from date, p_to date)
returns jsonb
language sql
stable
security definer
set search_path = fleet, public
as $$
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
  from (
    select
      f.driver_id as "driverId",
      f.platform,
      coalesce(sum(f.amount) filter (where f.status_bucket in ('completed', 'cancelled')), 0) as "totalEarnings",
      coalesce(sum(coalesce(f.fare_base, 0) + coalesce(f.fare_surge, 0)) filter (where f.status_bucket in ('completed', 'cancelled')), 0) as fare,
      coalesce(sum(coalesce(f.fare_cancellation, 0)) filter (where f.status_bucket in ('completed', 'cancelled')), 0) as cancellation,
      coalesce(sum(coalesce(f.fare_time_at_stop, 0)) filter (where f.status_bucket in ('completed', 'cancelled')), 0) as "timeAtStop",
      case
        when count(*) filter (
          where f.status_bucket in ('completed', 'cancelled') and f.fare_priority is null and f.platform = 'Uber'
        ) > 0 then null
        else coalesce(sum(f.fare_priority) filter (where f.status_bucket in ('completed', 'cancelled')), 0)
      end as priority,
      coalesce(sum(coalesce(f.fare_wait, 0)) filter (where f.status_bucket in ('completed', 'cancelled')), 0) as "waitTime",
      coalesce(sum(coalesce(f.fare_tips, 0)) filter (where f.status_bucket in ('completed', 'cancelled')), 0) as tips,
      coalesce(sum(coalesce(f.fare_other, 0)) filter (where f.status_bucket in ('completed', 'cancelled')), 0) as "otherFare",
      coalesce(sum(coalesce(f.toll_refund, 0)) filter (where f.status_bucket in ('completed', 'cancelled')), 0) as "tollRefundTrips",
      coalesce(sum(abs(coalesce(f.cash_collected, f.cash_collected_abs, 0))) filter (where f.status_bucket = 'completed'), 0) as "cashCollectedTrips",
      count(*) filter (where f.status_bucket = 'completed') as "completedTrips",
      coalesce(sum(coalesce(f.distance_km, 0)) filter (where f.status_bucket = 'completed'), 0) as "distanceKm",
      case
        when f.platform in ('Roam', 'InDrive') and count(*) filter (
          where f.status_bucket in ('completed', 'cancelled') and f.platform_fee is null
        ) > 0 then null
        when f.platform in ('Roam', 'InDrive') then coalesce(sum(f.platform_fee) filter (
          where f.status_bucket in ('completed', 'cancelled')
        ), 0)
        else null
      end as "platformFee",
      (f.platform in ('Roam', 'InDrive') and count(*) filter (
        where f.status_bucket in ('completed', 'cancelled') and f.platform_fee is not null
      ) > 0 and count(*) filter (
        where f.status_bucket in ('completed', 'cancelled') and f.platform_fee is null
      ) = 0) as "commissionRecorded"
    from fleet.trip_facts f
    where f.organization_id = p_org
      and f.local_date >= p_from
      and f.local_date <= p_to
      and f.platform in ('Uber', 'Roam', 'InDrive')
    group by f.driver_id, f.platform
  ) x;
$$;

revoke all on function fleet.statement_week_rollup(text, date, date) from public, anon, authenticated;
grant execute on function fleet.statement_week_rollup(text, date, date) to service_role;

create or replace function public.statement_week_rollup(p_org text, p_from date, p_to date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select fleet.statement_week_rollup(p_org, p_from, p_to);
$$;

revoke all on function public.statement_week_rollup(text, date, date) from public, anon, authenticated;
grant execute on function public.statement_week_rollup(text, date, date) to service_role;

create or replace function fleet.fuel_expense_ledger_totals(
  p_org text,
  p_from date,
  p_to date,
  p_search text
)
returns table(approved numeric, rejected numeric, pending numeric)
language sql
stable
security definer
set search_path = fleet, public
as $$
  select
    coalesce(sum(abs(t.amount)) filter (where t.status = 'Approved'), 0),
    coalesce(sum(abs(t.amount)) filter (where t.status = 'Rejected'), 0),
    0::numeric
  from fleet.transactions t
  where t.organization_id = p_org
    and (p_from is null or t.date >= p_from)
    and (p_to is null or t.date < p_to + 1)
    and t.status in ('Approved', 'Rejected')
    and (
      (
        lower(t.type) = 'expense'
        and (
          t.category ilike '%fuel%'
          or coalesce(t.payload_json->>'description', '') ilike '%fuel expense%'
          or coalesce(t.payload_json->>'description', '') ilike 'fuel:%'
          or coalesce(t.payload_json->>'description', '') ilike '%fuel —%'
        )
      )
      or (
        t.category in ('Fuel', 'Fuel Reimbursement')
        and t.type in ('Reimbursement', 'Fuel_Manual_Entry', 'Manual_Entry', 'Expense')
      )
    )
    and (
      p_search is null
      or p_search = ''
      or coalesce(t.payload_json->>'description', '') ilike '%' || p_search || '%'
      or coalesce(t.category, '') ilike '%' || p_search || '%'
    );
$$;

revoke all on function fleet.fuel_expense_ledger_totals(text, date, date, text) from public, anon, authenticated;
grant execute on function fleet.fuel_expense_ledger_totals(text, date, date, text) to service_role;

create or replace function public.fuel_expense_ledger_totals(
  p_org text,
  p_from date,
  p_to date,
  p_search text
)
returns table(approved numeric, rejected numeric, pending numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select * from fleet.fuel_expense_ledger_totals(p_org, p_from, p_to, p_search);
$$;

revoke all on function public.fuel_expense_ledger_totals(text, date, date, text) from public, anon, authenticated;
grant execute on function public.fuel_expense_ledger_totals(text, date, date, text) to service_role;

create or replace function fleet.fuel_entries_amount_sum(p_org text, p_from date, p_to date)
returns numeric
language sql
stable
security definer
set search_path = fleet, public
as $$
  select coalesce(sum(abs(amount)), 0)
  from fleet.fuel_entries
  where organization_id = p_org
    and date >= p_from
    and date < p_to + 1;
$$;

revoke all on function fleet.fuel_entries_amount_sum(text, date, date) from public, anon, authenticated;
grant execute on function fleet.fuel_entries_amount_sum(text, date, date) to service_role;

create or replace function public.fuel_entries_amount_sum(p_org text, p_from date, p_to date)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select fleet.fuel_entries_amount_sum(p_org, p_from, p_to);
$$;

revoke all on function public.fuel_entries_amount_sum(text, date, date) from public, anon, authenticated;
grant execute on function public.fuel_entries_amount_sum(text, date, date) to service_role;
