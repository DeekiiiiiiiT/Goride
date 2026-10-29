-- Refineries: Petrojam becomes one benchmark record. Old wide table stays as a read-only legacy copy.
-- A view with the old shape keeps Fleet, Price Engine, and station analytics working.

create table fuel.refinery (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  operator text,
  country text not null default 'JM',
  place_id text references places.place(id),
  website text,
  price_source_url text,
  source_kind text not null check (source_kind in ('petrojam_html', 'manual')),
  cadence text not null default 'weekly_thu',
  status text not null default 'active' check (status in ('active', 'planned', 'closed')),
  is_benchmark boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index refinery_one_benchmark_per_country
  on fuel.refinery (country)
  where is_benchmark;

create table fuel.refinery_product (
  code text primary key,
  label text not null,
  unit text,
  engine_grade text unique,
  board_group text not null check (board_group in ('motor', 'other')),
  sort int not null
);

create table fuel.refinery_sync_run (
  id uuid primary key default gen_random_uuid(),
  refinery_id uuid references fuel.refinery(id),
  trigger text not null,
  actor uuid,
  mode text,
  pages int,
  weeks_found int,
  weeks_new int,
  weeks_unchanged int,
  weeks_revised int,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table fuel.refinery_price (
  id uuid primary key default gen_random_uuid(),
  refinery_id uuid not null references fuel.refinery(id),
  product_code text not null references fuel.refinery_product(code),
  effective_date date not null,
  price_jmd numeric(12, 4) not null,
  revision int not null default 1,
  superseded_at timestamptz,
  source text not null check (source in ('scrape', 'manual', 'backfill')),
  source_url text,
  sync_run_id uuid references fuel.refinery_sync_run(id),
  entered_by uuid,
  reason text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create unique index refinery_price_current
  on fuel.refinery_price (refinery_id, product_code, effective_date)
  where superseded_at is null;

create index refinery_price_lookup
  on fuel.refinery_price (product_code, effective_date desc)
  where superseded_at is null;

create index refinery_price_refinery_date
  on fuel.refinery_price (refinery_id, effective_date desc)
  where superseded_at is null;

alter table fuel.refinery enable row level security;
alter table fuel.refinery_product enable row level security;
alter table fuel.refinery_price enable row level security;
alter table fuel.refinery_sync_run enable row level security;

create policy refinery_select on fuel.refinery for select to authenticated using (true);
create policy refinery_product_select on fuel.refinery_product for select to authenticated using (true);
create policy refinery_price_select on fuel.refinery_price for select to authenticated using (true);
create policy refinery_sync_run_select on fuel.refinery_sync_run for select to authenticated using (true);

create policy refinery_service on fuel.refinery for all to service_role using (true) with check (true);
create policy refinery_product_service on fuel.refinery_product for all to service_role using (true) with check (true);
create policy refinery_price_service on fuel.refinery_price for all to service_role using (true) with check (true);
create policy refinery_sync_run_service on fuel.refinery_sync_run for all to service_role using (true) with check (true);

revoke all on fuel.refinery, fuel.refinery_product, fuel.refinery_price, fuel.refinery_sync_run from anon, public;
grant select on fuel.refinery, fuel.refinery_product, fuel.refinery_price, fuel.refinery_sync_run to authenticated;
grant all on fuel.refinery, fuel.refinery_product, fuel.refinery_price, fuel.refinery_sync_run to service_role;

insert into fuel.refinery (
  slug, name, operator, country, website, price_source_url, source_kind, cadence, status, is_benchmark
) values (
  'petrojam',
  'Petrojam',
  'Petroleum Corporation of Jamaica',
  'JM',
  'https://www.petrojam.com/',
  'https://www.petrojam.com/price/',
  'petrojam_html',
  'weekly_thu',
  'active',
  true
);

insert into fuel.refinery_product (code, label, unit, engine_grade, board_group, sort) values
  ('gasolene_87', 'Gasolene 87', 'per litre', 'e10_87', 'motor', 1),
  ('gasolene_90', 'Gasolene 90', 'per litre', 'e10_90', 'motor', 2),
  ('auto_diesel', 'Auto diesel', 'per litre', 'diesel', 'motor', 3),
  ('ulsd', 'ULSD', 'per litre', 'ulsd', 'motor', 4),
  ('kerosene', 'Kerosene', null, null, 'other', 5),
  ('propane', 'Propane', null, null, 'other', 6),
  ('butane', 'Butane', null, null, 'other', 7),
  ('hfo', 'HFO', null, null, 'other', 8),
  ('asphalt', 'Asphalt', null, null, 'other', 9);

insert into fuel.refinery_price (
  refinery_id, product_code, effective_date, price_jmd, revision, source, source_url, first_seen_at, last_seen_at
)
select r.id, v.code, p.price_date, v.price, 1, 'backfill', p.source_url,
  coalesce(p.created_at, p.scraped_at, now()),
  coalesce(p.updated_at, p.scraped_at, now())
from fuel.petrojam_prices p
join fuel.refinery r on r.slug = 'petrojam'
cross join lateral (
  values
    ('gasolene_87', p.gasolene_87),
    ('gasolene_90', p.gasolene_90),
    ('auto_diesel', p.auto_diesel),
    ('ulsd', p.ulsd),
    ('kerosene', p.kerosene),
    ('propane', p.propane),
    ('butane', p.butane),
    ('hfo', p.hfo),
    ('asphalt', p.asphalt)
) as v(code, price)
where v.price is not null;

alter table fuel.petrojam_prices rename to petrojam_prices_legacy;
comment on table fuel.petrojam_prices_legacy is 'Read-only wide Petrojam history. Live prices are fuel.refinery_price. Drop only after the compat view has been the only reader.';

revoke insert, update, delete, truncate on fuel.petrojam_prices_legacy from authenticated, anon;

create view fuel.petrojam_prices
with (security_invoker = true) as
select
  coalesce((array_agg(l.id))[1], (array_agg(c.id order by c.product_code))[1]) as id,
  c.effective_date as price_date,
  max(c.price_jmd) filter (where c.product_code = 'gasolene_87') as gasolene_87,
  max(c.price_jmd) filter (where c.product_code = 'gasolene_90') as gasolene_90,
  max(c.price_jmd) filter (where c.product_code = 'auto_diesel') as auto_diesel,
  max(c.price_jmd) filter (where c.product_code = 'kerosene') as kerosene,
  max(c.price_jmd) filter (where c.product_code = 'propane') as propane,
  max(c.price_jmd) filter (where c.product_code = 'butane') as butane,
  max(c.price_jmd) filter (where c.product_code = 'hfo') as hfo,
  max(c.price_jmd) filter (where c.product_code = 'asphalt') as asphalt,
  max(c.price_jmd) filter (where c.product_code = 'ulsd') as ulsd,
  coalesce(max(l.source_url), max(c.source_url), 'https://www.petrojam.com/price/') as source_url,
  coalesce(max(l.scraped_at), max(c.last_seen_at)) as scraped_at,
  coalesce(max(l.created_at), min(c.first_seen_at)) as created_at,
  coalesce(max(l.updated_at), max(c.last_seen_at)) as updated_at
from fuel.refinery_price c
join fuel.refinery r on r.id = c.refinery_id and r.is_benchmark
left join fuel.petrojam_prices_legacy l on l.price_date = c.effective_date
where c.superseded_at is null
group by c.effective_date;

grant select on fuel.petrojam_prices to authenticated, service_role;

drop view if exists public.fuel_petrojam_prices;
create view public.fuel_petrojam_prices
with (security_invoker = true) as
select * from fuel.petrojam_prices;

grant select on public.fuel_petrojam_prices to anon, authenticated, service_role;

revoke insert, update, delete, truncate, trigger, references
  on public.fuel_petrojam_prices, public.fuel_retail_price_markup
  from anon, authenticated;

create or replace function places.wholesale_on(p_grade text, p_on date)
returns numeric
language sql
stable
security definer
set search_path = fuel, public
as $$
  select p.price_jmd
  from fuel.refinery_price p
  join fuel.refinery r on r.id = p.refinery_id and r.is_benchmark
  join fuel.refinery_product pr on pr.code = p.product_code and pr.engine_grade = p_grade
  where p.superseded_at is null
    and p.effective_date <= coalesce(p_on, current_date)
  order by p.effective_date desc
  limit 1;
$$;

create or replace function places.latest_petrojam_date()
returns date
language sql
stable
security definer
set search_path = fuel, public
as $$
  select max(p.effective_date)
  from fuel.refinery_price p
  join fuel.refinery r on r.id = p.refinery_id and r.is_benchmark
  where p.superseded_at is null;
$$;

create or replace function fuel.benchmark()
returns table (id uuid, name text, slug text)
language sql
stable
security invoker
set search_path = fuel, public
as $$
  select r.id, r.name, r.slug
  from fuel.refinery r
  where r.is_benchmark
  order by r.country
  limit 1;
$$;

grant execute on function fuel.benchmark() to authenticated, service_role;

create or replace function fuel.freshness_label(p_latest date, p_today date)
returns text
language sql
immutable
as $$
  select case
    when p_latest is null then null
    when p_today - p_latest <= 7 then 'Current'
    when p_today - p_latest > 8 then 'Late'
    else 'Due'
  end;
$$;

create or replace function fuel.next_expected_thursday(p_latest date)
returns date
language sql
immutable
as $$
  select case
    when p_latest is null then null
    else p_latest + (
      case
        when ((4 - extract(dow from p_latest)::int + 7) % 7) = 0 then 7
        else (4 - extract(dow from p_latest)::int + 7) % 7
      end
    )
  end;
$$;

create or replace function public.refinery_write_snapshot(
  p_refinery_id uuid,
  p_rows jsonb,
  p_source text,
  p_source_url text,
  p_trigger text,
  p_actor uuid,
  p_mode text,
  p_pages int,
  p_reason text,
  p_entered_by uuid
) returns jsonb
language plpgsql
security definer
set search_path = fuel, public
as $$
declare
  v_run uuid;
  v_found int := 0;
  v_new int := 0;
  v_same int := 0;
  v_rev int := 0;
  week date;
  rowj jsonb;
  cur fuel.refinery_price%rowtype;
  v_week_new boolean;
  v_week_changed boolean;
  v_code text;
  v_date date;
  v_price numeric;
begin
  if p_source not in ('scrape', 'manual', 'backfill') then
    raise exception 'invalid_source';
  end if;

  insert into fuel.refinery_sync_run (refinery_id, trigger, actor, mode, pages, started_at)
  values (p_refinery_id, coalesce(p_trigger, 'owner'), p_actor, p_mode, p_pages, clock_timestamp())
  returning id into v_run;

  for week in
    select distinct (j->>'effective_date')::date
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) j
    where j->>'effective_date' is not null
  loop
    v_found := v_found + 1;
    select not exists (
      select 1 from fuel.refinery_price
      where refinery_id = p_refinery_id
        and effective_date = week
        and superseded_at is null
    ) into v_week_new;

    v_week_changed := false;
    if not v_week_new then
      select exists (
        select 1
        from jsonb_array_elements(p_rows) j
        join fuel.refinery_price p
          on p.refinery_id = p_refinery_id
         and p.product_code = j->>'product_code'
         and p.effective_date = (j->>'effective_date')::date
         and p.superseded_at is null
        where (j->>'effective_date')::date = week
          and p.price_jmd is distinct from round((j->>'price_jmd')::numeric, 4)
      ) into v_week_changed;
    end if;

    if v_week_new then
      v_new := v_new + 1;
    elsif v_week_changed then
      v_rev := v_rev + 1;
    else
      v_same := v_same + 1;
    end if;
  end loop;

  for rowj in
    select value
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
    where value->>'price_jmd' is not null
      and value->>'product_code' is not null
      and value->>'effective_date' is not null
  loop
    v_code := rowj->>'product_code';
    v_date := (rowj->>'effective_date')::date;
    v_price := round((rowj->>'price_jmd')::numeric, 4);

    select * into cur
    from fuel.refinery_price
    where refinery_id = p_refinery_id
      and product_code = v_code
      and effective_date = v_date
      and superseded_at is null;

    if not found then
      insert into fuel.refinery_price (
        refinery_id, product_code, effective_date, price_jmd, revision, source, source_url,
        sync_run_id, entered_by, reason, first_seen_at, last_seen_at
      ) values (
        p_refinery_id, v_code, v_date, v_price, 1, p_source, p_source_url,
        v_run, p_entered_by, p_reason, clock_timestamp(), clock_timestamp()
      );
    elsif cur.price_jmd = v_price then
      update fuel.refinery_price
      set last_seen_at = clock_timestamp(), sync_run_id = v_run
      where id = cur.id;
    else
      update fuel.refinery_price
      set superseded_at = clock_timestamp()
      where id = cur.id;
      insert into fuel.refinery_price (
        refinery_id, product_code, effective_date, price_jmd, revision, source, source_url,
        sync_run_id, entered_by, reason, first_seen_at, last_seen_at
      ) values (
        p_refinery_id, v_code, v_date, v_price, cur.revision + 1, p_source, p_source_url,
        v_run, p_entered_by, p_reason, cur.first_seen_at, clock_timestamp()
      );
    end if;
  end loop;

  update fuel.refinery_sync_run
  set weeks_found = v_found,
      weeks_new = v_new,
      weeks_unchanged = v_same,
      weeks_revised = v_rev,
      finished_at = clock_timestamp()
  where id = v_run;

  return jsonb_build_object(
    'run_id', v_run,
    'weeks_found', v_found,
    'weeks_new', v_new,
    'weeks_unchanged', v_same,
    'weeks_revised', v_rev,
    'error', null
  );
exception when others then
  insert into fuel.refinery_sync_run (refinery_id, trigger, actor, mode, pages, error, started_at, finished_at)
  values (p_refinery_id, coalesce(p_trigger, 'owner'), p_actor, p_mode, p_pages, sqlerrm, clock_timestamp(), clock_timestamp());
  return jsonb_build_object('error', sqlerrm, 'weeks_found', 0, 'weeks_new', 0, 'weeks_unchanged', 0, 'weeks_revised', 0);
end;
$$;

create or replace function public.refinery_list()
returns jsonb
language sql
stable
security definer
set search_path = fuel, public, places
as $$
  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.is_benchmark desc, x.name), '[]'::jsonb)
  from (
    select
      r.id, r.slug, r.name, r.operator, r.country, r.place_id, r.website, r.price_source_url,
      r.source_kind, r.cadence, r.status, r.is_benchmark,
      coalesce(pl.name, case r.country when 'JM' then 'Jamaica' else r.country end) as location,
      (select max(p.effective_date) from fuel.refinery_price p where p.refinery_id = r.id and p.superseded_at is null) as latest_week,
      (select count(distinct p.product_code) from fuel.refinery_price p where p.refinery_id = r.id and p.superseded_at is null) as product_count,
      fuel.freshness_label(
        (select max(p.effective_date) from fuel.refinery_price p where p.refinery_id = r.id and p.superseded_at is null),
        current_date
      ) as freshness,
      (
        select max(s.finished_at) from fuel.refinery_sync_run s
        where s.refinery_id = r.id and s.error is null
      ) as synced_at,
      fuel.next_expected_thursday(
        (select max(p.effective_date) from fuel.refinery_price p where p.refinery_id = r.id and p.superseded_at is null)
      ) as next_expected
    from fuel.refinery r
    left join places.place pl on pl.id = r.place_id
  ) x;
