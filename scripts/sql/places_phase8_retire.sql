-- Places retirement. One statement, so an early run cannot drop anything.
-- Do not run before 2026-11-12 00:00 UTC (14 days after the O3 deploy on 2026-10-28).
-- Before running, edge logs for those 14 days must show no errors from
-- places.public_station or public.station_merchant_aliases.
--
-- Fleet keeps these forever. Do not drop them:
--   fleet.stations, fleet.toll_plazas, fleet.station_quality,
--   public.fleet_stations, public.fleet_toll_plazas,
--   places.stations_view_write(), places.tolls_view_write().
--
-- refresh_coverage() must already count places.public_place and pending
-- places.place only (migration 20261028210000). This script drops
-- places.public_station and does not rewrite that function.
--
-- Same release, after this script commits: rebuild fleet-fuel and redeploy
-- fleet-fuel and explorer. Intakes already write the price engine, not
-- station_id. This script drops station_id, places.latest_retail_estimate,
-- and the old in_band flag. price_current stays; the engine still fills it.
--
-- KV station and toll saves are safe: fleet.upsert_master writes places and returns
-- before it touches a fleet table.

do $retire$
begin
  if now() < timestamptz '2026-11-12 00:00:00+00' then
    raise exception
      'Places retirement is locked until 2026-11-12 00:00 UTC. Fleet station and toll views are permanent and are not part of this script.';
  end if;
  if exists (select 1 from places.price_current where place_id is null)
     or exists (select 1 from places.price_observation where place_id is null) then
    raise exception 'A price row is missing place_id. Do not drop station_id.';
  end if;

  execute $fn$
    create or replace function places.refresh_public_place(p_place_id text)
    returns void
    language plpgsql
    security definer
    set search_path = places, public
    as $body$
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

      select
        case
          when count(pc.grade) = 0 then null
          else coalesce(jsonb_object_agg(pc.grade, to_jsonb(pc.price_per_litre)), '{}'::jsonb)
            || coalesce(jsonb_object_agg(
              pc.grade || '_card',
              jsonb_build_object(
                'price', pc.price_per_litre,
                'confidence', pc.confidence,
                'reports', pc.report_count,
                'petrojam_week', pc.petrojam_week,
                'observed_at', pc.observed_at,
                'outdated', coalesce(pc.outdated, false)
              )
            ), '{}'::jsonb)
        end,
        max(pc.observed_at)
        into next_prices, next_price_at
      from places.price_current pc
      where pc.place_id = place.id;

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
        place.id, place.name, next_brand, next_kind, place.place_type,
        next_category, next_group, place.lat, place.lng, place.pcode, place.plus_code,
        place.address, place.attributes,
        coalesce(next_facilities, '[]'::jsonb),
        coalesce(next_types, '{}'),
        coalesce(next_categories, '{}'),
        next_prices, next_price_at, now()
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
    $body$;
  $fn$;

  execute $fn$
    create or replace function places.refresh_price_projection()
    returns trigger
    language plpgsql
    security definer
    set search_path = places, public
    as $body$
    declare
      target text;
    begin
      target := coalesce(new.place_id, old.place_id);
      perform places.refresh_public_place(target);
      return coalesce(new, old);
    end;
    $body$;
  $fn$;

  drop trigger if exists price_observation_place_id on places.price_observation;
  drop trigger if exists price_current_place_id on places.price_current;
  drop function if exists places.sync_price_place_id();

  alter table places.price_current alter column place_id set not null;
  alter table places.price_observation alter column place_id set not null;
  alter table places.price_current drop constraint price_current_pkey;
  alter table places.price_current add primary key (place_id, grade);
  alter table places.price_current drop column station_id;
  alter table places.price_observation drop column station_id;

  drop view if exists places.public_station;
  drop view if exists public.station_merchant_aliases;

  drop function if exists places.alias_view_write();
  drop function if exists places.public_station_update();

  drop table if exists places.place_capability;

  drop function if exists places.latest_retail_estimate(text);
  drop table if exists places.price_observation;
end
$retire$;
