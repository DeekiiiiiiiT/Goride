-- Places and Maps home: a places quality score, one overview, and two register filters.

create or replace function fleet.score_master_data()
returns void
language plpgsql
security definer
set search_path = fleet, public, places, geo
as $$
declare
  total int;
  failing int;
  score int;
  note text;
  boundary_total int;
  boundary_fail int;
  place_total int;
  place_fail int;
  places_pin_fail int;
begin
  select count(*) into total from fleet.stations;
  select count(*) into failing from fleet.station_quality where not coalesce(complete, false);
  if total = 0 then
    score := null; note := 'Not scored yet'; failing := 0;
  else
    score := ((total - failing) * 100) / total; note := null;
  end if;
  insert into fleet.dataset_quality (dataset, score, failing, checked_at, note)
  values ('stations', score, failing, now(), note)
  on conflict (dataset) do update
    set score = excluded.score, failing = excluded.failing, checked_at = excluded.checked_at, note = excluded.note;

  select count(*) into total from fleet.toll_plazas;
  select count(*) into failing from fleet.toll_plazas
    where name is null or lat is null or lng is null;
  if total = 0 then score := null; note := 'Not scored yet'; failing := 0;
  else score := ((total - failing) * 100) / total; note := null; end if;
  insert into fleet.dataset_quality (dataset, score, failing, checked_at, note)
  values ('tolls', score, failing, now(), note)
  on conflict (dataset) do update
    set score = excluded.score, failing = excluded.failing, checked_at = excluded.checked_at, note = excluded.note;

  select count(*) into total from fleet.platform_vendors;
  select count(*) into failing from fleet.platform_vendors
    where name is null or publish_state is null;
  if total = 0 then score := null; note := 'Not scored yet'; failing := 0;
  else score := ((total - failing) * 100) / total; note := null; end if;
  insert into fleet.dataset_quality (dataset, score, failing, checked_at, note)
  values ('vendors', score, failing, now(), note)
  on conflict (dataset) do update
    set score = excluded.score, failing = excluded.failing, checked_at = excluded.checked_at, note = excluded.note;

  if to_regclass('public.vehicle_catalog') is null then
    total := 0;
  else
    execute 'select count(*) from public.vehicle_catalog' into total;
    execute 'select count(*) from public.vehicle_catalog where make is null or model is null' into failing;
  end if;
  if total = 0 then score := null; note := 'Not scored yet'; failing := 0;
  else score := ((total - failing) * 100) / total; note := null; end if;
  insert into fleet.dataset_quality (dataset, score, failing, checked_at, note)
  values ('vehicles', score, failing, now(), note)
  on conflict (dataset) do update
    set score = excluded.score, failing = excluded.failing, checked_at = excluded.checked_at, note = excluded.note;

  boundary_total := 0;
  boundary_fail := 0;
  place_total := 0;
  place_fail := 0;
  if to_regclass('geo.boundaries') is not null then
    select count(*) into boundary_total from geo.boundaries;
    select count(*) into boundary_fail
    from geo.boundaries b
    where not exists (
      select 1
      from geo.boundary_versions v
      where v.id = b.current_version_id
        and v.status = 'published'
        and v.geom is not null
    );
  end if;
  if to_regclass('geo.places') is not null then
    select count(*) into place_total from geo.places;
    select count(*) into place_fail from geo.places
      where name is null or lat is null or lng is null;
  end if;
  total := boundary_total + place_total;
  failing := boundary_fail + place_fail;
  if total = 0 then score := null; note := 'Not scored yet'; failing := 0;
  else score := ((total - failing) * 100) / total; note := null; end if;
  insert into fleet.dataset_quality (dataset, score, failing, checked_at, note)
  values ('maps', score, failing, now(), note)
  on conflict (dataset) do update
    set score = excluded.score, failing = excluded.failing, checked_at = excluded.checked_at, note = excluded.note;

  if to_regclass('public.gct_rates') is null then
    total := 0; failing := 0;
  else
    execute 'select count(*) from public.gct_rates' into total;
    execute 'select count(*) from public.gct_rates where supply_class is null or rate_percent is null or effective_from is null' into failing;
  end if;
  if total = 0 then score := null; note := 'Not scored yet'; failing := 0;
  else score := ((total - failing) * 100) / total; note := null; end if;
  insert into fleet.dataset_quality (dataset, score, failing, checked_at, note)
  values ('gct_rates', score, failing, now(), note)
  on conflict (dataset) do update
    set score = excluded.score, failing = excluded.failing, checked_at = excluded.checked_at, note = excluded.note;

  select count(*) into total from places.place;
  select count(*) into failing
  from places.place p
  left join places.place_type t on t.slug = p.place_type
  where p.pin_state not in ('confirmed', 'offset')
     or nullif(btrim(p.pcode), '') is null
     or (coalesce(t.match_profile, '') = 'fuel' and p.brand_id is null);
  select count(*) into places_pin_fail
  from places.place
  where pin_state not in ('confirmed', 'offset');
  if total = 0 then
    score := null; note := 'Not scored yet'; failing := 0;
  else
    score := ((total - failing) * 100) / total;
    note := case when places_pin_fail > 0 then places_pin_fail || ' pins not checked' else null end;
  end if;
  insert into fleet.dataset_quality (dataset, score, failing, checked_at, note)
  values ('places', score, failing, now(), note)
  on conflict (dataset) do update
    set score = excluded.score, failing = excluded.failing, checked_at = excluded.checked_at, note = excluded.note;
