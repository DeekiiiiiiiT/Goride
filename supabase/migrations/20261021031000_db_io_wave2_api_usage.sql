-- Disk IO wave 2b: API call log moves off key-value read-modify-write.
-- Old api_usage rows stay until the 90-day purge. Backup prefix is unused and is deleted once.

create table if not exists private.api_usage_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  provider text not null,
  service text,
  route text,
  model text,
  status text not null,
  http_status int,
  latency_ms int,
  input_tokens int,
  output_tokens int,
  images int,
  requests int,
  cost_usd numeric not null default 0,
  error_code text,
  error_message text,
  user_id text,
  org_id text
);

create index if not exists api_usage_events_provider_at_idx
  on private.api_usage_events (provider, occurred_at desc);

create table if not exists private.api_usage_totals (
  provider text not null,
  period text not null,
  calls int not null default 0,
  errors int not null default 0,
  cost_usd numeric not null default 0,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  images int not null default 0,
  requests int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (provider, period)
);

create or replace function public.log_api_usage(
  p_provider text,
  p_service text,
  p_route text,
  p_model text,
  p_status text,
  p_http_status int,
  p_latency_ms int,
  p_input_tokens int,
  p_output_tokens int,
  p_images int,
  p_requests int,
  p_cost_usd numeric,
  p_error_code text,
  p_error_message text,
  p_user_id text,
  p_org_id text,
  p_occurred_at timestamptz
) returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_at timestamptz := coalesce(p_occurred_at, now());
  v_day text := to_char(v_at at time zone 'UTC', 'YYYY-MM-DD');
  v_month text := to_char(v_at at time zone 'UTC', 'YYYY-MM');
  v_err int := case when p_status = 'error' then 1 else 0 end;
  v_cost numeric := coalesce(p_cost_usd, 0);
begin
  insert into private.api_usage_events (
    occurred_at, provider, service, route, model, status, http_status, latency_ms,
    input_tokens, output_tokens, images, requests, cost_usd, error_code, error_message, user_id, org_id
  ) values (
    v_at, p_provider, p_service, p_route, p_model, coalesce(p_status, 'success'), p_http_status, p_latency_ms,
    p_input_tokens, p_output_tokens, p_images, p_requests, v_cost, p_error_code, left(p_error_message, 500),
    p_user_id, p_org_id
  );

  insert into private.api_usage_totals as t (
    provider, period, calls, errors, cost_usd, input_tokens, output_tokens, images, requests, updated_at
  ) values (
    p_provider, v_day, 1, v_err, v_cost,
    coalesce(p_input_tokens, 0), coalesce(p_output_tokens, 0), coalesce(p_images, 0), coalesce(p_requests, 0), now()
  )
  on conflict (provider, period) do update set
    calls = t.calls + 1,
    errors = t.errors + excluded.errors,
    cost_usd = t.cost_usd + excluded.cost_usd,
    input_tokens = t.input_tokens + excluded.input_tokens,
    output_tokens = t.output_tokens + excluded.output_tokens,
    images = t.images + excluded.images,
    requests = t.requests + excluded.requests,
    updated_at = now();

  insert into private.api_usage_totals as t (
    provider, period, calls, errors, cost_usd, input_tokens, output_tokens, images, requests, updated_at
  ) values (
    p_provider, v_month, 1, v_err, v_cost,
    coalesce(p_input_tokens, 0), coalesce(p_output_tokens, 0), coalesce(p_images, 0), coalesce(p_requests, 0), now()
  )
  on conflict (provider, period) do update set
    calls = t.calls + 1,
    errors = t.errors + excluded.errors,
    cost_usd = t.cost_usd + excluded.cost_usd,
    input_tokens = t.input_tokens + excluded.input_tokens,
    output_tokens = t.output_tokens + excluded.output_tokens,
    images = t.images + excluded.images,
    requests = t.requests + excluded.requests,
    updated_at = now();
end;
$fn$;

