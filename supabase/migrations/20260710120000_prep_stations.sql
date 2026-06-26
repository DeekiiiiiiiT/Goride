-- Prep stations: kitchen zones (Grill, Fry, Cold, etc.) for KDS routing

CREATE TABLE IF NOT EXISTS delivery.merchant_prep_stations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES delivery.merchants(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_merchant_prep_stations_merchant
  ON delivery.merchant_prep_stations (merchant_id, sort_order);

ALTER TABLE delivery.menu_items
  ADD COLUMN IF NOT EXISTS prep_station_id uuid
    REFERENCES delivery.merchant_prep_stations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_menu_items_prep_station
  ON delivery.menu_items (merchant_id, prep_station_id)
  WHERE prep_station_id IS NOT NULL;

ALTER TABLE delivery.merchant_station_devices
  ADD COLUMN IF NOT EXISTS prep_station_id uuid
    REFERENCES delivery.merchant_prep_stations(id) ON DELETE SET NULL;

COMMENT ON TABLE delivery.merchant_prep_stations IS 'Kitchen prep zones for multi-line KDS routing';
COMMENT ON COLUMN delivery.menu_items.prep_station_id IS 'Optional prep station assignment for KDS item routing';
COMMENT ON COLUMN delivery.merchant_station_devices.prep_station_id IS 'Optional prep zone lock for kitchen tablets';
