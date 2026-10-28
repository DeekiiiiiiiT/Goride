-- Trip analytics projection. trip-analytics-rules-v1
-- Source of truth stays fleet.trips. Cash signs on the source are not changed.
-- America/Jamaica. Filter keys: startDate endDate platform serviceLine driverId vehicleId
-- status paymentMethod zone isManual hour dow minEarnings maxEarnings minDistance hasTip
-- hasSurge population anchorPeriodId cursorDate cursorId platforms driverIds vehicleIds compare
-- Cancel codes: rider_cancelled driver_cancelled delivery_failed other wait_too_long unknown unmatched timeout

create or replace function fleet.trip_num(v text)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when v is null or btrim(v) = '' then null
    when btrim(v) ~ '^-?[0-9]+(\.[0-9]+)?$' then btrim(v)::numeric
    else null
  end;
$$;

create or replace function fleet.trip_bool(v text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case lower(btrim(coalesce(v, '')))
    when 'true' then true
    when '1' then true
    when 'false' then false
    when '0' then false
    else null
  end;
$$;

create or replace function fleet.normalize_trip_area(raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    btrim(regexp_replace(
      regexp_replace(lower(btrim(coalesce(raw, ''))), '\s*,?\s*jamaica\s*$', '', 'i'),
      '\s+', ' ', 'g'
    )),
    ''
  );
$$;

create or replace function fleet.haversine_km(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language sql
immutable
set search_path = ''
as $$
  select case
    when lat1 is null or lng1 is null or lat2 is null or lng2 is null then null
    else 2 * 6371 * asin(sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2)
      + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
    ))
  end;
$$;

create table if not exists fleet.trip_zones (
  id text primary key,
  name text not null,
  parish text,
  centroid_lat double precision,
  centroid_lng double precision,
  aliases text[] not null default '{}',
  created_at timestamptz not null default now()
);

create unique index if not exists trip_zones_name_lower_uidx on fleet.trip_zones (lower(name));

create table if not exists fleet.trip_analytics_settings (
  organization_id text primary key,
  long_distance_km numeric not null default 100,
  long_duration_min numeric not null default 180,
  fare_floor numeric not null default 5000,
  fare_per_km_max numeric not null default 500,
  speed_high_kmh numeric not null default 120,
  speed_low_kmh numeric not null default 3,
  speed_low_min_km numeric not null default 2,
  gps_equal_meters numeric not null default 50,
  updated_at timestamptz not null default now()
);

create table if not exists fleet.trip_facts (
  trip_id text primary key,
  organization_id text,
  driver_id text,
  driver_name text,
  vehicle_id text,
  platform text,
  service_line text,
  service_category text,
  analytics_population text not null default 'rideshare',
  is_manual boolean not null default false,
  is_live boolean not null default false,
  status_bucket text not null,
  request_at timestamptz,
  local_date date,
  local_hour smallint,
  local_dow smallint,
  time_unknown boolean not null default false,
  amount numeric,
  net_to_driver numeric,
  platform_fee numeric,
  cash_collected_abs numeric,
  payment_method text,
  distance_km numeric,
  duration_min numeric,
  fare_base numeric,
  fare_surge numeric,
  fare_tips numeric,
  fare_wait numeric,
  fare_airport numeric,
  fare_taxes numeric,
  tolls numeric,
  has_surge boolean not null default false,
  has_tip boolean not null default false,
  cancel_actor text,
  cancel_reason_code text,
  cancellation_fee numeric,
  pickup_lat double precision,
  pickup_lng double precision,
  dropoff_lat double precision,
  dropoff_lng double precision,
  pickup_zone text,
  dropoff_zone text,
  deadhead_km_allocated numeric,
  anchor_period_id text,
  anomaly_flags text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create index if not exists trip_facts_org_date_idx on fleet.trip_facts (organization_id, local_date);
create index if not exists trip_facts_org_driver_date_idx on fleet.trip_facts (organization_id, driver_id, local_date);
create index if not exists trip_facts_org_vehicle_date_idx on fleet.trip_facts (organization_id, vehicle_id, local_date);
create index if not exists trip_facts_org_status_date_idx on fleet.trip_facts (organization_id, status_bucket, local_date);
create index if not exists trip_facts_anomaly_gin on fleet.trip_facts using gin (anomaly_flags);

create table if not exists fleet.trip_anomaly_reviews (
  organization_id text not null,
  trip_id text not null,
  rule text not null,
  action text not null check (action in ('dismiss', 'keep')),
  reason text,
  reviewed_by text,
  reviewed_at timestamptz not null default now(),
  primary key (organization_id, trip_id, rule)
);

alter table fleet.trip_facts enable row level security;
alter table fleet.trip_zones enable row level security;
alter table fleet.trip_analytics_settings enable row level security;
alter table fleet.trip_anomaly_reviews enable row level security;

revoke all on fleet.trip_facts from public, anon, authenticated;
revoke all on fleet.trip_zones from public, anon, authenticated;
revoke all on fleet.trip_analytics_settings from public, anon, authenticated;
revoke all on fleet.trip_anomaly_reviews from public, anon, authenticated;
grant select, insert, update, delete on fleet.trip_facts to service_role;
grant select, insert, update, delete on fleet.trip_zones to service_role;
grant select, insert, update, delete on fleet.trip_analytics_settings to service_role;
grant select, insert, update, delete on fleet.trip_anomaly_reviews to service_role;

insert into fleet.trip_zones (id, name, parish, centroid_lat, centroid_lng, aliases) values
  ('kingston', 'Kingston', 'Kingston', 17.9714, -76.7931, array['kingston','new kingston','half way tree','halfway tree','cross roads','crossroads','downtown kingston']),
  ('portmore', 'Portmore', 'St. Catherine', 17.9545, -76.8820, array['portmore','portmore pines','greater portmore']),
  ('spanish-town', 'Spanish Town', 'St. Catherine', 17.9911, -76.9574, array['spanish town']),
  ('montego-bay', 'Montego Bay', 'St. James', 18.4762, -77.8939, array['montego bay','mobay']),
  ('ocho-rios', 'Ocho Rios', 'St. Ann', 18.4076, -77.1031, array['ocho rios']),
  ('negril', 'Negril', 'Westmoreland', 18.2684, -78.3481, array['negril']),
  ('mandeville', 'Mandeville', 'Manchester', 18.0416, -77.5071, array['mandeville']),
  ('may-pen', 'May Pen', 'Clarendon', 17.9645, -77.2450, array['may pen']),
  ('old-harbour', 'Old Harbour', 'St. Catherine', 17.9414, -77.1090, array['old harbour']),
  ('port-antonio', 'Port Antonio', 'Portland', 18.1764, -76.4509, array['port antonio'])
on conflict (id) do update set
  centroid_lat = excluded.centroid_lat,
  centroid_lng = excluded.centroid_lng,
  aliases = excluded.aliases;

create or replace function fleet.zone_for_trip(p_area text, p_lat double precision, p_lng double precision)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (
      select z.name
      from fleet.trip_zones z
      where p_area is not null
        and (lower(z.name) = p_area or p_area = any (z.aliases))
      limit 1
    ),
    (
      select z.name
      from fleet.trip_zones z
      where p_lat is not null
        and z.centroid_lat is not null
        and fleet.haversine_km(p_lat, p_lng, z.centroid_lat, z.centroid_lng) <= 3
      order by fleet.haversine_km(p_lat, p_lng, z.centroid_lat, z.centroid_lng)
      limit 1
    )
  );
