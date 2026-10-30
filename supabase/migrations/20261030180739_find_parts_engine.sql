-- Find parts engine: browse names, universal parts follow the chosen part, problem list.

alter table public.maintenance_service_categories
  add column if not exists plain_name text,
  add column if not exists is_part boolean not null default true,
  add column if not exists common_rank integer;

alter table public.spec_key
  add column if not exists maintenance_component_id uuid references public.maintenance_service_categories (id);

drop function if exists public.universal_section_for_variant(uuid, integer);

create function public.universal_section_for_variant(
  p_catalog_id uuid,
  p_vehicle_year integer default null,
  p_component_id uuid default null
) returns jsonb
language sql
stable
security definer
set search_path to public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'specKey', spec_key,
    'label', label,
    'value', spec_value,
    'unit', unit,
    'items', items
  ) order by label), '[]'::jsonb)
  from (
    select
      spec_key,
      label,
      spec_value,
      unit,
      coalesce(jsonb_agg(jsonb_build_object(
        'id', universal_part_id,
        'manufacturer', manufacturer,
        'partNumber', part_number,
        'name', name,
        'extra', extra
      ) order by manufacturer) filter (where universal_part_id is not null), '[]'::jsonb) as items
    from public.universal_parts_for_variant(p_catalog_id, p_vehicle_year)
    where p_component_id is null
      or exists (
        select 1
        from public.spec_key sk
        where sk.key = spec_key
          and sk.maintenance_component_id = p_component_id
      )
    group by spec_key, label, spec_value, unit
  ) s;
$$;

alter function public.universal_section_for_variant(uuid, integer, uuid) owner to postgres;
revoke all on function public.universal_section_for_variant(uuid, integer, uuid) from public;
grant all on function public.universal_section_for_variant(uuid, integer, uuid) to service_role;

create table if not exists public.part_symptom (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  hint text,
  sort_order integer not null default 100,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table if not exists public.part_symptom_component (
  symptom_id uuid references public.part_symptom (id) on delete cascade,
  component_id uuid references public.maintenance_service_categories (id) on delete cascade,
  rank integer not null default 1,
  primary key (symptom_id, component_id)
);

alter table public.part_symptom enable row level security;
alter table public.part_symptom_component enable row level security;

drop policy if exists part_symptom_read on public.part_symptom;
create policy part_symptom_read on public.part_symptom
  for select to authenticated
  using (active = true);

drop policy if exists part_symptom_component_read on public.part_symptom_component;
create policy part_symptom_component_read on public.part_symptom_component
  for select to authenticated
  using (
    exists (
      select 1 from public.part_symptom s
      where s.id = symptom_id and s.active = true
    )
  );

revoke all on public.part_symptom from public, anon;
revoke all on public.part_symptom_component from public, anon;
grant select on public.part_symptom to authenticated;
grant select on public.part_symptom_component to authenticated;
grant all on public.part_symptom to service_role;
grant all on public.part_symptom_component to service_role;
