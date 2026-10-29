-- T3. Two stations 20 m apart. Rolls back. Run after the station register migration.
BEGIN;

DO $$
DECLARE
  parish_name text;
  dupe_a text[];
  dupe_b text[];
  mismatch boolean;
  no_brand boolean;
BEGIN
  SELECT b.name INTO parish_name
  FROM geo.boundaries b
  WHERE b.admin_level = 1 AND b.pcode = 'JM06';
  IF parish_name IS DISTINCT FROM 'Saint Andrew' THEN
    RAISE EXCEPTION 'JM06 should be Saint Andrew, got %', parish_name;
  END IF;

  INSERT INTO places.place (id, place_type, name, lat, lng, status, pin_state, pcode, parish, brand_id)
  VALUES
    ('station-check-a', 'gas_station', 'Check Station A', 18.01750, -76.79360, 'pending', 'unchecked', 'JM06', 'Kingston', null),
    ('station-check-b', 'gas_station', 'Check Station B', 18.01768, -76.79360, 'verified', 'unchecked', 'JM06', 'Saint Andrew', null);

  SELECT r.possible_duplicate_ids, r.parish_text_mismatch, r.brand_id IS NULL, r.parish_name
    INTO dupe_a, mismatch, no_brand, parish_name
  FROM places.station_list_row r
  WHERE r.id = 'station-check-a';

  IF NOT ('station-check-b' = ANY (dupe_a)) THEN
    RAISE EXCEPTION 'station A should flag station B as a possible duplicate';
  END IF;
  IF mismatch IS NOT TRUE THEN
    RAISE EXCEPTION 'Kingston text on JM06 should be a parish mismatch';
  END IF;
  IF no_brand IS NOT TRUE THEN
    RAISE EXCEPTION 'a station with no brand should be flagged';
  END IF;
  IF parish_name IS DISTINCT FROM 'Saint Andrew' THEN
    RAISE EXCEPTION 'parish name should come from the map, got %', parish_name;
  END IF;

  SELECT r.possible_duplicate_ids INTO dupe_b
  FROM places.station_list_row r
  WHERE r.id = 'station-check-b';
  IF NOT ('station-check-a' = ANY (dupe_b)) THEN
    RAISE EXCEPTION 'station B should flag station A as a possible duplicate';
  END IF;
END $$;

ROLLBACK;
