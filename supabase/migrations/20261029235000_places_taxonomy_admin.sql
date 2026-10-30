-- Categories admin. Public places.taxonomy() is not replaced.
-- T1 retire gas_station (or any in-use type) raises in_use and writes nothing.
-- T2 retire of an unused type writes one change row, then this check rolls that back.
-- T3 a group with an active category cannot be retired.
-- T4 restore is refused while the parent is retired, then the fixture rolls back.
-- T5 taxonomy_admin() totals match the tables.
-- T6 every brand that existed here is scoped to gas_station.

alter table places.place_type add column if not exists sort int not null default 0;
alter table places.facility_type add column if not exists sort int not null default 0;
alter table places.brand add column if not exists sort int not null default 0;
alter table places.brand add column if not exists place_types text[] not null default '{}';

update places.brand
set place_types = '{gas_station}'
where place_types = '{}';

create table if not exists places.taxonomy_change (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  row_key text not null,
  action text not null check (action in ('create', 'update', 'retire', 'restore')),
  before jsonb,
  after jsonb,
  reason text,
  actor_id uuid,
  at timestamptz not null default now()
);

create index if not exists taxonomy_change_row_ix
  on places.taxonomy_change (table_name, row_key, at desc);

alter table places.taxonomy_change enable row level security;
revoke all on table places.taxonomy_change from public, anon, authenticated;
grant select, insert on table places.taxonomy_change to service_role;

create or replace function places.taxonomy_in_use(p_blocked jsonb)
returns boolean
language sql
immutable
as $$
  select coalesce((p_blocked->>'places')::int, 0) > 0
    or coalesce((p_blocked->>'plug_chip')::boolean, false)
    or coalesce((p_blocked->>'search_as')::int, 0) > 0
    or coalesce((p_blocked->>'children')::int, 0) > 0
    or coalesce((p_blocked->>'facilities')::int, 0) > 0
    or coalesce((p_blocked->>'default_facilities')::int, 0) > 0;
$$;

