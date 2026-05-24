-- Apply missing body_type_slug on driver_locations (from 20260520100000 migration).
ALTER TABLE rides.driver_locations
  ADD COLUMN IF NOT EXISTS body_type_slug TEXT;

CREATE INDEX IF NOT EXISTS idx_rides_driver_locations_body_type
  ON rides.driver_locations (body_type_slug)
  WHERE body_type_slug IS NOT NULL;

NOTIFY pgrst, 'reload schema';
