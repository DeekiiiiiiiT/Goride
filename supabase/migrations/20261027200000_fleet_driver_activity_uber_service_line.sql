-- Uber app activity timeline import: allow service_line = 'uber' on projection table.

ALTER TABLE fleet.driver_activity_events
  DROP CONSTRAINT IF EXISTS driver_activity_events_service_line_check;

ALTER TABLE fleet.driver_activity_events
  ADD CONSTRAINT driver_activity_events_service_line_check
  CHECK (service_line IN ('roam_rides', 'roam_rush', 'fleet_ops', 'uber'));

COMMENT ON CONSTRAINT driver_activity_events_service_line_check ON fleet.driver_activity_events IS
  'roam_rides/roam_rush/fleet_ops = native; uber = Uber app activity timeline import';
