-- Phase 4: prep station kind for bar/kitchen KDS routing
ALTER TABLE delivery.merchant_prep_stations
  ADD COLUMN IF NOT EXISTS kind text;

ALTER TABLE delivery.merchant_prep_stations
  DROP CONSTRAINT IF EXISTS merchant_prep_stations_kind_check;

ALTER TABLE delivery.merchant_prep_stations
  ADD CONSTRAINT merchant_prep_stations_kind_check
  CHECK (kind IS NULL OR kind IN ('kitchen', 'bar', 'other'));

UPDATE delivery.merchant_prep_stations
SET kind = 'bar'
WHERE kind IS NULL
  AND (
    id::text ILIKE '%bar%'
    OR id::text ILIKE '%drink%'
    OR id::text ILIKE '%beverage%'
    OR id::text ILIKE '%cocktail%'
    OR name ILIKE '%bar%'
    OR name ILIKE '%drink%'
    OR name ILIKE '%beverage%'
    OR name ILIKE '%cocktail%'
  );

COMMENT ON COLUMN delivery.merchant_prep_stations.kind IS
  'Station type for KDS routing: kitchen | bar | other';
