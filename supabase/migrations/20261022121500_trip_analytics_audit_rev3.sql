-- Trip analytics audit rev 3.
-- Duplicate warnings only pair two completed trips.
-- Roam funnel stage minutes are medians. The funnel flag stays off.

create or replace function fleet.trip_live_anomaly_flags(
  b fleet.trip_facts,
  p_floor numeric,
  p_fpk numeric,
  p_long_km numeric,
  p_long_min numeric,
  p_speed_high numeric,
  p_speed_low numeric,
  p_speed_km numeric,
  p_gps_m numeric,
  p_p99 numeric,
  p_med numeric
) returns text[]
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when b.status_bucket is distinct from 'completed' then '{}'::text[]
    else coalesce(array_remove(array[
      case when coalesce(b.amount, 0) = 0 then 'zero_fare' end,
      case when b.distance_km is null or b.distance_km = 0 then 'zero_distance' end,
      case when b.distance_km > p_long_km then 'long_distance' end,
      case when b.duration_min > p_long_min then 'long_duration' end,
      case when b.amount > greatest(p_floor, coalesce(p_p99, 0) * 1.5) then 'fare_outlier' end,
      case when coalesce(b.distance_km, 0) >= 2 and b.amount / nullif(b.distance_km, 0) > p_fpk then 'fare_per_km' end,
      case when coalesce(b.duration_min, 0) > 0 and coalesce(b.distance_km, 0) > 0
        and (b.distance_km / (b.duration_min / 60.0)) > p_speed_high then 'speed_high' end,
      case when coalesce(b.duration_min, 0) > 0 and coalesce(b.distance_km, 0) > p_speed_km
        and (b.distance_km / (b.duration_min / 60.0)) < p_speed_low then 'speed_low' end,
      case when b.request_at is not null and exists (
        select 1 from fleet.trip_facts o
        where o.organization_id = b.organization_id
          and o.driver_id = b.driver_id
          and o.request_at = b.request_at
          and o.trip_id <> b.trip_id
          and o.status_bucket = 'completed'
      ) then 'duplicate' end,
      case when b.time_unknown then 'missing_time' end,
      case when b.vehicle_id is null then 'missing_vehicle' end,
      case when b.pickup_lat is not null and b.dropoff_lat is not null
        and fleet.haversine_km(b.pickup_lat, b.pickup_lng, b.dropoff_lat, b.dropoff_lng) * 1000 < p_gps_m
        and b.amount > 2 * coalesce(p_med, b.amount) then 'gps_equal' end
    ], null), '{}'::text[])
  end;
$$;

create or replace function fleet.backfill_trip_facts(p_batch int default 300)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_n int := 0;
  remaining_n bigint;
  trip_count bigint;
  fact_count bigint;
  trip_amount numeric;
  fact_amount numeric;
begin
  insert into fleet.trip_facts
  select (fleet.project_trip_fact(t)).*
  from fleet.trips t
  where not exists (
    select 1 from fleet.trip_facts f where f.trip_id = t.id
  )
  order by t.id
  limit greatest(coalesce(p_batch, 300), 1)
  on conflict (trip_id) do nothing;
  get diagnostics inserted_n = row_count;

  select count(*) into remaining_n
  from fleet.trips t
  where not exists (
    select 1 from fleet.trip_facts f where f.trip_id = t.id
  );

  if remaining_n = 0 then
    update fleet.trip_facts f
    set anomaly_flags = f.anomaly_flags || array['duplicate']
    where f.status_bucket = 'completed'
      and f.request_at is not null
      and f.driver_id is not null
      and exists (
        select 1 from fleet.trip_facts o
        where o.organization_id = f.organization_id
          and o.driver_id = f.driver_id
          and o.request_at = f.request_at
          and o.trip_id <> f.trip_id
          and o.status_bucket = 'completed'
      )
      and not ('duplicate' = any (f.anomaly_flags));

    select count(*), coalesce(sum(amount), 0) into trip_count, trip_amount from fleet.trips;
    select count(*), coalesce(sum(amount), 0) into fact_count, fact_amount from fleet.trip_facts;
    return jsonb_build_object(
      'inserted', inserted_n,
      'remaining', 0,
      'parityOk', trip_count = fact_count and trip_amount is not distinct from fact_amount,
      'trips', trip_count,
      'facts', fact_count
    );
  end if;

  return jsonb_build_object('inserted', inserted_n, 'remaining', remaining_n);