$$;

create or replace function public.refinery_board(p_slug text, p_week date)
returns jsonb
language plpgsql
stable
security definer
set search_path = fuel, public
as $$
declare
  v_id uuid;
  v_week date;
  v_prev date;
  v_products jsonb;
  v_weeks jsonb;
begin
  select id into v_id from fuel.refinery where slug = p_slug;
  if v_id is null then
    return jsonb_build_object('error', 'not_found');
  end if;

  select coalesce(
    p_week,
    (select max(effective_date) from fuel.refinery_price where refinery_id = v_id and superseded_at is null)
  ) into v_week;

  select max(effective_date) into v_prev
  from fuel.refinery_price
  where refinery_id = v_id and superseded_at is null and effective_date < v_week;

  select coalesce(jsonb_agg(to_jsonb(d) order by d desc), '[]'::jsonb) into v_weeks
  from (
    select distinct effective_date as d
    from fuel.refinery_price
    where refinery_id = v_id and superseded_at is null
  ) s;

  select coalesce(jsonb_agg(prod order by (prod->>'sort')::int), '[]'::jsonb) into v_products
  from (
    select jsonb_build_object(
      'code', pr.code,
      'label', pr.label,
      'unit', pr.unit,
      'boardGroup', pr.board_group,
      'sort', pr.sort,
      'engineGrade', pr.engine_grade,
      'price', cur.price_jmd,
      'prevPrice', prev.price_jmd,
      'change', case when cur.price_jmd is null or prev.price_jmd is null then null else round(cur.price_jmd - prev.price_jmd, 4) end,
      'changePct', case
        when cur.price_jmd is null or prev.price_jmd is null or prev.price_jmd = 0 then null
        else round((cur.price_jmd - prev.price_jmd) / prev.price_jmd * 100, 1)
      end,
      'low52', band.lo,
      'high52', band.hi,
      'markerPct', case
        when band.lo is null or band.hi is null or band.hi = band.lo then null
        else round((cur.price_jmd - band.lo) / (band.hi - band.lo) * 100, 1)
      end,
      'sparkline', coalesce(spark.pts, '[]'::jsonb),
      'revision', case
        when cur.revision is null or cur.revision <= 1 then null
        else jsonb_build_object(
          'revision', cur.revision,
          'revisedAt', cur.last_seen_at,
          'previous', old.price_jmd
        )
      end,
      'prevWeek', v_prev
    ) as prod
    from fuel.refinery_product pr
    left join lateral (
      select * from fuel.refinery_price
      where refinery_id = v_id and product_code = pr.code and effective_date = v_week and superseded_at is null
      limit 1
    ) cur on true
    left join lateral (
      select price_jmd from fuel.refinery_price
      where refinery_id = v_id and product_code = pr.code and effective_date = v_prev and superseded_at is null
      limit 1
    ) prev on true
    left join lateral (
      select min(price_jmd) as lo, max(price_jmd) as hi
      from (
        select price_jmd from fuel.refinery_price
        where refinery_id = v_id and product_code = pr.code and superseded_at is null and effective_date <= v_week
        order by effective_date desc
        limit 52
      ) s
    ) band on true
    left join lateral (
      select jsonb_agg(price_jmd order by effective_date) as pts
      from (
        select price_jmd, effective_date from fuel.refinery_price
        where refinery_id = v_id and product_code = pr.code and superseded_at is null and effective_date <= v_week
        order by effective_date desc
        limit 12
      ) s
    ) spark on true
    left join lateral (
      select price_jmd from fuel.refinery_price
      where refinery_id = v_id and product_code = pr.code and effective_date = v_week and revision = cur.revision - 1
      order by superseded_at desc nulls last
      limit 1
    ) old on true
  ) q;

  return jsonb_build_object(
    'week', v_week,
    'prevWeek', v_prev,
    'weeks', v_weeks,
    'products', v_products
  );
