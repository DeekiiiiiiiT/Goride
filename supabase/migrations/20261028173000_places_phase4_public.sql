-- Phase 4. One public copy of a verified place. The station card stays a view
-- of gas stations, so Plug still reads the same 56 rows and can still update prices.

create temp table saved_station_prices as
select id, prices, price_updated_at
from places.public_station;

create or replace function places.sync_public_station()
returns trigger
language plpgsql
security definer
set search_path = places, public
as $$
begin
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop table places.public_place;

create table places.public_place (
  id text primary key,
  name text not null,
  brand text,
  kind text,
  place_type text not null,
  category_code text,
  group_code text,
  lat double precision not null,
  lng double precision not null,
  geog geography(Point,4326) generated always as (
    public.st_setsrid(public.st_makepoint(lng, lat), 4326)::public.geography
  ) stored,
  pcode text,
  plus_code text,
  address text,
  details jsonb not null default '{}',
  facilities jsonb not null default '[]',
  facility_types text[] not null default '{}',
  facility_categories text[] not null default '{}',
  prices jsonb not null default '{}',
  price_updated_at timestamptz,
  updated_at timestamptz not null default now()
);

create index public_place_geog_gix on places.public_place using gist (geog);
create index public_place_facility_types_gix on places.public_place using gin (facility_types);
create index public_place_facility_categories_gix on places.public_place using gin (facility_categories);

alter table places.public_place enable row level security;
revoke all on table places.public_place from public, anon, authenticated;
grant all on table places.public_place to service_role;

create or replace function places.plug_kind(p_place_type text)
returns text
language sql
immutable
as $$
  select case p_place_type
    when 'gas_station' then null
    when 'mechanic_garage' then 'mechanic'
    when 'parts_store' then 'parts_store'
    when 'tyre_shop' then 'tyre_air'
    when 'car_wash' then 'car_wash'
    when 'public_restroom' then 'restroom'
    when 'toll_plaza' then 'toll'
    when 'roadside_assistance' then 'roadside'
    else null
  end;
$$;

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

  select jsonb_object_agg(pc.grade, pc.price_per_litre), max(pc.observed_at)
    into next_prices, next_price_at
  from places.price_current pc
  where pc.station_id = place.id;

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
    place.id,
    place.name,
    next_brand,
    next_kind,
    place.place_type,
    next_category,
    next_group,
    place.lat,
    place.lng,
    place.pcode,
    place.plus_code,
    place.address,
    place.attributes,
    coalesce(next_facilities, '[]'::jsonb),
    coalesce(next_types, '{}'),
    coalesce(next_categories, '{}'),
    next_prices,
    next_price_at,
    now()
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

do $$
declare
  place_id text;
begin
  for place_id in select id from places.place loop
    perform places.refresh_public_place(place_id);
  end loop;
end $$;

drop table places.public_station;

create view places.public_station with (security_invoker = true) as
select
  id,
  name,
  brand,
  lat,
  lng,
  pcode,
  prices,
  price_updated_at,
  facility_types as capabilities,
  updated_at,
  address
from places.public_place
where place_type = 'gas_station';

revoke all on table places.public_station from public, anon, authenticated;
grant select, insert, update, delete on table places.public_station to service_role;

create or replace function places.public_station_update()
returns trigger
language plpgsql
security definer
set search_path = places, public
as $$
begin
  update places.public_place
  set prices = coalesce(new.prices, prices),
      price_updated_at = coalesce(new.price_updated_at, now()),
      updated_at = now()
  where id = old.id;
  return new;
end;
$$;

drop trigger if exists public_station_update on places.public_station;
create trigger public_station_update
  instead of update on places.public_station
  for each row execute function places.public_station_update();

create or replace function places.refresh_place_projection()
returns trigger
language plpgsql
security definer
set search_path = places, public
as $$
begin
  if tg_op = 'DELETE' then
    perform places.refresh_public_place(old.id);
    perform places.refresh_coverage();
    return old;
  end if;
  perform places.refresh_public_place(new.id);
  perform places.refresh_coverage();
  return new;
end;
$$;

create or replace function places.refresh_facility_projection()
returns trigger
language plpgsql
security definer
set search_path = places, public
as $$
declare
  target text;
begin
  target := coalesce(new.place_id, old.place_id);
  perform places.refresh_public_place(target);
  perform places.refresh_coverage();
  return coalesce(new, old);
end;
$$;

create or replace function places.refresh_price_projection()
returns trigger
language plpgsql
security definer
set search_path = places, public
as $$
declare
  target text;
begin
  target := coalesce(new.station_id, old.station_id);
  perform places.refresh_public_place(target);
  return coalesce(new, old);
end;
$$;

drop trigger if exists place_public_projection on places.place;
create trigger place_public_projection
  after insert or delete or update on places.place
  for each row execute function places.refresh_place_projection();

