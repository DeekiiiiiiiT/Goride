-- Perf audit Wave 0: rebuild fare-rules city fallback index (dropped in 20260518100000)

CREATE INDEX IF NOT EXISTS idx_rides_fare_rules_city_vehicle_active
  ON rides.fare_rules (city, vehicle_type)
  WHERE is_active = true;
