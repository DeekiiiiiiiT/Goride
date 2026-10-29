-- Keep a station's current public price when this week has nothing new to publish.
-- The grade stays a number so the live Plug map still reads it. Confidence sits beside it.
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
  where pc.place_id = place.id or pc.station_id = place.id;

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
$$;

