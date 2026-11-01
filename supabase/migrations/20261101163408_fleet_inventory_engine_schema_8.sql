
-- ---------------------------------------------------------------------------
-- Serialized assets
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fleet.inv_asset (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  asset_tag text NOT NULL,
  item_id uuid NOT NULL REFERENCES fleet.inv_item (id) ON DELETE RESTRICT,
  serial_number text,
  imei text,
  status text NOT NULL DEFAULT 'in_store'
    CHECK (status IN (
      'in_store', 'installed', 'in_repair', 'faulty', 'lost', 'retired', 'disposed'
    )),
  location_id uuid REFERENCES fleet.inv_location (id) ON DELETE SET NULL,
  bin_id uuid REFERENCES fleet.inv_bin (id) ON DELETE SET NULL,
  receipt_id uuid REFERENCES fleet.inv_receipt (id) ON DELETE SET NULL,
  purchase_cost numeric(14, 2),
  installed_at timestamptz,
  warranty_ends_on date,
  next_inspection_due date,
  insurance_policy_ref text,
  insurer_name text,
  provider text,
  external_device_id text,
  firmware_version text,
  last_heartbeat_at timestamptz,
  device_health text NOT NULL DEFAULT 'not_connected'
    CHECK (device_health IN ('not_connected', 'standby', 'online', 'offline')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS inv_asset_org_tag_uidx ON fleet.inv_asset (organization_id, asset_tag);
CREATE UNIQUE INDEX IF NOT EXISTS inv_asset_org_item_serial_uidx
  ON fleet.inv_asset (organization_id, item_id, serial_number)
  WHERE serial_number IS NOT NULL;

ALTER TABLE fleet.inv_ledger
  ADD CONSTRAINT inv_ledger_asset_fkey
  FOREIGN KEY (asset_id) REFERENCES fleet.inv_asset (id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS fleet.inv_asset_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  asset_id uuid REFERENCES fleet.inv_asset (id) ON DELETE CASCADE,
  vehicle_id text REFERENCES fleet.vehicles (id) ON DELETE SET NULL,
  kit_line_id uuid,
  type text NOT NULL,
  title text,
  body text,
  photo_paths text[] NOT NULL DEFAULT '{}'::text[],
  gps_lat double precision,
  gps_lng double precision,
  obd_snapshot jsonb,
  actor uuid,
  actor_role text,
  place text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fleet.inv_asset_diagnostic (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  asset_id uuid NOT NULL REFERENCES fleet.inv_asset (id) ON DELETE CASCADE,
  check_name text NOT NULL,
  value text,
  status text,
  observed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fleet.inv_document (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  file_path text NOT NULL,
  name text NOT NULL,
  size_bytes bigint,
  kind text,
  created_at timestamptz NOT NULL DEFAULT now()
);