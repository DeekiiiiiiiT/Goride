-- Fleet vehicles: platform tags for Rideshare / Delivery tabs
ALTER TABLE fleet.vehicles
  ADD COLUMN IF NOT EXISTS service_lines text[] NOT NULL DEFAULT ARRAY['rideshare']::text[];

COMMENT ON COLUMN fleet.vehicles.service_lines IS
  'Platforms this vehicle serves: rideshare and/or rush_delivery. Empty not allowed; default rideshare.';

-- Backfill from payload_json when present
UPDATE fleet.vehicles
SET service_lines = (
  SELECT COALESCE(
    array_agg(DISTINCT x),
    ARRAY['rideshare']::text[]
  )
  FROM unnest(
    CASE
      WHEN jsonb_typeof(payload_json->'serviceLines') = 'array'
        THEN ARRAY(SELECT jsonb_array_elements_text(payload_json->'serviceLines'))
      WHEN jsonb_typeof(payload_json->'service_lines') = 'array'
        THEN ARRAY(SELECT jsonb_array_elements_text(payload_json->'service_lines'))
      ELSE ARRAY['rideshare']::text[]
    END
  ) AS x
  WHERE x IN ('rideshare', 'rush_delivery')
)
WHERE payload_json ? 'serviceLines'
   OR payload_json ? 'service_lines';
