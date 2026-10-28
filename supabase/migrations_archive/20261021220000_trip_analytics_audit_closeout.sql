-- Trip analytics audit close-out.
-- Live badges, the 2 km fare rule, real kilometres, and fleet attribution for offers
-- that never get a driver. Does not replay the already-applied facts migration.

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
      ) then 'duplicate' end,
      case when b.time_unknown then 'missing_time' end,
      case when b.vehicle_id is null then 'missing_vehicle' end,
      case when b.pickup_lat is not null and b.dropoff_lat is not null
        and fleet.haversine_km(b.pickup_lat, b.pickup_lng, b.dropoff_lat, b.dropoff_lng) * 1000 < p_gps_m
        and b.amount > 2 * coalesce(p_med, b.amount) then 'gps_equal' end
    ], null), '{}'::text[])
  end;
$$;

create or replace function fleet.project_trip_fact(t fleet.trips)
returns fleet.trip_facts
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  f fleet.trip_facts;
  p jsonb := coalesce(t.payload_json, '{}'::jsonb);
  v_req timestamptz;
  v_local timestamp;
  v_reason text;
  v_by text;
  v_uber text;
  v_token text;
  v_platform text;
  v_line text;
  v_category text;
  v_floor numeric := 5000;
  v_fpk numeric := 500;
  v_long_km numeric := 100;
  v_long_min numeric := 180;
  v_speed_high numeric := 120;
  v_speed_low numeric := 3;
  v_speed_km numeric := 2;
