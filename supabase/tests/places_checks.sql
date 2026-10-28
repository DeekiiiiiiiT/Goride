-- Places search and public projection. Rolls back. Run after migrations, not on its own.
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM places.place_type t
    LEFT JOIN places.category c ON c.code = t.category_code
    WHERE c.code IS NULL
  ) THEN
    RAISE EXCEPTION 'a place type has no category';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM places.facility_type f
    LEFT JOIN places.category c ON c.code = f.category_code
    WHERE c.code IS NULL
  ) THEN
    RAISE EXCEPTION 'a facility type has no category';
  END IF;
END $$;

INSERT INTO places.place (id, place_type, name, lat, lng, status, pin_state, pcode)
VALUES
  ('places-check-pending', 'gas_station', 'Pending check', 18.01, -76.80, 'pending', 'unchecked', 'JMTEST'),
  ('places-check-offset', 'gas_station', 'Offset check', 18.02, -76.81, 'verified', 'offset', 'JMTEST'),
  ('places-check-near', 'gas_station', 'Near check', 18.0179, -76.8099, 'verified', 'confirmed', 'JMTEST'),
  ('places-check-far', 'gas_station', 'Far check', 18.05, -76.85, 'verified', 'confirmed', 'JMTEST'),
  ('places-check-restroom', 'public_restroom', 'Restroom place', 18.0185, -76.8105, 'verified', 'confirmed', 'JMTEST');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM places.public_place
    WHERE id IN ('places-check-pending', 'places-check-offset')
  ) THEN
    RAISE EXCEPTION 'a pending or offset place is public';
  END IF;
END $$;

INSERT INTO places.place_facility (place_id, facility_type) VALUES
  ('places-check-near', 'restroom'),
  ('places-check-far', 'restroom');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM places.public_place
    WHERE id = 'places-check-near' AND 'restroom' = ANY (facility_types)
  ) THEN
    RAISE EXCEPTION 'adding a facility did not update facility_types';
  END IF;
END $$;

DELETE FROM places.place_facility
WHERE place_id = 'places-check-near' AND facility_type = 'restroom';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM places.public_place
    WHERE id = 'places-check-near' AND 'restroom' = ANY (facility_types)
  ) THEN
    RAISE EXCEPTION 'removing a facility left it on facility_types';
  END IF;
END $$;

INSERT INTO places.place_facility (place_id, facility_type)
VALUES ('places-check-near', 'restroom');

DO $$
DECLARE
  rec record;
  seen int := 0;
  saw_far boolean := false;
  saw_restroom boolean := false;
  prev double precision := null;
BEGIN
  FOR rec IN
    SELECT * FROM places.search_facility('restroom', 18.0179, -76.8099, 50000)
  LOOP
    seen := seen + 1;
    IF seen = 1 AND rec.place_id IS DISTINCT FROM 'places-check-near' THEN
      RAISE EXCEPTION 'nearest restroom was %, expected the attached station', rec.place_id;
    END IF;
    IF prev IS NOT NULL AND rec.distance_m < prev THEN
      RAISE EXCEPTION 'search_facility is not ordered by distance';
    END IF;
    prev := rec.distance_m;
    IF rec.place_id = 'places-check-far' THEN saw_far := true; END IF;
    IF rec.place_id = 'places-check-restroom' THEN saw_restroom := true; END IF;
    IF rec.place_id IN ('places-check-pending', 'places-check-offset') THEN
      RAISE EXCEPTION 'search returned a place that is not public';
    END IF;
  END LOOP;

  IF seen = 0 THEN
    RAISE EXCEPTION 'search_facility returned nothing';
  END IF;
  IF NOT saw_far THEN
    RAISE EXCEPTION 'the farther attached restroom is missing';
  END IF;
  IF NOT saw_restroom THEN
    RAISE EXCEPTION 'a search_as_facility place is missing';
  END IF;
END $$;

ROLLBACK;
