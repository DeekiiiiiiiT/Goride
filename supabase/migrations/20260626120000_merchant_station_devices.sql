-- Store tablet pairing: rotatable codes, enrolled devices, server-side staff flags

ALTER TABLE delivery.merchants
  ADD COLUMN IF NOT EXISTS kiosk_pairing_code text,
  ADD COLUMN IF NOT EXISTS kiosk_pairing_rotated_at timestamptz,
  ADD COLUMN IF NOT EXISTS staff_operations_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS staff_station_pin_enabled boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS merchants_kiosk_pairing_code_idx
  ON delivery.merchants (kiosk_pairing_code)
  WHERE kiosk_pairing_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS delivery.merchant_station_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES delivery.merchants(id) ON DELETE CASCADE,
  station text NOT NULL CHECK (station IN ('counter', 'kitchen', 'manager')),
  token_hash text NOT NULL,
  label text,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS merchant_station_devices_token_hash_idx
  ON delivery.merchant_station_devices (token_hash)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS merchant_station_devices_merchant_idx
  ON delivery.merchant_station_devices (merchant_id)
  WHERE revoked_at IS NULL;

ALTER TABLE delivery.merchant_station_devices ENABLE ROW LEVEL SECURITY;
