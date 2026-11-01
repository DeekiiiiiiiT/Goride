-- Fleet Find parts FP4: ABS channels + handbrake type on vehicle_catalog (31 Oct 2026 audit)
-- Values are owner-entered in Dominion (Vehicle catalog → Wheels & Brakes). Do not seed here.

alter table public.vehicle_catalog
  add column if not exists abs_channels text,
  add column if not exists handbrake_type text;

comment on column public.vehicle_catalog.abs_channels is 'Verified ABS channel description for Fleet Find parts FP4; entered in Dominion Wheels & Brakes.';
comment on column public.vehicle_catalog.handbrake_type is 'Verified handbrake type for Fleet Find parts FP4; entered in Dominion Wheels & Brakes.';