end;
$$;

revoke all on function fleet.score_master_data() from public, anon, authenticated;
grant execute on function fleet.score_master_data() to service_role;

create or replace function places.places_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = places, geo, fleet, public
as $$
declare
  v_total int;
  v_verified int;
  v_pending int;
  v_learnt int;
  v_on_plug int;
  v_types_used int;
  v_types_active int;
  v_by_type jsonb;
  v_parish int;
  v_town int;
  v_community int;
  v_places_score int;
  v_places_failing int;
  v_places_checked timestamptz;
  v_pin_pass int;
  v_pin_fail int;
  v_area_pass int;
  v_area_fail int;
  v_brand_pass int;
  v_brand_fail int;
  v_brand_applies int;
  v_map_score int;
  v_map_checked timestamptz;
  v_country int;
  v_parishes int;
  v_towns int;
  v_communities int;
  v_drafts int;
  v_last_publish timestamptz;
  v_publishes int;
  v_pins int;
  v_pins_pass int;
  v_borders int;
  v_borders_pass int;
  v_imports int;
  v_last_import timestamptz;
  v_checks int;
  v_new_places int;
  v_suggestions int;
  v_evidence int;
  v_oldest timestamptz;
  v_place_edit timestamptz;
  v_review_at timestamptz;
  v_verified_unchecked int;
  v_no_brand int;
  v_parish_only int;
