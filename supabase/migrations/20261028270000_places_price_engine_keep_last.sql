-- Keep the latest accepted price when this Petrojam week has no new report.
-- Older prices stay on the map and are marked outdated.

create or replace function places.price_engine_publish(p_place_id text, p_grade text)
returns void
language plpgsql
security definer
set search_path = places, public
as $$
declare
  settings places.price_engine_settings%rowtype;
  week date;
  window_start timestamptz;
  published numeric;
  spread numeric;
  n int;
  fleet_n int;
  plug_n int;
  confidence text;
  history_id uuid;
  current_price numeric;
  stale boolean := false;
  fallback_at timestamptz;
begin
  if p_place_id is null or p_grade is null or p_grade = 'unknown' then
    return;
  end if;
  select * into settings from places.price_engine_settings where id = 1;
  week := places.latest_petrojam_date();
  if week is null then
    return;
  end if;
  window_start := greatest(week::timestamptz, now() - make_interval(days => settings.window_days));

  with rows as (
    select r.price_per_litre as price, c.weight, r.source
    from places.price_report r
    join places.price_report_check c on c.source = r.source and c.report_id = r.id
    where r.place_id = p_place_id
      and r.grade = p_grade
      and c.status in ('accepted', 'approved')
      and c.weight > 0
      and not ('DUPLICATE' = any (c.reasons))
      and r.reported_at >= window_start
  ),
  ordered as (
    select
      price,
      sum(weight) over (order by price) as cum,
      sum(weight) over () as total,
      count(*) over () as row_n,
      count(*) filter (where source = 'fleet') over () as row_fleet,
      count(*) filter (where source = 'plug') over () as row_plug,
      max(price) over () as max_price,
      min(price) over () as min_price
    from rows
  )
  select price, row_n::int, row_fleet::int, row_plug::int,
         case when price > 0 then (max_price - min_price) / price else null end
    into published, n, fleet_n, plug_n, spread
  from ordered
  where cum >= total / 2
  order by price
  limit 1;

  if published is null then
    select r.price_per_litre, 1,
           case when r.source = 'fleet' then 1 else 0 end,
           case when r.source = 'plug' then 1 else 0 end,
           0,
           r.reported_at
      into published, n, fleet_n, plug_n, spread, fallback_at
    from places.price_report r
    join places.price_report_check c on c.source = r.source and c.report_id = r.id
    where r.place_id = p_place_id
      and r.grade = p_grade
      and c.status in ('accepted', 'approved')
      and c.weight > 0
      and not ('DUPLICATE' = any (c.reasons))
    order by r.reported_at desc
    limit 1;
    if published is not null then
      select max(price_date) into week
      from fuel.petrojam_prices
      where price_date <= fallback_at::date;
    end if;
    if published is null or week is null then
      update places.price_current
      set outdated = true
      where place_id = p_place_id
        and grade = p_grade
        and (
          valid_until < now()
          or (week is not null and petrojam_week is not null and petrojam_week < week)
        );
      perform places.refresh_public_place(p_place_id);
      return;
    end if;
    stale := true;
  end if;

  if n >= 3 and spread is not null and spread <= 0.02 then
    confidence := 'high';
  elsif n >= 2 or fleet_n >= 1 then
    confidence := 'medium';
  else
    confidence := 'low';
  end if;

  select price_per_litre into current_price
  from places.price_current
  where place_id = p_place_id and grade = p_grade
  limit 1;

  if current_price is null or round(current_price, 4) is distinct from round(published, 4) then
    insert into places.published_fuel_price (
      place_id, grade, price_per_litre, report_count, fleet_count, plug_count,
      spread_pct, confidence, petrojam_week, window_start, window_end, valid_until
    ) values (
      p_place_id, p_grade, published, n, fleet_n, plug_n,
      spread, confidence, week, window_start, now(), (week + 8)::timestamptz
    )
    returning id into history_id;
  else
    select published_id into history_id
    from places.price_current
    where place_id = p_place_id and grade = p_grade
    limit 1;
  end if;

  perform places.upsert_price_current(
    p_place_id, p_grade, published, confidence, n, fleet_n, plug_n,
    week, (week + 8)::timestamptz, history_id
  );

  update places.price_reporter rep
  set trust_weight = least(3.0, greatest(0.1, rep.trust_weight + delta.change)),
      accepted = rep.accepted + 1,
      updated_at = now()
  from (
    select r.reporter_key,
      case
        when published = 0 then 0
        when abs(r.price_per_litre - published) / published <= 0.03 then 0.05
        when abs(r.price_per_litre - published) / published > 0.10 then -0.10
        else 0
      end as change
    from places.price_report r
    join places.price_report_check c on c.source = r.source and c.report_id = r.id
    where r.place_id = p_place_id
      and r.grade = p_grade
      and c.status in ('accepted', 'approved')
      and c.trust_applied = false
      and r.reported_at >= window_start
  ) delta
  where rep.reporter_key = delta.reporter_key;

  update places.price_report_check c
  set trust_applied = true
  from places.price_report r
  where c.source = r.source
    and c.report_id = r.id
    and r.place_id = p_place_id
    and r.grade = p_grade
    and c.status in ('accepted', 'approved')
    and c.trust_applied = false
    and r.reported_at >= window_start;

  if stale or week < places.latest_petrojam_date() then
    update places.price_current
    set outdated = true
    where place_id = p_place_id and grade = p_grade;
  end if;
  perform places.refresh_public_place(p_place_id);
end;
$$;

-- Fills with no grade are still kept. They wait in Review.
do $missing$
begin
  if to_regclass('fleet.fuel_entries') is null then
    return;
  end if;
  insert into places.fleet_price_report (
    fuel_entry_id, organization_id, driver_id, vehicle_id, place_id,
    grade, grade_source, litres, amount, station_state, reported_at
  )
  select
    f.id,
    coalesce(nullif(f.organization_id, ''), 'unknown'),
    nullif(f.driver_id, ''),
    nullif(f.vehicle_id, ''),
    p.id,
    'unknown',
    'unknown',
    coalesce(f.liters, places.safe_numeric(f.payload_json->>'liters'), places.safe_numeric(f.payload_json->>'litres')),
    coalesce(f.amount, places.safe_numeric(f.payload_json->>'amount')),
    'verified',
    coalesce(f.created_at, f.date::timestamptz)
  from fleet.fuel_entries f
  join places.place p
    on p.id = coalesce(f.payload_json->>'matchedStationId', f.payload_json #>> '{metadata,matchedStationId}')
   and p.status = 'verified'
   and p.place_type = 'gas_station'
  where coalesce(f.date, f.created_at::date) >= date '2026-09-01'
    and coalesce(f.liters, places.safe_numeric(f.payload_json->>'liters'), places.safe_numeric(f.payload_json->>'litres'), 0) > 0
    and coalesce(f.amount, places.safe_numeric(f.payload_json->>'amount'), 0) > 0
    and not exists (select 1 from places.fleet_price_report r where r.fuel_entry_id = f.id);
end
$missing$;

do $republish$
declare
  rec record;
begin
  for rec in
    select distinct place_id, grade
    from places.fleet_price_report
    where place_id is not null
      and grade <> 'unknown'
  loop
    perform places.price_engine_publish(rec.place_id, rec.grade);
  end loop;
end
$republish$;
