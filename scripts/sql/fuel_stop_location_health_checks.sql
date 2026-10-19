-- Fuel stop location resolution health checks (C1–C9).
-- Gates (0 rows when healthy): C1–C3, C5, C9. Reports (warn only): C4, C6–C8.
-- C4 gpsAlias drift is report-only until a dedicated alias cleanup (pre-existing).
-- Alert only — never auto-fix. Runner: scripts/check-fuel-stop-location-health.mjs
-- Project: csfllzzastacofsvcdsc

-- C1: Learnt locations within 1 km of a verified station (late logs that escaped near-miss)
WITH verified AS (
  SELECT id, name,
    (payload_json->'location'->>'lat')::float AS lat,
    (payload_json->'location'->>'lng')::float AS lng
  FROM fleet.stations
  WHERE payload_json->>'status' = 'verified'
    AND payload_json->'location'->>'lat' IS NOT NULL
),
learnt AS (
  SELECT id, name,
    (payload_json->'location'->>'lat')::float AS lat,
    (payload_json->'location'->>'lng')::float AS lng
  FROM fleet.stations
  WHERE payload_json->>'status' = 'learnt'
    AND payload_json->'location'->>'lat' IS NOT NULL
)
SELECT l.id AS learnt_id, l.name AS learnt_name, v.id AS station_id, v.name AS station_name,
  (6371000 * 2 * asin(sqrt(
    power(sin(radians(l.lat - v.lat) / 2), 2) +
    cos(radians(v.lat)) * cos(radians(l.lat)) * power(sin(radians(l.lng - v.lng) / 2), 2)
  ))) AS distance_m
FROM learnt l
JOIN verified v ON true
WHERE (6371000 * 2 * asin(sqrt(
    power(sin(radians(l.lat - v.lat) / 2), 2) +
    cos(radians(v.lat)) * cos(radians(l.lat)) * power(sin(radians(l.lng - v.lng) / 2), 2)
  ))) <= 1000
ORDER BY distance_m
LIMIT 50;

-- C2: Approved JAA rows with no station, >3 days after import, by jaaStation
-- Exclude Dominion hand-review holds (Rev 6 suspicious pairs — resolve in queue, not auto-heal)
SELECT
  payload_json->'metadata'->>'jaaStation' AS jaa_station,
  count(*) AS rows
FROM fleet.fuel_entries
WHERE payload_json->'metadata'->>'jaaStation' IS NOT NULL
  AND (payload_json->'metadata'->>'matchedStationId') IS NULL
  AND (payload_json->>'type' ILIKE '%card%' OR payload_json->'metadata'->>'importSource' = 'jaa_raw')
  AND created_at < now() - interval '3 days'
  AND coalesce(payload_json->'metadata'->'handReview'->>'reason', '') = ''
GROUP BY 1
ORDER BY rows DESC;

-- C3: Verified stations with an unverified CSV row within 50 m
WITH verified AS (
  SELECT id, name,
    (payload_json->'location'->>'lat')::float AS lat,
    (payload_json->'location'->>'lng')::float AS lng
  FROM fleet.stations
  WHERE payload_json->>'status' = 'verified'
),
unverified AS (
  SELECT id, name,
    (payload_json->'location'->>'lat')::float AS lat,
    (payload_json->'location'->>'lng')::float AS lng
  FROM fleet.stations
  WHERE payload_json->>'status' = 'unverified'
)
SELECT v.id AS god_id, v.name AS god_name, u.id AS csv_id, u.name AS csv_name,
  (6371000 * 2 * asin(sqrt(
    power(sin(radians(u.lat - v.lat) / 2), 2) +
    cos(radians(v.lat)) * cos(radians(u.lat)) * power(sin(radians(u.lng - v.lng) / 2), 2)
  ))) AS distance_m
FROM verified v
JOIN unverified u ON v.lat IS NOT NULL AND u.lat IS NOT NULL
WHERE (6371000 * 2 * asin(sqrt(
    power(sin(radians(u.lat - v.lat) / 2), 2) +
    cos(radians(v.lat)) * cos(radians(u.lat)) * power(sin(radians(u.lng - v.lng) / 2), 2)
  ))) <= 50
ORDER BY distance_m;

-- C4: gpsAliases more than 150 m from their station pin
SELECT s.id, s.name, alias
FROM fleet.stations s,
  LATERAL jsonb_array_elements(COALESCE(s.payload_json->'gpsAliases', '[]'::jsonb)) AS alias
WHERE s.payload_json->>'status' = 'verified'
  AND (alias->>'lat') IS NOT NULL
  AND (6371000 * 2 * asin(sqrt(
    power(sin(radians((alias->>'lat')::float - (s.payload_json->'location'->>'lat')::float) / 2), 2) +
    cos(radians((s.payload_json->'location'->>'lat')::float)) *
    cos(radians((alias->>'lat')::float)) *
    power(sin(radians((alias->>'lng')::float - (s.payload_json->'location'->>'lng')::float) / 2), 2)
  ))) > 150;

