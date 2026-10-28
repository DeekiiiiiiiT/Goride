-- F-26: typed distance/duration on fleet.trips for correct numeric sort (fixes R-04 lex sort)

ALTER TABLE fleet.trips
  ADD COLUMN IF NOT EXISTS distance numeric;

ALTER TABLE fleet.trips
  ADD COLUMN IF NOT EXISTS duration numeric;

-- Backfill from payload when values look numeric (prefer common aliases)
UPDATE fleet.trips
SET distance = COALESCE(
  distance,
  CASE WHEN payload_json->>'distance' ~ '^-?[0-9]+(\.[0-9]+)?$'
    THEN (payload_json->>'distance')::numeric END,
  CASE WHEN payload_json->>'distanceKm' ~ '^-?[0-9]+(\.[0-9]+)?$'
    THEN (payload_json->>'distanceKm')::numeric END,
  CASE WHEN payload_json->>'tripDistance' ~ '^-?[0-9]+(\.[0-9]+)?$'
    THEN (payload_json->>'tripDistance')::numeric END
)
WHERE distance IS NULL
  AND (
    payload_json->>'distance' ~ '^-?[0-9]+(\.[0-9]+)?$'
    OR payload_json->>'distanceKm' ~ '^-?[0-9]+(\.[0-9]+)?$'
    OR payload_json->>'tripDistance' ~ '^-?[0-9]+(\.[0-9]+)?$'
  );

UPDATE fleet.trips
SET duration = COALESCE(
  duration,
  CASE WHEN payload_json->>'duration' ~ '^-?[0-9]+(\.[0-9]+)?$'
    THEN (payload_json->>'duration')::numeric END,
  CASE WHEN payload_json->>'durationMinutes' ~ '^-?[0-9]+(\.[0-9]+)?$'
    THEN (payload_json->>'durationMinutes')::numeric END,
  CASE WHEN payload_json->>'tripDuration' ~ '^-?[0-9]+(\.[0-9]+)?$'
    THEN (payload_json->>'tripDuration')::numeric END
)
WHERE duration IS NULL
  AND (
    payload_json->>'duration' ~ '^-?[0-9]+(\.[0-9]+)?$'
    OR payload_json->>'durationMinutes' ~ '^-?[0-9]+(\.[0-9]+)?$'
    OR payload_json->>'tripDuration' ~ '^-?[0-9]+(\.[0-9]+)?$'
  );

COMMENT ON COLUMN fleet.trips.distance IS 'Trip distance (km); typed for ledger sort (F-26)';
COMMENT ON COLUMN fleet.trips.duration IS 'Trip duration (minutes); typed for ledger sort (F-26)';
