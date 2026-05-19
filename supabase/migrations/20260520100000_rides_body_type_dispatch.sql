-- Body-type dispatch: Commando labels on body types, service↔body links, driver presence slug.

ALTER TABLE rides.vehicle_types
  ADD COLUMN IF NOT EXISTS commando_body_type TEXT;

UPDATE rides.vehicle_types
SET commando_body_type = label
WHERE solution_kind = 'vehicle'
  AND (commando_body_type IS NULL OR trim(commando_body_type) = '');

CREATE UNIQUE INDEX IF NOT EXISTS idx_rides_vehicle_types_commando_body
  ON rides.vehicle_types (lower(trim(commando_body_type)))
  WHERE solution_kind = 'vehicle' AND commando_body_type IS NOT NULL AND trim(commando_body_type) <> '';

CREATE TABLE IF NOT EXISTS rides.service_body_types (
  service_slug TEXT NOT NULL REFERENCES rides.vehicle_types(slug) ON DELETE CASCADE,
  body_type_slug TEXT NOT NULL REFERENCES rides.vehicle_types(slug) ON DELETE CASCADE,
  priority INTEGER NOT NULL DEFAULT 10,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (service_slug, body_type_slug)
);

CREATE INDEX IF NOT EXISTS idx_rides_service_body_types_service_priority
  ON rides.service_body_types (service_slug, priority, body_type_slug);

ALTER TABLE rides.driver_locations
  ADD COLUMN IF NOT EXISTS body_type_slug TEXT;

CREATE INDEX IF NOT EXISTS idx_rides_driver_locations_body_type
  ON rides.driver_locations (body_type_slug)
  WHERE body_type_slug IS NOT NULL;

ALTER TABLE public.driver_vehicles
  ADD COLUMN IF NOT EXISTS body_type TEXT;

COMMENT ON COLUMN rides.vehicle_types.commando_body_type IS 'Commando motor vehicle catalog body type label (body-type rows only).';
COMMENT ON TABLE rides.service_body_types IS 'Ordered body types eligible per rider-facing service; wave dispatch expands by priority tier.';
COMMENT ON COLUMN rides.driver_locations.body_type_slug IS 'Normalized body type slug for matching (from driver primary vehicle).';

DROP VIEW IF EXISTS public.rides_vehicle_types;
CREATE VIEW public.rides_vehicle_types AS
  SELECT * FROM rides.vehicle_types;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rides_vehicle_types TO service_role;

DROP VIEW IF EXISTS public.rides_service_body_types;
CREATE VIEW public.rides_service_body_types AS
  SELECT * FROM rides.service_body_types;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rides_service_body_types TO service_role;

NOTIFY pgrst, 'reload schema';
