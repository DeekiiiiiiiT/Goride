-- Configurable Roam Rides vehicle / service tiers (labels, descriptions, capacity display).

CREATE TABLE IF NOT EXISTS rides.vehicle_types (
  slug TEXT PRIMARY KEY CHECK (slug ~ '^[a-z][a-z0-9_-]{0,30}$'),
  label TEXT NOT NULL CHECK (char_length(trim(label)) > 0),
  description TEXT NOT NULL DEFAULT '',
  seats INTEGER NOT NULL DEFAULT 4 CHECK (seats >= 0 AND seats <= 99),
  capacity_label TEXT,
  tagline TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rides_vehicle_types_active_sort
  ON rides.vehicle_types (is_active, sort_order, slug);

DROP TRIGGER IF EXISTS update_rides_vehicle_types_updated_at ON rides.vehicle_types;
CREATE TRIGGER update_rides_vehicle_types_updated_at
  BEFORE UPDATE ON rides.vehicle_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE rides.vehicle_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rides_vehicle_types_read ON rides.vehicle_types;
CREATE POLICY rides_vehicle_types_read ON rides.vehicle_types
  FOR SELECT TO authenticated USING (TRUE);

GRANT SELECT ON rides.vehicle_types TO authenticated;
GRANT ALL ON rides.vehicle_types TO service_role;

INSERT INTO rides.vehicle_types (slug, label, description, seats, capacity_label, tagline, sort_order)
VALUES
  ('uberx', 'UberX', 'Sedan — standard 4-door compact or mid-size car', 4, NULL, NULL, 10),
  ('comfort', 'Comfort', 'Sedan — newer, more spacious 4-door mid-size car', 4, NULL, NULL, 20),
  ('uberxl', 'UberXL', 'SUV or minivan — larger 6-passenger utility vehicle', 6, NULL, NULL, 30),
  (
    'courier',
    'Courier',
    'Variable — car, motorcycle, bicycle, or scooter depending on your market',
    0,
    'Variable',
    'Send a package',
    40
  )
ON CONFLICT (slug) DO NOTHING;

-- Public view for PostgREST when `rides` schema is not exposed
DROP VIEW IF EXISTS public.rides_vehicle_types;
CREATE VIEW public.rides_vehicle_types AS
  SELECT * FROM rides.vehicle_types;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rides_vehicle_types TO service_role;

CREATE OR REPLACE FUNCTION public.rides_vehicle_types_instead_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rides, public
AS $$
BEGIN
  DELETE FROM rides.vehicle_types WHERE slug = OLD.slug;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS rides_vehicle_types_instead_delete ON public.rides_vehicle_types;
CREATE TRIGGER rides_vehicle_types_instead_delete
  INSTEAD OF DELETE ON public.rides_vehicle_types
  FOR EACH ROW
  EXECUTE FUNCTION public.rides_vehicle_types_instead_delete();

NOTIFY pgrst, 'reload schema';
