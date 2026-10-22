-- Remember a successful driving distance between two rounded pins.
-- Failures are not stored. This is not the week's mileage, which the close check still uses.

create table if not exists public.fuel_route_cache (
  from_key text not null,
  to_key text not null,
  km numeric not null,
  source text not null default 'google_directions',
  created_at timestamptz not null default now(),
  primary key (from_key, to_key)
);

alter table public.fuel_route_cache enable row level security;

revoke all on table public.fuel_route_cache from public, anon, authenticated;
grant select, insert, update on table public.fuel_route_cache to service_role;
