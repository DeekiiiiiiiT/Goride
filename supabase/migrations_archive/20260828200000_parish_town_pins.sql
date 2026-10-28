-- Reference town/city pin locations per parish (ops geography — not customer delivery).

ALTER TABLE delivery.service_parishes
  ADD COLUMN IF NOT EXISTS town_pins jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS town_pins_updated_at timestamptz;

COMMENT ON COLUMN delivery.service_parishes.town_pins IS
  'Reference Point pins [{name,lat,lng,properties?}] imported from GeoJSON FeatureCollection.';
