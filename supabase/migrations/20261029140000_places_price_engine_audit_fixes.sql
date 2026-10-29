-- Price engine audit fixes. New migration only: applied files stay as they are.
-- Unknown grade is not "out of bounds". A later duplicate is kept at weight 0.
-- A matched gas-card row does not count twice. Corrected amount/litres stay on the check.

alter table places.price_report_check drop constraint if exists price_report_check_status_check;
alter table places.price_report_check
  add constraint price_report_check_status_check
  check (status in ('accepted', 'review', 'waiting_place', 'approved', 'rejected', 'duplicate'));

delete from places.price_current a
where a.ctid in (
  select ctid from (
    select ctid,
           row_number() over (
             partition by place_id, grade
             order by observed_at desc nulls last
           ) as rn
    from places.price_current
    where place_id is not null
  ) ranked
  where rn > 1
);

alter table places.price_current drop constraint if exists price_current_place_grade_key;
alter table places.price_current
  add constraint price_current_place_grade_key unique (place_id, grade);

create or replace function places.effective_report_price(p_source text, p_id uuid, p_price numeric)
returns numeric
language sql
stable
as $$
  select coalesce(
    (
      select case
        when (c.detail #>> '{corrected,price_per_litre}') ~ '^[0-9]+(\.[0-9]+)?$'
          then (c.detail #>> '{corrected,price_per_litre}')::numeric
        else null
      end
      from places.price_report_check c
      where c.source = p_source and c.report_id = p_id
    ),
    p_price
  );
$$;

create or replace function places.vehicle_catalog_grade(p_vehicle_id text)
returns text
language plpgsql
stable
security definer
set search_path = places, fleet, public
as $$
declare
  payload jsonb;
  catalog_id text;
  grade text;
begin
  if p_vehicle_id is null or to_regclass('fleet.vehicles') is null then
    return null;
  end if;

  select payload_json into payload from fleet.vehicles where id = p_vehicle_id;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'fleet' and table_name = 'vehicles' and column_name = 'vehicle_catalog_id'
  ) then
    execute 'select nullif(btrim(vehicle_catalog_id::text), '''') from fleet.vehicles where id = $1'
      into catalog_id using p_vehicle_id;
  end if;

  if catalog_id is null or catalog_id = '' then
    catalog_id := nullif(btrim(coalesce(payload->>'vehicleCatalogId', payload->>'catalogId', '')), '');
  end if;

  if catalog_id is not null and to_regclass('public.vehicle_catalog') is not null then
    select places.map_fuel_grade(vc.fuel_grade) into grade
    from public.vehicle_catalog vc
    where vc.id::text = catalog_id
    limit 1;
    if grade is not null and grade <> 'unknown' then
      return grade;
    end if;
  end if;

  grade := places.map_fuel_grade(payload->>'vehicle_catalog_fuel_grade_hint');
  if grade is not null and grade <> 'unknown' then
    return grade;
  end if;

  grade := places.map_fuel_grade(payload #>> '{fuelSettings,fuelType}');
  if grade is not null and grade <> 'unknown' then
    return grade;
  end if;

  grade := places.map_fuel_grade(payload->>'catalogFuelGrade');
  if grade is not null and grade <> 'unknown' then
    return grade;
  end if;

  return null;
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
  kept jsonb;
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
  mad_floor numeric;
  reasons text[] := '{}';
  next_status text;
  v_weight numeric;
  grade_known boolean;
begin
  if p_source not in ('fleet', 'plug') then
    raise exception 'unknown price source %', p_source;
  end if;

  select status, detail->'corrected' into existing, kept
  from places.price_report_check
  where source = p_source and report_id = p_id;
  if existing in ('approved', 'rejected', 'duplicate') then
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

  v_price := places.effective_report_price(p_source, p_id, v_price);

  select status, pin_state, name into v_status, v_pin, v_name
  from places.place where id = v_place;

  grade_known := v_grade is not null and v_grade <> 'unknown';

  if not grade_known or v_grade_source = 'unknown' then
    reasons := reasons || array['GRADE_UNKNOWN'];
  end if;
  if p_source = 'plug' and v_grade_source = 'user_changed' then
    reasons := reasons || array['GRADE_CHANGED'];
  end if;
  if v_mock then
    reasons := reasons || array['MOCK_LOCATION'];
  end if;

  if grade_known then
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
           percentile_cont(0.5) within group (order by places.effective_report_price(r.source, r.id, r.price_per_litre))
      into sample_n, sample_median
    from places.price_report r
    join places.price_report_check c on c.source = r.source and c.report_id = r.id
    where r.place_id = v_place
      and r.grade = v_grade
      and c.status in ('accepted', 'approved')
      and r.reported_at >= now() - make_interval(days => settings.window_days)
      and r.id <> p_id;
    if sample_n >= settings.mad_min_reports and sample_median is not null then
      select percentile_cont(0.5) within group (
               order by abs(places.effective_report_price(r.source, r.id, r.price_per_litre) - sample_median)
             )
        into sample_mad
      from places.price_report r
      join places.price_report_check c on c.source = r.source and c.report_id = r.id
      where r.place_id = v_place
        and r.grade = v_grade
        and c.status in ('accepted', 'approved')
        and r.reported_at >= now() - make_interval(days => settings.window_days)
        and r.id <> p_id;
      mad_floor := greatest(coalesce(sample_mad, 0), abs(sample_median) * 0.01);
      if abs(v_price - sample_median) > settings.mad_k * mad_floor then
        reasons := reasons || array['UNUSUAL_FOR_STATION'];
      end if;
    end if;
  end if;

  if v_place is not null and exists (
    select 1 from places.price_report r
    where r.reporter_key = v_key
      and r.place_id is not distinct from v_place
      and r.grade = v_grade
      and r.id <> p_id
      and abs(extract(epoch from (r.reported_at - v_at))) <= 600
      and (
        r.reported_at < v_at
        or (r.reported_at = v_at and r.id < p_id)
      )
  ) then
    reasons := reasons || array['DUPLICATE'];
  end if;

  if v_place is null or v_status is distinct from 'verified' or v_pin = 'offset' then
    reasons := reasons || array['PLACE_NOT_VERIFIED'];
    next_status := 'waiting_place';
  elsif coalesce(array_length(reasons, 1), 0) = 1 and reasons[1] = 'DUPLICATE' then
    next_status := 'duplicate';
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
      'reporter_key', v_key,
      'corrected', kept
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
    select places.effective_report_price(r.source, r.id, r.price_per_litre) as price, c.weight, r.source
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
    select places.effective_report_price(r.source, r.id, r.price_per_litre), 1,
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
      accepted = rep.accepted + delta.n,
      updated_at = now()
  from (
    select reporter_key, coalesce(sum(change), 0) as change, count(*)::int as n
    from (
      select r.reporter_key,
        case
          when published = 0 then 0
          when abs(places.effective_report_price(r.source, r.id, r.price_per_litre) - published) / published <= 0.03 then 0.05
          when abs(places.effective_report_price(r.source, r.id, r.price_per_litre) - published) / published > 0.10 then -0.10
          else 0
        end as change
      from places.price_report r
      join places.price_report_check c on c.source = r.source and c.report_id = r.id
      where r.place_id = p_place_id
        and r.grade = p_grade
        and c.status in ('accepted', 'approved')
        and c.trust_applied = false
        and r.reported_at >= window_start
    ) raw
    group by reporter_key
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
  select c.status, r.place_id, r.grade, r.reporter_key
    into previous, v_place, v_grade, v_key
  from places.price_report_check c
  join places.price_report r on r.source = c.source and r.id = c.report_id
  where c.source = p_source and c.report_id = p_id;
  if previous is null then
    raise exception 'report not found';
  end if;
  if p_decision = 'approved' and (v_grade is null or v_grade = 'unknown') then
    raise exception 'Set the grade first';
  end if;
  if p_decision = 'approved' and previous = 'waiting_place' then
    raise exception 'Verify the station first';
  end if;

  update places.price_report_check
  set status = p_decision,
      review_note = nullif(btrim(coalesce(p_note, '')), ''),
      reviewed_by = p_reviewer,
      reviewed_at = now(),
      trust_applied = case when p_decision = 'rejected' then true else trust_applied end
  where source = p_source and report_id = p_id;

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

create or replace function places.price_engine_fix_and_approve(
  p_source text,
  p_id uuid,
  p_litres numeric,
  p_amount numeric,
  p_reviewer uuid,
  p_note text
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
begin
  if p_source not in ('fleet', 'plug') then
    raise exception 'unknown price source %', p_source;
  end if;
  if p_litres is null or p_litres <= 0 or p_amount is null or p_amount <= 0 then
    raise exception 'Enter a real amount and litres';
  end if;

  select c.status, r.place_id, r.grade
    into previous, v_place, v_grade
  from places.price_report_check c
  join places.price_report r on r.source = c.source and r.id = c.report_id
  where c.source = p_source and c.report_id = p_id;
  if previous is null then
    raise exception 'report not found';
  end if;
  if v_grade is null or v_grade = 'unknown' then
    raise exception 'Set the grade first';
  end if;
  if previous = 'waiting_place' then
    raise exception 'Verify the station first';
  end if;

  update places.price_report_check
  set status = 'approved',
      detail = coalesce(detail, '{}'::jsonb) || jsonb_build_object(
        'corrected', jsonb_build_object(
          'litres', p_litres,
          'amount', p_amount,
          'price_per_litre', round(p_amount / p_litres, 4)
        )
      ),
      review_note = nullif(btrim(coalesce(p_note, '')), ''),
      reviewed_by = p_reviewer,
      reviewed_at = now()
  where source = p_source and report_id = p_id;

  perform places.price_engine_publish(v_place, v_grade);
end;
$$;

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
  where source = p_source and report_id = p_id and status in ('approved', 'rejected', 'duplicate');
  perform places.price_engine_check(p_source, p_id);
  if v_old is not null and v_old is distinct from p_grade then
    perform places.price_engine_publish(v_place, v_old);
  end if;
  perform places.price_engine_publish(v_place, p_grade);
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
  old_place text;
  old_grade text;
begin
  if tg_op = 'DELETE' then
    place_id := old.place_id;
    grade := old.grade;
    delete from places.price_report_check
    where source = src and report_id = old.id;
  else
    if tg_op = 'UPDATE' then
      old_place := old.place_id;
      old_grade := old.grade;
    end if;
    place_id := new.place_id;
    grade := new.grade;
    perform places.price_engine_check(src, new.id);
    if tg_op = 'UPDATE'
       and (old_place is distinct from new.place_id or old_grade is distinct from new.grade)
       and old_place is not null
       and old_grade is not null then
      perform places.price_engine_publish(old_place, old_grade);
    end if;
  end if;
  if place_id is not null and grade is not null then
    perform places.price_engine_publish(place_id, grade);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists fleet_price_report_engine on places.fleet_price_report;
create trigger fleet_price_report_engine
  after insert or delete or update of place_id, grade, litres, amount
  on places.fleet_price_report
  for each row execute function places.price_engine_on_report('fleet');

drop trigger if exists plug_price_report_engine on places.plug_price_report;
create trigger plug_price_report_engine
  after insert or delete or update of place_id, grade, litres, amount
  on places.plug_price_report
  for each row execute function places.price_engine_on_report('plug');

drop trigger if exists plug_price_report_master_change on places.plug_price_report;

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
  p.parish,
  coalesce(f.litres, g.litres) as litres,
  coalesce(f.amount, g.amount) as amount
from places.price_report_check c
join places.price_report r on r.source = c.source and r.id = c.report_id
left join places.fleet_price_report f on c.source = 'fleet' and f.id = c.report_id
left join places.plug_price_report g on c.source = 'plug' and g.id = c.report_id
left join places.place p on p.id = r.place_id;

revoke all on places.price_review_row from public, anon, authenticated;
grant select on places.price_review_row to service_role;

revoke all on function places.effective_report_price(text, uuid, numeric) from public, anon, authenticated;
revoke all on function places.vehicle_catalog_grade(text) from public, anon, authenticated;
revoke all on function places.price_engine_check(text, uuid) from public, anon, authenticated;
revoke all on function places.price_engine_publish(text, text) from public, anon, authenticated;
revoke all on function places.price_engine_review(text, uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function places.price_engine_fix_and_approve(text, uuid, numeric, numeric, uuid, text) from public, anon, authenticated;
revoke all on function places.price_engine_set_grade(text, uuid, text) from public, anon, authenticated;
revoke all on function places.price_engine_on_report() from public, anon, authenticated;
grant execute on function places.effective_report_price(text, uuid, numeric) to service_role;
grant execute on function places.vehicle_catalog_grade(text) to service_role;
grant execute on function places.price_engine_check(text, uuid) to service_role;
grant execute on function places.price_engine_publish(text, text) to service_role;
grant execute on function places.price_engine_review(text, uuid, text, text, uuid) to service_role;
grant execute on function places.price_engine_fix_and_approve(text, uuid, numeric, numeric, uuid, text) to service_role;
grant execute on function places.price_engine_set_grade(text, uuid, text) to service_role;
grant execute on function places.price_engine_on_report() to service_role;

do $regrade$
begin
  if to_regclass('fleet.fuel_entries') is null then
    return;
  end if;

  update places.fleet_price_report r
  set grade = chosen.grade,
      grade_source = chosen.source
  from fleet.fuel_entries f
  cross join lateral (
    select
      places.vehicle_catalog_grade(f.vehicle_id) as vehicle_grade,
      places.map_fuel_grade(coalesce(
        nullif(f.payload_json->>'fuelType', ''),
        nullif(f.payload_json #>> '{metadata,fuelType}', '')
      )) as fill_grade,
      places.map_fuel_grade(nullif(f.payload_json #>> '{metadata,jaaFuelType}', '')) as statement_grade
  ) raw
  cross join lateral (
    select
      case
        when raw.vehicle_grade is not null then raw.vehicle_grade
        when raw.fill_grade is not null and raw.fill_grade <> 'unknown' then raw.fill_grade
        when raw.statement_grade is not null and raw.statement_grade <> 'unknown' then raw.statement_grade
        else null
      end as grade,
      case
        when raw.vehicle_grade is not null then 'vehicle'
        when raw.fill_grade is not null and raw.fill_grade <> 'unknown' then 'fill'
        when raw.statement_grade is not null and raw.statement_grade <> 'unknown' then 'statement'
        else 'unknown'
      end as source
  ) chosen
  where r.fuel_entry_id = f.id
    and r.grade = 'unknown'
    and chosen.grade is not null;
end
$regrade$;

do $recheck$
declare
  rec record;
begin
  for rec in
    select source, report_id
    from places.price_report_check
    where status not in ('approved', 'rejected', 'duplicate')
  loop
    perform places.price_engine_check(rec.source, rec.report_id);
  end loop;
end
$recheck$;

do $cards$
begin
  if to_regclass('fleet.fuel_entries') is null then
    return;
  end if;

  update places.fleet_price_report driver
  set grade = mapped.g,
      grade_source = 'statement'
  from places.fleet_price_report card
  join fleet.fuel_entries f on f.id = card.fuel_entry_id
  cross join lateral (
    select places.map_fuel_grade(nullif(f.payload_json #>> '{metadata,jaaFuelType}', '')) as g
  ) mapped
  where coalesce(f.payload_json->>'type', '') = 'Card_Transaction'
    and nullif(f.payload_json #>> '{metadata,jaaMatchedDriverEntryId}', '') is not null
    and driver.fuel_entry_id = f.payload_json #>> '{metadata,jaaMatchedDriverEntryId}'
    and driver.grade = 'unknown'
    and mapped.g is not null
    and mapped.g <> 'unknown';

  update places.price_report_check c
  set status = 'duplicate',
      reasons = array['DUPLICATE'],
      weight = 0,
      review_note = coalesce(c.review_note, 'matched driver fill')
  from places.fleet_price_report card
  join fleet.fuel_entries f on f.id = card.fuel_entry_id
  where c.source = 'fleet'
    and c.report_id = card.id
    and coalesce(f.payload_json->>'type', '') = 'Card_Transaction'
    and nullif(f.payload_json #>> '{metadata,jaaMatchedDriverEntryId}', '') is not null
    and exists (
      select 1 from places.fleet_price_report driver
      where driver.fuel_entry_id = f.payload_json #>> '{metadata,jaaMatchedDriverEntryId}'
    )
    and c.status not in ('approved', 'rejected');
end
$cards$;

do $republish$
declare
  rec record;
begin
  for rec in
    select distinct place_id, grade
    from places.price_report
    where place_id is not null
      and grade <> 'unknown'
  loop
    perform places.price_engine_publish(rec.place_id, rec.grade);
  end loop;
end
$republish$;
