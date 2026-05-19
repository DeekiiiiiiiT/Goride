-- Ensure commando_body_type exists on rides.vehicle_types and refresh PostgREST view.
-- Safe to run if 20260520100000_rides_body_type_dispatch.sql was skipped or view is stale.

ALTER TABLE rides.vehicle_types
  ADD COLUMN IF NOT EXISTS commando_body_type TEXT;

UPDATE rides.vehicle_types
SET commando_body_type = label
WHERE solution_kind = 'vehicle'
  AND (commando_body_type IS NULL OR trim(commando_body_type) = '');

CREATE UNIQUE INDEX IF NOT EXISTS idx_rides_vehicle_types_commando_body
  ON rides.vehicle_types (lower(trim(commando_body_type)))
  WHERE solution_kind = 'vehicle'
    AND commando_body_type IS NOT NULL
    AND trim(commando_body_type) <> '';

COMMENT ON COLUMN rides.vehicle_types.commando_body_type IS
  'Commando motor vehicle catalog body type label (body-type rows only).';

DROP VIEW IF EXISTS public.rides_vehicle_types;
CREATE VIEW public.rides_vehicle_types AS
  SELECT * FROM rides.vehicle_types;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rides_vehicle_types TO service_role;

NOTIFY pgrst, 'reload schema';
