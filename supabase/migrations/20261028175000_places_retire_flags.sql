-- Groups and brands can be retired the same way categories already can.
alter table places.category_group add column if not exists active boolean not null default true;
alter table places.brand add column if not exists active boolean not null default true;

create or replace function places.taxonomy()
returns jsonb
language sql
stable
security definer
set search_path = places, public
as $$
  select jsonb_build_object(
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', g.code, 'slug', g.slug, 'label', g.label, 'colour', g.colour, 'sort', g.sort, 'active', g.active
      ) order by g.sort, g.code)
      from places.category_group g
      where g.active
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', c.code, 'group_code', c.group_code, 'slug', c.slug, 'label', c.label,
        'icon', c.icon, 'sort', c.sort, 'active', c.active
      ) order by c.sort, c.code)
      from places.category c
      where c.active
    ), '[]'::jsonb),
    'placeTypes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'slug', t.slug, 'category_code', t.category_code, 'label', t.label, 'icon', t.icon,
        'default_geofence_m', t.default_geofence_m, 'default_facilities', t.default_facilities,
        'match_profile', t.match_profile, 'search_as_facility', t.search_as_facility,
        'attribute_schema', t.attribute_schema, 'active', t.active
      ) order by t.label)
      from places.place_type t
      where t.active
    ), '[]'::jsonb),
    'facilityTypes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'slug', f.slug, 'category_code', f.category_code, 'label', f.label, 'icon', f.icon,
        'searchable', f.searchable, 'attribute_schema', f.attribute_schema, 'active', f.active
      ) order by f.label)
      from places.facility_type f
      where f.active
    ), '[]'::jsonb),
    'brands', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'slug', b.slug, 'name', b.name, 'aliases', b.aliases, 'logo_url', b.logo_url, 'active', b.active
      ) order by b.name)
      from places.brand b
      where b.active
    ), '[]'::jsonb)
  );
$$;
