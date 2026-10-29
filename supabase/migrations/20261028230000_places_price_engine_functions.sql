-- Price engine. One check per report, then one place and grade. No polling.

create or replace function places.wholesale_on(p_grade text, p_on date)
returns numeric
language plpgsql
stable
security definer
set search_path = fuel, public
as $$
declare
  col text;
  value numeric;
begin
  if to_regclass('fuel.petrojam_prices') is null then
    return null;
  end if;
  col := case p_grade
    when 'e10_90' then 'gasolene_90'
    when 'diesel' then 'auto_diesel'
    when 'ulsd' then 'ulsd'
    when 'e10_87' then 'gasolene_87'
    else null
  end;
  if col is null then
    return null;
  end if;
  execute format(
    'select %I from fuel.petrojam_prices where price_date <= $1 and %I is not null order by price_date desc limit 1',
    col, col
  ) into value using coalesce(p_on, current_date);
  return value;
exception
  when undefined_table then
    return null;
end;
$$;

create or replace function places.latest_petrojam_date()
returns date
language plpgsql
stable
security definer
set search_path = fuel, public
as $$
declare
  value date;
begin
  if to_regclass('fuel.petrojam_prices') is null then
    return null;
  end if;
  execute 'select max(price_date) from fuel.petrojam_prices' into value;
  return value;
exception
  when undefined_table then
    return null;
end;
$$;

create or replace function places.upsert_price_current(
  p_place_id text,
  p_grade text,
  p_price numeric,
  p_confidence text,
  p_reports int,
  p_fleet int,
  p_plug int,
  p_week date,
  p_valid timestamptz,
  p_published uuid
)
returns void
language plpgsql
security definer
set search_path = places, public
as $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'places' and table_name = 'price_current' and column_name = 'station_id'
  ) then
    insert into places.price_current (
      station_id, place_id, grade, price_per_litre, observed_at,
      confidence, report_count, fleet_count, plug_count, petrojam_week, valid_until, published_id, outdated
    ) values (
      p_place_id, p_place_id, p_grade, p_price, now(),
      p_confidence, p_reports, p_fleet, p_plug, p_week, p_valid, p_published, false
    )
    on conflict (station_id, grade) do update set
      place_id = excluded.place_id,
      price_per_litre = excluded.price_per_litre,
      observed_at = excluded.observed_at,
      confidence = excluded.confidence,
      report_count = excluded.report_count,
      fleet_count = excluded.fleet_count,
      plug_count = excluded.plug_count,
      petrojam_week = excluded.petrojam_week,
      valid_until = excluded.valid_until,
      published_id = coalesce(excluded.published_id, places.price_current.published_id),
      outdated = false;
  else
    insert into places.price_current (
      place_id, grade, price_per_litre, observed_at,
      confidence, report_count, fleet_count, plug_count, petrojam_week, valid_until, published_id, outdated
    ) values (
      p_place_id, p_grade, p_price, now(),
      p_confidence, p_reports, p_fleet, p_plug, p_week, p_valid, p_published, false
    )
    on conflict (place_id, grade) do update set
      price_per_litre = excluded.price_per_litre,
      observed_at = excluded.observed_at,
      confidence = excluded.confidence,
      report_count = excluded.report_count,
      fleet_count = excluded.fleet_count,
      plug_count = excluded.plug_count,
      petrojam_week = excluded.petrojam_week,
      valid_until = excluded.valid_until,
      published_id = coalesce(excluded.published_id, places.price_current.published_id),
      outdated = false;
  end if;
end;
$$;

