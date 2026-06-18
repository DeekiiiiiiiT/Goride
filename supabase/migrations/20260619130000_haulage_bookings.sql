-- Haulage booking manifest (child of ride_requests).

CREATE TABLE IF NOT EXISTS rides.haulage_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_request_id UUID NOT NULL UNIQUE REFERENCES rides.ride_requests(id) ON DELETE CASCADE,
  stairs_level TEXT NOT NULL DEFAULT 'none'
    CHECK (stairs_level IN ('none', '1_flight', '2_plus')),
  prep_status TEXT NOT NULL DEFAULT 'ready'
    CHECK (prep_status IN ('ready', 'needs_unhooking')),
  total_weight_kg NUMERIC(10, 2) NOT NULL CHECK (total_weight_kg > 0),
  total_volume_cm3 NUMERIC(14, 2) NOT NULL DEFAULT 0,
  min_body_type_slug TEXT REFERENCES rides.vehicle_types(slug) ON DELETE SET NULL,
  fill_percent NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (fill_percent >= 0 AND fill_percent <= 100),
  recommended_gear JSONB NOT NULL DEFAULT '[]'::jsonb,
  manifest_summary TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rides.haulage_booking_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  haulage_booking_id UUID NOT NULL REFERENCES rides.haulage_bookings(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  variant_id TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1 CHECK (qty > 0 AND qty <= 99),
  item_title TEXT NOT NULL,
  variant_label TEXT NOT NULL,
  weight_kg NUMERIC(8, 2) NOT NULL,
  length_cm NUMERIC(8, 2),
  width_cm NUMERIC(8, 2),
  height_cm NUMERIC(8, 2),
  fragile BOOLEAN NOT NULL DEFAULT FALSE,
  requires_disassembly BOOLEAN NOT NULL DEFAULT FALSE,
  upright_only BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_haulage_bookings_ride
  ON rides.haulage_bookings (ride_request_id);

CREATE INDEX IF NOT EXISTS idx_haulage_booking_lines_booking
  ON rides.haulage_booking_lines (haulage_booking_id);

DROP TRIGGER IF EXISTS update_haulage_bookings_updated_at ON rides.haulage_bookings;
CREATE TRIGGER update_haulage_bookings_updated_at
  BEFORE UPDATE ON rides.haulage_bookings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE rides.haulage_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE rides.haulage_booking_lines ENABLE ROW LEVEL SECURITY;

GRANT ALL ON rides.haulage_bookings TO service_role;
GRANT ALL ON rides.haulage_booking_lines TO service_role;

DROP VIEW IF EXISTS public.rides_haulage_bookings;
CREATE VIEW public.rides_haulage_bookings AS SELECT * FROM rides.haulage_bookings;
DROP VIEW IF EXISTS public.rides_haulage_booking_lines;
CREATE VIEW public.rides_haulage_booking_lines AS SELECT * FROM rides.haulage_booking_lines;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rides_haulage_bookings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rides_haulage_booking_lines TO service_role;

NOTIFY pgrst, 'reload schema';