end;
$$;

create or replace function fleet.roam_ride_funnel(p_org text, f jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  requested bigint := 0;
  offered bigint := 0;
  accepted bigint := 0;
  arrived bigint := 0;
  started bigint := 0;
  completed bigint := 0;
  reasons jsonb := '[]'::jsonb;
  offered_med numeric;
  accepted_med numeric;
  arrived_med numeric;
  started_med numeric;
  completed_med numeric;
begin
  -- A request belongs to this fleet when it was stamped, assigned to a fleet driver,
  -- or offered to one. Offered-but-not-accepted demand stays visible. A request
  -- nobody from this fleet was offered is not this fleet's demand.
  with rides as (
    select r.*
    from rides.ride_requests r
    where (
      r.organization_id::text = p_org
      or exists (
        select 1 from public.driver_profiles dp
        where dp.user_id = r.assigned_driver_user_id
          and dp.mode = 'fleet'
          and dp.fleet_id::text = p_org
      )
      or exists (
        select 1
        from rides.driver_offers o
        join public.driver_profiles dp on dp.user_id = o.driver_user_id
        where o.ride_request_id = r.id
          and dp.mode = 'fleet'
          and dp.fleet_id::text = p_org
      )
    )
    and (nullif(f->>'startDate', '') is null or (r.created_at at time zone 'America/Jamaica')::date >= (f->>'startDate')::date)
    and (nullif(f->>'endDate', '') is null or (r.created_at at time zone 'America/Jamaica')::date <= (f->>'endDate')::date)
  ),
  marked as (
    select
      r.status,
      (
        r.organization_id::text = p_org
        or exists (
          select 1 from public.driver_profiles dp
          where dp.user_id = r.assigned_driver_user_id
            and dp.mode = 'fleet'
            and dp.fleet_id::text = p_org
        )
      ) as belongs,
      exists (
        select 1
        from rides.driver_offers o
        join public.driver_profiles dp on dp.user_id = o.driver_user_id
        where o.ride_request_id = r.id
          and dp.mode = 'fleet'
          and dp.fleet_id::text = p_org
      ) as offered_here,
      exists (select 1 from rides.driver_offers o where o.ride_request_id = r.id) as had_any_offer,
      r.cancelled_by,
      r.cancel_reason
    from rides r
  )
  select
    count(*),
    count(*) filter (where offered_here or (belongs and had_any_offer)),
    count(*) filter (where belongs and status in ('driver_assigned', 'driver_en_route_pickup', 'driver_arrived_pickup', 'on_trip', 'completed')),
    count(*) filter (where belongs and status in ('driver_arrived_pickup', 'on_trip', 'completed')),
    count(*) filter (where belongs and status in ('on_trip', 'completed')),
    count(*) filter (where belongs and status = 'completed')
  into requested, offered, accepted, arrived, started, completed
  from marked;

  select coalesce(jsonb_agg(jsonb_build_object('reason', reason, 'count', n) order by n desc), '[]'::jsonb)
  into reasons
  from (
    select coalesce(nullif(r.cancel_reason, ''), 'unmatched') as reason, count(*) as n
    from rides.ride_requests r
    where r.status = 'cancelled'
      and r.cancelled_by = 'system'
      and (
        r.organization_id::text = p_org
        or exists (
          select 1 from public.driver_profiles dp
          where dp.user_id = r.assigned_driver_user_id
            and dp.mode = 'fleet'
            and dp.fleet_id::text = p_org
        )
        or exists (
          select 1
          from rides.driver_offers o
          join public.driver_profiles dp on dp.user_id = o.driver_user_id
          where o.ride_request_id = r.id
            and dp.mode = 'fleet'
            and dp.fleet_id::text = p_org
        )
      )
      and (nullif(f->>'startDate', '') is null or (r.created_at at time zone 'America/Jamaica')::date >= (f->>'startDate')::date)
      and (nullif(f->>'endDate', '') is null or (r.created_at at time zone 'America/Jamaica')::date <= (f->>'endDate')::date)
    group by 1
  ) u;

  -- Same request set as the counts above. A missing timestamp stays null.
  with rides as (
    select r.*
    from rides.ride_requests r
    where (
      r.organization_id::text = p_org
      or exists (
        select 1 from public.driver_profiles dp
        where dp.user_id = r.assigned_driver_user_id
          and dp.mode = 'fleet'
          and dp.fleet_id::text = p_org
      )
      or exists (
        select 1
        from rides.driver_offers o
        join public.driver_profiles dp on dp.user_id = o.driver_user_id
        where o.ride_request_id = r.id
          and dp.mode = 'fleet'
          and dp.fleet_id::text = p_org
      )
    )
    and (nullif(f->>'startDate', '') is null or (r.created_at at time zone 'America/Jamaica')::date >= (f->>'startDate')::date)
    and (nullif(f->>'endDate', '') is null or (r.created_at at time zone 'America/Jamaica')::date <= (f->>'endDate')::date)
  )
  select
    round((percentile_cont(0.5) within group (order by offered_min))::numeric, 1),
    round((percentile_cont(0.5) within group (order by accepted_min))::numeric, 1),
    round((percentile_cont(0.5) within group (order by arrived_min))::numeric, 1),
    round((percentile_cont(0.5) within group (order by started_min))::numeric, 1),
    round((percentile_cont(0.5) within group (order by completed_min))::numeric, 1)
  into offered_med, accepted_med, arrived_med, started_med, completed_med
  from (
    select
      case
        when off.first_offer is not null and r.created_at is not null and off.first_offer >= r.created_at
        then extract(epoch from (off.first_offer - r.created_at)) / 60.0
      end as offered_min,
      case
        when r.en_route_at is not null and r.created_at is not null and r.en_route_at >= r.created_at
        then extract(epoch from (r.en_route_at - r.created_at)) / 60.0
      end as accepted_min,
      case
        when r.arrived_pickup_at is not null and r.en_route_at is not null and r.arrived_pickup_at >= r.en_route_at
        then extract(epoch from (r.arrived_pickup_at - r.en_route_at)) / 60.0
      end as arrived_min,
      case
        when r.trip_started_at is not null and r.arrived_pickup_at is not null and r.trip_started_at >= r.arrived_pickup_at
        then extract(epoch from (r.trip_started_at - r.arrived_pickup_at)) / 60.0
      end as started_min,
      case
        when r.completed_at is not null and r.trip_started_at is not null and r.completed_at >= r.trip_started_at
        then extract(epoch from (r.completed_at - r.trip_started_at)) / 60.0
      end as completed_min
    from rides r
    left join lateral (
      select min(o.created_at) as first_offer
      from rides.driver_offers o
      join public.driver_profiles dp on dp.user_id = o.driver_user_id
      where o.ride_request_id = r.id
        and dp.mode = 'fleet'
        and dp.fleet_id::text = p_org
    ) off on true
  ) gaps;

  return jsonb_build_object(
    'requested', requested,
    'offered', offered,
    'accepted', accepted,
    'arrived', arrived,
    'started', started,
    'completed', completed,
    'stageMinutes', jsonb_build_object(
      'offered', offered_med,
      'accepted', accepted_med,
      'arrived', arrived_med,
      'started', started_med,
      'completed', completed_med
    ),
    'unmatched', reasons,
    'empty', completed = 0
  );
end;
$$;

notify pgrst, 'reload schema';