create or replace function places.price_engine_check(p_source text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = places, fuel, public
as $$
declare
  settings places.price_engine_settings%rowtype;
  existing text;
  v_place text;
  v_grade text;
  v_price numeric;
  v_at timestamptz;
  v_key text;
  v_mock boolean := false;
  v_grade_source text;
  v_status text;
  v_pin text;
  v_name text;
  wholesale numeric;
  last_price numeric;
  last_week date;
  expected numeric;
  then_wholesale numeric;
  sample_n int;
  sample_median numeric;
  sample_mad numeric;
  reasons text[] := '{}';
  next_status text;
  v_weight numeric;
begin
  if p_source not in ('fleet', 'plug') then
    raise exception 'unknown price source %', p_source;
  end if;

  select status into existing
  from places.price_report_check
  where source = p_source and report_id = p_id;
  if existing in ('approved', 'rejected') then
    return;
  end if;

  select * into settings from places.price_engine_settings where id = 1;

  if p_source = 'fleet' then
    select place_id, grade, price_per_litre, reported_at,
           'fleet:' || coalesce(driver_id, organization_id), grade_source
      into v_place, v_grade, v_price, v_at, v_key, v_grade_source
    from places.fleet_price_report
    where id = p_id;
  else
    select place_id, grade, price_per_litre, reported_at,
           'plug:' || reporter_hash, mock_location, grade_source
      into v_place, v_grade, v_price, v_at, v_key, v_mock, v_grade_source
    from places.plug_price_report
    where id = p_id;
  end if;
  if v_price is null then
    return;
  end if;

  select status, pin_state, name into v_status, v_pin, v_name
  from places.place where id = v_place;

  if v_grade = 'unknown' or v_grade is null or v_grade_source = 'unknown' then
    reasons := reasons || array['GRADE_UNKNOWN'];
  end if;
  if p_source = 'plug' and v_grade_source = 'user_changed' then
    reasons := reasons || array['GRADE_CHANGED'];
  end if;
  if v_mock then
    reasons := reasons || array['MOCK_LOCATION'];
  end if;

  wholesale := places.wholesale_on(v_grade, v_at::date);
  if wholesale is null or wholesale <= 0
     or v_price < wholesale * settings.bounds_low
     or v_price > wholesale * settings.bounds_high then
    reasons := reasons || array['OUT_OF_BOUNDS'];
  end if;

  select price_per_litre, petrojam_week into last_price, last_week
  from places.price_current
  where place_id = v_place and grade = v_grade
  limit 1;
  if last_price is not null and last_price > 0 then
    then_wholesale := places.wholesale_on(v_grade, coalesce(last_week, v_at::date));
    if then_wholesale is not null and then_wholesale > 0 and wholesale is not null and wholesale > 0 then
      expected := last_price * (wholesale / then_wholesale);
    else
      expected := last_price;
    end if;
    if expected > 0 and abs(v_price - expected) / expected > settings.change_pct then
      reasons := reasons || array['BIG_CHANGE'];
    end if;
  end if;

  select count(*)::int,
         percentile_cont(0.5) within group (order by r.price_per_litre)
    into sample_n, sample_median
  from places.price_report r
  join places.price_report_check c on c.source = r.source and c.report_id = r.id
  where r.place_id = v_place
    and r.grade = v_grade
    and c.status in ('accepted', 'approved')
    and r.reported_at >= now() - make_interval(days => settings.window_days)
    and r.id <> p_id;
  if sample_n >= settings.mad_min_reports and sample_median is not null then
    select percentile_cont(0.5) within group (order by abs(r.price_per_litre - sample_median))
      into sample_mad
    from places.price_report r
    join places.price_report_check c on c.source = r.source and c.report_id = r.id
    where r.place_id = v_place
      and r.grade = v_grade
      and c.status in ('accepted', 'approved')
      and r.reported_at >= now() - make_interval(days => settings.window_days)
      and r.id <> p_id;
    if abs(v_price - sample_median) > settings.mad_k * coalesce(sample_mad, 0) then
      reasons := reasons || array['UNUSUAL_FOR_STATION'];
    end if;
  end if;

  if v_place is not null and exists (
    select 1 from places.price_report r
    where r.reporter_key = v_key
      and r.place_id is not distinct from v_place
      and r.grade = v_grade
      and r.id <> p_id
      and abs(extract(epoch from (r.reported_at - v_at))) <= 600
  ) then
    reasons := reasons || array['DUPLICATE'];
  end if;

  if v_place is null or v_status is distinct from 'verified' or v_pin = 'offset' then
    reasons := reasons || array['PLACE_NOT_VERIFIED'];
    next_status := 'waiting_place';
  elsif coalesce(array_length(reasons, 1), 0) > 0 then
    next_status := 'review';
  else
    next_status := 'accepted';
  end if;

  v_weight := case when p_source = 'fleet' then settings.fleet_weight else settings.plug_weight end;
  insert into places.price_reporter (reporter_key, source, trust_weight, reports, last_report_at)
  values (v_key, p_source, v_weight, 1, v_at)
  on conflict (reporter_key) do update set
    last_report_at = greatest(places.price_reporter.last_report_at, excluded.last_report_at),
    reports = places.price_reporter.reports + case
      when exists (
        select 1 from places.price_report_check
        where source = p_source and report_id = p_id
      ) then 0 else 1 end;
  select trust_weight into v_weight from places.price_reporter where reporter_key = v_key;

  insert into places.price_report_check (source, report_id, status, reasons, detail, weight)
  values (
    p_source,
    p_id,
    next_status,
    reasons,
    jsonb_strip_nulls(jsonb_build_object(
      'price', v_price,
      'grade', v_grade,
      'place_id', v_place,
      'place_name', v_name,
      'wholesale', wholesale,
      'reporter_key', v_key
    )),
    case when 'DUPLICATE' = any (reasons) then 0 else v_weight end
  )
  on conflict (source, report_id) do update set
    status = excluded.status,
    reasons = excluded.reasons,
    detail = excluded.detail,
    weight = excluded.weight,
    checked_at = now();
end;
$$;

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

create or replace function places.price_engine_review(
  p_source text,
  p_id uuid,
  p_decision text,
  p_note text,
  p_reviewer uuid
)
returns void
language plpgsql
security definer
set search_path = places, public
as $$
declare
  previous text;
  v_place text;
  v_grade text;
  v_key text;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'decision must be approved or rejected';
  end if;
  select status into previous
  from places.price_report_check
  where source = p_source and report_id = p_id;
  if previous is null then
    raise exception 'report not found';
  end if;

  update places.price_report_check
  set status = p_decision,
      review_note = nullif(btrim(coalesce(p_note, '')), ''),
      reviewed_by = p_reviewer,
      reviewed_at = now(),
      trust_applied = case when p_decision = 'rejected' then true else trust_applied end
  where source = p_source and report_id = p_id;

  select place_id, grade, reporter_key into v_place, v_grade, v_key
  from places.price_report
  where source = p_source and id = p_id;

  if p_decision = 'rejected' and previous is distinct from 'rejected' then
    update places.price_reporter
    set trust_weight = greatest(0.1, trust_weight - 0.20),
        owner_rejected = owner_rejected + 1,
        updated_at = now()
    where reporter_key = v_key;
  end if;

  perform places.price_engine_publish(v_place, v_grade);
end;
$$;

create or replace function places.price_engine_mark_stale(p_date date)
returns void
language plpgsql
security definer
set search_path = places, public
as $$
declare
  target text;
begin
  update places.price_current
  set outdated = true
  where petrojam_week is null or petrojam_week < p_date;

  for target in
    select distinct place_id from places.price_current
    where outdated and place_id is not null
  loop
    perform places.refresh_public_place(target);
  end loop;
end;
$$;

create or replace function places.price_engine_daily()
returns void
language plpgsql
security definer
set search_path = places, public
as $$
declare
  target text;
begin
  update places.price_reporter r
  set trust_weight = least(3.0, greatest(0.1,
        r.trust_weight + 0.05 * (
          case when r.source = 'fleet' then s.fleet_weight else s.plug_weight end - r.trust_weight
        )
      )),
      updated_at = now()
  from places.price_engine_settings s
  where s.id = 1
    and r.last_report_at < now() - interval '30 days'
    and r.updated_at < now() - interval '7 days';

  update places.price_current
  set outdated = true
  where valid_until is not null
    and valid_until < now()
    and outdated = false;

  for target in
    select distinct place_id from places.price_current
    where outdated and place_id is not null
  loop
    perform places.refresh_public_place(target);
  end loop;
end;
$$;

create or replace function places.price_engine_on_report()
returns trigger
language plpgsql
security definer
set search_path = places, public
as $$
declare
  src text := tg_argv[0];
  place_id text;
  grade text;
begin
  if tg_op = 'DELETE' then
    place_id := old.place_id;
    grade := old.grade;
    delete from places.price_report_check
    where source = src and report_id = old.id;
  else
    place_id := new.place_id;
    grade := new.grade;
    perform places.price_engine_check(src, new.id);
  end if;
  if place_id is not null and grade is not null then
    perform places.price_engine_publish(place_id, grade);
  end if;
  return coalesce(new, old);
end;
$$;

create trigger fleet_price_report_engine
  after insert or delete on places.fleet_price_report
  for each row execute function places.price_engine_on_report('fleet');

create trigger plug_price_report_engine
  after insert or delete on places.plug_price_report
  for each row execute function places.price_engine_on_report('plug');

create or replace function places.price_engine_on_verified()
returns trigger
language plpgsql
security definer
set search_path = places, public
as $$
declare
  row record;
begin
  if new.status = 'verified' and old.status is distinct from 'verified' then
    for row in
      select r.source, r.id, r.grade
      from places.price_report r
      join places.price_report_check c on c.source = r.source and c.report_id = r.id
      where r.place_id = new.id
        and c.status = 'waiting_place'
    loop
      perform places.price_engine_check(row.source, row.id);
      perform places.price_engine_publish(new.id, row.grade);
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists place_price_engine_verified on places.place;
create trigger place_price_engine_verified
  after update of status on places.place
  for each row execute function places.price_engine_on_verified();

create or replace function places.refresh_public_place(p_place_id text)
returns void
language plpgsql
security definer
set search_path = places, public
as $$
declare
  place places.place%rowtype;
  next_brand text;
  next_kind text;
  next_category text;
  next_group text;
  next_facilities jsonb;
  next_types text[];
  next_categories text[];
  next_prices jsonb;
  next_price_at timestamptz;
begin
  select * into place from places.place where id = p_place_id;
  if not found or place.status <> 'verified' or place.pin_state = 'offset' then
    delete from places.public_place where id = p_place_id;
    return;
  end if;

  select b.name into next_brand from places.brand b where b.id = place.brand_id;
  if next_brand is null then
    next_brand := 'Independent';
  end if;
  next_kind := places.plug_kind(place.place_type);

  select t.category_code, c.group_code
    into next_category, next_group
  from places.place_type t
  join places.category c on c.code = t.category_code
  where t.slug = place.place_type;

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', f.id,
      'type', f.facility_type,
      'category', ft.category_code,
      'label', coalesce(f.label, ft.label),
      'attributes', f.attributes
    ) order by ft.label), '[]'::jsonb),
    coalesce(array_agg(distinct f.facility_type), '{}'),
    coalesce(array_agg(distinct ft.category_code), '{}')
  into next_facilities, next_types, next_categories
  from places.place_facility f
  join places.facility_type ft on ft.slug = f.facility_type
  where f.place_id = place.id;

  select
    case
      when count(pc.grade) = 0 then null
      else coalesce(jsonb_object_agg(pc.grade, to_jsonb(pc.price_per_litre)), '{}'::jsonb)
        || coalesce(jsonb_object_agg(
          pc.grade || '_card',
          jsonb_build_object(
            'price', pc.price_per_litre,
            'confidence', pc.confidence,
            'reports', pc.report_count,
            'petrojam_week', pc.petrojam_week,
            'observed_at', pc.observed_at,
            'outdated', coalesce(pc.outdated, false)
          )
        ), '{}'::jsonb)
    end,
    max(pc.observed_at)
    into next_prices, next_price_at
  from places.price_current pc
  where pc.place_id = place.id or pc.station_id = place.id;

  if next_prices is null then
    begin
      execute 'select prices, price_updated_at from saved_station_prices where id = $1'
        into next_prices, next_price_at
        using place.id;
    exception when undefined_table then
      next_prices := null;
    end;
  end if;
  if next_prices is null then
    select prices, price_updated_at into next_prices, next_price_at
    from places.public_place
    where id = place.id;
  end if;
  next_prices := coalesce(next_prices, '{}'::jsonb);

  insert into places.public_place (
    id, name, brand, kind, place_type, category_code, group_code,
    lat, lng, pcode, plus_code, address, details,
    facilities, facility_types, facility_categories,
    prices, price_updated_at, updated_at
  ) values (
    place.id, place.name, next_brand, next_kind, place.place_type,
    next_category, next_group, place.lat, place.lng, place.pcode, place.plus_code,
    place.address, place.attributes,
    coalesce(next_facilities, '[]'::jsonb),
    coalesce(next_types, '{}'),
    coalesce(next_categories, '{}'),
    next_prices, next_price_at, now()
  )
  on conflict (id) do update set
    name = excluded.name,
    brand = excluded.brand,
    kind = excluded.kind,
    place_type = excluded.place_type,
    category_code = excluded.category_code,
    group_code = excluded.group_code,
    lat = excluded.lat,
    lng = excluded.lng,
    pcode = excluded.pcode,
    plus_code = excluded.plus_code,
    address = excluded.address,
    details = excluded.details,
    facilities = excluded.facilities,
    facility_types = excluded.facility_types,
    facility_categories = excluded.facility_categories,
    prices = excluded.prices,
    price_updated_at = excluded.price_updated_at,
    updated_at = now();
