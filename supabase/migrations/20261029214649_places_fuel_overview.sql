-- Fuel home reads one overview. Counts only. No customer, fleet, driver, or card rows.

create or replace function places.fuel_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = places, fuel, fleet, geo, public
as $$
declare
  v_total int;
  v_verified int;
  v_pending int;
  v_score int;
  v_failing int;
  v_checked timestamptz;
  v_pin_pass int;
  v_pin_fail int;
  v_brand_pass int;
  v_brand_fail int;
  v_parish_pass int;
  v_parish_fail int;
  v_live int;
  v_priced int;
  v_coverage int;
  v_review int;
  v_oldest_review timestamptz;
  v_top_share numeric;
  v_outdated_share numeric;
  v_reports_7d int;
  v_last_report timestamptz;
  v_last_publish timestamptz;
  v_bench_slug text;
  v_bench_name text;
  v_refineries int;
  v_week date;
  v_expected date;
  v_late int;
  v_freshness text;
  v_bench_price numeric;
  v_last_run timestamptz;
  v_programs int;
  v_station_edit timestamptz;
  v_grades jsonb;
  v_activity jsonb;
begin
  select c.total, c.verified
    into v_total, v_verified
  from public.fleet_station_counts() c;

  select count(*)::int into v_pending
  from places.place
  where place_type = 'gas_station'
    and status = 'pending';

  select q.score, q.failing, q.checked_at
    into v_score, v_failing, v_checked
  from fleet.dataset_quality q
  where q.dataset = 'stations';

  select
    count(*) filter (where p.pin_state is not null and p.pin_state <> 'unchecked')::int,
    count(*) filter (where p.pin_state is null or p.pin_state = 'unchecked')::int,
    count(*) filter (where p.brand_id is not null)::int,
    count(*) filter (where p.brand_id is null)::int,
    count(*) filter (where
      p.parish is null
      or exists (
        select 1
        from geo.boundaries b
        where b.admin_level = 1
          and b.pcode = left(p.pcode, 4)
          and places.parish_text_key(b.name) = places.parish_text_key(p.parish)
      )
    )::int,
    count(*) filter (where
      p.parish is not null
      and not exists (
        select 1
        from geo.boundaries b
        where b.admin_level = 1
          and b.pcode = left(p.pcode, 4)
          and places.parish_text_key(b.name) = places.parish_text_key(p.parish)
      )
    )::int
  into v_pin_pass, v_pin_fail, v_brand_pass, v_brand_fail, v_parish_pass, v_parish_fail
  from places.place p
  where p.place_type = 'gas_station';

  select
    count(*)::int,
    count(distinct place_id)::int
  into v_live, v_priced
  from places.price_current
  where valid_until > now();

  v_coverage := case
    when coalesce(v_total, 0) = 0 then 0
    else round(v_priced * 100.0 / v_total)::int
  end;

  select count(*)::int, min(checked_at)
    into v_review, v_oldest_review
  from places.price_report_check
  where status = 'review';

  select case
    when coalesce(sum(reports), 0) = 0 then 0
    else round(max(reports)::numeric / sum(reports), 4)
  end
  into v_top_share
  from places.price_reporter;

  select case
    when count(*) = 0 then 0
    else round(count(*) filter (where outdated)::numeric / count(*), 4)
  end
  into v_outdated_share
  from places.price_current;

  select count(*)::int into v_reports_7d
  from places.price_report
  where reported_at > now() - interval '7 days';

  select max(reported_at) into v_last_report from places.price_report;
  select max(published_at) into v_last_publish from places.published_fuel_price;

  select r.slug, r.name
    into v_bench_slug, v_bench_name
  from fuel.refinery r
  where r.is_benchmark
  order by r.country
  limit 1;

  select count(*)::int into v_refineries from fuel.refinery;

  v_week := places.latest_petrojam_date();
  v_expected := current_date - ((extract(dow from current_date)::int + 3) % 7);
  v_late := case when v_week is null then null else (v_expected - v_week) end;
  v_freshness := case
    when v_week is null then 'stale'
    when v_late <= 0 then 'current'
    when v_late <= 7 then 'due'
    else 'stale'
  end;

  v_bench_price := places.wholesale_on('e10_87', current_date);

  select max(finished_at) into v_last_run
  from fuel.refinery_sync_run;

  select count(*)::int into v_programs
  from public.kv_store_37f42386
  where key like 'jaa_program:%'
    and value->>'mode' in ('roam_managed', 'self_serve');

  select max(updated_at) into v_station_edit
  from places.place
  where place_type = 'gas_station';

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'grade', pr.engine_grade,
      'label', pr.label,
      'live', coalesce(live.live, 0),
      'avg_pump', live.avg_pump,
      'benchmark', bench.price,
      'diff', case
        when live.avg_pump is null or bench.price is null then null
        else round(live.avg_pump - bench.price, 2)
      end,
      'diff_pct', case
        when live.avg_pump is null or bench.price is null or bench.price = 0 then null
        else round((live.avg_pump - bench.price) / bench.price * 100, 1)
      end
    )
    order by pr.sort
  ), '[]'::jsonb)
  into v_grades
  from fuel.refinery_product pr
  left join lateral (
    select
      count(*)::int as live,
      round(avg(pc.price_per_litre), 2) as avg_pump
    from places.price_current pc
    where pc.grade = pr.engine_grade
      and pc.valid_until > now()
  ) live on true
  left join lateral (
    select round(places.wholesale_on(pr.engine_grade, current_date), 2) as price
  ) bench on true
  where pr.board_group = 'motor'
    and pr.engine_grade is not null;

  v_activity := jsonb_build_array(
    jsonb_build_object('kind', 'report', 'at', v_last_report),
    jsonb_build_object('kind', 'publish', 'at', v_last_publish),
    jsonb_build_object('kind', 'refinery_week', 'at', v_week),
    jsonb_build_object('kind', 'station_edit', 'at', v_station_edit)
  );

  return jsonb_build_object(
    'generated_at', now(),
    'stations', jsonb_build_object(
      'total', coalesce(v_total, 0),
      'verified', coalesce(v_verified, 0),
      'pending', coalesce(v_pending, 0)
    ),
    'quality', jsonb_build_object(
      'score', v_score,
      'failing', coalesce(v_failing, 0),
      'rules', jsonb_build_array(
        jsonb_build_object('key', 'pin_checked', 'label', 'Pin checked', 'pass', coalesce(v_pin_pass, 0), 'fail', coalesce(v_pin_fail, 0)),
        jsonb_build_object('key', 'brand_set', 'label', 'Brand set', 'pass', coalesce(v_brand_pass, 0), 'fail', coalesce(v_brand_fail, 0)),
        jsonb_build_object('key', 'parish_match', 'label', 'Parish matches map', 'pass', coalesce(v_parish_pass, 0), 'fail', coalesce(v_parish_fail, 0))
      ),
      'checked_at', v_checked
    ),
    'prices', jsonb_build_object(
      'live', coalesce(v_live, 0),
      'priced_stations', coalesce(v_priced, 0),
      'coverage_pct', coalesce(v_coverage, 0),
      'by_grade', v_grades,
      'review_waiting', coalesce(v_review, 0),
      'oldest_review_at', v_oldest_review,
      'top_reporter_share', coalesce(v_top_share, 0),
      'outdated_share', coalesce(v_outdated_share, 0),
      'reports_7d', coalesce(v_reports_7d, 0),
      'last_report_at', v_last_report,
      'last_published_at', v_last_publish
    ),
    'benchmark', jsonb_build_object(
      'slug', v_bench_slug,
      'name', v_bench_name,
      'refineries', coalesce(v_refineries, 0),
      'latest_week', v_week,
      'freshness', v_freshness,
      'headline', jsonb_build_object(
        'product', 'gasolene_87',
        'label', 'Gasolene 87',
        'price', case when v_bench_price is null then null else round(v_bench_price, 2) end
      ),
      'last_run_at', v_last_run
    ),
    'gas_cards', jsonb_build_object('programs', coalesce(v_programs, 0)),
    'activity', v_activity
  );
