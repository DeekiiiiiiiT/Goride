-- Phase 1. The place register. places.place is empty, so the id can become
-- text and keep the station ids that fuel fills already use.
-- Access stays inside the places schema: row security on, no policies,
-- service role only.

alter table places.place_capability drop constraint if exists place_capability_place_id_fkey;
alter table places.place_evidence drop constraint if exists place_evidence_place_id_fkey;
alter table places.place_change_proposal drop constraint if exists place_change_proposal_place_id_fkey;

alter table places.place_capability alter column place_id type text using place_id::text;
alter table places.place_evidence alter column place_id type text using place_id::text;
alter table places.place_change_proposal alter column place_id type text using place_id::text;
alter table explorer.pin_receipt alter column place_id type text using place_id::text;

alter table places.place_evidence drop column if exists station_id;
alter table places.place_change_proposal drop column if exists station_id;

alter table places.place_change_proposal drop constraint if exists place_change_proposal_kind_check;
alter table places.place_change_proposal
  add constraint place_change_proposal_kind_check
  check (kind = any (array['new','move','close','rename','merge','facility_add','facility_remove']));

drop table places.place;

create table places.category_group (
  code text primary key,
  slug text unique not null,
  label text not null,
  colour text not null,
  sort int not null default 0
);

create table places.category (
  code text primary key,
  group_code text not null references places.category_group(code),
  slug text unique not null,
  label text not null,
  icon text,
  sort int not null default 0,
  active boolean not null default true
);

create table places.facility_type (
  slug text primary key,
  category_code text not null references places.category(code),
  label text not null,
  icon text,
  searchable boolean not null default true,
  attribute_schema jsonb,
  active boolean not null default true
);

create table places.place_type (
  slug text primary key,
  category_code text not null references places.category(code),
  label text not null,
  icon text,
  default_geofence_m int not null default 50 check (default_geofence_m between 10 and 2000),
  default_facilities text[] not null default '{}',
  match_profile text not null default 'none' check (match_profile in ('fuel','toll','none')),
  search_as_facility text,
  attribute_schema jsonb,
  active boolean not null default true
);

alter table places.place_type
  add constraint place_type_search_as_facility_fkey
  foreign key (search_as_facility) references places.facility_type(slug);

create table places.brand (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  aliases text[] not null default '{}',
  logo_url text
);

