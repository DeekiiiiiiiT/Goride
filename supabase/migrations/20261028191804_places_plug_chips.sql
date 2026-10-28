-- Plug home chips live on the place type, in the same order the app already uses.

alter table places.place_type
  add column if not exists plug_chip text,
  add column if not exists grid_sort int,
  add column if not exists grid_icon text,
  add column if not exists plug_label text,
  add column if not exists plug_map_label text,
  add column if not exists empty_hint text;

update places.place_type as t
set plug_chip = seed.chip,
    grid_sort = seed.sort,
    grid_icon = seed.icon,
    plug_label = seed.label,
    plug_map_label = seed.map_label,
    empty_hint = seed.empty_hint
from (values
  ('mechanic_garage', 'mechanic', 1, 'build', 'Mechanics', 'Mechanic', 'No mechanics mapped near you yet'),
  ('parts_store', 'parts_store', 2, 'settings', 'Parts stores', 'Parts store', 'No parts stores mapped near you yet'),
  ('gas_station', 'fuel', 3, 'local_gas_station', 'Fuel prices', 'Fuel station', 'No fuel stations mapped near you yet'),
  ('tyre_shop', 'tyre_air', 4, 'tire_repair', 'Tyres & air', 'Tyres & air', 'No tyre and air places mapped near you yet'),
  ('car_wash', 'car_wash', 5, 'local_car_wash', 'Car wash', 'Car wash', 'No car washes mapped near you yet'),
  ('public_restroom', 'restroom', 6, 'wc', 'Restrooms', 'Restroom', 'No restrooms mapped near you yet'),
  ('toll_plaza', 'toll', 7, 'toll', 'Tolls', 'Toll', 'No tolls mapped near you yet'),
  ('roadside_assistance', 'roadside', 8, 'sos', 'Roadside help', 'Roadside help', 'No roadside help mapped near you yet')
) as seed(slug, chip, sort, icon, label, map_label, empty_hint)
where t.slug = seed.slug;

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
    ), '[]'::jsonb),
    'plugChips', coalesce((
      select jsonb_agg(jsonb_build_object(
        'chip', t.plug_chip,
        'placeType', t.slug,
        'label', t.plug_label,
        'mapLabel', t.plug_map_label,
        'icon', t.grid_icon,
        'empty', t.empty_hint,
        'sort', t.grid_sort
      ) order by t.grid_sort)
      from places.place_type t
      where t.active and t.plug_chip is not null
    ), '[]'::jsonb)
  );
$$;