$$;

create or replace function fleet.project_trip_fact(t fleet.trips)
returns fleet.trip_facts
language plpgsql
stable
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

  f.anomaly_flags := '{}';
  if f.status_bucket = 'completed' and coalesce(f.amount, 0) = 0 then
    f.anomaly_flags := f.anomaly_flags || array['zero_fare'];
  end if;
  if f.status_bucket = 'completed' and (f.distance_km is null or f.distance_km = 0) then
    f.anomaly_flags := f.anomaly_flags || array['zero_distance'];
  end if;
  if f.status_bucket = 'completed' and f.distance_km > 100 then
    f.anomaly_flags := f.anomaly_flags || array['long_distance'];
  end if;
  if f.status_bucket = 'completed' and f.duration_min > 180 then
    f.anomaly_flags := f.anomaly_flags || array['long_duration'];
  end if;
  if f.status_bucket = 'completed' and f.amount > 5000 then
    f.anomaly_flags := f.anomaly_flags || array['fare_outlier_floor'];
  end if;
  if f.status_bucket = 'completed' and f.distance_km > 0 and (f.amount / f.distance_km) > 500 then
    f.anomaly_flags := f.anomaly_flags || array['fare_per_km'];
  end if;
  if f.status_bucket = 'completed' and f.distance_km > 0 and f.duration_min > 0 then
    if (f.distance_km / (f.duration_min / 60.0)) > 120 then
      f.anomaly_flags := f.anomaly_flags || array['speed_high'];
    elsif (f.distance_km / (f.duration_min / 60.0)) < 3 and f.distance_km > 2 then
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

create or replace function fleet.sync_trip_fact()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from fleet.trip_facts where trip_id = old.id;
    return old;
  end if;
  delete from fleet.trip_facts where trip_id = new.id;
  insert into fleet.trip_facts
  select (fleet.project_trip_fact(new)).*;
  return new;
end;
$$;

drop trigger if exists trip_facts_sync on fleet.trips;
create trigger trip_facts_sync
  after insert or update or delete on fleet.trips
  for each row execute function fleet.sync_trip_fact();

-- Existing trips are copied in short batches. One full pass times out the SQL editor.
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

create or replace function fleet.trip_prior_window(p_start date, p_end date)
returns table (prior_start date, prior_end date)
language plpgsql
immutable
set search_path = ''
as $$
declare
  len int;
  prev_month date;
  day_n int;
  last_prev int;
