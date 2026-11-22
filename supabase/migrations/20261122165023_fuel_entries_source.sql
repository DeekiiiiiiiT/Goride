-- D3 (F-14): provenance on fleet.fuel_entries — forward only (null = legacy).

ALTER TABLE fleet.fuel_entries
  ADD COLUMN IF NOT EXISTS source text;

ALTER TABLE fleet.fuel_entries
  DROP CONSTRAINT IF EXISTS fleet_fuel_entries_source_chk;

ALTER TABLE fleet.fuel_entries
  ADD CONSTRAINT fleet_fuel_entries_source_chk
  CHECK (
    source IS NULL
    OR source = ANY (
      ARRAY['scan', 'card_statement', 'platform', 'manual', 'telematics']::text[]
    )
  );

COMMENT ON COLUMN fleet.fuel_entries.source IS
  'Where km/litres came from: scan|card_statement|platform|manual|telematics. Null = written before F-14.';