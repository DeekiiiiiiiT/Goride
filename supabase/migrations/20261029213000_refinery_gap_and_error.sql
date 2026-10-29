-- A Thursday that is still today is "due", not a missing week.
create or replace function public.refinery_runs(p_slug text, p_limit int default 10)
returns jsonb
language plpgsql
stable
security definer
set search_path = fuel, public
as $$
declare
  v_id uuid;
  v_latest date;
  v_through date := current_date - 1;
  v_gaps int;
  v_revised int;
begin
  select id into v_id from fuel.refinery where slug = p_slug;
  if v_id is null then
    return jsonb_build_object('error', 'not_found');
  end if;
  select max(effective_date) into v_latest
  from fuel.refinery_price where refinery_id = v_id and superseded_at is null;

  select count(*) into v_gaps
  from generate_series(date '2023-01-05', v_through, interval '7 days') g(d)
  where not exists (
    select 1 from fuel.refinery_price p
    where p.refinery_id = v_id and p.superseded_at is null
      and p.effective_date >= g.d::date and p.effective_date < g.d::date + 7
  );

  select count(*) into v_revised from (
    select effective_date, product_code
    from fuel.refinery_price
    where refinery_id = v_id
    group by effective_date, product_code
    having count(*) > 1
  ) s;

  return jsonb_build_object(
    'freshness', fuel.freshness_label(v_latest, current_date),
    'latestWeek', v_latest,
    'nextExpected', fuel.next_expected_thursday(v_latest),
    'syncedAt', (select max(finished_at) from fuel.refinery_sync_run where refinery_id = v_id and error is null),
    'gaps', v_gaps,
    'gapWeeks', (
      select coalesce(jsonb_agg(g.d::date order by g.d), '[]'::jsonb)
      from generate_series(date '2023-01-05', v_through, interval '7 days') g(d)
      where not exists (
        select 1 from fuel.refinery_price p
        where p.refinery_id = v_id and p.superseded_at is null
          and p.effective_date >= g.d::date and p.effective_date < g.d::date + 7
      )
    ),
    'revisedWeeks', v_revised,
    'runs', (
      select coalesce(jsonb_agg(row_to_json(q)::jsonb), '[]'::jsonb)
      from (
        select
          s.started_at as at,
          case s.trigger when 'schedule' then 'Schedule' when 'owner' then 'Owner' when 'manual_entry' then 'Manual entry' else s.trigger end as trigger,
          s.mode,
          case
            when s.error is not null then s.error
            when coalesce(s.weeks_revised, 0) > 0 and coalesce(s.weeks_new, 0) = 0 then
              case when s.weeks_revised = 1 then '1 revised' else s.weeks_revised::text || ' revised' end
            when coalesce(s.weeks_new, 0) = 0 then 'No new week'
            when s.weeks_new = 1 then '1 new week'
            else to_char(s.weeks_new, 'FM9,999,999') || ' weeks'
          end as result,
          case when s.finished_at is null then null else round(extract(epoch from (s.finished_at - s.started_at)))::int end as seconds,
          s.error
        from fuel.refinery_sync_run s
        where s.refinery_id = v_id
        order by s.started_at desc
        limit greatest(coalesce(p_limit, 10), 1)
      ) q
    )
  );
end;
$$;

create or replace function public.refinery_record_error(
  p_refinery_id uuid,
  p_trigger text,
  p_actor uuid,
  p_mode text,
  p_error text
) returns uuid
language plpgsql
security definer
set search_path = fuel, public
as $$
declare
  v_id uuid;
begin
  insert into fuel.refinery_sync_run (refinery_id, trigger, actor, mode, error, started_at, finished_at)
  values (p_refinery_id, coalesce(p_trigger, 'schedule'), p_actor, p_mode, p_error, clock_timestamp(), clock_timestamp())
  returning id into v_id;
  return v_id;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'refinery-price-sources',
  'refinery-price-sources',
  false,
  10485760,
  array['application/pdf','image/jpeg','image/png','image/webp']::text[]
)
on conflict (id) do nothing;

revoke all on function public.refinery_runs(text, int) from public, anon, authenticated;
revoke all on function public.refinery_record_error(uuid, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.refinery_runs(text, int) to service_role;
grant execute on function public.refinery_record_error(uuid, text, uuid, text, text) to service_role;