begin
  f.trip_id := t.id;
  f.organization_id := t.organization_id;
  f.driver_id := t.driver_id;
  f.driver_name := nullif(btrim(coalesce(p->>'driverName', '')), '');
  f.vehicle_id := nullif(btrim(coalesce(t.vehicle_id, '')), '');
  v_platform := lower(regexp_replace(coalesce(t.platform, p->>'platform', ''), '\s+', '', 'g'));
  f.platform := case v_platform
    when 'uber' then 'Uber'
    when 'indrive' then 'InDrive'
    when 'roam' then 'Roam'
    when 'goride' then 'Roam'
    when 'roamrush' then 'Roam Rush'
    else coalesce(nullif(btrim(coalesce(t.platform, '')), ''), 'Unknown')
  end;
  v_line := coalesce(t.service_line, p->>'serviceLine', p->>'service_line', 'rideshare');
  f.service_line := v_line;
  v_category := lower(coalesce(p->>'serviceCategory', p->>'service_category', ''));
  f.service_category := nullif(v_category, '');
  f.is_manual := coalesce(fleet.trip_bool(p->>'isManual'), false);
  f.is_live := coalesce(fleet.trip_bool(p->>'isLiveRecorded'), false);
  f.status_bucket := case
    when lower(coalesce(t.status, '')) in ('completed') then 'completed'
    when lower(coalesce(t.status, '')) in ('cancelled', 'canceled') then 'cancelled'
    else 'in_progress'
  end;
  f.amount := t.amount;
  f.payment_method := coalesce(t.payment_method, p->>'paymentMethod');
  f.distance_km := coalesce(t.distance, fleet.trip_num(p->>'distance'));
  f.duration_min := coalesce(t.duration, fleet.trip_num(p->>'duration'));
  f.anchor_period_id := nullif(p->>'anchorPeriodId', '');
  f.cash_collected_abs := abs(fleet.trip_num(p->>'cashCollected'));
  if f.platform = 'Uber' then
    f.net_to_driver := coalesce(t.net_to_driver, fleet.trip_num(p->>'netToDriver'));
  elsif f.platform = 'InDrive' then
    f.net_to_driver := fleet.trip_num(p->>'indriveNetIncome');
  else
    f.net_to_driver := coalesce(t.net_to_driver, fleet.trip_num(p->>'netToDriver'));
  end if;
  if f.platform = 'Uber' and f.amount is not null and f.net_to_driver is not null then
    f.platform_fee := f.amount - f.net_to_driver;
  elsif f.platform = 'InDrive' then
    f.platform_fee := fleet.trip_num(p->>'indriveServiceFee');
  else
    f.platform_fee := null;
  end if;
  f.fare_base := fleet.trip_num(p#>>'{fareBreakdown,baseFare}');
  f.fare_surge := fleet.trip_num(p#>>'{fareBreakdown,surge}');
  f.fare_tips := fleet.trip_num(p#>>'{fareBreakdown,tips}');
  f.fare_wait := fleet.trip_num(p#>>'{fareBreakdown,waitTime}');
  f.fare_airport := fleet.trip_num(p#>>'{fareBreakdown,airportFees}');
  f.fare_taxes := fleet.trip_num(p#>>'{fareBreakdown,taxes}');
  f.tolls := fleet.trip_num(p->>'tollCharges');
  f.has_surge := coalesce(f.fare_surge, 0) > 0;
  f.has_tip := coalesce(f.fare_tips, 0) > 0;
  f.deadhead_km_allocated := fleet.trip_num(p->>'normalizedEnrouteDistance');
  f.pickup_lat := coalesce(fleet.trip_num(p->>'startLat'), fleet.trip_num(p->>'pickupLat'), fleet.trip_num(p#>>'{pickupCoords,lat}'))::double precision;
  f.pickup_lng := coalesce(fleet.trip_num(p->>'startLng'), fleet.trip_num(p->>'pickupLng'), fleet.trip_num(p#>>'{pickupCoords,lon}'), fleet.trip_num(p#>>'{pickupCoords,lng}'))::double precision;
  f.dropoff_lat := coalesce(fleet.trip_num(p->>'endLat'), fleet.trip_num(p->>'dropoffLat'), fleet.trip_num(p#>>'{dropoffCoords,lat}'))::double precision;
  f.dropoff_lng := coalesce(fleet.trip_num(p->>'endLng'), fleet.trip_num(p->>'dropoffLng'), fleet.trip_num(p#>>'{dropoffCoords,lon}'), fleet.trip_num(p#>>'{dropoffCoords,lng}'))::double precision;

  begin
    v_req := nullif(p->>'requestTime', '')::timestamptz;
  exception when others then
    v_req := null;
  end;
  f.request_at := v_req;
  if v_req is not null then
    v_local := v_req at time zone 'America/Jamaica';
    f.local_date := v_local::date;
    f.local_hour := extract(hour from v_local)::smallint;
    f.local_dow := extract(isodow from v_local)::smallint;
    f.time_unknown := false;
  else
    f.local_date := t.date;
    f.local_hour := null;
    f.local_dow := null;
    f.time_unknown := true;
  end if;

  if f.status_bucket = 'cancelled' then
    v_reason := lower(btrim(coalesce(p->>'cancellationReason', '')));
    v_by := lower(btrim(coalesce(p->>'cancelledBy', '')));
    v_uber := lower(btrim(coalesce(p->>'uberTripStatus', '')));
    v_token := case when v_reason <> '' then v_reason else v_uber end;
    if v_token = 'rider_cancelled' then
      f.cancel_actor := 'rider'; f.cancel_reason_code := 'rider_cancelled';
    elsif v_token = 'driver_cancelled' then
      f.cancel_actor := 'driver'; f.cancel_reason_code := 'driver_cancelled';
    elsif v_token = 'delivery_failed' then
      f.cancel_actor := 'delivery'; f.cancel_reason_code := 'delivery_failed';
    elsif v_token = 'other (driver)' or v_by = 'driver' then
      f.cancel_actor := 'driver'; f.cancel_reason_code := 'other';
    elsif v_token = 'other (rider)' or v_by = 'rider' then
      f.cancel_actor := 'rider'; f.cancel_reason_code := 'other';
    elsif v_token = 'wait time too long' then
      f.cancel_reason_code := 'wait_too_long';
      f.cancel_actor := case v_by when 'driver' then 'driver' when 'rider' then 'rider' else 'unknown' end;
    elsif v_by = 'system' then
      f.cancel_actor := 'system';
      f.cancel_reason_code := case when v_token = 'timeout' then 'timeout' else 'unmatched' end;
    elsif v_token = '' then
      f.cancel_actor := 'unknown'; f.cancel_reason_code := 'unknown';
    else
      f.cancel_actor := 'unknown'; f.cancel_reason_code := 'other';
    end if;
    f.cancellation_fee := coalesce(fleet.trip_num(p->>'cancellationFee'), f.amount);
  end if;

  if v_line = 'rush_delivery' or v_category = 'courier' or f.cancel_reason_code = 'delivery_failed' then
    f.analytics_population := 'delivery';
  else
    f.analytics_population := 'rideshare';
  end if;

  f.pickup_zone := coalesce(
    fleet.zone_for_trip(fleet.normalize_trip_area(p->>'pickupArea'), f.pickup_lat, f.pickup_lng),
    initcap(fleet.normalize_trip_area(p->>'pickupArea'))
  );
  f.dropoff_zone := coalesce(
    fleet.zone_for_trip(fleet.normalize_trip_area(p->>'dropoffArea'), f.dropoff_lat, f.dropoff_lng),
    initcap(fleet.normalize_trip_area(p->>'dropoffArea'))
  );

  select
    coalesce(s.fare_floor, 5000), coalesce(s.fare_per_km_max, 500), coalesce(s.long_distance_km, 100),
    coalesce(s.long_duration_min, 180), coalesce(s.speed_high_kmh, 120), coalesce(s.speed_low_kmh, 3),
    coalesce(s.speed_low_min_km, 2)
  into v_floor, v_fpk, v_long_km, v_long_min, v_speed_high, v_speed_low, v_speed_km
  from fleet.trip_analytics_settings s
  where s.organization_id = f.organization_id;
  if v_floor is null then
    v_floor := 5000; v_fpk := 500; v_long_km := 100; v_long_min := 180;
    v_speed_high := 120; v_speed_low := 3; v_speed_km := 2;
  end if;

  f.anomaly_flags := '{}';
  if f.status_bucket = 'completed' and coalesce(f.amount, 0) = 0 then
    f.anomaly_flags := f.anomaly_flags || array['zero_fare'];
  end if;
  if f.status_bucket = 'completed' and (f.distance_km is null or f.distance_km = 0) then
    f.anomaly_flags := f.anomaly_flags || array['zero_distance'];
  end if;
  if f.status_bucket = 'completed' and f.distance_km > v_long_km then
    f.anomaly_flags := f.anomaly_flags || array['long_distance'];
  end if;
  if f.status_bucket = 'completed' and f.duration_min > v_long_min then
    f.anomaly_flags := f.anomaly_flags || array['long_duration'];
  end if;
  if f.status_bucket = 'completed' and f.amount > v_floor then
    f.anomaly_flags := f.anomaly_flags || array['fare_outlier'];
  end if;
  if f.status_bucket = 'completed' and coalesce(f.distance_km, 0) >= 2 and (f.amount / f.distance_km) > v_fpk then
    f.anomaly_flags := f.anomaly_flags || array['fare_per_km'];
  end if;
  if f.status_bucket = 'completed' and f.distance_km > 0 and f.duration_min > 0 then
    if (f.distance_km / (f.duration_min / 60.0)) > v_speed_high then
      f.anomaly_flags := f.anomaly_flags || array['speed_high'];
    elsif (f.distance_km / (f.duration_min / 60.0)) < v_speed_low and f.distance_km > v_speed_km then
      f.anomaly_flags := f.anomaly_flags || array['speed_low'];
    end if;
  end if;
  if f.time_unknown and f.status_bucket = 'completed' then
    f.anomaly_flags := f.anomaly_flags || array['missing_time'];
  end if;
  if f.status_bucket = 'completed' and f.vehicle_id is null then
    f.anomaly_flags := f.anomaly_flags || array['missing_vehicle'];
  end if;
  f.updated_at := now();
  return f;
end;
$$;

create or replace function fleet.trip_kpi_block(p_org text, f jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_completed bigint;
  v_cancelled bigint;
  v_progress bigint;
  v_total bigint;
  v_gross numeric;
  v_cancel_fees numeric;
  v_sum_amount numeric;
  v_sum_net numeric;
  v_net_known bigint;
  v_net_unknown bigint;
  v_cash numeric;
  v_cash_trips bigint;
  v_median numeric;
  v_fare_num numeric;
  v_dist_sum numeric;
  v_dist_n bigint;
  v_avg_dist numeric;
  v_avg_dur numeric;
  v_dur_n bigint;
  v_fee numeric;
  v_time_unknown bigint;
  s date;
  e date;
  len int;
  i int;
  b0 date;
  b1 date;
  spark numeric[] := array[]::numeric[];
  bucket_count numeric;
begin
  select
    count(*) filter (where status_bucket = 'completed'),
    count(*) filter (where status_bucket = 'cancelled'),
    count(*) filter (where status_bucket = 'in_progress'),
    count(*),
    coalesce(sum(amount) filter (where status_bucket = 'completed'), 0),
    coalesce(sum(amount) filter (where status_bucket = 'cancelled'), 0),
    coalesce(sum(amount), 0),
    coalesce(sum(net_to_driver) filter (where net_to_driver is not null), 0),
    count(*) filter (where net_to_driver is not null),
    count(*) filter (where net_to_driver is null),
    coalesce(sum(cash_collected_abs) filter (where status_bucket = 'completed'), 0),
    count(*) filter (where status_bucket = 'completed' and lower(coalesce(payment_method, '')) = 'cash'),
    percentile_cont(0.5) within group (order by amount) filter (where status_bucket = 'completed' and amount is not null),
    coalesce(sum(amount) filter (where status_bucket = 'completed' and coalesce(distance_km, 0) > 0), 0),
    coalesce(sum(distance_km) filter (where status_bucket = 'completed' and coalesce(distance_km, 0) > 0), 0),
    count(*) filter (where status_bucket = 'completed' and coalesce(distance_km, 0) > 0),
    avg(distance_km) filter (where status_bucket = 'completed' and coalesce(distance_km, 0) > 0),
    avg(duration_min) filter (where status_bucket = 'completed' and coalesce(duration_min, 0) > 0),
    count(*) filter (where status_bucket = 'completed' and coalesce(duration_min, 0) > 0),
    coalesce(sum(platform_fee) filter (where status_bucket = 'completed' and platform_fee is not null), 0),
    count(*) filter (where time_unknown)
  into
    v_completed, v_cancelled, v_progress, v_total, v_gross, v_cancel_fees, v_sum_amount,
    v_sum_net, v_net_known, v_net_unknown, v_cash, v_cash_trips, v_median,
    v_fare_num, v_dist_sum, v_dist_n, v_avg_dist, v_avg_dur, v_dur_n, v_fee, v_time_unknown
  from fleet.trip_facts_matching(p_org, f);

  s := nullif(f->>'startDate', '')::date;
  e := nullif(f->>'endDate', '')::date;
  if s is null or e is null then
    select min(local_date), max(local_date) into s, e from fleet.trip_facts_matching(p_org, f);
  end if;
  if s is not null and e is not null and e >= s then
    len := greatest(1, (e - s) + 1);
    for i in 0..6 loop
      b0 := s + floor(i * len / 7.0)::int;
      b1 := s + floor((i + 1) * len / 7.0)::int - 1;
      if b1 < b0 then b1 := b0; end if;
      select count(*) into bucket_count
      from fleet.trip_facts_matching(p_org, f) t
      where t.status_bucket = 'completed'
        and t.local_date between b0 and b1;
      spark := spark || bucket_count;
    end loop;
  end if;

  return jsonb_build_object(
    'completed', v_completed,
    'cancelled', v_cancelled,
    'inProgress', v_progress,
    'total', v_total,
    'grossFares', v_gross,
    'cancelFees', v_cancel_fees,
    'sumAmount', v_sum_amount,
    'sumNet', v_sum_net,
    'netKnownCount', v_net_known,
    'netUnknownCount', v_net_unknown,
    'cashCollected', v_cash,
    'cashTrips', v_cash_trips,
    'cashShare', case when v_completed > 0 then v_cash_trips::numeric / v_completed else null end,
    'avgFare', case when v_completed > 0 then v_gross / v_completed else null end,
    'medianFare', v_median,
    'farePerKm', case when v_dist_sum > 0 then v_fare_num / v_dist_sum else null end,
    'distanceTrips', v_dist_n,
    'distanceKm', v_dist_sum,
    'avgDistance', v_avg_dist,
    'avgDuration', v_avg_dur,
    'durationTrips', v_dur_n,
    'platformFee', v_fee,
    'timeUnknown', v_time_unknown,
    'cancellationRate', case when (v_completed + v_cancelled) > 0 then v_cancelled::numeric / (v_completed + v_cancelled) else null end,
    'sparkline', to_jsonb(spark)
  );
end;
$$;

create or replace function fleet.trip_analytics_anomalies(p_org text, f jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_floor numeric := 5000;
  v_fpk numeric := 500;
  v_long_km numeric := 100;
  v_long_min numeric := 180;
  v_speed_high numeric := 120;
  v_speed_low numeric := 3;
  v_speed_km numeric := 2;
  v_gps_m numeric := 50;
  v_limit int := least(greatest(coalesce((f->>'anomalyLimit')::int, 50), 1), 200);
  v_offset int := greatest(coalesce((f->>'anomalyOffset')::int, 0), 0);
  counts jsonb;
  feed jsonb;
  total_n bigint;
begin
  select
    coalesce(s.fare_floor, 5000), coalesce(s.fare_per_km_max, 500), coalesce(s.long_distance_km, 100),
    coalesce(s.long_duration_min, 180), coalesce(s.speed_high_kmh, 120), coalesce(s.speed_low_kmh, 3),
    coalesce(s.speed_low_min_km, 2), coalesce(s.gps_equal_meters, 50)
  into v_floor, v_fpk, v_long_km, v_long_min, v_speed_high, v_speed_low, v_speed_km, v_gps_m
  from fleet.trip_analytics_settings s
  where s.organization_id = p_org;
  if v_floor is null then
    v_floor := 5000; v_fpk := 500; v_long_km := 100; v_long_min := 180;
    v_speed_high := 120; v_speed_low := 3; v_speed_km := 2; v_gps_m := 50;
  end if;

  with base as (
    select * from fleet.trip_facts_matching(p_org, f) where status_bucket = 'completed'
  ),
  p99s as (
    select platform, percentile_cont(0.99) within group (order by amount) as p99,
      percentile_cont(0.5) within group (order by amount) as med
    from base where amount is not null group by platform
  ),
  flagged as (
    select b.trip_id, b.driver_id, b.driver_name, b.local_date, b.platform, b.amount, b.distance_km, b.duration_min, rule
    from base b
    left join p99s p on p.platform = b.platform
    cross join lateral unnest(fleet.trip_live_anomaly_flags(
      b::fleet.trip_facts, v_floor, v_fpk, v_long_km, v_long_min, v_speed_high, v_speed_low, v_speed_km, v_gps_m, p.p99::numeric, p.med::numeric
    )) as rule
  ),
  visible as (
    select fl.*
    from flagged fl
    where not exists (
      select 1 from fleet.trip_anomaly_reviews r
      where r.organization_id = p_org and r.trip_id = fl.trip_id and r.rule = fl.rule and r.action = 'dismiss'
    )
  )
  select
    coalesce((select jsonb_object_agg(rule, n) from (select rule, count(*) n from visible group by rule) c), '{}'::jsonb),
    (select count(*) from visible),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'tripId', trip_id, 'rule', rule, 'driverId', driver_id, 'driverName', driver_name,
        'date', local_date, 'platform', platform, 'amount', amount, 'distanceKm', distance_km, 'durationMin', duration_min
      ))
      from (
        select * from visible
        order by local_date desc nulls last, trip_id
        limit v_limit offset v_offset
      ) page
    ), '[]'::jsonb)
  into counts, total_n, feed;

  return jsonb_build_object(
    'counts', counts,
    'total', total_n,
    'feed', feed,
    'thresholds', jsonb_build_object(
      'fareFloor', v_floor, 'farePerKmMax', v_fpk, 'longDistanceKm', v_long_km,
      'longDurationMin', v_long_min, 'speedHigh', v_speed_high, 'speedLow', v_speed_low
    )
  );
end;
$$;

create or replace function fleet.trip_fact_page(
  p_org text, f jsonb, p_limit int default 50, p_offset int default 0, p_sort text default 'local_date', p_asc boolean default false
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $page$
declare
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 10000);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_sort text := case p_sort
    when 'amount' then 'amount'
    when 'distance_km' then 'distance_km'
    when 'duration_min' then 'duration_min'
    when 'platform' then 'platform'
    when 'status_bucket' then 'status_bucket'
    when 'trip_id' then 'trip_id'
    else 'local_date'
  end;
  v_floor numeric := 5000;
  v_fpk numeric := 500;
  v_long_km numeric := 100;
  v_long_min numeric := 180;
  v_speed_high numeric := 120;
  v_speed_low numeric := 3;
  v_speed_km numeric := 2;
  v_gps_m numeric := 50;
  p99map jsonb := '{}'::jsonb;
  total_n bigint;
  rows jsonb;
begin
  select
    coalesce(s.fare_floor, 5000), coalesce(s.fare_per_km_max, 500), coalesce(s.long_distance_km, 100),
    coalesce(s.long_duration_min, 180), coalesce(s.speed_high_kmh, 120), coalesce(s.speed_low_kmh, 3),
    coalesce(s.speed_low_min_km, 2), coalesce(s.gps_equal_meters, 50)
  into v_floor, v_fpk, v_long_km, v_long_min, v_speed_high, v_speed_low, v_speed_km, v_gps_m
  from fleet.trip_analytics_settings s
  where s.organization_id = p_org;
  if v_floor is null then
    v_floor := 5000; v_fpk := 500; v_long_km := 100; v_long_min := 180;
    v_speed_high := 120; v_speed_low := 3; v_speed_km := 2; v_gps_m := 50;
  end if;

  select coalesce(jsonb_object_agg(platform, jsonb_build_object('p99', p99, 'med', med)), '{}'::jsonb)
  into p99map
  from (
    select platform,
      percentile_cont(0.99) within group (order by amount) as p99,
      percentile_cont(0.5) within group (order by amount) as med
    from fleet.trip_facts_matching(p_org, f)
    where status_bucket = 'completed' and amount is not null and platform is not null
    group by platform
  ) s;

  select count(*) into total_n from fleet.trip_facts_matching(p_org, f);
  execute format(
    'select coalesce(jsonb_agg(row_to_json(page)::jsonb), ''[]''::jsonb) from (
       select trip_id,
         coalesce((
           select array_agg(flag)
           from unnest(fleet.trip_live_anomaly_flags(
             t::fleet.trip_facts, $6, $7, $8, $9, $10, $11, $12, $13,
             nullif($14 -> coalesce(t.platform, '''') ->> ''p99'', '''')::numeric,
             nullif($14 -> coalesce(t.platform, '''') ->> ''med'', '''')::numeric
           )) as flag
           where not exists (
             select 1 from fleet.trip_anomaly_reviews r
             where r.organization_id = $1 and r.trip_id = t.trip_id and r.rule = flag and r.action = ''dismiss''
           )
         ), ''{}''::text[]) as anomaly_flags,
         cancel_actor, local_date, platform, amount
       from fleet.trip_facts_matching($1, $2) t
       where (
         nullif($2->>''cursorDate'', '''') is null
         or ($3 = false and (t.local_date, t.trip_id) < (($2->>''cursorDate'')::date, $2->>''cursorId''))
         or ($3 = true and (t.local_date, t.trip_id) > (($2->>''cursorDate'')::date, $2->>''cursorId''))
       )
       order by %I %s nulls last, trip_id %s
       limit $4 offset $5
     ) page',
    v_sort,
    case when p_asc then 'asc' else 'desc' end,
    case when p_asc then 'asc' else 'desc' end
  )
  into rows
  using p_org, f, p_asc, v_limit, v_offset,
    v_floor, v_fpk, v_long_km, v_long_min, v_speed_high, v_speed_low, v_speed_km, v_gps_m, p99map;

  return jsonb_build_object('total', total_n, 'rows', rows);
end;
$page$;

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

  return jsonb_build_object(
    'requested', requested,
    'offered', offered,
    'accepted', accepted,
    'arrived', arrived,
    'started', started,
    'completed', completed,
    'stageMinutes', jsonb_build_object('offered', null, 'accepted', null, 'arrived', null, 'started', null, 'completed', null),
    'unmatched', reasons,
    'empty', completed = 0
  );
end;
$$;

revoke all on function fleet.trip_live_anomaly_flags(fleet.trip_facts, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric) from public, anon, authenticated;
grant execute on function fleet.trip_live_anomaly_flags(fleet.trip_facts, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric) to service_role;

-- Old dismissals used the stored name. Live badges use fare_outlier.
update fleet.trip_anomaly_reviews r
set rule = 'fare_outlier'
where r.rule = 'fare_outlier_floor'
  and not exists (
    select 1 from fleet.trip_anomaly_reviews x
    where x.organization_id = r.organization_id
      and x.trip_id = r.trip_id
      and x.rule = 'fare_outlier'
  );
delete from fleet.trip_anomaly_reviews where rule = 'fare_outlier_floor';

update fleet.trip_facts f
set anomaly_flags = coalesce((
  select array_agg(s.flag order by s.flag)
  from (
    select case when u.flag = 'fare_outlier_floor' then 'fare_outlier' else u.flag end as flag
    from unnest(f.anomaly_flags) as u(flag)
  ) s
  where not (s.flag = 'fare_per_km' and coalesce(f.distance_km, 0) < 2)
), '{}')
where f.anomaly_flags && array['fare_outlier_floor', 'fare_per_km'];

-- Stamp org on rides that already have a fleet driver. Unassigned and independent stay null.
update rides.ride_requests r
set
  fleet_id = dp.fleet_id,
  organization_id = dp.fleet_id,
  attribution_mode = 'fleet',
  updated_at = now()
from public.driver_profiles dp
where r.organization_id is null
  and r.assigned_driver_user_id = dp.user_id
  and dp.mode = 'fleet'
  and dp.fleet_id is not null;

notify pgrst, 'reload schema';
