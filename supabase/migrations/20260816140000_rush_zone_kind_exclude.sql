-- Rush coverage zones: include vs exclude kind for precision carve-outs.

ALTER TABLE delivery.service_zone_polygons
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'include';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'service_zone_polygons_kind_check'
  ) THEN
    ALTER TABLE delivery.service_zone_polygons
      ADD CONSTRAINT service_zone_polygons_kind_check
      CHECK (kind IN ('include', 'exclude'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_service_zone_polygons_market_kind
  ON delivery.service_zone_polygons(market_id, kind);

COMMENT ON COLUMN delivery.service_zone_polygons.kind IS
  'include = serviceable area; exclude = carve-out (exclude wins over include).';