create table places.place (
  id text primary key default gen_random_uuid()::text,
  place_type text not null references places.place_type(slug),
  name text not null,
  brand_id uuid references places.brand(id),
  operator text,
  lat double precision not null,
  lng double precision not null,
  geog geography(Point,4326) generated always as (
    public.st_setsrid(public.st_makepoint(lng, lat), 4326)::public.geography
  ) stored,
  plus_code text,
  pcode text,
  address text,
  parish text,
  phone text,
  website text,
  attributes jsonb not null default '{}',
  status text not null default 'pending'
    check (status in ('pending','learnt','verified','rejected','duplicate','closed','anomaly')),
  pin_state text not null default 'unchecked' check (pin_state in ('unchecked','confirmed','offset')),
  geofence_m int check (geofence_m between 10 and 2000),
  duplicate_of text references places.place(id),
  origin_app text not null default 'manual' check (origin_app in ('roam_fleet','roam_plug','manual')),
  legacy_kv_id text unique,
  verified_at timestamptz,
  verified_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index place_geog_gix on places.place using gist (geog);
create index place_type_status_ix on places.place (place_type, status);
create index place_name_trgm on places.place using gin (name public.gin_trgm_ops);

alter table places.place_evidence
  add constraint place_evidence_place_id_fkey
  foreign key (place_id) references places.place(id) on delete cascade;

alter table places.place_change_proposal
  add constraint place_change_proposal_place_id_fkey
  foreign key (place_id) references places.place(id) on delete cascade;

create table places.place_facility (
  id uuid primary key default gen_random_uuid(),
  place_id text not null references places.place(id) on delete cascade,
  facility_type text not null references places.facility_type(slug),
  label text,
  attributes jsonb not null default '{}',
  source text not null default 'admin' check (source in ('admin','import','plug_proposal','fleet_evidence')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index place_facility_one
  on places.place_facility (place_id, facility_type, coalesce(label, ''));
create index place_facility_type_ix on places.place_facility (facility_type);

create table places.place_alias (
  id uuid primary key default gen_random_uuid(),
  place_id text not null references places.place(id) on delete cascade,
  kind text not null check (kind in ('merchant_name','gps','former_name')),
  organization_id text,
  issuer text,
  raw_value text,
  normalized_value text,
  lat double precision,
  lng double precision,
  source text not null check (source in ('admin_link','heal_auto','seed','import')),
  confirmed_by uuid,
  created_at timestamptz not null default now()
);

create unique index place_alias_merchant_one on places.place_alias
  (coalesce(organization_id, ''), coalesce(issuer, ''), normalized_value)
  where kind = 'merchant_name';

create table places.place_legacy_archive (
  id text primary key,
  legacy_kv_id text,
  reason text not null,
  payload jsonb not null,
  archived_at timestamptz not null default now()
);

-- 11-character Open Location Code (10 pair digits plus one grid digit).
create or replace function places.encode_plus_code(p_lat double precision, p_lng double precision)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  alphabet constant text := '23456789CFGHJMPQRVWX';
  final_lat constant numeric := 25000000;
  final_lng constant numeric := 8192000;
  lat_int numeric;
  lng_int numeric;
  lat_digit int;
  lng_digit int;
  i int;
  extra text;
  pair_lat text[] := array[]::text[];
  pair_lng text[] := array[]::text[];
  grid text[] := array[]::text[];
begin
  if p_lat is null or p_lng is null then
    return null;
  end if;
  lat_int := floor(p_lat::numeric * final_lat) + 90 * final_lat;
  if lat_int < 0 then
    lat_int := 0;
  elsif lat_int >= 180 * final_lat then
    lat_int := 180 * final_lat - 1;
  end if;
  lng_int := floor(p_lng::numeric * final_lng) + 180 * final_lng;
  if lng_int < 0 then
    lng_int := mod(lng_int, 360 * final_lng) + 360 * final_lng;
  elsif lng_int >= 360 * final_lng then
    lng_int := mod(lng_int, 360 * final_lng);
  end if;

  for i in 1..5 loop
    lat_digit := mod(lat_int, 5)::int;
    lng_digit := mod(lng_int, 4)::int;
    grid[i] := substr(alphabet, lat_digit * 4 + lng_digit + 1, 1);
    lat_int := floor(lat_int / 5);
    lng_int := floor(lng_int / 4);
  end loop;
  extra := grid[5];

  for i in 1..5 loop
    pair_lat[i] := substr(alphabet, mod(lat_int, 20)::int + 1, 1);
    pair_lng[i] := substr(alphabet, mod(lng_int, 20)::int + 1, 1);
    lat_int := floor(lat_int / 20);
    lng_int := floor(lng_int / 20);
  end loop;

  return pair_lat[5] || pair_lng[5]
      || pair_lat[4] || pair_lng[4]
      || pair_lat[3] || pair_lng[3]
      || pair_lat[2] || pair_lng[2]
      || '+'
      || pair_lat[1] || pair_lng[1]
      || extra;
end;
$$;

do $$
declare
  sample text;
begin
  sample := places.encode_plus_code(17.9910125, -76.9792656);
  if sample is distinct from '7795X2RC+C75' then
    raise exception 'plus code mismatch: %', sample;
  end if;
end $$;

create or replace function places.nearby(
  p_lat double precision,
  p_lng double precision,
  p_radius_m double precision,
  p_match_profile text default null,
  p_statuses text[] default array['verified']
)
returns table (
  id text,
  name text,
  place_type text,
  status text,
  pin_state text,
  effective_geofence_m integer,
  distance_m double precision,
  lat double precision,
  lng double precision
)
language sql
stable
security definer
set search_path = places, public
as $$
  select
    p.id,
    p.name,
    p.place_type,
    p.status,
    p.pin_state,
    coalesce(p.geofence_m, pt.default_geofence_m, 150)::integer,
    public.st_distance(p.geog, public.st_setsrid(public.st_makepoint(p_lng, p_lat), 4326)::public.geography),
    p.lat,
    p.lng
  from places.place p
  join places.place_type pt on pt.slug = p.place_type
  where p.status = any (p_statuses)
    and p.pin_state <> 'offset'
    and public.st_dwithin(
      p.geog,
      public.st_setsrid(public.st_makepoint(p_lng, p_lat), 4326)::public.geography,
      p_radius_m
    )
    and (
      p_match_profile is null
      or pt.match_profile = p_match_profile
      or (
        p_match_profile = 'fuel'
        and exists (
          select 1
          from places.place_facility f
          where f.place_id = p.id
            and f.facility_type = 'fuel_pump'
        )
      )
    )
  order by 7;
$$;

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
  select place_id, facility_id, display_name, place_name, category_code, distance_m
  from (
    select
      p.id as place_id,
      f.id as facility_id,
      coalesce(f.label, ft.label) as display_name,
      p.name as place_name,
      ft.category_code,
      public.st_distance(p.geog, public.st_setsrid(public.st_makepoint(p_lng, p_lat), 4326)::public.geography) as distance_m
    from places.place p
    join places.place_facility f on f.place_id = p.id
    join places.facility_type ft on ft.slug = f.facility_type
    where p.status = 'verified'
      and p.pin_state <> 'offset'
      and f.facility_type = p_facility_type
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
      pt.category_code,
      public.st_distance(p.geog, public.st_setsrid(public.st_makepoint(p_lng, p_lat), 4326)::public.geography)
    from places.place p
    join places.place_type pt on pt.slug = p.place_type
    where p.status = 'verified'
      and p.pin_state <> 'offset'
      and pt.search_as_facility = p_facility_type
      and not exists (
        select 1
        from places.place_facility f
        where f.place_id = p.id
          and f.facility_type = p_facility_type
      )
      and public.st_dwithin(
        p.geog,
        public.st_setsrid(public.st_makepoint(p_lng, p_lat), 4326)::public.geography,
        p_radius_m
      )
  ) found
  order by distance_m;
$$;

-- Real body arrives with the public map. Until then an approval must not
-- write the old uuid public place row.
create or replace function places.refresh_public_place(p_place_id text)
returns void
language plpgsql
security definer
set search_path = places, public
as $$
begin
  return;
end;
$$;

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
        'code', g.code, 'slug', g.slug, 'label', g.label, 'colour', g.colour, 'sort', g.sort
      ) order by g.sort, g.code)
      from places.category_group g
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
        'id', b.id, 'slug', b.slug, 'name', b.name, 'aliases', b.aliases, 'logo_url', b.logo_url
      ) order by b.name)
      from places.brand b
    ), '[]'::jsonb)
  );