drop trigger if exists facility_public_projection on places.place_facility;
create trigger facility_public_projection
  after insert or delete or update on places.place_facility
  for each row execute function places.refresh_facility_projection();

drop trigger if exists price_public_projection on places.price_current;
create trigger price_public_projection
  after insert or delete or update on places.price_current
  for each row execute function places.refresh_price_projection();

alter table places.price_observation add column if not exists place_id text;
alter table places.price_current add column if not exists place_id text;

update places.price_observation
set place_id = station_id
where place_id is null
  and exists (select 1 from places.place p where p.id = station_id);

update places.price_current
set place_id = station_id
where place_id is null
  and exists (select 1 from places.place p where p.id = station_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'price_observation_place_id_fkey'
  ) then
    alter table places.price_observation
      add constraint price_observation_place_id_fkey
      foreign key (place_id) references places.place(id);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'price_current_place_id_fkey'
  ) then
    alter table places.price_current
      add constraint price_current_place_id_fkey
      foreign key (place_id) references places.place(id);
  end if;
end $$;

create or replace function places.sync_price_place_id()
returns trigger
language plpgsql
as $$
begin
  if new.place_id is null then
    new.place_id := new.station_id;
  end if;
  if new.station_id is null then
    new.station_id := new.place_id;
  end if;
  return new;
end;
$$;

drop trigger if exists price_observation_place_id on places.price_observation;
create trigger price_observation_place_id
  before insert or update on places.price_observation
  for each row execute function places.sync_price_place_id();

drop trigger if exists price_current_place_id on places.price_current;
create trigger price_current_place_id
  before insert or update on places.price_current
  for each row execute function places.sync_price_place_id();

create or replace function places.search_facility(
  p_facility_type text,
  p_lat double precision,
  p_lng double precision,
  p_radius_m double precision
)
returns table (
  place_id text,
  facility_id uuid,
  display_name text,
  place_name text,
  category_code text,
  distance_m double precision
)
language sql
stable
security definer
set search_path = places, public
as $$
  select found.place_id, found.facility_id, found.display_name, found.place_name, found.category_code, found.distance_m
  from (
    select
      p.id as place_id,
      (elem->>'id')::uuid as facility_id,
      coalesce(elem->>'label', ft.label) as display_name,
      p.name as place_name,
      coalesce(elem->>'category', ft.category_code) as category_code,
      public.st_distance(p.geog, public.st_setsrid(public.st_makepoint(p_lng, p_lat), 4326)::public.geography) as distance_m
    from places.public_place p
    cross join lateral jsonb_array_elements(p.facilities) elem
    join places.facility_type ft on ft.slug = elem->>'type'
    where elem->>'type' = p_facility_type
      and public.st_dwithin(
        p.geog,
        public.st_setsrid(public.st_makepoint(p_lng, p_lat), 4326)::public.geography,
        p_radius_m
      )
    union all
    select
      p.id,
      null::uuid,
      p.name,
      p.name,
      t.category_code,
      public.st_distance(p.geog, public.st_setsrid(public.st_makepoint(p_lng, p_lat), 4326)::public.geography)
    from places.public_place p
    join places.place_type t on t.slug = p.place_type
    where t.search_as_facility = p_facility_type
      and not exists (
        select 1
        from jsonb_array_elements(p.facilities) elem
        where elem->>'type' = p_facility_type
      )
      and public.st_dwithin(
        p.geog,
        public.st_setsrid(public.st_makepoint(p_lng, p_lat), 4326)::public.geography,
        p_radius_m
      )
  ) found
  order by found.distance_m;
$$;

revoke all on function places.plug_kind(text) from public, anon, authenticated;
grant execute on function places.plug_kind(text) to service_role;
revoke all on function places.public_station_update() from public, anon, authenticated;
grant execute on function places.public_station_update() to service_role;
revoke all on function places.refresh_place_projection() from public, anon, authenticated;
grant execute on function places.refresh_place_projection() to service_role;
revoke all on function places.refresh_facility_projection() from public, anon, authenticated;
grant execute on function places.refresh_facility_projection() to service_role;
revoke all on function places.refresh_price_projection() from public, anon, authenticated;
grant execute on function places.refresh_price_projection() to service_role;

select places.refresh_coverage();

do $$
declare
  published int;
  cards int;
  hidden int;
begin
  select count(*) into published from places.public_place where place_type = 'gas_station';
  select count(*) into cards from places.public_station;
  if published <> 56 or cards <> 56 then
    raise exception 'public gas stations changed: place % card %', published, cards;
  end if;
  select count(*) into hidden
  from places.public_place pub
  join places.place p on p.id = pub.id
  where p.status <> 'verified' or p.pin_state = 'offset';
  if hidden <> 0 then
    raise exception 'a place that should be hidden is public';
  end if;
end $$;
