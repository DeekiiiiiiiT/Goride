-- Stamp where a station came from, and show that on the Station Database.
-- The public view is rebuilt so the new column is visible to the service role.

CREATE OR REPLACE FUNCTION fleet.stamp_station_origin_app()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  from_payload text := COALESCE(NEW.payload_json->>'originApp', NEW.payload_json->>'origin_app', '');
  stamped text;
BEGIN
  IF from_payload IN ('roam_fleet', 'roam_plug', 'manual') THEN
    stamped := from_payload;
  ELSIF NEW.origin_app IN ('roam_fleet', 'roam_plug') THEN
    stamped := NEW.origin_app;
  ELSIF COALESCE(NEW.payload_json->>'dataSource', '') = 'import' THEN
    stamped := 'manual';
  ELSIF COALESCE(NEW.payload_json->>'dataSource', '') = 'log'
     OR COALESCE(NEW.legacy_kv_id, '') LIKE 'learnt_location:%' THEN
    stamped := 'roam_fleet';
  ELSIF COALESCE(NEW.legacy_kv_id, '') LIKE 'plug:%' THEN
    stamped := 'roam_plug';
  ELSE
    stamped := 'manual';
  END IF;

  NEW.origin_app := stamped;

  IF COALESCE(NEW.payload_json->>'originApp', '') IS DISTINCT FROM NEW.origin_app THEN
    NEW.payload_json := jsonb_set(
      COALESCE(NEW.payload_json, '{}'::jsonb),
      '{originApp}',
      to_jsonb(NEW.origin_app),
      true
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stamp_station_origin_app ON fleet.stations;
CREATE TRIGGER stamp_station_origin_app
  BEFORE INSERT OR UPDATE ON fleet.stations
  FOR EACH ROW EXECUTE FUNCTION fleet.stamp_station_origin_app();

REVOKE ALL ON FUNCTION fleet.stamp_station_origin_app() FROM PUBLIC, anon, authenticated;

WITH fills AS (
  SELECT
    COALESCE(
      NULLIF(payload_json->>'matchedStationId', ''),
      NULLIF(payload_json->'metadata'->>'learntLocationId', '')
    ) AS station_id,
    created_at,
    'roam_fleet'::text AS origin
  FROM fleet.fuel_entries
  UNION ALL
  SELECT station_id, created_at, 'roam_plug'::text
  FROM explorer.fuel_log
  WHERE station_id IS NOT NULL
),
earliest AS (
  SELECT DISTINCT ON (station_id) station_id, origin
  FROM fills
  WHERE station_id IS NOT NULL
  ORDER BY station_id, created_at ASC
)
UPDATE fleet.stations s
SET origin_app = e.origin,
    payload_json = jsonb_set(COALESCE(s.payload_json, '{}'::jsonb), '{originApp}', to_jsonb(e.origin), true)
FROM earliest e
WHERE s.id = e.station_id
  AND s.origin_app = 'manual';

UPDATE fleet.stations
SET origin_app = 'roam_plug',
    payload_json = jsonb_set(COALESCE(payload_json, '{}'::jsonb), '{originApp}', '"roam_plug"'::jsonb, true)
WHERE origin_app = 'manual'
  AND legacy_kv_id LIKE 'plug:%';

UPDATE fleet.stations
SET origin_app = 'roam_fleet',
    payload_json = jsonb_set(COALESCE(payload_json, '{}'::jsonb), '{originApp}', '"roam_fleet"'::jsonb, true)
WHERE origin_app = 'manual'
  AND legacy_kv_id LIKE 'learnt_location:%';

UPDATE fleet.stations
SET payload_json = jsonb_set(
  COALESCE(payload_json, '{}'::jsonb),
  '{originApp}',
  to_jsonb(origin_app),
  true
)
WHERE origin_app IN ('roam_fleet', 'roam_plug')
  AND COALESCE(payload_json->>'originApp', '') IS DISTINCT FROM origin_app;

UPDATE public.kv_store_37f42386 kv
SET value = jsonb_set(COALESCE(kv.value, '{}'::jsonb), '{originApp}', to_jsonb(s.origin_app), true)
FROM fleet.stations s
WHERE kv.key = s.legacy_kv_id
  AND s.origin_app IN ('roam_fleet', 'roam_plug')
  AND COALESCE(kv.value->>'originApp', '') IS DISTINCT FROM s.origin_app;

UPDATE public.kv_store_37f42386
SET value = jsonb_set(COALESCE(value, '{}'::jsonb), '{originApp}', '"roam_fleet"'::jsonb, true)
WHERE key LIKE 'learnt_location:%'
  AND COALESCE(value->>'originApp', '') = '';

CREATE OR REPLACE VIEW public.fleet_stations
WITH (security_invoker = true) AS
  SELECT * FROM fleet.stations;

GRANT SELECT ON public.fleet_stations TO authenticated;
GRANT ALL ON public.fleet_stations TO service_role;

NOTIFY pgrst, 'reload schema';
