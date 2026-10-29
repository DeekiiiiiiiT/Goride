-- When you set the grade, that report can publish. It is no longer "grade unknown".

create or replace function places.price_engine_set_grade(p_source text, p_id uuid, p_grade text)
returns void
language plpgsql
security definer
set search_path = places, public
as $$
declare
  v_place text;
  v_old text;
begin
  if p_grade not in ('e10_87', 'e10_90', 'diesel', 'ulsd', 'unknown') then
    raise exception 'unknown grade';
  end if;
  if p_source = 'fleet' then
    select grade into v_old from places.fleet_price_report where id = p_id;
    update places.fleet_price_report
    set grade = p_grade,
        grade_source = case when p_grade = 'unknown' then grade_source else 'fill' end
    where id = p_id
    returning place_id into v_place;
  elsif p_source = 'plug' then
    select grade into v_old from places.plug_price_report where id = p_id;
    update places.plug_price_report
    set grade = p_grade,
        grade_source = case when p_grade = 'unknown' then grade_source else 'vehicle_locked' end
    where id = p_id
    returning place_id into v_place;
  else
    raise exception 'unknown price source';
  end if;
  if not found then
    raise exception 'report not found';
  end if;
  update places.price_report_check
  set status = 'review'
  where source = p_source and report_id = p_id and status in ('approved', 'rejected');
  perform places.price_engine_check(p_source, p_id);
  if v_old is not null and v_old is distinct from p_grade then
    perform places.price_engine_publish(v_place, v_old);
  end if;
  perform places.price_engine_publish(v_place, p_grade);
end;
$$;

revoke all on function places.price_engine_set_grade(text, uuid, text) from public, anon, authenticated;
grant execute on function places.price_engine_set_grade(text, uuid, text) to service_role;