end;
$$;

create or replace function public.refinery_series(
  p_slug text,
  p_products text[],
  p_from date,
  p_to date,
  p_compare boolean default false
) returns jsonb
language plpgsql
stable
security definer
set search_path = fuel, public
as $$
declare
  v_id uuid;
  v_from date;
  v_to date;
begin
  select id into v_id from fuel.refinery where slug = p_slug;
  if v_id is null then
    return jsonb_build_object('error', 'not_found');
  end if;

  if p_compare then
    return (
      select jsonb_build_object(
        'compare', true,
        'product', p_products[1],
        'points', coalesce(jsonb_agg(jsonb_build_object(
          'week', s.effective_date,
          'refinery', s.slug,
          'name', s.name,
          'price', s.price_jmd,
          'change', s.change
        ) order by s.effective_date, s.slug), '[]'::jsonb)
      )
      from (
        select p.effective_date, r.slug, r.name, p.price_jmd,
          p.price_jmd - lag(p.price_jmd) over (partition by r.id order by p.effective_date) as change
        from fuel.refinery_price p
        join fuel.refinery r on r.id = p.refinery_id
        where p.superseded_at is null
          and p.product_code = p_products[1]
          and (p_from is null or p.effective_date >= p_from)
          and (p_to is null or p.effective_date <= p_to)
      ) s
    );
  end if;

  select coalesce(p_from, min(effective_date)), coalesce(p_to, max(effective_date))
  into v_from, v_to
  from fuel.refinery_price
  where refinery_id = v_id and superseded_at is null;

  return (
    select jsonb_build_object(
      'compare', false,
      'from', v_from,
      'to', v_to,
      'points', coalesce(jsonb_agg(pt order by (pt->>'week')), '[]'::jsonb)
    )
    from (
      select jsonb_build_object(
        'week', w.effective_date,
        'products', jsonb_agg(jsonb_build_object(
          'code', p.product_code,
          'price', p.price_jmd,
          'change', p.price_jmd - lag(p.price_jmd) over (partition by p.product_code order by p.effective_date)
        ) order by p.product_code)
      ) as pt
      from (
        select distinct effective_date
        from fuel.refinery_price
        where refinery_id = v_id and superseded_at is null
          and effective_date >= v_from and effective_date <= v_to
      ) w
      join fuel.refinery_price p
        on p.refinery_id = v_id
       and p.effective_date = w.effective_date
       and p.superseded_at is null
       and (p_products is null or p.product_code = any (p_products))
      group by w.effective_date
    ) z
  );
