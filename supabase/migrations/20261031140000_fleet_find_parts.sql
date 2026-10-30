-- Fleet Find parts: quote urgency, another-car requests, pending-catalog source.

alter table public.part_quote_request
  add column if not exists urgency text,
  add column if not exists maintenance_component_id uuid references public.maintenance_service_categories (id) on delete set null;

alter table public.part_quote_request
  drop constraint if exists part_quote_request_urgency_check;
alter table public.part_quote_request
  add constraint part_quote_request_urgency_check
  check (urgency is null or urgency in ('low', 'normal', 'urgent'));

alter table public.parts_sourcing_requests
  alter column vehicle_id drop not null;

alter table public.vehicle_catalog_pending_requests
  drop constraint if exists vehicle_catalog_pending_requests_source_check;
alter table public.vehicle_catalog_pending_requests
  add constraint vehicle_catalog_pending_requests_source_check
  check (source in ('scan', 'manual', 'find_parts'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'parts-request-photos',
  'parts-request-photos',
  false,
  8388608,
  array['image/jpeg','image/png','image/webp']::text[]
)
on conflict (id) do nothing;