begin
  if p_start is null or p_end is null or p_end < p_start then
    return;
  end if;
  -- same days of the previous month when the range starts on the 1st and stays in that month
  if extract(day from p_start) = 1
     and date_trunc('month', p_start) = date_trunc('month', p_end) then
    prev_month := (p_start - interval '1 month')::date;
    day_n := extract(day from p_end)::int;
    last_prev := extract(day from (date_trunc('month', prev_month) + interval '1 month - 1 day'))::int;
    prior_start := date_trunc('month', prev_month)::date;
    prior_end := (date_trunc('month', prev_month)::date + (least(day_n, last_prev) - 1));
    return next;
    return;
  end if;
  len := (p_end - p_start) + 1;
  prior_end := p_start - 1;
  prior_start := prior_end - (len - 1);
  return next;
end;
$$;

create or replace function fleet.trip_facts_matching(p_org text, f jsonb)
returns setof fleet.trip_facts
language sql
stable
security invoker
set search_path = ''
as $$
  select t.*
  from fleet.trip_facts t
  where t.organization_id = p_org
    and (
      coalesce(f->>'population', 'rideshare') = 'all'
      or t.analytics_population = coalesce(nullif(f->>'population', ''), 'rideshare')
    )
    and (nullif(f->>'startDate', '') is null or t.local_date >= (f->>'startDate')::date)
    and (nullif(f->>'endDate', '') is null or t.local_date <= (f->>'endDate')::date)
    and (
      f->'platforms' is null
      or jsonb_typeof(f->'platforms') <> 'array'
      or jsonb_array_length(f->'platforms') = 0
      or t.platform in (select jsonb_array_elements_text(f->'platforms'))
    )
    and (nullif(f->>'platform', '') is null or t.platform = f->>'platform')
    and (nullif(f->>'serviceLine', '') is null or t.service_line = f->>'serviceLine')
    and (
      f->'driverIds' is null
      or jsonb_typeof(f->'driverIds') <> 'array'
      or jsonb_array_length(f->'driverIds') = 0
      or t.driver_id in (select jsonb_array_elements_text(f->'driverIds'))
    )
    and (nullif(f->>'driverId', '') is null or t.driver_id = f->>'driverId')
    and (
      f->'vehicleIds' is null
      or jsonb_typeof(f->'vehicleIds') <> 'array'
      or jsonb_array_length(f->'vehicleIds') = 0
      or t.vehicle_id in (select jsonb_array_elements_text(f->'vehicleIds'))
    )
    and (nullif(f->>'vehicleId', '') is null or t.vehicle_id = f->>'vehicleId')
    and (nullif(f->>'status', '') is null or t.status_bucket = f->>'status')
    and (
      nullif(f->>'paymentMethod', '') is null
      or (f->>'paymentMethod' = 'cash' and lower(coalesce(t.payment_method, '')) = 'cash')
      or (f->>'paymentMethod' = 'digital' and lower(coalesce(t.payment_method, '')) is distinct from 'cash')
    )
    and (
      nullif(f->>'zone', '') is null
      or t.pickup_zone = f->>'zone'
      or t.dropoff_zone = f->>'zone'
    )
    and (f->>'isManual' is null or t.is_manual = (f->>'isManual')::boolean)
    and (nullif(f->>'hour', '') is null or t.local_hour = (f->>'hour')::int)
    and (nullif(f->>'dow', '') is null or t.local_dow = (f->>'dow')::int)
    and (nullif(f->>'minEarnings', '') is null or t.amount >= (f->>'minEarnings')::numeric)
    and (nullif(f->>'maxEarnings', '') is null or t.amount <= (f->>'maxEarnings')::numeric)
    and (nullif(f->>'minDistance', '') is null or t.distance_km >= (f->>'minDistance')::numeric)
    and (f->>'hasTip' is null or t.has_tip = (f->>'hasTip')::boolean)
    and (f->>'hasSurge' is null or t.has_surge = (f->>'hasSurge')::boolean)
    and (nullif(f->>'anchorPeriodId', '') is null or t.anchor_period_id = f->>'anchorPeriodId');
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

