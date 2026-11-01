-- Fleet Find parts Rev 2. Columns checked against production on 31 Oct 2026.

alter table public.part_quote_request
  drop constraint if exists part_quote_request_urgency_check;
alter table public.part_quote_request
  add constraint part_quote_request_urgency_check
  check (urgency is null or urgency in ('low', 'normal', 'urgent', 'within_24h'));

alter table public.part_quote_request
  add column if not exists wrong_fit_reported_at timestamptz,
  add column if not exists target_price_jmd numeric(12, 2),
  add column if not exists reply_due_at timestamptz,
  add column if not exists linked_service_id text;

alter table public.parts_sourcing_requests
  drop constraint if exists parts_sourcing_requests_urgency_check;
alter table public.parts_sourcing_requests
  add constraint parts_sourcing_requests_urgency_check
  check (urgency is null or urgency in ('low', 'normal', 'urgent', 'within_24h'));

alter table public.parts_sourcing_requests
  add column if not exists wrong_fit_reported_at timestamptz,
  add column if not exists found_price_jmd numeric(12, 2),
  add column if not exists po_number text,
  add column if not exists reply_due_at timestamptz,
  add column if not exists kind text;

alter table public.part_master
  add column if not exists gtin text,
  add column if not exists photo_verified boolean not null default false,
  add column if not exists hs_code text;

alter table public.maintenance_service_categories
  add column if not exists labour_minutes integer,
  add column if not exists fleet_tip text,
  add column if not exists description text,
  add column if not exists image_url text;

alter table public.vehicle_catalog
  add column if not exists chassis_serial_from text,
  add column if not exists description text;

alter table public.part_symptom_component
  add column if not exists weight numeric(6, 2);

alter table public.org_part_stock
  add column if not exists batch_note text,
  add column if not exists bin text;

update public.vehicle_catalog
set description = nullif(trim(concat_ws(' · ', nullif(engine_code, ''), nullif(transmission, ''), nullif(drivetrain, ''))), '')
where description is null
  and lower(model) in ('fit', 'roomy');

update public.vehicle_catalog
set chassis_serial_from = chassis_code
where chassis_serial_from is null
  and chassis_code is not null
  and lower(model) in ('fit', 'roomy');

create table if not exists public.fleet_saved_part_searches (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  user_id uuid,
  url text not null,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.fleet_parts_list (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  user_id uuid,
  status text not null default 'open' check (status in ('open', 'confirmed')),
  created_at timestamptz not null default now()
);

create unique index if not exists fleet_parts_list_one_open
  on public.fleet_parts_list (organization_id, user_id)
  where status = 'open' and user_id is not null;

create table if not exists public.fleet_parts_list_line (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.fleet_parts_list (id) on delete cascade,
  organization_id text not null,
  part_id uuid,
  component_id uuid,
  supplier_id uuid,
  label text not null,
  qty numeric(12, 3) not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.fleet_parts_notices (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  kind text not null,
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.parts_supplier_sync_run (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  status text not null default 'ok',
  message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

alter table public.fleet_saved_part_searches enable row level security;
alter table public.fleet_parts_list enable row level security;
alter table public.fleet_parts_list_line enable row level security;
alter table public.fleet_parts_notices enable row level security;
alter table public.parts_supplier_sync_run enable row level security;

drop policy if exists fleet_saved_part_searches_no_direct on public.fleet_saved_part_searches;
create policy fleet_saved_part_searches_no_direct on public.fleet_saved_part_searches
  for all using (false) with check (false);

drop policy if exists fleet_parts_list_no_direct on public.fleet_parts_list;
create policy fleet_parts_list_no_direct on public.fleet_parts_list
  for all using (false) with check (false);

drop policy if exists fleet_parts_list_line_no_direct on public.fleet_parts_list_line;
create policy fleet_parts_list_line_no_direct on public.fleet_parts_list_line
  for all using (false) with check (false);

drop policy if exists fleet_parts_notices_no_direct on public.fleet_parts_notices;
create policy fleet_parts_notices_no_direct on public.fleet_parts_notices
  for all using (false) with check (false);

drop policy if exists parts_supplier_sync_run_no_direct on public.parts_supplier_sync_run;
create policy parts_supplier_sync_run_no_direct on public.parts_supplier_sync_run
  for all using (false) with check (false);;