end;
$$;

create or replace function public.refinery_history(p_slug text, p_year int, p_page int)
returns jsonb
language plpgsql
stable
security definer
set search_path = fuel, public
as $$
declare
  v_id uuid;
  v_page int := greatest(coalesce(p_page, 1), 0);
  v_size int := 52;
  v_offset int;
  v_total int;
begin
  select id into v_id from fuel.refinery where slug = p_slug;
  if v_id is null then
    return jsonb_build_object('error', 'not_found');
  end if;
  v_offset := case when v_page = 0 then 0 else (v_page - 1) * v_size end;

  select count(*) into v_total from (
    select distinct effective_date
    from fuel.refinery_price
    where refinery_id = v_id and superseded_at is null
      and (p_year is null or extract(year from effective_date) = p_year)
  ) d;

  return jsonb_build_object(
    'page', case when v_page = 0 then 1 else v_page end,
    'pageSize', case when v_page = 0 then v_total else v_size end,
    'total', v_total,
    'years', (
      select coalesce(jsonb_agg(y order by y desc), '[]'::jsonb)
      from (select distinct extract(year from effective_date)::int as y from fuel.refinery_price where refinery_id = v_id and superseded_at is null) s
    ),
    'spanFrom', (select min(effective_date) from fuel.refinery_price where refinery_id = v_id and superseded_at is null),
    'spanTo', (select max(effective_date) from fuel.refinery_price where refinery_id = v_id and superseded_at is null),
    'products', (
      select coalesce(jsonb_agg(jsonb_build_object('code', code, 'label', label, 'unit', unit) order by sort), '[]'::jsonb)
      from fuel.refinery_product
    ),
    'rows', (
      select coalesce(jsonb_agg(row_to_json(z)::jsonb), '[]'::jsonb)
      from (
        select
          w.effective_date as week,
          case when bool_or(p.source = 'manual') then 'Manual' else 'Scrape' end as source,
          jsonb_object_agg(p.product_code, jsonb_build_object('price', p.price_jmd, 'revised', p.revision > 1)) as cells
        from (
          select distinct effective_date
          from fuel.refinery_price
          where refinery_id = v_id and superseded_at is null
            and (p_year is null or extract(year from effective_date) = p_year)
          order by effective_date desc
          limit case when v_page = 0 then null else v_size end
          offset v_offset
        ) w
        join fuel.refinery_price p
          on p.refinery_id = v_id and p.effective_date = w.effective_date and p.superseded_at is null
        group by w.effective_date
        order by w.effective_date desc
      ) z
    )
  );