begin
  select
    count(*)::int,
    count(*) filter (where status = 'verified')::int,
    count(*) filter (where status = 'pending')::int,
    count(*) filter (where status = 'learnt')::int,
    count(distinct place_type)::int,
    max(updated_at)
  into v_total, v_verified, v_pending, v_learnt, v_types_used, v_place_edit
  from places.place;

  select count(*)::int into v_on_plug from places.public_place;
  select count(*)::int into v_types_active from places.place_type where active;

  select coalesce(jsonb_agg(jsonb_build_object(
    'type', slug,
    'label', label,
    'count', n
  ) order by n desc, label), '[]'::jsonb)
  into v_by_type
  from (
    select t.slug, t.label, count(*)::int as n
    from places.place p
    join places.place_type t on t.slug = p.place_type
    group by t.slug, t.label
  ) typed;

  select
    count(*) filter (where coalesce(b.admin_level, 1) <= 1)::int,
    count(*) filter (where b.admin_level = 2)::int,
    count(*) filter (where b.admin_level >= 3)::int
  into v_parish, v_town, v_community
  from places.place p
  left join geo.boundaries b on b.pcode = p.pcode;

  select q.score, q.failing, q.checked_at
  into v_places_score, v_places_failing, v_places_checked
  from fleet.dataset_quality q
  where q.dataset = 'places';

  select q.score, q.checked_at
  into v_map_score, v_map_checked
  from fleet.dataset_quality q
  where q.dataset = 'maps';

  select
    count(*) filter (where p.pin_state in ('confirmed', 'offset'))::int,
    count(*) filter (where p.pin_state not in ('confirmed', 'offset'))::int,
    count(*) filter (where nullif(btrim(p.pcode), '') is not null)::int,
    count(*) filter (where nullif(btrim(p.pcode), '') is null)::int
  into v_pin_pass, v_pin_fail, v_area_pass, v_area_fail
  from places.place p;

  select
    count(*) filter (where p.brand_id is not null)::int,
    count(*) filter (where p.brand_id is null)::int,
    count(*)::int
  into v_brand_pass, v_brand_fail, v_brand_applies
  from places.place p
  join places.place_type t on t.slug = p.place_type
  where t.match_profile = 'fuel';

  select
    count(*) filter (where admin_level = 0)::int,
    count(*) filter (where admin_level = 1)::int,
    count(*) filter (where admin_level = 2)::int,
    count(*) filter (where admin_level >= 3)::int,
    count(*)::int,
    count(*) filter (where exists (
      select 1
      from geo.boundary_versions v
      where v.id = b.current_version_id
        and v.status = 'published'
        and v.geom is not null
    ))::int
  into v_country, v_parishes, v_towns, v_communities, v_borders, v_borders_pass
  from geo.boundaries b;

  select count(*)::int into v_drafts
  from geo.boundary_versions
  where status = 'draft';

  select count(*)::int, max(created_at) filter (where status = 'published')
  into v_publishes, v_last_publish
  from geo.publish_log;

  select
    count(*)::int,
    count(*) filter (where name is not null and lat is not null and lng is not null)::int
  into v_pins, v_pins_pass
  from geo.places;

  select count(*)::int, max(created_at)
  into v_imports, v_last_import
  from geo.import_runs;

  v_checks := 0;
  if to_regclass('geo.quality_issues') is not null then
    select count(*)::int into v_checks from geo.quality_issues;
  elsif to_regclass('geo.quality_issues_mv') is not null then
    select count(*)::int into v_checks from geo.quality_issues_mv where severity <> 'info';
  end if;

  v_new_places := coalesce(v_pending, 0);
  select count(*)::int into v_suggestions
  from places.place_change_proposal
  where status = 'pending';
  select count(*)::int into v_evidence from places.place_evidence;
  select min(created_at) into v_oldest
  from places.place
  where status in ('pending', 'learnt');
  select max(decided_at) into v_review_at
  from places.place_change_proposal
  where decided_at is not null;

  select
    count(*) filter (where p.status = 'verified' and p.pin_state not in ('confirmed', 'offset'))::int,
    count(*) filter (where t.match_profile = 'fuel' and p.brand_id is null)::int,
    count(*) filter (where coalesce(b.admin_level, 1) <= 1)::int
  into v_verified_unchecked, v_no_brand, v_parish_only
  from places.place p
  left join places.place_type t on t.slug = p.place_type
  left join geo.boundaries b on b.pcode = p.pcode;

  return jsonb_build_object(
    'generated_at', now(),
    'places', jsonb_build_object(
      'total', coalesce(v_total, 0),
      'verified', coalesce(v_verified, 0),
      'pending', coalesce(v_pending, 0),
      'learnt', coalesce(v_learnt, 0),
      'on_plug', coalesce(v_on_plug, 0),
      'types_used', coalesce(v_types_used, 0),
      'types_active', coalesce(v_types_active, 0),
      'by_type', coalesce(v_by_type, '[]'::jsonb),
      'area_depth', jsonb_build_object(
        'parish', coalesce(v_parish, 0),
        'town', coalesce(v_town, 0),
        'community', coalesce(v_community, 0)
      )
    ),
    'places_quality', jsonb_build_object(
      'score', v_places_score,
      'failing', coalesce(v_places_failing, 0),
      'checked_at', v_places_checked,
      'rules', jsonb_build_array(
        jsonb_build_object('key', 'pin_checked', 'label', 'Pin checked', 'pass', coalesce(v_pin_pass, 0), 'fail', coalesce(v_pin_fail, 0)),
        jsonb_build_object('key', 'area_code', 'label', 'Area code', 'pass', coalesce(v_area_pass, 0), 'fail', coalesce(v_area_fail, 0)),
        jsonb_build_object('key', 'brand_set', 'label', 'Brand set', 'pass', coalesce(v_brand_pass, 0), 'fail', coalesce(v_brand_fail, 0), 'applies_to', coalesce(v_brand_applies, 0))
      )
    ),
    'map', jsonb_build_object(
      'score', v_map_score,
      'checked_at', v_map_checked,
      'areas', jsonb_build_object(
        'country', coalesce(v_country, 0),
        'parish', coalesce(v_parishes, 0),
        'town', coalesce(v_towns, 0),
        'community', coalesce(v_communities, 0)
      ),
      'drafts', coalesce(v_drafts, 0),
      'last_publish_at', v_last_publish,
      'publishes', coalesce(v_publishes, 0),
      'pins', coalesce(v_pins, 0),
      'pins_pass', coalesce(v_pins_pass, 0),
      'borders_total', coalesce(v_borders, 0),
      'borders_pass', coalesce(v_borders_pass, 0),
      'imports', coalesce(v_imports, 0),
      'last_import_at', v_last_import,
      'open_checks', coalesce(v_checks, 0)
    ),
    'review', jsonb_build_object(
      'new_places', coalesce(v_new_places, 0),
      'learnt', coalesce(v_learnt, 0),
      'suggestions', coalesce(v_suggestions, 0),
      'evidence', coalesce(v_evidence, 0),
      'oldest_at', v_oldest
    ),
    'issues', jsonb_build_object(
      'pin_unchecked', coalesce(v_pin_fail, 0),
      'verified_pin_unchecked', coalesce(v_verified_unchecked, 0),
      'no_brand', coalesce(v_no_brand, 0),
      'area_parish_only', coalesce(v_parish_only, 0)
    ),
    'activity', jsonb_build_array(
      jsonb_build_object('kind', 'place_edit', 'at', v_place_edit),
      jsonb_build_object('kind', 'border_publish', 'at', v_last_publish),
      jsonb_build_object('kind', 'import', 'at', v_last_import),
      jsonb_build_object('kind', 'review', 'at', v_review_at)
    )
  );
