-- Public stations take their parish from the pin, not from a field stations do not store.
-- Dominion coverage is rebuilt from those rows and from other public places.

CREATE OR REPLACE FUNCTION places.refresh_coverage()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = places, public
AS $$
BEGIN
  DELETE FROM places.coverage_count;
  INSERT INTO places.coverage_count (pcode, kind, verified_count, pending_count)
  SELECT pcode, kind, SUM(verified_count)::integer, SUM(pending_count)::integer
  FROM (
    SELECT pcode, 'station'::text AS kind, COUNT(*)::integer AS verified_count, 0 AS pending_count
    FROM places.public_station
    WHERE pcode IS NOT NULL AND btrim(pcode) <> ''
    GROUP BY pcode
    UNION ALL
    SELECT pcode, kind, COUNT(*)::integer, 0
    FROM places.public_place
    WHERE pcode IS NOT NULL AND btrim(pcode) <> ''
    GROUP BY pcode, kind
    UNION ALL
    SELECT p.pcode, COALESCE(c.kind, 'mechanic'), 0, COUNT(*)::integer
    FROM places.place p
    LEFT JOIN LATERAL (
      SELECT cap.kind
      FROM places.place_capability cap
      WHERE cap.place_id = p.id
      LIMIT 1
    ) c ON true
    WHERE p.status = 'pending'
      AND p.pcode IS NOT NULL
      AND btrim(p.pcode) <> ''
    GROUP BY p.pcode, COALESCE(c.kind, 'mechanic')
  ) rows
  GROUP BY pcode, kind;
END;
$$;

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
    INSERT INTO places.public_station (id, name, brand, lat, lng, pcode, updated_at)
    VALUES (
      row.id,
      COALESCE(row.name, 'Station'),
      row.payload_json->>'brand',
      lat,
      lng,
      parish,
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
  PERFORM places.refresh_coverage();
  RETURN row;
END;
$$;

UPDATE places.public_station
SET pcode = places.parish_pcode(lat, lng),
    updated_at = now()
WHERE pcode IS NULL OR btrim(pcode) = '';

SELECT places.refresh_coverage();

REVOKE ALL ON FUNCTION places.sync_public_station() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION places.refresh_coverage() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION places.refresh_coverage() TO service_role;