-- C5: GPS/provisional station ≠ statement-alias station on linked pair
-- Also: linked pairs where statement jaaStation is fuzzy-similar (≥0.88) to a *different*
-- verified station name than matchedStationId (pg_trgm; Rev 6 G5/G7 guard).
SELECT fe.id,
  fe.payload_json->'metadata'->>'matchedStationId' AS gps_station,
  fe.payload_json->'metadata'->>'statementMismatchStationId' AS statement_station,
  fe.payload_json->'metadata'->>'statementMismatchMerchant' AS merchant,
  fe.payload_json->>'jaaStation' AS jaa_station,
  alt.id AS fuzzy_alt_station_id,
  alt.name AS fuzzy_alt_station_name,
  similarity(
    lower(trim(coalesce(fe.payload_json->>'jaaStation', ''))),
    lower(trim(coalesce(alt.name, '')))
  ) AS fuzzy_score
FROM fleet.fuel_entries fe
LEFT JOIN LATERAL (
  SELECT s.id, s.name
  FROM fleet.stations s
  WHERE s.id IS DISTINCT FROM (fe.payload_json->'metadata'->>'matchedStationId')
    AND coalesce(s.name, '') <> ''
    AND coalesce(fe.payload_json->>'jaaStation', '') <> ''
    AND similarity(
      lower(trim(fe.payload_json->>'jaaStation')),
      lower(trim(s.name))
    ) >= 0.88
  ORDER BY similarity(
    lower(trim(fe.payload_json->>'jaaStation')),
    lower(trim(s.name))
  ) DESC
  LIMIT 1
) alt ON true
WHERE fe.payload_json->'metadata'->>'statementMismatchStationId' IS NOT NULL
   OR (fe.payload_json->'metadata'->'stationResolution'->>'reason') = 'STATEMENT_MISMATCH'
   OR (
     fe.payload_json->'metadata'->>'peerFuelEntryId' IS NOT NULL
     AND fe.payload_json->'metadata'->>'matchedStationId' IS NOT NULL
     AND alt.id IS NOT NULL
   );

-- C6: Per driver, last 30 days: % of fills that were LATE_LOG
SELECT
  driver_id,
  count(*) AS fills,
  count(*) FILTER (
    WHERE payload_json->'metadata'->'stationResolution'->>'reason' = 'LATE_LOG'
       OR payload_json->'metadata'->>'locationStatus' = 'provisional'
  ) AS late_logs,
  round(
    100.0 * count(*) FILTER (
      WHERE payload_json->'metadata'->'stationResolution'->>'reason' = 'LATE_LOG'
         OR payload_json->'metadata'->>'locationStatus' = 'provisional'
    ) / NULLIF(count(*), 0),
    1
  ) AS late_log_pct
FROM fleet.fuel_entries
WHERE date >= (current_date - 30)
  AND driver_id IS NOT NULL
GROUP BY driver_id
ORDER BY late_log_pct DESC NULLS LAST;

-- C7: Per verified station: median GPS-verified fill distance from pin (flag if > 40 m)
-- (Approximation via entry matchDistance when verificationMethod = gps_handshake)
SELECT
  payload_json->'metadata'->>'matchedStationId' AS station_id,
  percentile_cont(0.5) WITHIN GROUP (
    ORDER BY (payload_json->'metadata'->>'matchDistance')::float
  ) AS median_distance_m,
  count(*) AS gps_verified_fills
FROM fleet.fuel_entries
WHERE payload_json->'metadata'->>'verificationMethod' = 'gps_handshake'
  AND payload_json->'metadata'->>'matchDistance' IS NOT NULL
GROUP BY 1
HAVING count(*) >= 10
   AND percentile_cont(0.5) WITHIN GROUP (
     ORDER BY (payload_json->'metadata'->>'matchDistance')::float
   ) > 40
ORDER BY median_distance_m DESC;

-- C8: Per verified station: 90th-percentile distance vs geofenceRadius
SELECT
  s.id,
  s.name,
  (s.payload_json->>'geofenceRadius')::float AS radius_m,
  percentile_cont(0.9) WITHIN GROUP (
    ORDER BY (e.payload_json->'metadata'->>'matchDistance')::float
  ) AS p90_distance_m
FROM fleet.stations s
JOIN fleet.fuel_entries e
  ON e.payload_json->'metadata'->>'matchedStationId' = s.id
 AND e.payload_json->'metadata'->>'verificationMethod' = 'gps_handshake'
WHERE s.payload_json->>'status' = 'verified'
GROUP BY s.id, s.name, s.payload_json->>'geofenceRadius'
HAVING count(*) >= 10;

-- C9: Provisional fills older than 7 days (stuck soft matches)
SELECT
  id,
  payload_json->>'vendor' AS vendor,
  payload_json->'metadata'->>'matchedStationId' AS station_id,
  payload_json->'metadata'->'stationResolution'->>'reason' AS reason,
  created_at
FROM fleet.fuel_entries
WHERE payload_json->'metadata'->>'locationStatus' = 'provisional'
  AND created_at < now() - interval '7 days'
ORDER BY created_at
LIMIT 50;