create or replace function places.taxonomy_blocked(p_table text, p_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = places, public
as $$
declare
  places_n int := 0;
  plug boolean := false;
  search_n int := 0;
  children_n int := 0;
  facilities_n int := 0;
  defaults_n int := 0;
begin
  if p_table = 'place_type' then
    select count(*) into places_n from places.place where place_type = p_id;
    select coalesce(plug_chip is not null and btrim(plug_chip) <> '', false)
      into plug from places.place_type where slug = p_id;
    select count(*) into search_n from places.place_type where search_as_facility = p_id;
  elsif p_table = 'facility_type' then
    select count(*) into facilities_n from places.place_facility where facility_type = p_id;
    select count(*) into defaults_n from places.place_type where p_id = any (default_facilities);
    select count(*) into search_n from places.place_type where search_as_facility = p_id;
  elsif p_table = 'category' then
    select count(*) into children_n
    from (
      select slug from places.place_type where category_code = p_id and active
      union all
      select slug from places.facility_type where category_code = p_id and active
    ) kids;
  elsif p_table = 'category_group' then
    select count(*) into children_n from places.category where group_code = p_id and active;
  elsif p_table = 'brand' then
    select count(*) into places_n from places.place where brand_id::text = p_id;
  end if;
  return jsonb_build_object(
    'places', places_n,
    'plug_chip', coalesce(plug, false),
    'search_as', search_n,
    'children', children_n,
    'facilities', facilities_n,
    'default_facilities', defaults_n
  );
end;
$$;

create or replace function places.taxonomy_require_reason(p_reason text)
returns void
language plpgsql
as $$
begin
  if p_reason is null or char_length(btrim(p_reason)) < 10 then
    raise exception 'A reason needs at least 10 characters' using errcode = '22023';
  end if;
end;
$$;

create or replace function places.taxonomy_stamp(p_reason text, p_actor uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('places.reason', btrim(p_reason), true);
  perform set_config('places.actor', coalesce(p_actor::text, ''), true);
end;
$$;

create or replace function places.log_taxonomy_change()
returns trigger
language plpgsql
security definer
set search_path = places, public
as $$
declare
  next_action text;
  row_key text;
  actor_raw text;
  actor_uuid uuid;
begin
  if tg_op = 'INSERT' then
    next_action := 'create';
  elsif old.active is true and new.active is false then
    next_action := 'retire';
  elsif old.active is false and new.active is true then
    next_action := 'restore';
  else
    next_action := 'update';
  end if;

  -- to_jsonb so a place type row is not asked for a code column.
  if tg_table_name = 'brand' then
    row_key := to_jsonb(new)->>'id';
  elsif tg_table_name in ('category_group', 'category') then
    row_key := to_jsonb(new)->>'code';
  else
    row_key := to_jsonb(new)->>'slug';
  end if;

  actor_raw := nullif(current_setting('places.actor', true), '');
  if actor_raw is null then
    actor_raw := nullif(current_setting('request.jwt.claim.sub', true), '');
  end if;
  if actor_raw ~ '^[0-9a-fA-F-]{36}$' then
    actor_uuid := actor_raw::uuid;
  end if;

  insert into places.taxonomy_change (table_name, row_key, action, before, after, reason, actor_id)
  values (
    tg_table_name,
    row_key,
    next_action,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    to_jsonb(new),
    nullif(current_setting('places.reason', true), ''),
    actor_uuid
  );
  return new;
end;
$$;

drop trigger if exists taxonomy_change_category_group on places.category_group;
drop trigger if exists taxonomy_change_category on places.category;
drop trigger if exists taxonomy_change_place_type on places.place_type;
drop trigger if exists taxonomy_change_facility_type on places.facility_type;
drop trigger if exists taxonomy_change_brand on places.brand;

create trigger taxonomy_change_category_group
  after insert or update on places.category_group
  for each row execute function places.log_taxonomy_change();
create trigger taxonomy_change_category
  after insert or update on places.category
  for each row execute function places.log_taxonomy_change();
create trigger taxonomy_change_place_type
  after insert or update on places.place_type
  for each row execute function places.log_taxonomy_change();
create trigger taxonomy_change_facility_type
  after insert or update on places.facility_type
  for each row execute function places.log_taxonomy_change();
create trigger taxonomy_change_brand
  after insert or update on places.brand
  for each row execute function places.log_taxonomy_change();

create or replace function places.retire_taxonomy(p_table text, p_id text, p_reason text, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = places, public
as $$
declare
  blocked jsonb;
  updated int;
begin
  if p_table not in ('category_group', 'category', 'place_type', 'facility_type', 'brand') then
    raise exception 'That list cannot be edited' using errcode = '22023';
  end if;
  perform places.taxonomy_require_reason(p_reason);
  blocked := places.taxonomy_blocked(p_table, p_id);
  if places.taxonomy_in_use(blocked) then
    raise exception 'in_use' using detail = blocked::text;
  end if;
  perform places.taxonomy_stamp(p_reason, p_actor);
  if p_table = 'category_group' then
    update places.category_group set active = false where code = p_id and active;
  elsif p_table = 'category' then
    update places.category set active = false where code = p_id and active;
  elsif p_table = 'place_type' then
    update places.place_type set active = false where slug = p_id and active;
  elsif p_table = 'facility_type' then
    update places.facility_type set active = false where slug = p_id and active;
  else
    update places.brand set active = false where id::text = p_id and active;
  end if;
  get diagnostics updated = row_count;
  if updated = 0 then
    raise exception 'That item was not found' using errcode = '22023';
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function places.restore_taxonomy(p_table text, p_id text, p_reason text, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = places, public
as $$
declare
  parent_label text;
  parent_active boolean;
  updated int;
begin
  if p_table not in ('category_group', 'category', 'place_type', 'facility_type', 'brand') then
    raise exception 'That list cannot be edited' using errcode = '22023';
  end if;
  perform places.taxonomy_require_reason(p_reason);
  parent_active := true;
  if p_table = 'place_type' then
    select case when g.active is false then g.label else c.label end,
           c.active and g.active
      into parent_label, parent_active
    from places.place_type t
    join places.category c on c.code = t.category_code
    join places.category_group g on g.code = c.group_code
    where t.slug = p_id;
  elsif p_table = 'facility_type' then
    select case when g.active is false then g.label else c.label end,
           c.active and g.active
      into parent_label, parent_active
    from places.facility_type f
    join places.category c on c.code = f.category_code
    join places.category_group g on g.code = c.group_code
    where f.slug = p_id;
  elsif p_table = 'category' then
    select g.label, g.active
      into parent_label, parent_active
    from places.category c
    join places.category_group g on g.code = c.group_code
    where c.code = p_id;
  end if;
  if parent_active is false then
    raise exception 'parent_retired' using detail = format('Restore ''%s'' first', parent_label);
  end if;
  perform places.taxonomy_stamp(p_reason, p_actor);
  if p_table = 'category_group' then
    update places.category_group set active = true where code = p_id and active is false;
  elsif p_table = 'category' then
    update places.category set active = true where code = p_id and active is false;
  elsif p_table = 'place_type' then
    update places.place_type set active = true where slug = p_id and active is false;
  elsif p_table = 'facility_type' then
    update places.facility_type set active = true where slug = p_id and active is false;
  else
    update places.brand set active = true where id::text = p_id and active is false;
  end if;
  get diagnostics updated = row_count;
  if updated = 0 then
    raise exception 'That item was not found' using errcode = '22023';
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function places.taxonomy_admin()
returns jsonb
language sql
stable
security definer
set search_path = places, public
as $$
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'groups', (select count(*) from places.category_group),
      'categories', (select count(*) from places.category),
      'categories_in_use', (
        select count(*) from places.category c
        where exists (select 1 from places.place_type t where t.category_code = c.code)
      ),
      'place_types', (select count(*) from places.place_type),
      'place_types_in_use', (
        select count(*) from places.place_type t
        where exists (select 1 from places.place p where p.place_type = t.slug)
      ),
      'facility_types', (select count(*) from places.facility_type),
      'facility_types_in_use', (
        select count(*) from places.facility_type f
        where exists (select 1 from places.place_facility pf where pf.facility_type = f.slug)
      ),
      'brands', (select count(*) from places.brand),
      'logos', (select count(*) from places.brand where logo_url is not null and btrim(logo_url) <> ''),
      'retired', (
        (select count(*) from places.category_group where active is false)
        + (select count(*) from places.category where active is false)
        + (select count(*) from places.place_type where active is false)
        + (select count(*) from places.facility_type where active is false)
        + (select count(*) from places.brand where active is false)
      )
    ),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', g.code, 'slug', g.slug, 'label', g.label, 'colour', g.colour, 'sort', g.sort, 'active', g.active,
        'type_count', (
          select count(*) from places.place_type t
          join places.category c on c.code = t.category_code
          where c.group_code = g.code
        ),
        'places', (
          select count(*) from places.place p
          join places.place_type t on t.slug = p.place_type
          join places.category c on c.code = t.category_code
          where c.group_code = g.code
        ),
        'blocked_by', places.taxonomy_blocked('category_group', g.code)
      ) order by g.sort, g.code)
      from places.category_group g
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', c.code, 'group_code', c.group_code, 'slug', c.slug, 'label', c.label,
        'icon', c.icon, 'sort', c.sort, 'active', c.active,
        'type_count', (select count(*) from places.place_type t where t.category_code = c.code),
        'facility_count', (select count(*) from places.facility_type f where f.category_code = c.code),
        'parent_label', g.label,
        'parent_active', g.active,
        'blocked_by', places.taxonomy_blocked('category', c.code)
      ) order by c.sort, c.code)
      from places.category c
      join places.category_group g on g.code = c.group_code
    ), '[]'::jsonb),
    'placeTypes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'slug', t.slug, 'category_code', t.category_code, 'label', t.label, 'icon', t.icon, 'sort', t.sort,
        'default_geofence_m', t.default_geofence_m, 'default_facilities', t.default_facilities,
        'match_profile', t.match_profile, 'search_as_facility', t.search_as_facility,
        'attribute_schema', t.attribute_schema, 'active', t.active,
        'plug_chip', t.plug_chip, 'plug_label', t.plug_label, 'plug_map_label', t.plug_map_label,
        'grid_icon', t.grid_icon, 'grid_sort', t.grid_sort, 'empty_hint', t.empty_hint,
        'places', (select count(*) from places.place p where p.place_type = t.slug),
        'in_plug', t.plug_chip is not null and btrim(t.plug_chip) <> '',
        'parent_label', c.label,
        'parent_active', c.active and g.active,
        'parent_restore_label', case when g.active is false then g.label when c.active is false then c.label else null end,
        'group_label', g.label,
        'group_code', g.code,
        'blocked_by', places.taxonomy_blocked('place_type', t.slug)
      ) order by t.sort, t.label)
      from places.place_type t
      join places.category c on c.code = t.category_code
      join places.category_group g on g.code = c.group_code
    ), '[]'::jsonb),
    'facilityTypes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'slug', f.slug, 'category_code', f.category_code, 'label', f.label, 'icon', f.icon, 'sort', f.sort,
        'searchable', f.searchable, 'attribute_schema', f.attribute_schema, 'active', f.active,
        'facilities_used', (select count(*) from places.place_facility pf where pf.facility_type = f.slug),
        'parent_label', c.label,
        'parent_active', c.active and g.active,
        'parent_restore_label', case when g.active is false then g.label when c.active is false then c.label else null end,
        'group_label', g.label,
        'blocked_by', places.taxonomy_blocked('facility_type', f.slug)
      ) order by f.sort, f.label)
      from places.facility_type f
      join places.category c on c.code = f.category_code
      join places.category_group g on g.code = c.group_code
    ), '[]'::jsonb),
    'brands', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'slug', b.slug, 'name', b.name, 'aliases', b.aliases, 'logo_url', b.logo_url,
        'place_types', b.place_types, 'sort', b.sort, 'active', b.active,
        'places', (select count(*) from places.place p where p.brand_id = b.id),
        'blocked_by', places.taxonomy_blocked('brand', b.id::text)
      ) order by b.name)
      from places.brand b
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

