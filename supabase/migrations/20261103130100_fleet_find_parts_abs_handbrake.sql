-- Fleet Find parts FP4: ABS channels + handbrake type on vehicle_catalog (31 Oct 2026 audit)

alter table public.vehicle_catalog
  add column if not exists abs_channels text,
  add column if not exists handbrake_type text;

comment on column public.vehicle_catalog.abs_channels is 'Shown on Fleet Find parts FP4 chassis profile (e.g. 4-wheel Bosch).';
comment on column public.vehicle_catalog.handbrake_type is 'Shown on Fleet Find parts FP4 chassis profile (e.g. rear drum cable).';

-- Live Roomy 5179KZ → vehicle_catalog 3cd9cbf3-a804-4817-82db-400cf6abf13a (M900A, 2016 MY row)
update public.vehicle_catalog
set
  abs_channels = coalesce(nullif(trim(abs_channels), ''), '4-wheel Bosch'),
  handbrake_type = coalesce(nullif(trim(handbrake_type), ''), 'Rear drum cable')
where id = '3cd9cbf3-a804-4817-82db-400cf6abf13a'::uuid;
