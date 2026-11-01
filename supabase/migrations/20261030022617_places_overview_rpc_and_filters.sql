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
notify pgrst, 'reload schema';
