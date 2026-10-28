-- Statement lines live on trip_facts. The existing projector keeps analytics columns.
-- This trigger fills the Uber statement pieces on every insert, including the
-- delete-and-reinsert sync from fleet.trips.

alter table fleet.trip_facts
  add column if not exists fare_time_at_stop numeric,
  add column if not exists fare_cancellation numeric,
  add column if not exists fare_priority numeric,
  add column if not exists fare_other numeric,
  add column if not exists toll_refund numeric,
  add column if not exists cash_collected numeric;

create or replace function fleet.trip_facts_fill_statement_components()
returns trigger
language plpgsql
security definer
set search_path = fleet, public
as $$
declare
  p jsonb;
  amt numeric;
  base numeric;
  surge numeric;
  wait_n numeric;
  stop_n numeric;
  tips numeric;
  cancel_n numeric;
  other_n numeric;
  priority_n numeric;
begin
  select payload_json, amount into p, amt
  from fleet.trips
  where id = new.trip_id;
  if p is null then
    return new;
  end if;

  base := fleet.trip_num(p#>>'{fareBreakdown,baseFare}');
  surge := fleet.trip_num(p#>>'{fareBreakdown,surge}');
  wait_n := fleet.trip_num(p#>>'{fareBreakdown,waitTime}');
  stop_n := fleet.trip_num(p#>>'{fareBreakdown,timeAtStop}');
  tips := coalesce(fleet.trip_num(p->>'uberTips'), fleet.trip_num(p#>>'{fareBreakdown,tips}'));
  cancel_n := coalesce(fleet.trip_num(p->>'cancellationFare'), fleet.trip_num(p#>>'{fareBreakdown,cancellation}'));
  other_n := fleet.trip_num(p#>>'{fareBreakdown,other}');
  priority_n := fleet.trip_num(p#>>'{fareBreakdown,priority}');

  if priority_n is null
     and new.platform = 'Uber'
     and (base is not null or surge is not null or wait_n is not null or stop_n is not null or cancel_n is not null) then
    priority_n := coalesce(amt, 0)
      - coalesce(base, 0) - coalesce(surge, 0) - coalesce(wait_n, 0)
      - coalesce(stop_n, 0) - coalesce(tips, 0) - coalesce(cancel_n, 0) - coalesce(other_n, 0);
  end if;

  new.fare_time_at_stop := stop_n;
  new.fare_cancellation := cancel_n;
  new.fare_priority := priority_n;
  new.fare_other := other_n;
  new.toll_refund := coalesce(fleet.trip_num(p->>'uberRefundExpenseAmount'), fleet.trip_num(p->>'tollCharges'));
  new.cash_collected := fleet.trip_num(p->>'cashCollected');
  if tips is not null then
    new.fare_tips := tips;
  end if;

  if new.platform in ('Roam', 'GoRide') and new.net_to_driver is null then
    new.net_to_driver := coalesce(amt, 0)
      - coalesce(fleet.trip_num(p->>'roamCommission'), fleet.trip_num(p->>'platformFee'), 0);
  end if;

  return new;
end;
$$;

drop trigger if exists trip_facts_fill_statement_components on fleet.trip_facts;
create trigger trip_facts_fill_statement_components
  before insert on fleet.trip_facts
  for each row
  execute function fleet.trip_facts_fill_statement_components();

-- Existing rows. Same expressions as the trigger.
update fleet.trip_facts f
set
  fare_time_at_stop = fleet.trip_num(t.payload_json#>>'{fareBreakdown,timeAtStop}'),
  fare_cancellation = coalesce(
    fleet.trip_num(t.payload_json->>'cancellationFare'),
    fleet.trip_num(t.payload_json#>>'{fareBreakdown,cancellation}')
  ),
  fare_other = fleet.trip_num(t.payload_json#>>'{fareBreakdown,other}'),
  toll_refund = coalesce(
    fleet.trip_num(t.payload_json->>'uberRefundExpenseAmount'),
    fleet.trip_num(t.payload_json->>'tollCharges')
  ),
  cash_collected = fleet.trip_num(t.payload_json->>'cashCollected'),
  fare_tips = coalesce(fleet.trip_num(t.payload_json->>'uberTips'), f.fare_tips),
  fare_priority = coalesce(
    fleet.trip_num(t.payload_json#>>'{fareBreakdown,priority}'),
    case
      when f.platform = 'Uber'
        and (
          fleet.trip_num(t.payload_json#>>'{fareBreakdown,baseFare}') is not null
          or fleet.trip_num(t.payload_json#>>'{fareBreakdown,surge}') is not null
          or fleet.trip_num(t.payload_json#>>'{fareBreakdown,waitTime}') is not null
          or fleet.trip_num(t.payload_json#>>'{fareBreakdown,timeAtStop}') is not null
          or fleet.trip_num(t.payload_json->>'cancellationFare') is not null
        )
      then coalesce(t.amount, 0)
        - coalesce(fleet.trip_num(t.payload_json#>>'{fareBreakdown,baseFare}'), 0)
        - coalesce(fleet.trip_num(t.payload_json#>>'{fareBreakdown,surge}'), 0)
        - coalesce(fleet.trip_num(t.payload_json#>>'{fareBreakdown,waitTime}'), 0)
        - coalesce(fleet.trip_num(t.payload_json#>>'{fareBreakdown,timeAtStop}'), 0)
        - coalesce(fleet.trip_num(t.payload_json->>'uberTips'), fleet.trip_num(t.payload_json#>>'{fareBreakdown,tips}'), 0)
        - coalesce(fleet.trip_num(t.payload_json->>'cancellationFare'), 0)
        - coalesce(fleet.trip_num(t.payload_json#>>'{fareBreakdown,other}'), 0)
      else null
    end
  ),
  net_to_driver = case
    when f.platform in ('Roam', 'GoRide') and f.net_to_driver is null then
      coalesce(t.amount, 0)
        - coalesce(fleet.trip_num(t.payload_json->>'roamCommission'), fleet.trip_num(t.payload_json->>'platformFee'), 0)
    else f.net_to_driver
  end
from fleet.trips t
where t.id = f.trip_id;

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
      coalesce(sum(coalesce(f.distance_km, 0)) filter (where f.status_bucket = 'completed'), 0) as "distanceKm"
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

notify pgrst, 'reload schema';