create or replace function fleet.trip_analytics_kpis(p_org text, f jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  cur jsonb;
  pri jsonb;
  ps date;
  pe date;
begin
  cur := fleet.trip_kpi_block(p_org, f);
  if coalesce((f->>'compare')::boolean, true)
     and nullif(f->>'startDate', '') is not null
     and nullif(f->>'endDate', '') is not null then
    select w.prior_start, w.prior_end into ps, pe
    from fleet.trip_prior_window((f->>'startDate')::date, (f->>'endDate')::date) w;
    if ps is not null then
      pri := fleet.trip_kpi_block(p_org, f || jsonb_build_object('startDate', ps, 'endDate', pe));
    end if;
  end if;
  return jsonb_build_object('current', cur, 'prior', pri, 'priorStart', ps, 'priorEnd', pe);
end;
$$;

create or replace function fleet.trip_analytics_volume(p_org text, f jsonb, p_grain text default 'day')
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  series jsonb;
  prior jsonb := '[]'::jsonb;
  by_dow jsonb;
  ps date;
  pe date;
begin
  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.bucket), '[]'::jsonb)
  into series
  from (
    select
      case when p_grain = 'week' then (date_trunc('week', local_date))::date else local_date end as bucket,
      count(*) filter (where status_bucket = 'completed') as completed,
      count(*) filter (where status_bucket = 'cancelled') as cancelled,
      count(*) filter (where status_bucket = 'in_progress') as in_progress
    from fleet.trip_facts_matching(p_org, f)
    where local_date is not null
    group by 1
  ) x;

  select coalesce(jsonb_agg(row_to_json(d)::jsonb order by d.dow), '[]'::jsonb)
  into by_dow
  from (
    select local_dow as dow,
      count(*) filter (where status_bucket = 'completed') as completed,
      count(*) filter (where status_bucket = 'cancelled') as cancelled
    from fleet.trip_facts_matching(p_org, f)
    where local_dow is not null
    group by local_dow
  ) d;

  if nullif(f->>'startDate', '') is not null and nullif(f->>'endDate', '') is not null then
    select w.prior_start, w.prior_end into ps, pe
    from fleet.trip_prior_window((f->>'startDate')::date, (f->>'endDate')::date) w;
    if ps is not null then
      select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.bucket), '[]'::jsonb)
      into prior
      from (
        select local_date as bucket,
          count(*) filter (where status_bucket = 'completed') as completed,
          count(*) filter (where status_bucket = 'cancelled') as cancelled
        from fleet.trip_facts_matching(p_org, f || jsonb_build_object('startDate', ps, 'endDate', pe))
        where local_date is not null
        group by local_date
      ) x;
    end if;
  end if;

  return jsonb_build_object('series', series, 'prior', prior, 'byDow', by_dow, 'priorStart', ps, 'priorEnd', pe);
end;
$$;

create or replace function fleet.trip_analytics_heatmap(p_org text, f jsonb, p_measure text default 'completed')
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with base as (
    select * from fleet.trip_facts_matching(p_org, f)
  ),
  cells as (
    select local_dow as dow, local_hour as hour,
      case p_measure
        when 'cancelled' then count(*) filter (where status_bucket = 'cancelled')::numeric
        when 'surge_share' then
          case when sum(amount) filter (where platform = 'Uber' and status_bucket = 'completed') > 0
            then sum(coalesce(fare_surge, 0)) filter (where platform = 'Uber' and status_bucket = 'completed')
              / sum(amount) filter (where platform = 'Uber' and status_bucket = 'completed')
            else null end
        when 'fare_per_km' then
          case when sum(distance_km) filter (where status_bucket = 'completed' and coalesce(distance_km, 0) > 0) > 0
            then sum(amount) filter (where status_bucket = 'completed' and coalesce(distance_km, 0) > 0)
              / sum(distance_km) filter (where status_bucket = 'completed' and coalesce(distance_km, 0) > 0)
            else null end
        else count(*) filter (where status_bucket = 'completed')::numeric
      end as value
    from base
    where local_hour is not null and local_dow is not null
    group by local_dow, local_hour
  )
  select jsonb_build_object(
    'measure', p_measure,
    'cells', coalesce((select jsonb_agg(jsonb_build_object('dow', dow, 'hour', hour, 'value', value)) from cells), '[]'::jsonb),
    'timeKnown', (select count(*) from base where local_hour is not null),
    'timeUnknown', (select count(*) from base where time_unknown or local_hour is null),
    'total', (select count(*) from base)
  );
$$;