end;
$$;

revoke all on function places.fuel_overview() from public, anon, authenticated;
grant execute on function places.fuel_overview() to service_role;

do $$
declare
  overview jsonb := places.fuel_overview();
  counts record;
  quality record;
  live_direct int;
  rule jsonb;
begin
  select * into counts from public.fleet_station_counts();
  if (overview->'stations'->>'total')::int is distinct from counts.total
     or (overview->'stations'->>'verified')::int is distinct from counts.verified then
    raise exception 'T1 station totals % vs %', overview->'stations', to_jsonb(counts);
  end if;

  select score, failing into quality from fleet.dataset_quality where dataset = 'stations';
  if (overview->'quality'->>'score')::int is distinct from quality.score
     or (overview->'quality'->>'failing')::int is distinct from quality.failing then
    raise exception 'T2 quality % vs %', overview->'quality', to_jsonb(quality);
  end if;

  for rule in select elem from jsonb_array_elements(overview->'quality'->'rules') as elem
  loop
    if (rule->>'pass')::int + (rule->>'fail')::int
       is distinct from (overview->'stations'->>'total')::int then
      raise exception 'T3 rule %', rule;
    end if;
  end loop;

  select count(*)::int into live_direct
  from places.price_current
  where valid_until > now();
  if (overview->'prices'->>'live')::int is distinct from live_direct then
    raise exception 'T4 live % vs %', overview->'prices'->>'live', live_direct;
  end if;

  if has_function_privilege('anon', 'places.fuel_overview()', 'EXECUTE')
     or has_function_privilege('authenticated', 'places.fuel_overview()', 'EXECUTE') then
    raise exception 'T5 anon or authenticated can execute fuel_overview';
  end if;

  if overview ? 'organization' or overview ? 'driver' or overview ? 'vehicle' or overview ? 'card_number' then
    raise exception 'fuel_overview leaked a customer key';
  end if;
end;
$$;
