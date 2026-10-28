-- Coverage counts verified places once, from the public projection, plus pending
-- places. A full rebuild runs once per statement, not once per row.
-- Fleet's public views stay, but anon and authenticated lose the extra grants.

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
    select pcode,
      case place_type
        when 'gas_station' then 'fuel'
        when 'mechanic_garage' then 'mechanic'
        when 'parts_store' then 'parts_store'
        when 'tyre_shop' then 'tyre_air'
        when 'car_wash' then 'car_wash'
        when 'public_restroom' then 'restroom'
        when 'toll_plaza' then 'toll'
        when 'roadside_assistance' then 'roadside'
        else coalesce(place_type, 'mechanic')
      end as kind,
      count(*)::integer as verified_count,
      0 as pending_count
    from places.public_place
    where pcode is not null and btrim(pcode) <> ''
    group by pcode, place_type
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

create or replace function places.refresh_place_projection()
returns trigger
language plpgsql
security definer
set search_path = places, public
as $$
begin
  if tg_op = 'DELETE' then
    perform places.refresh_public_place(old.id);
    return old;
  end if;
  perform places.refresh_public_place(new.id);
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
  return coalesce(new, old);
end;
$$;

create or replace function places.refresh_coverage_statement()
returns trigger
language plpgsql
security definer
set search_path = places, public
as $$
begin
  perform places.refresh_coverage();
  return null;
end;
$$;

drop trigger if exists place_coverage_statement on places.place;
create trigger place_coverage_statement
  after insert or delete or update on places.place
  for each statement execute function places.refresh_coverage_statement();

drop trigger if exists facility_coverage_statement on places.place_facility;
create trigger facility_coverage_statement
  after insert or delete or update on places.place_facility
  for each statement execute function places.refresh_coverage_statement();

revoke all on function places.refresh_coverage_statement() from public, anon, authenticated;
grant execute on function places.refresh_coverage_statement() to service_role;

revoke all on table public.fleet_stations, public.fleet_toll_plazas, public.station_merchant_aliases from anon, authenticated;
revoke all on function places.stations_view_write() from public, anon, authenticated;
revoke all on function places.tolls_view_write() from public, anon, authenticated;
revoke all on function places.alias_view_write() from public, anon, authenticated;
revoke all on function places.sync_price_place_id() from public, anon, authenticated;
grant execute on function places.stations_view_write() to service_role;
grant execute on function places.tolls_view_write() to service_role;
grant execute on function places.alias_view_write() to service_role;
grant execute on function places.sync_price_place_id() to service_role;

create index if not exists fuel_entries_hand_review_reason_idx
  on fleet.fuel_entries ((payload_json #>> '{metadata,handReview,reason}'))
  where coalesce(payload_json #>> '{metadata,handReview,reason}', '') <> '';

create or replace function places.fill_place_pcode()
returns trigger
language plpgsql
security definer
set search_path = places, geo, public
as $$
begin
  if new.pcode is null or btrim(new.pcode) = '' then
    begin
      new.pcode := places.parish_pcode(new.lat, new.lng);
    exception
      when undefined_function then
        return new;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists place_fill_pcode on places.place;
create trigger place_fill_pcode
  before insert or update on places.place
  for each row execute function places.fill_place_pcode();

revoke all on function places.fill_place_pcode() from public, anon, authenticated;
grant execute on function places.fill_place_pcode() to service_role;

do $$
begin
  update places.place
  set pcode = places.parish_pcode(lat, lng)
  where (pcode is null or btrim(pcode) = '')
    and lat is not null
    and lng is not null
    and places.parish_pcode(lat, lng) is not null;
exception
  when undefined_function then
    null;
end $$;

select places.refresh_coverage();
