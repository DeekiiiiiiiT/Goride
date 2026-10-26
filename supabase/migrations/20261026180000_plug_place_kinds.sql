-- Eight road-convenience kinds. Do not relabel an EV row as something else.
DO $$
BEGIN
  IF to_regclass('places.place_capability') IS NULL THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM places.place_capability WHERE kind = 'ev_charging') THEN
    RAISE EXCEPTION 'ev_charging places exist; refusing to relabel them';
  END IF;
END $$;

UPDATE places.place_capability
SET kind = 'tyre_air'
WHERE kind IN ('air_pump', 'tyre');

DO $$
DECLARE
  conname text;
BEGIN
  IF to_regclass('places.place_capability') IS NULL THEN
    RETURN;
  END IF;
  FOR conname IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'places'
      AND t.relname = 'place_capability'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%kind%'
  LOOP
    EXECUTE format('ALTER TABLE places.place_capability DROP CONSTRAINT %I', conname);
  END LOOP;
END $$;

ALTER TABLE places.place_capability
  ADD CONSTRAINT place_capability_kind_check
  CHECK (kind IN ('mechanic', 'parts_store', 'fuel', 'tyre_air', 'car_wash', 'restroom', 'toll', 'roadside'));
