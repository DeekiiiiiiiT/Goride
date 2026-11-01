CREATE OR REPLACE VIEW fleet.vehicle_current_odometer_v AS
SELECT DISTINCT ON (r.vehicle_id)
  r.vehicle_id,
  r.organization_id,
  r.reading,
  r.recorded_at,
  r.source,
  r.reading_date
FROM fleet.odometer_readings r
WHERE r.is_voided = false
  AND r.is_anomaly = false
  AND r.reading > 0
ORDER BY r.vehicle_id, r.recorded_at DESC, r.reading DESC;

COMMENT ON VIEW fleet.vehicle_current_odometer_v IS
  'Latest trusted odometer per vehicle (not max ever).';