end;
$$;

revoke all on function places.places_overview() from public, anon, authenticated;
grant execute on function places.places_overview() to service_role;

create or replace view places.place_list_row with (security_invoker = true) as
select
  p.id,
  p.name,
  p.place_type,
  pt.label as type_label,
  pt.match_profile,
  pt.category_code,
  c.group_code,
  pt.default_geofence_m,
  p.address,
  p.plus_code,
  p.status,
  p.pin_state,
  p.geofence_m,
  (p.geofence_m is not null) as geofence_override,
  coalesce(p.geofence_m, pt.default_geofence_m) as geofence_display,
  p.phone,
  (p.phone is null or btrim(p.phone) = '') as no_phone,
  p.origin_app,
  p.updated_at,
  p.verified_at,
  p.lat,
  p.lng,
  p.brand_id,
  b.name as brand_name,
  (p.brand_id is null) as no_brand,
  left(p.pcode, 4) as pcode1,
  parish.name as parish_name,
  town_boundary.name as town_name,
  p.parish as parish_text,
  (
    parish.name is not null
    and p.parish is not null
    and places.parish_text_key(regexp_replace(btrim(p.parish), '\s+parish$', '', 'i'))
      is distinct from places.parish_text_key(parish.name)
  ) as parish_text_mismatch,
  (
    p.lat is null
    or p.lng is null
    or p.lat < 17.6
    or p.lat > 18.6
    or p.lng < -78.5
    or p.lng > -76.1
  ) as outside_jamaica,
  (p.pin_state = 'unchecked') as pin_unchecked,
  case
    when coalesce(p.legacy_payload->>'dataSource', '') = 'import' then 'import'
    when p.origin_app = 'roam_fleet' then 'fleet'
    when p.origin_app = 'roam_plug' then 'plug'
    else 'manual'
  end as source,
  (
    select count(*)::int
    from places.place_facility f
    where f.place_id = p.id
  ) as facility_count,
  (p.status = 'verified' and p.pin_state = 'unchecked') as verified_pin_unchecked,
  (coalesce(loc.admin_level, 1) <= 1) as area_parish_only