create or replace function fleet.trip_analytics_cancellations(p_org text, f jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  widened jsonb := f || jsonb_build_object('population', 'all', 'status', 'cancelled');
  by_actor jsonb;
  by_reason jsonb;
  trend jsonb;
  drivers jsonb;
  mean_rate numeric;
  std_rate numeric;
begin
  -- Actor chart includes delivery jobs. Rate cards stay on the rideshare filter.
  select coalesce(jsonb_agg(jsonb_build_object('actor', cancel_actor, 'count', n) order by n desc), '[]'::jsonb)
  into by_actor
  from (
    select coalesce(cancel_actor, 'unknown') as cancel_actor, count(*) as n
    from fleet.trip_facts_matching(p_org, widened)
    group by 1
  ) a;

  select coalesce(jsonb_agg(jsonb_build_object('reason', cancel_reason_code, 'count', n) order by n desc), '[]'::jsonb)
  into by_reason
  from (
    select coalesce(cancel_reason_code, 'unknown') as cancel_reason_code, count(*) as n
    from fleet.trip_facts_matching(p_org, widened)
    group by 1
  ) r;

  select avg(rate), stddev_pop(rate) into mean_rate, std_rate
  from (
    select local_date,
      count(*) filter (where status_bucket = 'cancelled')::numeric
        / nullif(count(*) filter (where status_bucket in ('completed', 'cancelled')), 0) as rate
    from fleet.trip_facts_matching(p_org, f || jsonb_build_object('population', 'all', 'status', null))
    where local_date is not null
    group by local_date
  ) daily
  where rate is not null;

  select coalesce(jsonb_agg(jsonb_build_object(
    'date', local_date, 'cancelled', cancelled, 'completed', completed, 'rate', rate, 'spike', spike
  ) order by local_date), '[]'::jsonb)
  into trend
  from (
    select local_date,
      count(*) filter (where status_bucket = 'cancelled') as cancelled,
      count(*) filter (where status_bucket = 'completed') as completed,
      count(*) filter (where status_bucket = 'cancelled')::numeric
        / nullif(count(*) filter (where status_bucket in ('completed', 'cancelled')), 0) as rate,
      (
        count(*) filter (where status_bucket = 'cancelled')::numeric
          / nullif(count(*) filter (where status_bucket in ('completed', 'cancelled')), 0)
      ) > (coalesce(mean_rate, 0) + 2 * coalesce(std_rate, 0))
      and coalesce(std_rate, 0) > 0 as spike
    from fleet.trip_facts_matching(p_org, f || jsonb_build_object('population', 'all', 'status', null))
    where local_date is not null
    group by local_date
  ) t;

  select coalesce(jsonb_agg(jsonb_build_object(
    'driverId', driver_id, 'driverName', driver_name, 'trips', trips, 'cancelled', cancelled, 'rate', rate
  ) order by rate desc), '[]'::jsonb)
  into drivers
  from (
    select driver_id,
      max(driver_name) as driver_name,
      count(*) filter (where status_bucket in ('completed', 'cancelled')) as trips,
      count(*) filter (where status_bucket = 'cancelled') as cancelled,
      count(*) filter (where status_bucket = 'cancelled')::numeric
        / nullif(count(*) filter (where status_bucket in ('completed', 'cancelled')), 0) as rate
    from fleet.trip_facts_matching(p_org, f || jsonb_build_object('population', 'rideshare', 'status', null))
    where driver_id is not null
    group by driver_id
    having count(*) filter (where status_bucket in ('completed', 'cancelled')) >= 20
  ) d;

  return jsonb_build_object(
    'byActor', by_actor,
    'byReason', by_reason,
    'trend', trend,
    'topDrivers', drivers,
    'cancelled', coalesce((select sum((item->>'count')::int) from jsonb_array_elements(by_actor) item), 0)
  );
end;
$$;

create or replace function fleet.trip_analytics_economics(p_org text, f jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  p50 numeric;
  p99 numeric;
  uber_gross numeric;
  composition jsonb;
  hist jsonb;
  by_hour jsonb;
  fees jsonb;
  cash_split jsonb;
  gap numeric;
begin
  select
    percentile_cont(0.5) within group (order by amount),
    percentile_cont(0.99) within group (order by amount),
    coalesce(sum(amount) filter (where platform = 'Uber'), 0)
  into p50, p99, uber_gross
  from fleet.trip_facts_matching(p_org, f)
  where status_bucket = 'completed' and amount is not null;

  select jsonb_build_object(
    'base', coalesce(sum(fare_base), 0),
    'surge', coalesce(sum(fare_surge), 0),
    'tips', coalesce(sum(fare_tips), 0),
    'wait', coalesce(sum(fare_wait), 0),
    'airport', coalesce(sum(fare_airport), 0),
    'taxes', coalesce(sum(fare_taxes), 0),
    'tolls', coalesce(sum(tolls), 0),
    'gross', uber_gross
  )
  into composition
  from fleet.trip_facts_matching(p_org, f)
  where status_bucket = 'completed' and platform = 'Uber';

  gap := uber_gross - (
    coalesce((composition->>'base')::numeric, 0)
    + coalesce((composition->>'surge')::numeric, 0)
    + coalesce((composition->>'tips')::numeric, 0)
    + coalesce((composition->>'wait')::numeric, 0)
    + coalesce((composition->>'airport')::numeric, 0)
    + coalesce((composition->>'taxes')::numeric, 0)
    + coalesce((composition->>'tolls')::numeric, 0)
  );

  select coalesce(jsonb_agg(jsonb_build_object('bin', bin, 'count', n) order by bin), '[]'::jsonb)
  into hist
  from (
    select least(width_bucket(amount, 0, 5000, 10), 11) as bin, count(*) as n
    from fleet.trip_facts_matching(p_org, f)
    where status_bucket = 'completed' and amount is not null
    group by 1
  ) h;

  select coalesce(jsonb_agg(jsonb_build_object('hour', local_hour, 'platform', platform, 'farePerKm', fare_per_km) order by local_hour, platform), '[]'::jsonb)
  into by_hour
  from (
    select local_hour, platform,
      sum(amount) / nullif(sum(distance_km), 0) as fare_per_km
    from fleet.trip_facts_matching(p_org, f)
    where status_bucket = 'completed' and coalesce(distance_km, 0) > 0 and local_hour is not null
    group by local_hour, platform
  ) hp;

  select coalesce(jsonb_agg(jsonb_build_object(
    'platform', platform, 'gross', gross, 'fee', fee, 'net', net, 'feePct', fee_pct
  )), '[]'::jsonb)
  into fees
  from (
    select platform,
      coalesce(sum(amount), 0) as gross,
      coalesce(sum(platform_fee), 0) as fee,
      coalesce(sum(net_to_driver), 0) as net,
      case when sum(amount) > 0 then sum(platform_fee) / sum(amount) else null end as fee_pct
    from fleet.trip_facts_matching(p_org, f)
    where status_bucket = 'completed'
    group by platform
  ) fee_rows;

  select coalesce(jsonb_agg(jsonb_build_object('platform', platform, 'cash', cash_n, 'digital', digital_n)), '[]'::jsonb)
  into cash_split
  from (
    select platform,
      count(*) filter (where lower(coalesce(payment_method, '')) = 'cash') as cash_n,
      count(*) filter (where lower(coalesce(payment_method, '')) is distinct from 'cash') as digital_n
    from fleet.trip_facts_matching(p_org, f)
    where status_bucket = 'completed'
    group by platform
  ) c;

  return jsonb_build_object(
    'p50', p50,
    'p99', p99,
    'histogram', hist,
    'uberComposition', composition,
    'uberGap', gap,
    'uberGapWithin1Pct', case when uber_gross = 0 then true else abs(gap) <= uber_gross * 0.01 end,
    'farePerKmByHour', by_hour,
    'fees', fees,
    'cashVsDigital', cash_split
  );
end;
$$;

create or replace function fleet.trip_analytics_geo(p_org text, f jsonb, p_kind text default 'all')
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  cells jsonb;
  dropoff_cells jsonb;
  areas jsonb;
  routes jsonb;
  matrix jsonb;
  deadhead jsonb;
  gps_n bigint;
  total_n bigint;
begin
  select count(*) filter (where pickup_lat is not null and pickup_lng is not null), count(*)
  into gps_n, total_n
  from fleet.trip_facts_matching(p_org, f)
  where status_bucket = 'completed';

  select coalesce(jsonb_agg(jsonb_build_object('lat', lat, 'lng', lng, 'count', n)), '[]'::jsonb)
  into cells
  from (
    select round(pickup_lat::numeric, 3) as lat, round(pickup_lng::numeric, 3) as lng, count(*) as n
    from fleet.trip_facts_matching(p_org, f)
    where status_bucket = 'completed' and pickup_lat is not null and pickup_lng is not null
    group by 1, 2
    order by n desc
    limit 400
  ) g;

  select coalesce(jsonb_agg(jsonb_build_object('lat', lat, 'lng', lng, 'count', n)), '[]'::jsonb)
  into dropoff_cells
  from (
    select round(dropoff_lat::numeric, 3) as lat, round(dropoff_lng::numeric, 3) as lng, count(*) as n
    from fleet.trip_facts_matching(p_org, f)
    where status_bucket = 'completed' and dropoff_lat is not null and dropoff_lng is not null
    group by 1, 2
    order by n desc
    limit 400
  ) d;

  select coalesce(jsonb_agg(jsonb_build_object('area', pickup_zone, 'trips', n) order by n desc), '[]'::jsonb)
  into areas
  from (
    select pickup_zone, count(*) as n
    from fleet.trip_facts_matching(p_org, f)
    where status_bucket = 'completed' and pickup_zone is not null
    group by pickup_zone
    order by n desc
    limit 10
  ) a;

  select coalesce(jsonb_agg(jsonb_build_object(
    'from', pickup_zone, 'to', dropoff_zone, 'trips', n, 'avgFare', avg_fare, 'avgDuration', avg_dur
  ) order by n desc), '[]'::jsonb)
  into routes
  from (
    select pickup_zone, dropoff_zone, count(*) as n, avg(amount) as avg_fare, avg(duration_min) as avg_dur
    from fleet.trip_facts_matching(p_org, f)
    where status_bucket = 'completed' and pickup_zone is not null and dropoff_zone is not null
    group by pickup_zone, dropoff_zone
    order by n desc
    limit 10
  ) r;

  select coalesce(jsonb_agg(jsonb_build_object(
    'from', pickup_zone, 'to', dropoff_zone, 'trips', n, 'avgFare', avg_fare, 'avgDuration', avg_dur
  )), '[]'::jsonb)
  into matrix
  from (
    select pickup_zone, dropoff_zone, count(*) as n, avg(amount) as avg_fare, avg(duration_min) as avg_dur
    from fleet.trip_facts_matching(p_org, f)
    where status_bucket = 'completed'
      and pickup_zone in (
        select pickup_zone from fleet.trip_facts_matching(p_org, f)
        where status_bucket = 'completed' and pickup_zone is not null
        group by pickup_zone order by count(*) desc limit 8
      )
      and dropoff_zone is not null
    group by pickup_zone, dropoff_zone
  ) m;

  select jsonb_build_object(
    'trips', count(*),
    'km', coalesce(sum(deadhead_km_allocated), 0),
    'kmPerTrip', case when count(*) > 0 then sum(deadhead_km_allocated) / count(*) else null end,
    'label', 'allocated'
  )
  into deadhead
  from fleet.trip_facts_matching(p_org, f)
  where status_bucket = 'completed' and platform = 'Uber' and deadhead_km_allocated is not null;

  return jsonb_build_object(
    'kind', p_kind,
    'gpsTrips', gps_n,
    'completedTrips', total_n,
    'cells', cells,
    'dropoffCells', dropoff_cells,
    'areas', areas,
    'routes', routes,
    'matrix', matrix,
    'deadhead', deadhead
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
    cross join lateral (
      select unnest(array_remove(array[
        case when coalesce(b.amount, 0) = 0 then 'zero_fare' end,
        case when b.distance_km is null or b.distance_km = 0 then 'zero_distance' end,
        case when b.distance_km > v_long_km then 'long_distance' end,
        case when b.duration_min > v_long_min then 'long_duration' end,
        case when b.amount > greatest(v_floor, coalesce(p.p99, 0) * 1.5) then 'fare_outlier' end,
        case when coalesce(b.distance_km, 0) > 0 and b.amount / b.distance_km > v_fpk then 'fare_per_km' end,
        case when coalesce(b.duration_min, 0) > 0 and coalesce(b.distance_km, 0) > 0
          and (b.distance_km / (b.duration_min / 60.0)) > v_speed_high then 'speed_high' end,
        case when coalesce(b.duration_min, 0) > 0 and coalesce(b.distance_km, 0) > v_speed_km
          and (b.distance_km / (b.duration_min / 60.0)) < v_speed_low then 'speed_low' end,
        case when b.request_at is not null and exists (
          select 1 from fleet.trip_facts o
          where o.organization_id = b.organization_id and o.driver_id = b.driver_id
            and o.request_at = b.request_at and o.trip_id <> b.trip_id
        ) then 'duplicate' end,
        case when b.time_unknown then 'missing_time' end,
        case when b.vehicle_id is null then 'missing_vehicle' end,
        case when b.pickup_lat is not null and b.dropoff_lat is not null
          and fleet.haversine_km(b.pickup_lat, b.pickup_lng, b.dropoff_lat, b.dropoff_lng) * 1000 < v_gps_m
          and b.amount > 2 * coalesce(p.med, b.amount) then 'gps_equal' end
      ], null)) as rule
    ) rules
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

create or replace function fleet.trip_facts_parity(p_org text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'trips', (select count(*) from fleet.trips where organization_id = p_org),
    'facts', (select count(*) from fleet.trip_facts where organization_id = p_org),
    'tripAmount', (select coalesce(sum(amount), 0) from fleet.trips where organization_id = p_org),
    'factAmount', (select coalesce(sum(amount), 0) from fleet.trip_facts where organization_id = p_org),
    'ok', (
      (select count(*) from fleet.trips where organization_id = p_org)
      = (select count(*) from fleet.trip_facts where organization_id = p_org)
      and (select coalesce(sum(amount), 0) from fleet.trips where organization_id = p_org)
        is not distinct from (select coalesce(sum(amount), 0) from fleet.trip_facts where organization_id = p_org)
    )
  );
$$;

create or replace function fleet.trip_analytics_coverage(p_org text, f jsonb)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with base as (
    select * from fleet.trip_facts_matching(p_org, f || jsonb_build_object('population', 'all'))
  )
  select jsonb_build_object(
    'total', count(*),
    'rideshare', count(*) filter (where analytics_population = 'rideshare'),
    'delivery', count(*) filter (where analytics_population = 'delivery'),
    'byPlatform', coalesce((
      select jsonb_agg(jsonb_build_object(
        'platform', platform,
        'trips', n,
        'withTime', with_time,
        'withGps', with_gps,
        'withDistance', with_distance,
        'withFareBreakdown', with_fare
      ))
      from (
        select platform, count(*) n,
          count(*) filter (where not time_unknown) with_time,
          count(*) filter (where pickup_lat is not null) with_gps,
          count(*) filter (where coalesce(distance_km, 0) > 0) with_distance,
          count(*) filter (where fare_base is not null or fare_surge is not null) with_fare
        from base group by platform
      ) p
    ), '[]'::jsonb),
    'gpsTrips', count(*) filter (where pickup_lat is not null and status_bucket = 'completed'),
    'completed', count(*) filter (where status_bucket = 'completed' and analytics_population = 'rideshare'),
    'timeUnknown', count(*) filter (where time_unknown),
    'parity', fleet.trip_facts_parity(p_org)
  )
  from base;
$$;

create or replace function fleet.trip_fact_page(
  p_org text, f jsonb, p_limit int default 50, p_offset int default 0, p_sort text default 'local_date', p_asc boolean default false
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
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
  total_n bigint;
  rows jsonb;
begin
  select count(*) into total_n from fleet.trip_facts_matching(p_org, f);
  execute format(
    'select coalesce(jsonb_agg(row_to_json(page)::jsonb), ''[]''::jsonb) from (
       select trip_id, anomaly_flags, cancel_actor, local_date, platform, amount
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
  using p_org, f, p_asc, v_limit, v_offset;

  return jsonb_build_object('total', total_n, 'rows', rows);
end;
$$;

create or replace function fleet.trip_analytics_watermark(p_org text)
returns timestamptz
language sql
stable
security invoker
set search_path = ''
as $$
  select max(updated_at) from fleet.trip_facts where organization_id = p_org;
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
begin
  with rides as (
    select r.*
    from rides.ride_requests r
    where r.organization_id::text = p_org
      and (nullif(f->>'startDate', '') is null or (r.created_at at time zone 'America/Jamaica')::date >= (f->>'startDate')::date)
      and (nullif(f->>'endDate', '') is null or (r.created_at at time zone 'America/Jamaica')::date <= (f->>'endDate')::date)
  ),
  marked as (
    select
      status,
      status in ('driver_assigned', 'driver_en_route_pickup', 'driver_arrived_pickup', 'on_trip', 'completed') as did_accept,
      status in ('driver_arrived_pickup', 'on_trip', 'completed') as did_arrive,
      status in ('on_trip', 'completed') as did_start,
      status = 'completed' as did_complete,
      exists (select 1 from rides.driver_offers o where o.ride_request_id = rides.id) as had_offer,
      cancelled_by,
      cancel_reason
    from rides
  )
  select
    count(*),
    count(*) filter (where had_offer or did_accept),
    count(*) filter (where did_accept),
    count(*) filter (where did_arrive),
    count(*) filter (where did_start),
    count(*) filter (where did_complete)
  into requested, offered, accepted, arrived, started, completed
  from marked;

  select coalesce(jsonb_agg(jsonb_build_object('reason', reason, 'count', n) order by n desc), '[]'::jsonb)
  into reasons
  from (
    select coalesce(nullif(cancel_reason, ''), 'unmatched') as reason, count(*) as n
    from rides.ride_requests r
    where r.organization_id::text = p_org
      and r.status = 'cancelled'
      and r.cancelled_by = 'system'
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

revoke all on function fleet.trip_num(text) from public, anon, authenticated;
revoke all on function fleet.trip_bool(text) from public, anon, authenticated;
revoke all on function fleet.normalize_trip_area(text) from public, anon, authenticated;
revoke all on function fleet.haversine_km(double precision, double precision, double precision, double precision) from public, anon, authenticated;
revoke all on function fleet.zone_for_trip(text, double precision, double precision) from public, anon, authenticated;
revoke all on function fleet.project_trip_fact(fleet.trips) from public, anon, authenticated;
revoke all on function fleet.sync_trip_fact() from public, anon, authenticated;
revoke all on function fleet.trip_prior_window(date, date) from public, anon, authenticated;
revoke all on function fleet.trip_facts_matching(text, jsonb) from public, anon, authenticated;
revoke all on function fleet.trip_kpi_block(text, jsonb) from public, anon, authenticated;
revoke all on function fleet.trip_analytics_kpis(text, jsonb) from public, anon, authenticated;
revoke all on function fleet.trip_analytics_volume(text, jsonb, text) from public, anon, authenticated;
revoke all on function fleet.trip_analytics_heatmap(text, jsonb, text) from public, anon, authenticated;
revoke all on function fleet.trip_analytics_cancellations(text, jsonb) from public, anon, authenticated;
revoke all on function fleet.trip_analytics_economics(text, jsonb) from public, anon, authenticated;
revoke all on function fleet.trip_analytics_geo(text, jsonb, text) from public, anon, authenticated;
revoke all on function fleet.trip_analytics_anomalies(text, jsonb) from public, anon, authenticated;
revoke all on function fleet.trip_analytics_coverage(text, jsonb) from public, anon, authenticated;
revoke all on function fleet.trip_facts_parity(text) from public, anon, authenticated;
revoke all on function fleet.trip_fact_page(text, jsonb, int, int, text, boolean) from public, anon, authenticated;
revoke all on function fleet.trip_analytics_watermark(text) from public, anon, authenticated;
revoke all on function fleet.roam_ride_funnel(text, jsonb) from public, anon, authenticated;
revoke all on function fleet.backfill_trip_facts(int) from public, anon, authenticated;

grant execute on function fleet.trip_facts_matching(text, jsonb) to service_role;
grant execute on function fleet.trip_kpi_block(text, jsonb) to service_role;
grant execute on function fleet.trip_analytics_kpis(text, jsonb) to service_role;
grant execute on function fleet.trip_analytics_volume(text, jsonb, text) to service_role;
grant execute on function fleet.trip_analytics_heatmap(text, jsonb, text) to service_role;
grant execute on function fleet.trip_analytics_cancellations(text, jsonb) to service_role;
grant execute on function fleet.trip_analytics_economics(text, jsonb) to service_role;
grant execute on function fleet.trip_analytics_geo(text, jsonb, text) to service_role;
grant execute on function fleet.trip_analytics_anomalies(text, jsonb) to service_role;
grant execute on function fleet.trip_analytics_coverage(text, jsonb) to service_role;
grant execute on function fleet.trip_facts_parity(text) to service_role;
grant execute on function fleet.trip_fact_page(text, jsonb, int, int, text, boolean) to service_role;
grant execute on function fleet.trip_analytics_watermark(text) to service_role;
grant execute on function fleet.roam_ride_funnel(text, jsonb) to service_role;
grant execute on function fleet.haversine_km(double precision, double precision, double precision, double precision) to service_role;
grant execute on function fleet.backfill_trip_facts(int) to service_role;

notify pgrst, 'reload schema';
