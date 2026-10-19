-- G5 / G7 data ops for fuel stop location resolution
-- Project: csfllzzastacofsvcdsc
-- Run manually (or via MCP). Alert-only health checks remain in fuel_stop_location_health_checks.sql.

-- G7: Delete CSV/unverified twins within 50 m of GOD (C3)
-- Maypen Main St (0 m) + Texaco / FIRST VENTURE twin (~4 m)
DELETE FROM fleet.stations
WHERE id IN (
  '106d057a-394d-4c02-b95f-d219e2e19ac8',
  'st_1eaad040'
)
AND payload_json->>'status' = 'unverified';

-- G5: GOD stations for recurring unknown statement names (pins are approximate — calibrate via Dominion Move pin)
INSERT INTO fleet.stations (id, organization_id, name, legacy_kv_id, payload_json)
VALUES
(
  'god-super-lube-service-centre',
  '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823',
  'Super Lube Service Centre',
  'station:god-super-lube-service-centre',
  jsonb_build_object(
    'id', 'god-super-lube-service-centre',
    'name', 'Super Lube Service Centre',
    'brand', 'Super Lube',
    'status', 'verified',
    'category', 'fuel',
    'address', 'Jamaica (pin pending calibration)',
    'country', 'Jamaica',
    'dataSource', 'seed_g5',
    'geofenceRadius', 100,
    'location', jsonb_build_object('lat', 18.0165, 'lng', -76.82),
    'organizationId', '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823'
  )
),
(
  'god-united-petroleum-lyndhurst',
  '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823',
  'United Petroleum Lyndhurst',
  'station:god-united-petroleum-lyndhurst',
  jsonb_build_object(
    'id', 'god-united-petroleum-lyndhurst',
    'name', 'United Petroleum Lyndhurst',
    'brand', 'United Petroleum',
    'status', 'verified',
    'category', 'fuel',
    'address', 'Lyndhurst Road, Kingston (pin pending calibration)',
    'country', 'Jamaica',
    'dataSource', 'seed_g5',
    'geofenceRadius', 100,
    'location', jsonb_build_object('lat', 18.0062, 'lng', -76.7888),
    'organizationId', '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823'
  )
)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    payload_json = fleet.stations.payload_json || EXCLUDED.payload_json,
    updated_at = now();

-- G5: Issuer aliases → new GOD stations
INSERT INTO public.station_merchant_aliases (
  organization_id, issuer, raw_name, normalized_name, station_id, source
) VALUES
(
  '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823',
  'jaa',
  'SUPER LUBE SERVICE CENTRE',
  'super lube service centre',
  'god-super-lube-service-centre',
  'seed'
),
(
  '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823',
  'jaa',
  'UNITED PETROLEUM JA LTD LYNDHURST',
  'united petroleum ja ltd lyndhurst',
  'god-united-petroleum-lyndhurst',
  'seed'
)
ON CONFLICT (organization_id, issuer, normalized_name) DO UPDATE
SET station_id = EXCLUDED.station_id,
    raw_name = EXCLUDED.raw_name,
    source = EXCLUDED.source;
