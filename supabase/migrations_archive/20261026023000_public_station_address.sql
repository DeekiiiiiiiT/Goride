-- Public stations carry the street address already stored on the fleet station.
-- A blank address stays blank. The app hides the line instead of inventing one.

ALTER TABLE places.public_station
  ADD COLUMN IF NOT EXISTS address text;

CREATE OR REPLACE FUNCTION places.sync_public_station()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = places, fleet, geo, extensions, public
AS $$
DECLARE
  row fleet.stations%ROWTYPE;
  st text;
  lat_text text;
  lng_text text;
  lat double precision;
  lng double precision;
  parish text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM places.public_station WHERE id = OLD.id;
    PERFORM places.refresh_coverage();
    RETURN OLD;
  END IF;

  row := NEW;
  st := COALESCE(row.payload_json->>'status', '');
  lat_text := COALESCE(row.payload_json #>> '{location,lat}', row.payload_json->>'lat', '');
  lng_text := COALESCE(row.payload_json #>> '{location,lng}', row.payload_json->>'lng', '');
  lat := CASE WHEN lat_text ~ '^-?[0-9]+(\.[0-9]+)?$' THEN lat_text::double precision ELSE NULL END;
  lng := CASE WHEN lng_text ~ '^-?[0-9]+(\.[0-9]+)?$' THEN lng_text::double precision ELSE NULL END;

  IF st = 'verified' AND lat IS NOT NULL AND lng IS NOT NULL THEN
    parish := places.parish_pcode(lat, lng);
    INSERT INTO places.public_station (id, name, brand, address, lat, lng, pcode, updated_at)
    VALUES (
      row.id,
      COALESCE(row.name, 'Station'),
      NULLIF(btrim(row.payload_json->>'brand'), ''),
      NULLIF(btrim(row.payload_json->>'address'), ''),
      lat,
      lng,
      parish,
      now()
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      brand = EXCLUDED.brand,
      address = EXCLUDED.address,
      lat = EXCLUDED.lat,
      lng = EXCLUDED.lng,
      pcode = EXCLUDED.pcode,
      updated_at = now();
  ELSE
    DELETE FROM places.public_station WHERE id = row.id;
  END IF;
  PERFORM places.refresh_coverage();
  RETURN row;
END;
$$;

UPDATE places.public_station pub
SET address = NULLIF(btrim(st.payload_json->>'address'), ''),
    updated_at = now()
FROM fleet.stations st
WHERE st.id = pub.id
  AND NULLIF(btrim(st.payload_json->>'address'), '') IS NOT NULL;

REVOKE ALL ON FUNCTION places.sync_public_station() FROM PUBLIC, anon, authenticated;