from places.place p
left join places.place_type pt on pt.slug = p.place_type
left join places.category c on c.code = pt.category_code
left join places.brand b on b.id = p.brand_id
left join geo.boundaries loc on loc.pcode = p.pcode
left join geo.boundaries town_boundary on town_boundary.pcode = case
  when loc.admin_level = 2 then loc.pcode
  when loc.admin_level = 3 then loc.parent_pcode
  else null
end
left join geo.boundaries parish
  on parish.admin_level = 1
 and parish.pcode = left(p.pcode, 4);

revoke all on places.place_list_row from public, anon, authenticated;
grant select on places.place_list_row to service_role;

select fleet.score_master_data();

do $$
declare
  overview jsonb := places.places_overview();
  places jsonb := overview->'places';
  quality record;
  maps record;
  other_status int;
  rule jsonb;
  expected int;
begin
  select count(*)::int into other_status
  from places.place
  where status not in ('verified', 'pending', 'learnt');

  if (places->>'total')::int is distinct from
     (places->>'verified')::int + (places->>'pending')::int + (places->>'learnt')::int + other_status then
    raise exception 'T1 places totals %', places;
  end if;

  select score, failing into quality from fleet.dataset_quality where dataset = 'places';
  select score, failing into maps from fleet.dataset_quality where dataset = 'maps';
  if (overview->'places_quality'->>'score')::int is distinct from quality.score
     or (overview->'places_quality'->>'failing')::int is distinct from quality.failing
     or (overview->'map'->>'score')::int is distinct from maps.score then
    raise exception 'T2 scores % vs places % maps %', overview->'places_quality', to_jsonb(quality), to_jsonb(maps);
  end if;

  for rule in select elem from jsonb_array_elements(overview->'places_quality'->'rules') as elem
  loop
    expected := coalesce((rule->>'applies_to')::int, (places->>'total')::int);
    if (rule->>'pass')::int + (rule->>'fail')::int is distinct from expected then
      raise exception 'T3 rule %', rule;
    end if;
  end loop;

  if has_function_privilege('anon', 'places.places_overview()', 'EXECUTE')
     or has_function_privilege('authenticated', 'places.places_overview()', 'EXECUTE') then
    raise exception 'T5 anon or authenticated can execute places_overview';
  end if;

  if overview ? 'organization' or overview ? 'driver' or overview ? 'vehicle'
     or overview ? 'user_id' or overview ? 'saved_place' then
    raise exception 'places_overview leaked a customer key';
  end if;
end;
$$;

notify pgrst, 'reload schema';