$$;

create or replace function fleet.log_master_change()
returns trigger
language plpgsql
as $$
declare
  who text := nullif(current_setting('app.actor', true), '');
  why text := nullif(current_setting('app.reason', true), '');
begin
  if why is null then
    if tg_op = 'UPDATE'
      and tg_table_name in ('stations', 'place')
      and new.status = 'verified'
      and old.status is distinct from 'verified' then
      why := 'verified';
    elsif tg_op = 'INSERT' then
      why := 'created';
    elsif tg_op = 'UPDATE' then
      why := 'updated';
    else
      why := 'deleted';
    end if;
  end if;

  insert into fleet.master_change_log (dataset, record_id, action, before_json, after_json, actor, reason)
  values (
    tg_table_name,
    coalesce(new.id, old.id)::text,
    lower(tg_op),
    case when tg_op = 'INSERT' then null else to_jsonb(old) - 'payload_json' end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) - 'payload_json' end,
    who,
    why
  );
  return coalesce(new, old);
end;
$$;

create trigger place_master_change
  after insert or delete or update on places.place
  for each row execute function fleet.log_master_change();

create trigger place_facility_master_change
  after insert or delete or update on places.place_facility
  for each row execute function fleet.log_master_change();

create trigger place_alias_master_change
  after insert or delete or update on places.place_alias
  for each row execute function fleet.log_master_change();

create or replace function places.refresh_coverage()
returns void
language plpgsql
security definer
set search_path = places, public
as $$
begin
  delete from places.coverage_count where true;
  insert into places.coverage_count (pcode, kind, verified_count, pending_count)
  select pcode, kind, sum(verified_count)::integer, sum(pending_count)::integer
  from (
    select pcode, 'station'::text as kind, count(*)::integer as verified_count, 0 as pending_count
    from places.public_station
    where pcode is not null and btrim(pcode) <> ''
    group by pcode
    union all
    select pcode, kind, count(*)::integer, 0
    from places.public_place
    where pcode is not null and btrim(pcode) <> ''
    group by pcode, kind
    union all
    select pcode, kind, 0, count(*)::integer
    from (
      select p.pcode,
        case p.place_type
          when 'gas_station' then 'fuel'
          when 'mechanic_garage' then 'mechanic'
          when 'parts_store' then 'parts_store'
          when 'tyre_shop' then 'tyre_air'
          when 'car_wash' then 'car_wash'
          when 'public_restroom' then 'restroom'
          when 'toll_plaza' then 'toll'
          when 'roadside_assistance' then 'roadside'
          else coalesce(p.place_type, 'mechanic')
        end as kind
      from places.place p
      where p.status = 'pending'
        and p.pcode is not null
        and btrim(p.pcode) <> ''
    ) pending
    group by pcode, kind
  ) rows
  group by pcode, kind;
end;
$$;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'category_group','category','facility_type','place_type','brand','place',
    'place_facility','place_alias','place_legacy_archive'
  ]
  loop
    execute format('alter table places.%I enable row level security', tbl);
    execute format('revoke all on table places.%I from public, anon, authenticated', tbl);
    execute format('grant all on table places.%I to service_role', tbl);
  end loop;
end $$;

revoke all on function places.encode_plus_code(double precision, double precision) from public, anon, authenticated;
grant execute on function places.encode_plus_code(double precision, double precision) to service_role;

revoke all on function places.nearby(double precision, double precision, double precision, text, text[]) from public, anon, authenticated;
grant execute on function places.nearby(double precision, double precision, double precision, text, text[]) to service_role;

revoke all on function places.search_facility(text, double precision, double precision, double precision) from public, anon, authenticated;
grant execute on function places.search_facility(text, double precision, double precision, double precision) to service_role;

revoke all on function places.refresh_public_place(text) from public, anon, authenticated;
grant execute on function places.refresh_public_place(text) to service_role;

revoke all on function places.taxonomy() from public, anon, authenticated;
grant execute on function places.taxonomy() to service_role;

grant all on table places.place to service_role;
grant all on table places.place_evidence to service_role;
grant all on table places.place_change_proposal to service_role;
