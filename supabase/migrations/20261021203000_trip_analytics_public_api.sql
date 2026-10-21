-- PostgREST does not expose schema fleet. These public wrappers are the only
-- door the fleet server uses. Granted to service_role only.

create or replace function public.trip_analytics_kpis(p_org text, f jsonb)
returns jsonb language sql security definer set search_path = ''
as $$ select fleet.trip_analytics_kpis(p_org, f); $$;

create or replace function public.trip_analytics_volume(p_org text, f jsonb, p_grain text)
returns jsonb language sql security definer set search_path = ''
as $$ select fleet.trip_analytics_volume(p_org, f, p_grain); $$;

create or replace function public.trip_analytics_heatmap(p_org text, f jsonb, p_measure text)
returns jsonb language sql security definer set search_path = ''
as $$ select fleet.trip_analytics_heatmap(p_org, f, p_measure); $$;

create or replace function public.trip_analytics_cancellations(p_org text, f jsonb)
returns jsonb language sql security definer set search_path = ''
as $$ select fleet.trip_analytics_cancellations(p_org, f); $$;

create or replace function public.trip_analytics_economics(p_org text, f jsonb)
returns jsonb language sql security definer set search_path = ''
as $$ select fleet.trip_analytics_economics(p_org, f); $$;

create or replace function public.trip_analytics_geo(p_org text, f jsonb, p_kind text)
returns jsonb language sql security definer set search_path = ''
as $$ select fleet.trip_analytics_geo(p_org, f, p_kind); $$;

create or replace function public.trip_analytics_anomalies(p_org text, f jsonb)
returns jsonb language sql security definer set search_path = ''
as $$ select fleet.trip_analytics_anomalies(p_org, f); $$;

create or replace function public.trip_analytics_coverage(p_org text, f jsonb)
returns jsonb language sql security definer set search_path = ''
as $$ select fleet.trip_analytics_coverage(p_org, f); $$;

create or replace function public.trip_facts_parity(p_org text)
returns jsonb language sql security definer set search_path = ''
as $$ select fleet.trip_facts_parity(p_org); $$;

create or replace function public.trip_fact_page(
  p_org text, f jsonb, p_limit int, p_offset int, p_sort text, p_asc boolean
)
returns jsonb language sql security definer set search_path = ''
as $$ select fleet.trip_fact_page(p_org, f, p_limit, p_offset, p_sort, p_asc); $$;

create or replace function public.trip_analytics_watermark(p_org text)
returns timestamptz language sql security definer set search_path = ''
as $$ select fleet.trip_analytics_watermark(p_org); $$;

create or replace function public.roam_ride_funnel(p_org text, f jsonb)
returns jsonb language sql security definer set search_path = ''
as $$ select fleet.roam_ride_funnel(p_org, f); $$;

create or replace function public.trip_anomaly_review_save(
  p_org text, p_trip_id text, p_rule text, p_action text, p_reason text, p_reviewed_by text
)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if p_action not in ('dismiss', 'keep') then
    raise exception 'invalid review action';
  end if;
  insert into fleet.trip_anomaly_reviews (
    organization_id, trip_id, rule, action, reason, reviewed_by, reviewed_at
  ) values (
    p_org, p_trip_id, p_rule, p_action, p_reason, p_reviewed_by, now()
  )
  on conflict (organization_id, trip_id, rule) do update set
    action = excluded.action,
    reason = excluded.reason,
    reviewed_by = excluded.reviewed_by,
    reviewed_at = now();
end;
$$;

create or replace function public.trip_analytics_settings_save(
  p_org text,
  p_fare_floor numeric,
  p_fare_per_km_max numeric,
  p_long_distance_km numeric,
  p_long_duration_min numeric,
  p_speed_high numeric,
  p_speed_low numeric
)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  insert into fleet.trip_analytics_settings (
    organization_id, fare_floor, fare_per_km_max, long_distance_km, long_duration_min,
    speed_high_kmh, speed_low_kmh, updated_at
  ) values (
    p_org,
    coalesce(p_fare_floor, 5000),
    coalesce(p_fare_per_km_max, 500),
    coalesce(p_long_distance_km, 100),
    coalesce(p_long_duration_min, 180),
    coalesce(p_speed_high, 120),
    coalesce(p_speed_low, 3),
    now()
  )
  on conflict (organization_id) do update set
    fare_floor = coalesce(p_fare_floor, fleet.trip_analytics_settings.fare_floor),
    fare_per_km_max = coalesce(p_fare_per_km_max, fleet.trip_analytics_settings.fare_per_km_max),
    long_distance_km = coalesce(p_long_distance_km, fleet.trip_analytics_settings.long_distance_km),
    long_duration_min = coalesce(p_long_duration_min, fleet.trip_analytics_settings.long_duration_min),
    speed_high_kmh = coalesce(p_speed_high, fleet.trip_analytics_settings.speed_high_kmh),
    speed_low_kmh = coalesce(p_speed_low, fleet.trip_analytics_settings.speed_low_kmh),
    updated_at = now();
end;
$$;

revoke all on function public.trip_analytics_kpis(text, jsonb) from public, anon, authenticated;
revoke all on function public.trip_analytics_volume(text, jsonb, text) from public, anon, authenticated;
revoke all on function public.trip_analytics_heatmap(text, jsonb, text) from public, anon, authenticated;
revoke all on function public.trip_analytics_cancellations(text, jsonb) from public, anon, authenticated;
revoke all on function public.trip_analytics_economics(text, jsonb) from public, anon, authenticated;
revoke all on function public.trip_analytics_geo(text, jsonb, text) from public, anon, authenticated;
revoke all on function public.trip_analytics_anomalies(text, jsonb) from public, anon, authenticated;
revoke all on function public.trip_analytics_coverage(text, jsonb) from public, anon, authenticated;
revoke all on function public.trip_facts_parity(text) from public, anon, authenticated;
revoke all on function public.trip_fact_page(text, jsonb, int, int, text, boolean) from public, anon, authenticated;
revoke all on function public.trip_analytics_watermark(text) from public, anon, authenticated;
revoke all on function public.roam_ride_funnel(text, jsonb) from public, anon, authenticated;
revoke all on function public.trip_anomaly_review_save(text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.trip_analytics_settings_save(text, numeric, numeric, numeric, numeric, numeric, numeric) from public, anon, authenticated;

grant execute on function public.trip_analytics_kpis(text, jsonb) to service_role;
grant execute on function public.trip_analytics_volume(text, jsonb, text) to service_role;
grant execute on function public.trip_analytics_heatmap(text, jsonb, text) to service_role;
grant execute on function public.trip_analytics_cancellations(text, jsonb) to service_role;
grant execute on function public.trip_analytics_economics(text, jsonb) to service_role;
grant execute on function public.trip_analytics_geo(text, jsonb, text) to service_role;
grant execute on function public.trip_analytics_anomalies(text, jsonb) to service_role;
grant execute on function public.trip_analytics_coverage(text, jsonb) to service_role;
grant execute on function public.trip_facts_parity(text) to service_role;
grant execute on function public.trip_fact_page(text, jsonb, int, int, text, boolean) to service_role;
grant execute on function public.trip_analytics_watermark(text) to service_role;
grant execute on function public.roam_ride_funnel(text, jsonb) to service_role;
grant execute on function public.trip_anomaly_review_save(text, text, text, text, text, text) to service_role;
grant execute on function public.trip_analytics_settings_save(text, numeric, numeric, numeric, numeric, numeric, numeric) to service_role;

notify pgrst, 'reload schema';
