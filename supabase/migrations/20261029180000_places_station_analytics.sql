-- Station analytics. Ages come from last_report_at, not the publish clock.
-- Station completeness is brand + parish text that matches the map + a checked pin.
-- One read function answers the page. No new cron and no materialized view.

alter table places.published_fuel_price
  add column if not exists last_report_at timestamptz;

alter table places.price_current
  add column if not exists last_report_at timestamptz;

update places.price_current pc
set last_report_at = src.max_at
from (
  select r.place_id, r.grade, max(r.reported_at) as max_at
  from places.price_report r
  join places.price_report_check c on c.source = r.source and c.report_id = r.id
  where c.status in ('accepted', 'approved')
    and c.weight > 0
    and not ('DUPLICATE' = any (coalesce(c.reasons, '{}'::text[])))
  group by r.place_id, r.grade
) src
where pc.place_id = src.place_id
  and pc.grade = src.grade
  and pc.last_report_at is null;

update places.published_fuel_price h
set last_report_at = src.max_at
from (
  select r.place_id, r.grade, max(r.reported_at) as max_at
  from places.price_report r
  join places.price_report_check c on c.source = r.source and c.report_id = r.id
  where c.status in ('accepted', 'approved')
    and c.weight > 0
    and not ('DUPLICATE' = any (coalesce(c.reasons, '{}'::text[])))
  group by r.place_id, r.grade
) src
where h.place_id = src.place_id
  and h.grade = src.grade
  and h.last_report_at is null;

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
  last_seen timestamptz;
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

  select max(r.reported_at)
    into last_seen
  from places.price_report r
  join places.price_report_check c on c.source = r.source and c.report_id = r.id
  where r.place_id = p_place_id
    and r.grade = p_grade
    and c.status in ('accepted', 'approved')
    and c.weight > 0
    and not ('DUPLICATE' = any (coalesce(c.reasons, '{}'::text[])))
    and (
      (stale and r.reported_at = fallback_at)
      or (not stale and r.reported_at >= window_start)
    );
  if last_seen is null then
    last_seen := fallback_at;
  end if;

  select price_per_litre into current_price
  from places.price_current
  where place_id = p_place_id and grade = p_grade
  limit 1;

  if current_price is null or round(current_price, 4) is distinct from round(published, 4) then
    insert into places.published_fuel_price (
      place_id, grade, price_per_litre, report_count, fleet_count, plug_count,
      spread_pct, confidence, petrojam_week, window_start, window_end, valid_until,
      last_report_at
    ) values (
      p_place_id, p_grade, published, n, fleet_n, plug_n,
      spread, confidence, week, window_start, now(), (week + 8)::timestamptz,
      last_seen
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

  update places.price_current
  set last_report_at = last_seen
  where place_id = p_place_id and grade = p_grade;

  if history_id is not null then
    update places.published_fuel_price
    set last_report_at = last_seen
    where id = history_id;
  end if;

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

create or replace view fleet.station_quality with (security_invoker = true) as
select
  p.id,
  p.name,
  case p.status
    when 'pending' then 'unverified'
    when 'closed' then 'resolved'
    else p.status
  end as status,
  (
    p.brand_id is not null
    and p.pin_state <> 'unchecked'
    and (
      p.parish is null
      or exists (
        select 1
        from geo.boundaries b
        where b.admin_level = 1
          and b.pcode = left(p.pcode, 4)
          and lower(btrim(b.name)) = lower(btrim(p.parish))
      )
    )
  ) as complete
from places.place p
where p.place_type = 'gas_station';

insert into places.place_legacy_archive (id, legacy_kv_id, reason, payload)
select
  p.id,
  p.legacy_kv_id,
  'verified_at_backfill',
  jsonb_build_object(
    'note', 'verified_at set from updated_at where status was verified and verified_at was null',
    'verified_at', p.updated_at
  )
from places.place p
where p.status = 'verified'
  and p.verified_at is null
on conflict (id) do update
set payload = places.place_legacy_archive.payload || jsonb_build_object('verified_at_backfill', excluded.payload);

update places.place
set verified_at = updated_at
where status = 'verified'
  and verified_at is null;

create or replace function places.station_analytics(
  p_grade text,
  p_week date default null,
  p_pcode text default null,
  p_brand uuid default null,
  p_unbranded boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = places, public, geo
as $$
declare
  v_week date := p_week;
  v_prev date;
  v_latest date;
  result jsonb;
begin
  if v_week is null then
    v_week := places.latest_petrojam_date();
  end if;
  v_latest := places.latest_petrojam_date();
  if v_week is not null then
    select max(price_date) into v_prev
    from fuel.petrojam_prices
    where price_date < v_week;
  end if;

  with scope as (
    select
      p.id,
      p.name,
      p.address,
      p.brand_id,
      case when p.brand_id is null then 'No brand set' else b.name end as brand_name,
      p.status,
      p.pin_state,
      p.parish as parish_text,
      p.lat,
      p.lng,
      left(p.pcode, 4) as pcode,
      g.name as parish_name,
      (
        g.name is not null
        and p.parish is not null
        and lower(btrim(p.parish)) <> lower(btrim(g.name))
      ) as parish_mismatch
    from places.place p
    left join places.brand b on b.id = p.brand_id
    left join geo.boundaries g
      on g.admin_level = 1
     and g.pcode = left(p.pcode, 4)
    where p.place_type = 'gas_station'
      and p.duplicate_of is null
      and (p_pcode is null or left(p.pcode, 4) = p_pcode)
      and (
        (p_brand is null and coalesce(p_unbranded, false) = false)
        or (p_brand is null and coalesce(p_unbranded, false) and p.brand_id is null)
        or (p_brand is not null and p.brand_id = p_brand)
      )
  ),
  live as (
    select
      pc.place_id,
      pc.price_per_litre,
      pc.report_count,
      pc.fleet_count,
      pc.plug_count,
      pc.confidence,
      pc.petrojam_week,
      pc.outdated,
      pc.last_report_at
    from places.price_current pc
    join scope s on s.id = pc.place_id
    where pc.grade = p_grade
  ),
  current_prices as (
    select * from live where petrojam_week = v_week
  ),
  reports as (
    select
      r.place_id,
      r.source,
      r.reporter_key,
      r.reported_at,
      places.effective_report_price(r.source, r.id, r.price_per_litre) as price,
      c.status,
      c.weight,
      (
        select max(pp.price_date)
        from fuel.petrojam_prices pp
        where pp.price_date <= r.reported_at::date
      ) as week
    from places.price_report r
    join places.price_report_check c on c.source = r.source and c.report_id = r.id
    join scope s on s.id = r.place_id
    where r.grade = p_grade
  ),
  accepted as (
    select *
    from reports
    where status in ('accepted', 'approved')
      and weight > 0
      and week is not null
  ),
  weeks as (
    select price_date as week
    from fuel.petrojam_prices
    where v_week is not null
      and price_date <= v_week
    order by price_date desc
    limit 260
  ),
  trend as (
    select
      w.week,
      places.wholesale_on(p_grade, w.week) as petrojam,
      percentile_cont(0.5) within group (order by a.price) as pump_median,
      min(a.price) as pump_min,
      max(a.price) as pump_max,
      count(a.price)::int as reports,
      count(distinct a.place_id)::int as stations
    from weeks w
    left join accepted a on a.week = w.week
    group by w.week
  ),
  parish_median as (
    select s.pcode, percentile_cont(0.5) within group (order by cp.price_per_litre) as median
    from current_prices cp
    join scope s on s.id = cp.place_id
    where s.pcode is not null
    group by s.pcode
  ),
  kpi as (
    select
      percentile_cont(0.5) within group (order by price_per_litre) as pump_median,
      coalesce(sum(report_count), 0)::int as n_reports,
      count(*)::int as n_stations
    from current_prices
  ),
  prev_kpi as (
    select
      percentile_cont(0.5) within group (order by price) as pump_median,
      count(distinct place_id)::int as stations
    from accepted
    where week = v_prev
  )
  select jsonb_build_object(
    'meta', jsonb_build_object(
      'grade', p_grade,
      'week', v_week,
      'prevWeek', v_prev,
      'petrojam', places.wholesale_on(p_grade, v_week),
      'petrojamPrev', places.wholesale_on(p_grade, v_prev),
      'petrojamYearAgo', places.wholesale_on(p_grade, v_week - 364),
      'latestPetrojamDate', v_latest,
      'lastReportAt', (select max(last_report_at) from live),
      'generatedAt', now(),
      'grades', coalesce((
        select jsonb_agg(g order by g)
        from unnest(array['diesel', 'e10_87', 'e10_90', 'ulsd']) g
        where places.wholesale_on(g, coalesce(v_latest, v_week, current_date)) is not null
      ), '[]'::jsonb),
      'availableWeeks', coalesce((
        select jsonb_agg(to_jsonb(price_date) order by price_date desc)
        from (
          select price_date
          from fuel.petrojam_prices
          where v_week is null or price_date <= v_latest
          order by price_date desc
          limit 52
        ) w
      ), '[]'::jsonb)
    ),
    'kpis', jsonb_build_object(
      'pumpMedian', (select pump_median from kpi),
      'pumpMedianPrev', (select pump_median from prev_kpi),
      'nStations', coalesce((select n_stations from kpi), 0),
      'nReports', coalesce((select n_reports from kpi), 0),
      'min', (
        select jsonb_build_object('placeId', s.id, 'name', s.name, 'price', cp.price_per_litre)
        from current_prices cp
        join scope s on s.id = cp.place_id
        order by cp.price_per_litre asc, s.name
        limit 1
      ),
      'max', (
        select jsonb_build_object('placeId', s.id, 'name', s.name, 'price', cp.price_per_litre)
        from current_prices cp
        join scope s on s.id = cp.place_id
        order by cp.price_per_litre desc, s.name
        limit 1
      ),
      'stationsPriced', (select count(distinct place_id)::int from live),
      'stationsInScope', (select count(*)::int from scope),
      'stationsPricedPrev', coalesce((select stations from prev_kpi), 0),
      'verified', (select count(*)::int from scope where status = 'verified')
    ),
    'trust', jsonb_build_object(
      'reporters', (select count(distinct reporter_key)::int from accepted where week = v_week),
      'topReporterShare', coalesce((
        select max(n)::numeric / nullif(sum(n), 0)
        from (
          select count(*)::numeric as n
          from accepted
          where week = v_week
          group by reporter_key
        ) shares
      ), 0),
      'fleet', (select count(*)::int from reports where source = 'fleet'),
      'plug', (select count(*)::int from reports where source = 'plug'),
      'accepted', (select count(*)::int from reports where week = v_week and status in ('accepted', 'approved')),
      'duplicate', (select count(*)::int from reports where week = v_week and status = 'duplicate'),
      'rejected', (select count(*)::int from reports where week = v_week and status = 'rejected'),
      'review', (select count(*)::int from reports where week = v_week and status in ('review', 'waiting_place')),
      'outdated', (
        select count(*)::int from live
        where coalesce(outdated, false)
           or (petrojam_week is not null and v_week is not null and petrojam_week < v_week)
      ),
      'live', (select count(*)::int from live),
      'outdatedShare', coalesce((
        select count(*) filter (
          where coalesce(outdated, false)
             or (petrojam_week is not null and v_week is not null and petrojam_week < v_week)
        )::numeric / nullif(count(*), 0)
        from live
      ), 0)
    ),
    'trend', coalesce((
      select jsonb_agg(jsonb_build_object(
        'week', t.week,
        'petrojam', t.petrojam,
        'pumpMedian', t.pump_median,
        'pumpMin', t.pump_min,
        'pumpMax', t.pump_max,
        'reports', t.reports,
        'stations', t.stations
      ) order by t.week)
      from trend t
    ), '[]'::jsonb),
    'parishes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'pcode', b.pcode,
        'name', b.name,
        'stations', coalesce(agg.stations, 0),
        'verified', coalesce(agg.verified, 0),
        'priced', coalesce(agg.priced, 0),
        'median', pm.median,
        'gap', case when pm.median is null then null else pm.median - places.wholesale_on(p_grade, v_week) end,
        'vsNational', case
          when pm.median is null or (select pump_median from kpi) is null then null
          else pm.median - (select pump_median from kpi)
        end
      ) order by b.name)
      from geo.boundaries b
      left join (
        select
          s.pcode,
          count(*)::int as stations,
          count(*) filter (where s.status = 'verified')::int as verified,
          count(*) filter (where lv.place_id is not null)::int as priced
        from scope s
        left join live lv on lv.place_id = s.id
        group by s.pcode
      ) agg on agg.pcode = b.pcode
      left join parish_median pm on pm.pcode = b.pcode
      where b.admin_level = 1
        and b.pcode ~ '^JM[0-9]{2}$'
    ), '[]'::jsonb),
    'brands', coalesce((
      select jsonb_agg(jsonb_build_object(
        'brandId', grp.brand_id,
        'name', grp.brand_name,
        'stations', grp.stations,
        'priced', grp.priced,
        'median', grp.median
      ) order by grp.brand_name)
      from (
        select
          s.brand_id,
          s.brand_name,
          count(*)::int as stations,
          count(*) filter (where lv.place_id is not null)::int as priced,
          percentile_cont(0.5) within group (order by cp.price_per_litre) as median
        from scope s
        left join live lv on lv.place_id = s.id
        left join current_prices cp on cp.place_id = s.id
        group by s.brand_id, s.brand_name
      ) grp
    ), '[]'::jsonb),
    'stations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'placeId', s.id,
        'name', s.name,
        'address', s.address,
        'brand', s.brand_name,
        'brandId', s.brand_id,
        'pcode', s.pcode,
        'parish', s.parish_name,
        'status', s.status,
        'price', lv.price_per_litre,
        'gap', case
          when lv.price_per_litre is null then null
          else lv.price_per_litre - places.wholesale_on(p_grade, v_week)
        end,
        'vsParish', case
          when lv.price_per_litre is null or pm.median is null then null
          else lv.price_per_litre - pm.median
        end,
        'reportCount', lv.report_count,
        'reporterCount', coalesce(rc.reporters, 0),
        'confidence', lv.confidence,
        'lastReportAt', lv.last_report_at,
        'outdated', case
          when lv.place_id is null then null
          else coalesce(lv.outdated, false)
            or (lv.petrojam_week is not null and v_week is not null and lv.petrojam_week < v_week)
        end,
        'pinState', s.pin_state,
        'parishTextMismatch', s.parish_mismatch,
        'lat', s.lat,
        'lng', s.lng
      ) order by lv.price_per_litre nulls last, s.name)
      from scope s
      left join live lv on lv.place_id = s.id
      left join parish_median pm on pm.pcode = s.pcode
      left join (
        select place_id, count(distinct reporter_key)::int as reporters
        from accepted
        group by place_id
      ) rc on rc.place_id = s.id
    ), '[]'::jsonb),
    'quality', jsonb_build_object(
      'parishMismatch', (
        select count(*)::int
        from places.place p
        join geo.boundaries g on g.admin_level = 1 and g.pcode = left(p.pcode, 4)
        where p.place_type = 'gas_station'
          and p.duplicate_of is null
          and p.parish is not null
          and lower(btrim(p.parish)) <> lower(btrim(g.name))
      ),
      'noBrand', (
        select count(*)::int
        from places.place p
        where p.place_type = 'gas_station'
          and p.duplicate_of is null
          and p.brand_id is null
      ),
      'pinUnchecked', (
        select count(*)::int
        from places.place p
        where p.place_type = 'gas_station'
          and p.duplicate_of is null
          and p.pin_state = 'unchecked'
      ),
      'verifiedNoDate', (
        select count(*)::int
        from places.place p
        where p.place_type = 'gas_station'
          and p.duplicate_of is null
          and p.status = 'verified'
          and p.verified_at is null
      ),
      'inReview', (
        select count(*)::int
        from places.price_report_check
        where status in ('review', 'waiting_place')
      )
    )
  ) into result;

  return result;
end;
$$;

revoke all on function places.station_analytics(text, date, text, uuid, boolean) from public, anon, authenticated;
grant execute on function places.station_analytics(text, date, text, uuid, boolean) to service_role;
