-- Thin public wrapper so finance-recon (service_role via PostgREST) can alert on daily temp IO.
-- Body stays in private.io_daily_temp_bytes (L-12).

create or replace function public.io_daily_temp_bytes()
returns bigint
language sql
stable
security definer
set search_path = public, private, pg_catalog
as $fn$
  select private.io_daily_temp_bytes();
$fn$;

revoke all on function public.io_daily_temp_bytes() from public;
grant execute on function public.io_daily_temp_bytes() to service_role;