end;
$$;

create or replace function public.refinery_versions(p_slug text, p_product text, p_week date)
returns jsonb
language sql
stable
security definer
set search_path = fuel, public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'revision', p.revision,
    'price', p.price_jmd,
    'source', p.source,
    'reason', p.reason,
    'at', coalesce(p.superseded_at, p.last_seen_at),
    'current', p.superseded_at is null
  ) order by p.revision desc), '[]'::jsonb)
  from fuel.refinery_price p
  join fuel.refinery r on r.id = p.refinery_id
  where r.slug = p_slug and p.product_code = p_product and p.effective_date = p_week;
$$;

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
  from generate_series(date '2023-01-05', current_date, interval '7 days') g(d)
  where not exists (
    select 1 from fuel.refinery_price p
    where p.refinery_id = v_id and p.superseded_at is null
      and p.effective_date >= g.d::date and p.effective_date < g.d::date + 7
  );

  select count(*) into v_revised from (
    select effective_date
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
      from generate_series(date '2023-01-05', current_date, interval '7 days') g(d)
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

create or replace function public.refinery_save(
  p_slug text,
  p_patch jsonb,
  p_actor uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = fuel, fleet, public
as $$
declare
  v_id uuid;
  v_country text;
  v_bench boolean;
  v_was boolean;
  v_slug text;
begin
  if p_slug is null or p_slug = '' then
    v_slug := trim(both '-' from regexp_replace(lower(coalesce(p_patch->>'name', '')), '[^a-z0-9]+', '-', 'g'));
    if v_slug = '' then
      raise exception 'name_required';
    end if;
    insert into fuel.refinery (
      slug, name, operator, country, place_id, website, price_source_url, source_kind, cadence, status, is_benchmark
    ) values (
      v_slug,
      p_patch->>'name',
      nullif(p_patch->>'operator', ''),
      coalesce(nullif(p_patch->>'country', ''), 'JM'),
      nullif(p_patch->>'place_id', ''),
      nullif(p_patch->>'website', ''),
      nullif(p_patch->>'price_source_url', ''),
      coalesce(nullif(p_patch->>'source_kind', ''), 'manual'),
      coalesce(nullif(p_patch->>'cadence', ''), 'weekly_thu'),
      coalesce(nullif(p_patch->>'status', ''), 'active'),
      false
    )
    returning id, country into v_id, v_country;
  else
    select id, country, is_benchmark into v_id, v_country, v_was from fuel.refinery where slug = p_slug;
    if v_id is null then
      raise exception 'not_found';
    end if;
    v_slug := p_slug;
    update fuel.refinery set
      name = coalesce(nullif(p_patch->>'name', ''), name),
      operator = case when p_patch ? 'operator' then nullif(p_patch->>'operator', '') else operator end,
      country = coalesce(nullif(p_patch->>'country', ''), country),
      place_id = case when p_patch ? 'place_id' then nullif(p_patch->>'place_id', '') else place_id end,
      website = case when p_patch ? 'website' then nullif(p_patch->>'website', '') else website end,
      price_source_url = case when p_patch ? 'price_source_url' then nullif(p_patch->>'price_source_url', '') else price_source_url end,
      source_kind = coalesce(nullif(p_patch->>'source_kind', ''), source_kind),
      status = coalesce(nullif(p_patch->>'status', ''), status),
      updated_at = now()
    where id = v_id
    returning country into v_country;
  end if;

  v_bench := coalesce((p_patch->>'is_benchmark')::boolean, false);
  if p_patch ? 'is_benchmark' and v_bench is distinct from coalesce(v_was, false) then
    if p_reason is null or length(trim(p_reason)) = 0 then
      raise exception 'reason_required';
    end if;
    if v_bench then
      update fuel.refinery set is_benchmark = false, updated_at = now()
      where country = v_country and is_benchmark and id <> v_id;
      update fuel.refinery set is_benchmark = true, updated_at = now() where id = v_id;
    else
      raise exception 'benchmark_required';
    end if;
    insert into fleet.master_change_log (dataset, record_id, action, before_json, after_json, actor, reason)
    values (
      'refinery', v_id::text, 'benchmark',
      jsonb_build_object('is_benchmark', coalesce(v_was, false)),
      jsonb_build_object('is_benchmark', v_bench, 'slug', v_slug),
      p_actor, p_reason
    );
  end if;

  return (select row_to_json(r)::jsonb from fuel.refinery r where r.id = v_id);
end;
$$;

create or replace function public.refinery_patch_product(p_code text, p_label text, p_unit text)
returns jsonb
language plpgsql
security definer
set search_path = fuel, public
as $$
declare
  v jsonb;
begin
  update fuel.refinery_product
  set label = coalesce(nullif(p_label, ''), label),
      unit = case when p_unit is null then unit when p_unit = '' then null else p_unit end
  where code = p_code
  returning jsonb_build_object('code', code, 'label', label, 'unit', unit) into v;
  if v is null then
    raise exception 'not_found';
  end if;
  return v;
end;
$$;

revoke all on function public.refinery_write_snapshot(uuid, jsonb, text, text, text, uuid, text, int, text, uuid) from public, anon, authenticated;
revoke all on function public.refinery_list() from public, anon, authenticated;
revoke all on function public.refinery_board(text, date) from public, anon, authenticated;
revoke all on function public.refinery_series(text, text[], date, date, boolean) from public, anon, authenticated;
revoke all on function public.refinery_history(text, int, int) from public, anon, authenticated;
revoke all on function public.refinery_versions(text, text, date) from public, anon, authenticated;
revoke all on function public.refinery_runs(text, int) from public, anon, authenticated;
revoke all on function public.refinery_save(text, jsonb, uuid, text) from public, anon, authenticated;
revoke all on function public.refinery_patch_product(text, text, text) from public, anon, authenticated;

grant execute on function public.refinery_write_snapshot(uuid, jsonb, text, text, text, uuid, text, int, text, uuid) to service_role;
grant execute on function public.refinery_list() to service_role;
grant execute on function public.refinery_board(text, date) to service_role;
grant execute on function public.refinery_series(text, text[], date, date, boolean) to service_role;
grant execute on function public.refinery_history(text, int, int) to service_role;
grant execute on function public.refinery_versions(text, text, date) to service_role;
grant execute on function public.refinery_runs(text, int) to service_role;
grant execute on function public.refinery_save(text, jsonb, uuid, text) to service_role;
grant execute on function public.refinery_patch_product(text, text, text) to service_role;

-- T1–T4 and T7. A failure rolls the migration back.
do $$
declare
  codes text[] := array['gasolene_87','gasolene_90','auto_diesel','ulsd','kerosene','propane','butane','hfo','asphalt'];
  c text;
  live_n bigint;
  old_n bigint;
  mismatch int;
  grants int;
begin
  foreach c in array codes loop
    execute format(
      'select count(*) from fuel.refinery_price p join fuel.refinery r on r.id = p.refinery_id where r.slug = ''petrojam'' and p.product_code = %L and p.superseded_at is null',
      c
    ) into live_n;
    execute format('select count(%I) from fuel.petrojam_prices_legacy', c) into old_n;
    if live_n <> old_n then
      raise exception 'T1 % live % legacy %', c, live_n, old_n;
    end if;
  end loop;

  select count(*) into mismatch from (
    (
      select * from (
        select * from public.fuel_petrojam_prices order by price_date desc limit 3
      ) a
      except
      select * from (
        select * from fuel.petrojam_prices_legacy order by price_date desc limit 3
      ) b
    )
    union all
    (
      select * from (
        select * from fuel.petrojam_prices_legacy order by price_date desc limit 3
      ) b
      except
      select * from (
        select * from public.fuel_petrojam_prices order by price_date desc limit 3
      ) a
    )
  ) d;
  if mismatch <> 0 then
    raise exception 'T2 compat view mismatch %', mismatch;
  end if;

  if places.wholesale_on('e10_87', '2026-10-22') is distinct from 201.8128 then
    raise exception 'T3 e10_87 %', places.wholesale_on('e10_87', '2026-10-22');
  end if;
  if places.wholesale_on('ulsd', '2026-10-22') is distinct from 271.5973 then
    raise exception 'T3 ulsd %', places.wholesale_on('ulsd', '2026-10-22');
  end if;
  if places.wholesale_on('e10_87', '2000-01-01') is not null then
    raise exception 'T3 pre-2004 should be null';
  end if;

  begin
    insert into fuel.refinery (slug, name, country, source_kind, is_benchmark)
    values ('t4-second-benchmark', 'Second', 'JM', 'manual', true);
    raise exception 'T4 second benchmark was allowed';
  exception
    when unique_violation then
      null;
  end;

  select count(*) into grants
  from information_schema.role_table_grants
  where grantee = 'anon'
    and (
      (table_schema = 'fuel' and table_name in ('refinery', 'refinery_product', 'refinery_price', 'refinery_sync_run'))
      or (table_schema = 'public' and table_name in ('fuel_petrojam_prices', 'fuel_retail_price_markup')
          and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER', 'REFERENCES'))
    );
  if grants <> 0 then
    raise exception 'T7 anon grants %', grants;
  end if;
end $$;