end;
$$;

create or replace view places.price_engine_health as
select
  (select count(*) from places.price_report_check where status = 'review')::int as review_count,
  (select min(checked_at) from places.price_report_check where status = 'review') as oldest_review_at,
  case
    when (select count(*) from places.price_current) = 0 then 0
    else (
      select count(*) filter (where outdated) from places.price_current
    )::numeric / (select count(*) from places.price_current)
  end as outdated_share,
  (select percentile_cont(0.5) within group (order by report_count) from places.price_current) as median_report_count,
  case
    when (select count(*) from places.price_report_check) = 0 then 0
    else (
      select count(*) from places.price_report_check where 'UNUSUAL_FOR_STATION' = any (reasons)
    )::numeric / (select count(*) from places.price_report_check)
  end as unusual_share,
  case
    when coalesce((select sum(reports) from places.price_reporter), 0) = 0 then 0
    else (
      select coalesce(sum(reports), 0)::numeric
      from (
        select reports from places.price_reporter order by reports desc limit 10
      ) top_reporters
    ) / (select sum(reports) from places.price_reporter)
  end as top_reporter_share;

revoke all on places.price_engine_health from public, anon, authenticated;
grant select on places.price_engine_health to service_role;

do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule('places-price-engine-daily');
    exception when others then
      null;
    end;
    perform cron.schedule(
      'places-price-engine-daily',
      '0 5 * * *',
      $job$select places.price_engine_daily()$job$
    );
  end if;