create or replace function places.taxonomy_history(p_table text, p_id text, p_limit int)
returns jsonb
language sql
stable
security definer
set search_path = places, public
as $$
  select coalesce((
    select jsonb_agg(to_jsonb(h) order by h.at desc)
    from (
      select id, table_name, row_key, action, reason, actor_id, at,
             coalesce(after->>'label', after->>'name', row_key) as item_label
      from places.taxonomy_change
      where (p_table is null or btrim(p_table) = '' or table_name = p_table)
        and (p_id is null or btrim(p_id) = '' or row_key = p_id)
      order by at desc
      limit least(coalesce(nullif(p_limit, 0), 50), 200)
    ) h
  ), '[]'::jsonb);
$$;

create or replace function places.jsonb_text_array(p_value jsonb)
returns text[]
language sql
immutable
as $$
  select coalesce(array(select jsonb_array_elements_text(p_value)), '{}'::text[]);
$$;

create or replace function places.create_taxonomy(p_table text, p_row jsonb, p_reason text, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = places, public
as $$
declare
  new_id text;
  key_text text;
begin
  if p_table not in ('category_group', 'category', 'place_type', 'facility_type', 'brand') then
    raise exception 'That list cannot be edited' using errcode = '22023';
  end if;
  perform places.taxonomy_require_reason(p_reason);
  if p_table = 'brand' then
    key_text := lower(btrim(coalesce(p_row->>'slug', '')));
    if key_text !~ '^[a-z0-9_]+$' then
      raise exception 'bad slug' using errcode = '22023';
    end if;
  elsif p_table in ('category_group', 'category') then
    key_text := lower(btrim(coalesce(p_row->>'code', '')));
    if key_text !~ '^[a-z0-9_.]+$' or lower(btrim(coalesce(p_row->>'slug', ''))) !~ '^[a-z0-9_]+$' then
      raise exception 'bad slug' using errcode = '22023';
    end if;
  else
    key_text := lower(btrim(coalesce(p_row->>'slug', '')));
    if key_text !~ '^[a-z0-9_]+$' then
      raise exception 'bad slug' using errcode = '22023';
    end if;
  end if;
  if btrim(coalesce(p_row->>'label', p_row->>'name', '')) = '' then
    raise exception 'A name is required' using errcode = '22023';
  end if;
  perform places.taxonomy_stamp(p_reason, p_actor);
  if p_table = 'category_group' then
    insert into places.category_group (code, slug, label, colour, sort)
    values (
      key_text,
      lower(btrim(p_row->>'slug')),
      btrim(p_row->>'label'),
      coalesce(nullif(btrim(p_row->>'colour'), ''), '#e1e2ed'),
      coalesce((p_row->>'sort')::int, 0)
    );
    new_id := key_text;
  elsif p_table = 'category' then
    insert into places.category (code, group_code, slug, label, icon, sort)
    values (
      key_text,
      p_row->>'group_code',
      lower(btrim(p_row->>'slug')),
      btrim(p_row->>'label'),
      nullif(p_row->>'icon', ''),
      coalesce((p_row->>'sort')::int, 0)
    );
    new_id := key_text;
  elsif p_table = 'place_type' then
    insert into places.place_type (slug, category_code, label, icon, default_geofence_m, default_facilities, sort)
    values (
      key_text,
      p_row->>'category_code',
      btrim(p_row->>'label'),
      nullif(p_row->>'icon', ''),
      coalesce((p_row->>'default_geofence_m')::int, 50),
      coalesce(places.jsonb_text_array(p_row->'default_facilities'), '{}'),
      coalesce((p_row->>'sort')::int, 0)
    );
    new_id := key_text;
  elsif p_table = 'facility_type' then
    insert into places.facility_type (slug, category_code, label, icon, searchable, sort)
    values (
      key_text,
      p_row->>'category_code',
      btrim(p_row->>'label'),
      nullif(p_row->>'icon', ''),
      coalesce((p_row->>'searchable')::boolean, true),
      coalesce((p_row->>'sort')::int, 0)
    );
    new_id := key_text;
  else
    insert into places.brand (slug, name, aliases, logo_url, place_types, sort)
    values (
      key_text,
      btrim(p_row->>'name'),
      coalesce(places.jsonb_text_array(p_row->'aliases'), '{}'),
      nullif(p_row->>'logo_url', ''),
      coalesce(places.jsonb_text_array(p_row->'place_types'), '{}'),
      coalesce((p_row->>'sort')::int, 0)
    )
    returning id::text into new_id;
  end if;
  return jsonb_build_object('ok', true, 'id', new_id);
end;
$$;

create or replace function places.save_taxonomy(p_table text, p_id text, p_patch jsonb, p_reason text, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = places, public
as $$
declare
  patch jsonb := coalesce(p_patch, '{}'::jsonb) - 'match_profile' - 'code' - 'slug' - 'id' - 'retire' - 'restore';
  updated int;
begin
  if p_table not in ('category_group', 'category', 'place_type', 'facility_type', 'brand') then
    raise exception 'That list cannot be edited' using errcode = '22023';
  end if;
  perform places.taxonomy_require_reason(p_reason);
  if patch = '{}'::jsonb then
    raise exception 'Nothing to change' using errcode = '22023';
  end if;
  perform places.taxonomy_stamp(p_reason, p_actor);
  if p_table = 'category_group' then
    update places.category_group g set
      label = case when patch ? 'label' then patch->>'label' else g.label end,
      colour = case when patch ? 'colour' then patch->>'colour' else g.colour end,
      sort = case when patch ? 'sort' then (patch->>'sort')::int else g.sort end
    where g.code = p_id;
  elsif p_table = 'category' then
    update places.category c set
      label = case when patch ? 'label' then patch->>'label' else c.label end,
      icon = case when patch ? 'icon' then nullif(patch->>'icon', '') else c.icon end,
      sort = case when patch ? 'sort' then (patch->>'sort')::int else c.sort end
    where c.code = p_id;
  elsif p_table = 'place_type' then
    update places.place_type t set
      label = case when patch ? 'label' then patch->>'label' else t.label end,
      icon = case when patch ? 'icon' then nullif(patch->>'icon', '') else t.icon end,
      sort = case when patch ? 'sort' then (patch->>'sort')::int else t.sort end,
      default_geofence_m = case when patch ? 'default_geofence_m' then (patch->>'default_geofence_m')::int else t.default_geofence_m end,
      default_facilities = case when patch ? 'default_facilities' then places.jsonb_text_array(patch->'default_facilities') else t.default_facilities end,
      attribute_schema = case when patch ? 'attribute_schema' then patch->'attribute_schema' else t.attribute_schema end,
      plug_chip = case when patch ? 'plug_chip' then nullif(patch->>'plug_chip', '') else t.plug_chip end,
      plug_label = case when patch ? 'plug_label' then nullif(patch->>'plug_label', '') else t.plug_label end,
      plug_map_label = case when patch ? 'plug_map_label' then nullif(patch->>'plug_map_label', '') else t.plug_map_label end,
      grid_icon = case when patch ? 'grid_icon' then nullif(patch->>'grid_icon', '') else t.grid_icon end,
      grid_sort = case when patch ? 'grid_sort' then nullif(patch->>'grid_sort', '')::int else t.grid_sort end,
      empty_hint = case when patch ? 'empty_hint' then nullif(patch->>'empty_hint', '') else t.empty_hint end
    where t.slug = p_id;
  elsif p_table = 'facility_type' then
    update places.facility_type f set
      label = case when patch ? 'label' then patch->>'label' else f.label end,
      icon = case when patch ? 'icon' then nullif(patch->>'icon', '') else f.icon end,
      sort = case when patch ? 'sort' then (patch->>'sort')::int else f.sort end,
      searchable = case when patch ? 'searchable' then (patch->>'searchable')::boolean else f.searchable end,
      attribute_schema = case when patch ? 'attribute_schema' then patch->'attribute_schema' else f.attribute_schema end
    where f.slug = p_id;
  else
    update places.brand b set
      name = case when patch ? 'name' then patch->>'name' else b.name end,
      aliases = case when patch ? 'aliases' then places.jsonb_text_array(patch->'aliases') else b.aliases end,
      logo_url = case when patch ? 'logo_url' then nullif(patch->>'logo_url', '') else b.logo_url end,
      place_types = case when patch ? 'place_types' then places.jsonb_text_array(patch->'place_types') else b.place_types end,
      sort = case when patch ? 'sort' then (patch->>'sort')::int else b.sort end
    where b.id::text = p_id;
  end if;
  get diagnostics updated = row_count;
  if updated = 0 then
    raise exception 'That item was not found' using errcode = '22023';
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function places.taxonomy_in_use(jsonb) from public, anon, authenticated;
revoke all on function places.taxonomy_blocked(text, text) from public, anon, authenticated;
revoke all on function places.taxonomy_require_reason(text) from public, anon, authenticated;
revoke all on function places.taxonomy_stamp(text, uuid) from public, anon, authenticated;
revoke all on function places.log_taxonomy_change() from public, anon, authenticated;
revoke all on function places.retire_taxonomy(text, text, text, uuid) from public, anon, authenticated;
revoke all on function places.restore_taxonomy(text, text, text, uuid) from public, anon, authenticated;
revoke all on function places.taxonomy_admin() from public, anon, authenticated;
revoke all on function places.taxonomy_history(text, text, int) from public, anon, authenticated;
revoke all on function places.jsonb_text_array(jsonb) from public, anon, authenticated;
revoke all on function places.create_taxonomy(text, jsonb, text, uuid) from public, anon, authenticated;
revoke all on function places.save_taxonomy(text, text, jsonb, text, uuid) from public, anon, authenticated;

grant execute on function places.taxonomy_blocked(text, text) to service_role;
grant execute on function places.retire_taxonomy(text, text, text, uuid) to service_role;
grant execute on function places.restore_taxonomy(text, text, text, uuid) to service_role;
grant execute on function places.taxonomy_admin() to service_role;
grant execute on function places.taxonomy_history(text, text, int) to service_role;
grant execute on function places.create_taxonomy(text, jsonb, text, uuid) to service_role;
grant execute on function places.save_taxonomy(text, text, jsonb, text, uuid) to service_role;

-- T5 and T6 stay in this migration. T1–T4 run inside a block that rolls their writes back.
do $$
declare
  admin_row jsonb;
  gas_places int;
  fn_places int;
  unused_slug text;
  group_code text;
  changes_before int;
  changes_after int;
begin
  if exists (select 1 from places.brand where not (place_types @> '{gas_station}')) then
    raise exception 'T6 failed: a brand is missing gas_station';
  end if;

  admin_row := places.taxonomy_admin();
  if (admin_row->'summary'->>'groups')::int <> (select count(*) from places.category_group)
     or (admin_row->'summary'->>'categories')::int <> (select count(*) from places.category)
     or (admin_row->'summary'->>'place_types')::int <> (select count(*) from places.place_type)
     or (admin_row->'summary'->>'facility_types')::int <> (select count(*) from places.facility_type)
     or (admin_row->'summary'->>'brands')::int <> (select count(*) from places.brand) then
    raise exception 'T5 failed: taxonomy_admin totals do not match the tables';
  end if;

  if exists (select 1 from places.place_type where slug = 'gas_station') then
    select count(*) into gas_places from places.place where place_type = 'gas_station';
    select (item->>'places')::int into fn_places
    from jsonb_array_elements(admin_row->'placeTypes') item
    where item->>'slug' = 'gas_station';
    if fn_places is distinct from gas_places then
      raise exception 'T5 failed: gas_station place count does not match';
    end if;
    select count(*) into changes_before from places.taxonomy_change;
    begin
      perform places.retire_taxonomy('place_type', 'gas_station', 'this must be refused', null);
      raise exception 'T1 failed: gas_station retire was allowed';
    exception when others then
      if sqlerrm <> 'in_use' then
        raise;
      end if;
    end;
    if (select active from places.place_type where slug = 'gas_station') is not true then
      raise exception 'T1 failed: gas_station is no longer active';
    end if;
    select count(*) into changes_after from places.taxonomy_change;
    if changes_after <> changes_before then
      raise exception 'T1 failed: a change row was written';
    end if;
  end if;

  select g.code into group_code
  from places.category_group g
  where exists (select 1 from places.category c where c.group_code = g.code and c.active)
  limit 1;
  if group_code is not null then
    begin
      perform places.retire_taxonomy('category_group', group_code, 'this must be refused', null);
      raise exception 'T3 failed: group retire was allowed';
    exception when others then
      if sqlerrm <> 'in_use' then
        raise;
      end if;
    end;
  end if;

  select t.slug into unused_slug
  from places.place_type t
  where t.active
    and t.plug_chip is null
    and not exists (select 1 from places.place p where p.place_type = t.slug)
    and not exists (select 1 from places.place_type o where o.search_as_facility = t.slug)
  limit 1;

  if unused_slug is not null then
    begin
      perform places.retire_taxonomy('place_type', unused_slug, 'unused type retired for the check', null);
      if exists (select 1 from places.place_type where slug = unused_slug and active) then
        raise exception 'T2 failed: unused type stayed active';
      end if;
      if (select count(*) from places.taxonomy_change where table_name = 'place_type' and row_key = unused_slug and action = 'retire') < 1 then
        raise exception 'T2 failed: retire did not write a change row';
      end if;
      if exists (
        select 1 from jsonb_array_elements(places.taxonomy()->'placeTypes') item
        where item->>'slug' = unused_slug
      ) then
        raise exception 'T2 failed: retired type is still in public taxonomy';
      end if;
      raise exception 'rollback T2';
    exception when others then
      if sqlerrm <> 'rollback T2' then
        raise;
      end if;
    end;
    if (select active from places.place_type where slug = unused_slug) is not true then
      raise exception 'T2 failed: the check left the type retired';
    end if;

    begin
      update places.category c
      set active = false
      from places.place_type t
      where t.slug = unused_slug and c.code = t.category_code;
      begin
        perform places.restore_taxonomy('place_type', unused_slug, 'restore should be refused', null);
        raise exception 'T4 failed: restore was allowed';
      exception when others then
        if sqlerrm <> 'parent_retired' then
          raise;
        end if;
      end;
      raise exception 'rollback T4';
    exception when others then
      if sqlerrm <> 'rollback T4' then
        raise;
      end if;
    end;
  end if;
end $$;
