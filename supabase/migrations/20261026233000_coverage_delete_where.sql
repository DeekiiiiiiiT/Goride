-- A station save rebuilds coverage. The rebuild deleted every coverage row
-- with no filter, and the database rejects that. Keep the same rebuild, with a filter.

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
    select p.pcode, coalesce(c.kind, 'mechanic'), 0, count(*)::integer
    from places.place p
    left join lateral (
      select cap.kind
      from places.place_capability cap
      where cap.place_id = p.id
      limit 1
    ) c on true
    where p.status = 'pending'
      and p.pcode is not null
      and btrim(p.pcode) <> ''
    group by p.pcode, coalesce(c.kind, 'mechanic')
  ) rows
  group by pcode, kind;
end;
$$;

revoke all on function places.refresh_coverage() from public, anon, authenticated;
grant execute on function places.refresh_coverage() to service_role;