end
$cron$;

revoke all on function places.wholesale_on(text, date) from public, anon, authenticated;
revoke all on function places.latest_petrojam_date() from public, anon, authenticated;
revoke all on function places.upsert_price_current(text, text, numeric, text, int, int, int, date, timestamptz, uuid) from public, anon, authenticated;
revoke all on function places.price_engine_check(text, uuid) from public, anon, authenticated;
revoke all on function places.price_engine_publish(text, text) from public, anon, authenticated;
revoke all on function places.price_engine_review(text, uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function places.price_engine_mark_stale(date) from public, anon, authenticated;
revoke all on function places.price_engine_daily() from public, anon, authenticated;
revoke all on function places.price_engine_on_report() from public, anon, authenticated;
revoke all on function places.price_engine_on_verified() from public, anon, authenticated;
grant execute on function places.wholesale_on(text, date) to service_role;
grant execute on function places.latest_petrojam_date() to service_role;
grant execute on function places.upsert_price_current(text, text, numeric, text, int, int, int, date, timestamptz, uuid) to service_role;
grant execute on function places.price_engine_check(text, uuid) to service_role;
grant execute on function places.price_engine_publish(text, text) to service_role;
grant execute on function places.price_engine_review(text, uuid, text, text, uuid) to service_role;
grant execute on function places.price_engine_mark_stale(date) to service_role;
grant execute on function places.price_engine_daily() to service_role;
grant execute on function places.price_engine_on_report() to service_role;
grant execute on function places.price_engine_on_verified() to service_role;

create or replace function places.safe_numeric(raw text)
returns numeric
language plpgsql
immutable
as $$
begin
  if raw is null or btrim(raw) = '' then
    return null;
  end if;
  return btrim(raw)::numeric;
exception
  when others then
    return null;
end;
$$;

do $backfill$
begin
  if to_regclass('fleet.fuel_entries') is null then
    return;
  end if;

  insert into places.fleet_price_report (
    fuel_entry_id, organization_id, driver_id, vehicle_id, place_id,
    grade, grade_source, litres, amount, pump_photo_path, station_state,
    gps_accuracy_m, reported_at
  )
  select
    f.id,
    coalesce(nullif(f.organization_id, ''), 'unknown'),
    nullif(f.driver_id, ''),
    nullif(f.vehicle_id, ''),
    p.id,
    mapped.grade,
    mapped.source,
    litres.v,
    amount.v,
    nullif(f.payload_json->>'odometerImageUrl', ''),
    'verified',
    places.safe_numeric(f.payload_json #>> '{metadata,locationMetadata,accuracy}'),
    coalesce(f.created_at, f.date::timestamptz)
  from fleet.fuel_entries f
  join places.place p
    on p.id = coalesce(f.payload_json->>'matchedStationId', f.payload_json #>> '{metadata,matchedStationId}')
  left join fleet.vehicles v on v.id = f.vehicle_id
  cross join lateral (
    select coalesce(
      f.liters,
      places.safe_numeric(f.payload_json->>'liters'),
      places.safe_numeric(f.payload_json->>'litres')
    ) as v
  ) litres
  cross join lateral (
    select coalesce(f.amount, places.safe_numeric(f.payload_json->>'amount')) as v
  ) amount
  cross join lateral (
    select
      places.map_fuel_grade(nullif(coalesce(
        f.payload_json->>'catalogFuelGrade',
        f.payload_json #>> '{metadata,catalogFuelGrade}',
        v.payload_json->>'catalogFuelGrade',
        (
          select vc.fuel_grade
          from public.vehicle_catalog vc
          where vc.id::text = coalesce(v.payload_json->>'vehicleCatalogId', v.payload_json->>'catalogId')
          limit 1
        )
      ), '')) as catalog_grade,
      places.map_fuel_grade(coalesce(
        nullif(f.payload_json->>'fuelType', ''),
        nullif(f.payload_json #>> '{metadata,fuelType}', '')
      )) as fill_grade,
      places.map_fuel_grade(nullif(f.payload_json #>> '{metadata,jaaFuelType}', '')) as statement_grade
  ) raw
  cross join lateral (
    select
      case
        when raw.catalog_grade is not null and raw.catalog_grade <> 'unknown' then raw.catalog_grade
        when raw.fill_grade is not null and raw.fill_grade <> 'unknown' then raw.fill_grade
        when raw.statement_grade is not null and raw.statement_grade <> 'unknown' then raw.statement_grade
        else null
      end as grade,
      case
        when raw.catalog_grade is not null and raw.catalog_grade <> 'unknown' then 'vehicle'
        when raw.fill_grade is not null and raw.fill_grade <> 'unknown' then 'fill'
        when raw.statement_grade is not null and raw.statement_grade <> 'unknown' then 'statement'
        else 'unknown'
      end as source
  ) mapped
  where p.status = 'verified'
    and p.place_type = 'gas_station'
    and litres.v > 0
    and amount.v > 0
    and mapped.grade in ('e10_87', 'e10_90', 'diesel', 'ulsd')
    and coalesce(f.date, f.created_at::date) >= date '2026-09-01'
    and not exists (
      select 1 from places.fleet_price_report existing
      where existing.fuel_entry_id = f.id
    );

  insert into places.fleet_price_report (
    fuel_entry_id, organization_id, place_id, grade, grade_source,
    litres, amount, station_state, reported_at
  )
  select
    'legacy:' || o.id::text,
    'legacy',
    o.place_id,
    o.grade,
    'fill',
    1,
    o.price_per_litre,
    'verified',
    coalesce(o.created_at, now())
  from places.price_observation o
  join places.place p on p.id = o.place_id
  where p.status = 'verified'
    and o.grade in ('e10_87', 'e10_90', 'diesel', 'ulsd')
    and o.price_per_litre > 0
    and not exists (
      select 1 from places.fleet_price_report r
      where r.place_id = o.place_id
        and abs(r.price_per_litre - o.price_per_litre) < 0.05
    )
    and not exists (
      select 1 from places.fleet_price_report r
      where r.fuel_entry_id = 'legacy:' || o.id::text
    );
end
$backfill$;

revoke all on function places.safe_numeric(text) from public, anon, authenticated;
grant execute on function places.safe_numeric(text) to service_role;

create or replace view places.price_review_row as
select
  c.source,
  c.report_id,
  c.status,
  c.reasons,
  c.detail,
  c.weight,
  c.checked_at,
  c.reviewed_at,
  c.review_note,
  r.place_id,
  r.grade,
  r.price_per_litre,
  r.reported_at,
  r.reporter_key,
  p.name as place_name,
  p.parish
from places.price_report_check c
join places.price_report r on r.source = c.source and r.id = c.report_id
left join places.place p on p.id = r.place_id;

revoke all on places.price_review_row from public, anon, authenticated;
grant select on places.price_review_row to service_role;

create or replace function places.price_engine_set_grade(p_source text, p_id uuid, p_grade text)
returns void
language plpgsql
security definer
set search_path = places, public
as $$
declare
  v_place text;
  v_old text;
begin
  if p_grade not in ('e10_87', 'e10_90', 'diesel', 'ulsd', 'unknown') then
    raise exception 'unknown grade';
  end if;
  if p_source = 'fleet' then
    select grade into v_old from places.fleet_price_report where id = p_id;
    update places.fleet_price_report
    set grade = p_grade,
        grade_source = case when p_grade = 'unknown' then grade_source else 'fill' end
    where id = p_id
    returning place_id into v_place;
  elsif p_source = 'plug' then
    select grade into v_old from places.plug_price_report where id = p_id;
    update places.plug_price_report
    set grade = p_grade,
        grade_source = case when p_grade = 'unknown' then grade_source else 'vehicle_locked' end
    where id = p_id
    returning place_id into v_place;
  else
    raise exception 'unknown price source';
  end if;
  if not found then
    raise exception 'report not found';
  end if;
  update places.price_report_check
  set status = 'review'
  where source = p_source and report_id = p_id and status in ('approved', 'rejected');
  perform places.price_engine_check(p_source, p_id);
  if v_old is not null and v_old is distinct from p_grade then
    perform places.price_engine_publish(v_place, v_old);
  end if;
  perform places.price_engine_publish(v_place, p_grade);
end;
$$;

create or replace function places.price_engine_recalculate_all()
returns int
language plpgsql
security definer
set search_path = places, public
as $$
declare
  n int := 0;
  rec record;
begin
  for rec in
    select distinct place_id, grade
    from places.price_report
    where place_id is not null and grade <> 'unknown'
  loop
    perform places.price_engine_publish(rec.place_id, rec.grade);
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function places.price_engine_save_settings(
  p_bounds_low numeric,
  p_bounds_high numeric,
  p_change_pct numeric,
  p_mad_k numeric,
  p_mad_min_reports int,
  p_window_days int,
  p_fleet_weight numeric,
  p_plug_weight numeric,
  p_actor uuid
)
returns jsonb
language plpgsql
security definer
set search_path = places, public
as $$
begin
  if p_bounds_low >= p_bounds_high or p_bounds_low < 0.5 or p_bounds_high > 3
     or p_change_pct < 0.01 or p_change_pct > 0.5
     or p_mad_k < 1 or p_mad_k > 10
     or p_mad_min_reports < 2 or p_window_days < 1 or p_window_days > 30
     or p_fleet_weight < 0.1 or p_fleet_weight > 3
     or p_plug_weight < 0.1 or p_plug_weight > 3 then
    raise exception 'those settings are out of range';
  end if;
  update places.price_engine_settings
  set bounds_low = p_bounds_low,
      bounds_high = p_bounds_high,
      change_pct = p_change_pct,
      mad_k = p_mad_k,
      mad_min_reports = p_mad_min_reports,
      window_days = p_window_days,
      fleet_weight = p_fleet_weight,
      plug_weight = p_plug_weight,
      updated_at = now(),
      updated_by = p_actor
  where id = 1;
  return (select to_jsonb(s) from places.price_engine_settings s where id = 1);
end;
$$;

create or replace function places.price_engine_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = places, public
as $$
declare
  week date := places.latest_petrojam_date();
  health jsonb;
  daily_ok boolean := false;
begin
  select to_jsonb(h) into health from places.price_engine_health h;
  begin
    execute $q$
      select exists (
        select 1
        from cron.job_run_details d
        join cron.job j on j.jobid = d.jobid
        where j.jobname = 'places-price-engine-daily'
          and d.status = 'succeeded'
          and d.start_time > now() - interval '2 days'
      )
    $q$ into daily_ok;
  exception when undefined_table or invalid_schema_name then
    daily_ok := false;
  end;
  return jsonb_build_object(
    'petrojamWeek', week,
    'verifiedStations', (select count(*) from places.place where place_type = 'gas_station' and status = 'verified'),
    'livePrices', (select count(*) from places.price_current where outdated = false),
    'outdatedPrices', (select count(*) from places.price_current where outdated),
    'reviewCount', (select count(*) from places.price_report_check where status = 'review'),
    'oldestReviewAt', (select min(checked_at) from places.price_report_check where status = 'review'),
    'reportsThisWeek', (select count(*) from places.price_report where week is null or reported_at >= week::timestamptz),
    'fleetThisWeek', (select count(*) from places.fleet_price_report where week is null or reported_at >= week::timestamptz),
    'plugThisWeek', (select count(*) from places.plug_price_report where week is null or reported_at >= week::timestamptz),
    'medianReports', health->'median_report_count',
    'reasons', coalesce((
      select jsonb_object_agg(reason, n) from (
        select reason, count(*) as n
        from places.price_report_check, unnest(reasons) as reason
        where checked_at > now() - interval '30 days'
        group by reason
      ) q
    ), '{}'::jsonb),
    'parishes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'parish', coalesce(parish, 'Unknown'),
        'stations', stations,
        'live', live,
        'outdated', outdated
      ) order by parish)
      from (
        select p.parish,
          count(distinct p.id) as stations,
          count(distinct p.id) filter (where pc.outdated = false) as live,
          count(distinct p.id) filter (where pc.outdated) as outdated
        from places.place p
        left join places.price_current pc on pc.place_id = p.id
        where p.place_type = 'gas_station' and p.status = 'verified'
        group by p.parish
      ) rows
    ), '[]'::jsonb),
    'health', health,
    'dailyJobOk', daily_ok,
    'settings', (select to_jsonb(s) from places.price_engine_settings s where id = 1)
  );
end;
$$;

revoke all on function places.price_engine_set_grade(text, uuid, text) from public, anon, authenticated;
revoke all on function places.price_engine_recalculate_all() from public, anon, authenticated;
revoke all on function places.price_engine_save_settings(numeric, numeric, numeric, numeric, integer, integer, numeric, numeric, uuid) from public, anon, authenticated;
revoke all on function places.price_engine_overview() from public, anon, authenticated;
grant execute on function places.price_engine_set_grade(text, uuid, text) to service_role;
grant execute on function places.price_engine_recalculate_all() to service_role;
grant execute on function places.price_engine_save_settings(numeric, numeric, numeric, numeric, integer, integer, numeric, numeric, uuid) to service_role;
grant execute on function places.price_engine_overview() to service_role;
