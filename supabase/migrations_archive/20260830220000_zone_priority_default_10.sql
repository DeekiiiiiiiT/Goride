-- PRIORITY-DEFAULT-1: align exclude-friendly default with scoped_exclusion_zones (10).
-- App paths already send priority 10; this protects raw SQL inserts from fail-open ties.
ALTER TABLE delivery.service_zone_polygons
  ALTER COLUMN priority SET DEFAULT 10;
