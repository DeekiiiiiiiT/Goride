-- Who changed a master row, scores for every dataset, and station visit counts without customer rows.

alter table fleet.master_change_log
  add column if not exists actor text,
  add column if not exists reason text;

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
      and tg_table_name = 'stations'
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

-- One call so the trigger can see the signed-in person. Only the columns present in p_row are written.
create or replace function fleet.upsert_master(p_table text, p_row jsonb, p_actor text, p_action text)
returns void
language plpgsql
security definer
set search_path = fleet, public
as $$
declare
  col text;
  cols text := 'id';
  selects text := 'r.id';
  sets text := '';
begin
  if p_table not in ('stations', 'toll_plazas', 'platform_vendors') then
    raise exception 'unsupported master table %', p_table;
  end if;
  if p_row is null or not (p_row ? 'id') then
    raise exception 'master row needs id';
  end if;

  perform set_config('app.actor', coalesce(p_actor, ''), true);
  perform set_config('app.reason', coalesce(p_action, ''), true);

  for col in
    select c.column_name
    from information_schema.columns c
    where c.table_schema = 'fleet'
      and c.table_name = p_table
      and c.column_name <> 'id'
      and p_row ? c.column_name
  loop
    cols := cols || ', ' || quote_ident(col);
    selects := selects || ', r.' || quote_ident(col);
    if sets <> '' then
      sets := sets || ', ';
    end if;
    sets := sets || format('%I = excluded.%I', col, col);
  end loop;

  if sets = '' then
    execute format(
      'insert into fleet.%I (id) select r.id from jsonb_populate_record(null::fleet.%I, $1) as r on conflict (id) do nothing',
      p_table, p_table
    ) using p_row;
  else
    execute format(
      'insert into fleet.%I (%s) select %s from jsonb_populate_record(null::fleet.%I, $1) as r on conflict (id) do update set %s',
      p_table, cols, selects, p_table, sets
    ) using p_row;
  end if;
end;
$$;

revoke all on function fleet.upsert_master(text, jsonb, text, text) from public, anon, authenticated;
grant execute on function fleet.upsert_master(text, jsonb, text, text) to service_role;

create or replace function fleet.station_fill_summary()
returns table (station_id text, fill_count int, last_fill_at text)
language sql
stable
security definer
set search_path = fleet, public
as $$
  select
    station_id,
    count(*)::int as fill_count,
    max(fill_on) as last_fill_at
  from (
    select
      coalesce(
        nullif(payload_json->>'matchedStationId', ''),
        nullif(payload_json->'metadata'->>'matchedStationId', ''),
        nullif(payload_json->'metadata'->>'bridgedStationId', '')
      ) as station_id,
      nullif(payload_json->>'date', '') as fill_on
    from fleet.fuel_entries
  ) fills
  where station_id is not null
  group by station_id;
$$;

revoke all on function fleet.station_fill_summary() from public, anon, authenticated;
grant execute on function fleet.station_fill_summary() to service_role;

create or replace function fleet.score_master_data()
returns void
language plpgsql
security definer
set search_path = fleet, public, places
as $$
declare
  total int;
  failing int;
  score int;
  note text;
begin
  -- stations
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

  -- tolls: a plaza needs a name and a point on the map
  select count(*) into total from fleet.toll_plazas;
  select count(*) into failing from fleet.toll_plazas
    where name is null or lat is null or lng is null;
  if total = 0 then score := null; note := 'Not scored yet'; failing := 0;
  else score := ((total - failing) * 100) / total; note := null; end if;
  insert into fleet.dataset_quality (dataset, score, failing, checked_at, note)
  values ('tolls', score, failing, now(), note)
  on conflict (dataset) do update
    set score = excluded.score, failing = excluded.failing, checked_at = excluded.checked_at, note = excluded.note;

  -- vendors
  select count(*) into total from fleet.platform_vendors;
  select count(*) into failing from fleet.platform_vendors
    where name is null or publish_state is null;
  if total = 0 then score := null; note := 'Not scored yet'; failing := 0;
  else score := ((total - failing) * 100) / total; note := null; end if;
  insert into fleet.dataset_quality (dataset, score, failing, checked_at, note)
  values ('vendors', score, failing, now(), note)
  on conflict (dataset) do update
    set score = excluded.score, failing = excluded.failing, checked_at = excluded.checked_at, note = excluded.note;

  -- vehicles
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

  -- maps
  if to_regclass('places.public_place') is null then
    total := 0; failing := 0;
  else
    select count(*) into total from places.public_place;
    select count(*) into failing from places.public_place
      where name is null or lat is null or lng is null;
  end if;
  if total = 0 then score := null; note := 'Not scored yet'; failing := 0;
  else score := ((total - failing) * 100) / total; note := null; end if;
  insert into fleet.dataset_quality (dataset, score, failing, checked_at, note)
  values ('maps', score, failing, now(), note)
  on conflict (dataset) do update
    set score = excluded.score, failing = excluded.failing, checked_at = excluded.checked_at, note = excluded.note;

  -- GCT rates
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
end;
$$;
