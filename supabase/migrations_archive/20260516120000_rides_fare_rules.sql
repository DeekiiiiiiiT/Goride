-- Fare rules + ride quote audit columns for Roam Rides upfront pricing.
-- See docs/passenger-rides/RIDES_SPEC.md and docs/passenger-rides/FARE_OPS.md

CREATE TABLE IF NOT EXISTS rides.fare_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city TEXT NOT NULL,
  vehicle_type TEXT NOT NULL,
  base_fare_minor BIGINT NOT NULL CHECK (base_fare_minor >= 0),
  price_per_km_minor BIGINT NOT NULL CHECK (price_per_km_minor >= 0),
  price_per_min_minor BIGINT NOT NULL CHECK (price_per_min_minor >= 0),
  booking_fee_minor BIGINT NOT NULL DEFAULT 0 CHECK (booking_fee_minor >= 0),
  min_fare_minor BIGINT NOT NULL CHECK (min_fare_minor >= 0),
  currency TEXT NOT NULL DEFAULT 'JMD',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rides_fare_rules_city_vehicle_active
  ON rides.fare_rules (city, vehicle_type)
  WHERE is_active = TRUE;

DROP TRIGGER IF EXISTS update_rides_fare_rules_updated_at ON rides.fare_rules;
CREATE TRIGGER update_rides_fare_rules_updated_at
  BEFORE UPDATE ON rides.fare_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE rides.fare_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rides_fare_rules_read ON rides.fare_rules;
CREATE POLICY rides_fare_rules_read ON rides.fare_rules
  FOR SELECT TO authenticated
  USING (is_active = TRUE);

GRANT SELECT ON rides.fare_rules TO authenticated;
GRANT ALL ON rides.fare_rules TO service_role;

-- Seed Jamaica standard rates (minor units = cents)
INSERT INTO rides.fare_rules (
  city,
  vehicle_type,
  base_fare_minor,
  price_per_km_minor,
  price_per_min_minor,
  booking_fee_minor,
  min_fare_minor,
  currency
)
SELECT
  'jamaica',
  'standard',
  30000,
  12000,
  5000,
  5000,
  50000,
  'JMD'
WHERE NOT EXISTS (
  SELECT 1 FROM rides.fare_rules
  WHERE city = 'jamaica' AND vehicle_type = 'standard' AND is_active = TRUE
);

ALTER TABLE rides.ride_requests
  ADD COLUMN IF NOT EXISTS duration_estimate_minutes NUMERIC(14, 4),
  ADD COLUMN IF NOT EXISTS quote_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS fare_breakdown JSONB;