revoke all on function public.log_api_usage(text, text, text, text, text, int, int, int, int, int, int, numeric, text, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.log_api_usage(text, text, text, text, text, int, int, int, int, int, int, numeric, text, text, text, text, timestamptz)
  to service_role;

create or replace function public.api_usage_totals(p_provider text, p_periods text[])
returns table (
  period text, calls int, errors int, cost_usd numeric,
  input_tokens int, output_tokens int, images int, requests int, updated_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select t.period, t.calls, t.errors, t.cost_usd, t.input_tokens, t.output_tokens, t.images, t.requests, t.updated_at
  from private.api_usage_totals t
  where t.provider = p_provider and t.period = any (p_periods);
$$;

revoke all on function public.api_usage_totals(text, text[]) from public, anon, authenticated;
grant execute on function public.api_usage_totals(text, text[]) to service_role;

create or replace function public.api_usage_top_routes(p_provider text, p_day date)
returns table (route text, calls bigint, cost_usd numeric)
language sql stable security definer set search_path = ''
as $$
  select coalesce(nullif(e.route, ''), '(unknown)'), count(*)::bigint, coalesce(sum(e.cost_usd), 0)
  from private.api_usage_events e
  where e.provider = p_provider
    and e.occurred_at >= p_day
    and e.occurred_at < p_day + 1
  group by 1
  order by 3 desc
  limit 10;
$$;

revoke all on function public.api_usage_top_routes(text, date) from public, anon, authenticated;
grant execute on function public.api_usage_top_routes(text, date) to service_role;

create or replace function public.api_usage_events_between(
  p_provider text, p_status text, p_q text, p_from date, p_to date, p_limit int
)
returns table (
  occurred_at timestamptz, provider text, service text, route text, model text, status text,
  http_status int, latency_ms int, input_tokens int, output_tokens int, images int, requests int,
  cost_usd numeric, error_code text, error_message text, user_id text, org_id text
)
language sql stable security definer set search_path = ''
as $$
  select e.occurred_at, e.provider, e.service, e.route, e.model, e.status,
    e.http_status, e.latency_ms, e.input_tokens, e.output_tokens, e.images, e.requests,
    e.cost_usd, e.error_code, e.error_message, e.user_id, e.org_id
  from private.api_usage_events e
  where e.occurred_at >= p_from
    and e.occurred_at < p_to + 1
    and (p_provider is null or p_provider = '' or e.provider = p_provider)
    and (p_status is null or p_status = '' or e.status = p_status)
    and (
      p_q is null or p_q = ''
      or e.route ilike '%' || p_q || '%'
      or e.model ilike '%' || p_q || '%'
      or e.error_message ilike '%' || p_q || '%'
    )
  order by e.occurred_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
$$;

revoke all on function public.api_usage_events_between(text, text, text, date, date, int) from public, anon, authenticated;
grant execute on function public.api_usage_events_between(text, text, text, date, date, int) to service_role;

-- Copy existing detail rows once. Totals are rebuilt from those rows.
do $bf$
declare r record;
  v_at timestamptz;
begin
  if exists (select 1 from private.api_usage_events limit 1) then
    return;
  end if;
  for r in
    select value from public.kv_store_37f42386
    where key >= 'api_usage:' and key < 'api_usagea'
  loop
    begin
      v_at := nullif(r.value->>'timestamp', '')::timestamptz;
      insert into private.api_usage_events (
        occurred_at, provider, service, route, model, status, http_status, latency_ms,
        input_tokens, output_tokens, images, requests, cost_usd, error_code, error_message, user_id, org_id
      ) values (
        coalesce(v_at, now()),
        coalesce(nullif(r.value->>'provider', ''), 'unknown'),
        r.value->>'service', r.value->>'route', r.value->>'model',
        coalesce(nullif(r.value->>'status', ''), 'success'),
        nullif(r.value->>'httpStatus', '')::int,
        nullif(r.value->>'latencyMs', '')::int,
        nullif(r.value->>'inputTokens', '')::int,
        nullif(r.value->>'outputTokens', '')::int,
        nullif(r.value->>'images', '')::int,
        nullif(r.value->>'requests', '')::int,
        coalesce(nullif(r.value->>'costUSD', '')::numeric, 0),
        r.value->>'errorCode',
        left(r.value->>'errorMessage', 500),
        r.value->>'userId', r.value->>'orgId'
      );
    exception when others then
      null;
    end;
  end loop;

  insert into private.api_usage_totals (
    provider, period, calls, errors, cost_usd, input_tokens, output_tokens, images, requests, updated_at
  )
  select provider,
    to_char(occurred_at at time zone 'UTC', 'YYYY-MM-DD'),
    count(*)::int,
    count(*) filter (where status = 'error')::int,
    coalesce(sum(cost_usd), 0),
    coalesce(sum(input_tokens), 0)::int,
    coalesce(sum(output_tokens), 0)::int,
    coalesce(sum(images), 0)::int,
    coalesce(sum(requests), 0)::int,
    now()
  from private.api_usage_events
  group by 1, 2
  on conflict (provider, period) do nothing;

  insert into private.api_usage_totals (
    provider, period, calls, errors, cost_usd, input_tokens, output_tokens, images, requests, updated_at
  )
  select provider,
    to_char(occurred_at at time zone 'UTC', 'YYYY-MM'),
    count(*)::int,
    count(*) filter (where status = 'error')::int,
    coalesce(sum(cost_usd), 0),
    coalesce(sum(input_tokens), 0)::int,
    coalesce(sum(output_tokens), 0)::int,
    coalesce(sum(images), 0)::int,
    coalesce(sum(requests), 0)::int,
    now()
  from private.api_usage_events
  group by 1, 2
  on conflict (provider, period) do nothing;
end
$bf$;

delete from public.kv_store_37f42386 where key >= 'fleet_kv_backup:' and key < 'fleet_kv_backuq';

do $cron$
declare jid bigint;
begin
  select jobid into jid from cron.job where jobname = 'purge-disk-io-logs-90d';
  if jid is not null then
    perform cron.unschedule(jid);
  end if;
  perform cron.schedule(
    'purge-disk-io-logs-90d',
    '50 5 * * *',
    $job$
      delete from private.api_usage_events where occurred_at < now() - interval '90 days';
      delete from public.kv_store_37f42386
        where key >= 'error-log:' and key < 'error-loga'
          and left(coalesce(value->>'timestamp', ''), 10) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          and (value->>'timestamp')::timestamptz < now() - interval '90 days';
      delete from public.kv_store_37f42386
        where key >= 'stats:v3:' and key < 'stats:v3a'
          and (value ? 'timestamp') and (value ? 'ttl')
          and (value->>'timestamp') ~ '^[0-9]+$'
          and (value->>'ttl') ~ '^[0-9]+$'
          and to_timestamp(((value->>'timestamp')::numeric) / 1000.0)
              + make_interval(secs => (value->>'ttl')::int) < now();
      delete from public.kv_store_37f42386
        where key >= 'api_usage:' and key < 'api_usagea'
          and substring(key from 11 for 10) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          and substring(key from 11 for 10) < to_char(now() - interval '90 days', 'YYYY-MM-DD');
    $job$
  );
end
$cron$;

notify pgrst, 'reload schema';
