-- Parish foundation can enforce delivery (outer gate or parish-only mode).

ALTER TABLE delivery.service_parishes
  ADD COLUMN IF NOT EXISTS coverage_mode text NOT NULL DEFAULT 'town_zones';

ALTER TABLE delivery.service_parishes
  DROP CONSTRAINT IF EXISTS service_parishes_coverage_mode_check;

ALTER TABLE delivery.service_parishes
  ADD CONSTRAINT service_parishes_coverage_mode_check
  CHECK (coverage_mode IN ('town_zones', 'parish_boundary'));

COMMENT ON COLUMN delivery.service_parishes.foundation_polygon IS
  'Parish outline (>=3 {lat,lng}). town_zones: outer gate on customer delivery. parish_boundary: replaces town borders for delivery.';

COMMENT ON COLUMN delivery.service_parishes.coverage_mode IS
  'town_zones = town published zones + optional parish outer gate. parish_boundary = parish foundation is the live delivery area (same-parish orders).';
