-- Split transport options into vehicle types vs services (e.g. Courier).

ALTER TABLE rides.vehicle_types
  ADD COLUMN IF NOT EXISTS solution_kind TEXT NOT NULL DEFAULT 'vehicle'
  CHECK (solution_kind IN ('vehicle', 'service'));

UPDATE rides.vehicle_types
SET solution_kind = 'service'
WHERE slug = 'courier';

UPDATE rides.vehicle_types
SET solution_kind = 'vehicle'
WHERE solution_kind IS NULL OR solution_kind NOT IN ('vehicle', 'service');

DROP VIEW IF EXISTS public.rides_vehicle_types;
CREATE VIEW public.rides_vehicle_types AS
  SELECT * FROM rides.vehicle_types;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rides_vehicle_types TO service_role;

NOTIFY pgrst, 'reload schema';
