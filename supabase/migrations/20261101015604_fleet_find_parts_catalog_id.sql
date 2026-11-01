alter table public.parts_sourcing_requests
  add column if not exists vehicle_catalog_id uuid references public.vehicle_catalog (id) on delete set null,
  add column if not exists match_type text,
  add column if not exists fit_descriptor text;

update public.parts_sourcing_requests r
set
  vehicle_catalog_id = r.platform_id,
  platform_id = vc.platform_id
from public.vehicle_catalog vc
where r.platform_id = vc.id
  and r.vehicle_catalog_id is null
  and not exists (
    select 1 from public.vehicle_platform vp where vp.id = r.platform_id
  );;
