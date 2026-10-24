-- A station stays on the public map only while it is verified.
-- Un-verify, anomaly, learnt, or delete removes the public card.

CREATE OR REPLACE FUNCTION places.sync_public_station()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = places, fleet
AS $$
DECLARE
  row fleet.stations%ROWTYPE;
  st text;
  lat_text text;
  lng_text text;
  lat double precision;
  lng double precision;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM places.public_station WHERE id = OLD.id;
    RETURN OLD;
  END IF;

  row := NEW;
  st := COALESCE(row.payload_json->>'status', '');
  lat_text := COALESCE(row.payload_json #>> '{location,lat}', row.payload_json->>'lat', '');
  lng_text := COALESCE(row.payload_json #>> '{location,lng}', row.payload_json->>'lng', '');
  lat := CASE WHEN lat_text ~ '^-?[0-9]+(\.[0-9]+)?$' THEN lat_text::double precision ELSE NULL END;
  lng := CASE WHEN lng_text ~ '^-?[0-9]+(\.[0-9]+)?$' THEN lng_text::double precision ELSE NULL END;

  IF st = 'verified' AND lat IS NOT NULL AND lng IS NOT NULL THEN
    INSERT INTO places.public_station (id, name, brand, lat, lng, pcode, updated_at)
    VALUES (
      row.id,
      COALESCE(row.name, 'Station'),
      row.payload_json->>'brand',
      lat,
      lng,
      row.payload_json->>'pcode',
      now()
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      brand = EXCLUDED.brand,
      lat = EXCLUDED.lat,
      lng = EXCLUDED.lng,
      pcode = EXCLUDED.pcode,
      updated_at = now();
  ELSE
    DELETE FROM places.public_station WHERE id = row.id;
  END IF;
  RETURN row;
END;
$$;

DROP TRIGGER IF EXISTS sync_public_station ON fleet.stations;
CREATE TRIGGER sync_public_station
  AFTER INSERT OR UPDATE OR DELETE ON fleet.stations
  FOR EACH ROW EXECUTE FUNCTION places.sync_public_station();

DELETE FROM places.public_station pub
WHERE NOT EXISTS (
  SELECT 1
  FROM fleet.stations s
  WHERE s.id = pub.id
    AND COALESCE(s.payload_json->>'status', '') = 'verified'
    AND COALESCE(s.payload_json #>> '{location,lat}', s.payload_json->>'lat', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
    AND COALESCE(s.payload_json #>> '{location,lng}', s.payload_json->>'lng', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
);

REVOKE ALL ON FUNCTION places.sync_public_station() FROM PUBLIC, anon, authenticated;
