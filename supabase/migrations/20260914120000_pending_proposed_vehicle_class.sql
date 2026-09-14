-- Pending requests: mirror vehicle_catalog.vehicle_class so approve-new cannot silently become 'car'.

ALTER TABLE public.vehicle_catalog_pending_requests
  ADD COLUMN IF NOT EXISTS proposed_vehicle_class text;

UPDATE public.vehicle_catalog_pending_requests
SET proposed_vehicle_class = 'car'
WHERE proposed_vehicle_class IS NULL OR trim(proposed_vehicle_class) = '';

ALTER TABLE public.vehicle_catalog_pending_requests
  ALTER COLUMN proposed_vehicle_class SET DEFAULT 'car';

ALTER TABLE public.vehicle_catalog_pending_requests
  ALTER COLUMN proposed_vehicle_class SET NOT NULL;

ALTER TABLE public.vehicle_catalog_pending_requests
  DROP CONSTRAINT IF EXISTS vehicle_catalog_pending_requests_proposed_vehicle_class_check;

ALTER TABLE public.vehicle_catalog_pending_requests
  ADD CONSTRAINT vehicle_catalog_pending_requests_proposed_vehicle_class_check
  CHECK (proposed_vehicle_class IN ('car', 'motorcycle'));

COMMENT ON COLUMN public.vehicle_catalog_pending_requests.proposed_vehicle_class IS
  'Mirrors vehicle_catalog.vehicle_class; seeded from fleet usageCategory on upsert; used on approve-new.';
