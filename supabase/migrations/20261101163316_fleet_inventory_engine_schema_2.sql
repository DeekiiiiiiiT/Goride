checked_by text NOT NULL DEFAULT 'system'
);
CREATE INDEX IF NOT EXISTS inv_chain_check_org_checked_idx ON fleet.inv_chain_check (organization_id, checked_at DESC);

CREATE TABLE IF NOT EXISTS fleet.inv_cost_layer (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  item_id uuid NOT NULL REFERENCES fleet.inv_item (id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES fleet.inv_location (id) ON DELETE RESTRICT,
  ledger_id uuid NOT NULL REFERENCES fleet.inv_ledger (id) ON DELETE RESTRICT,
  qty_remaining numeric(14, 3) NOT NULL CHECK (qty_remaining >= 0),
  unit_cost numeric(14, 2) NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inv_cost_layer_fifo_idx
  ON fleet.inv_cost_layer (organization_id, item_id, location_id, received_at);

CREATE TABLE IF NOT EXISTS fleet.inv_balance (
  organization_id text NOT NULL,
  item_id uuid NOT NULL REFERENCES fleet.inv_item (id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES fleet.inv_location (id) ON DELETE RESTRICT,
  bin_id uuid,
  bin_key uuid GENERATED ALWAYS AS (
    COALESCE(bin_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) STORED,
  on_hand numeric(14, 3) NOT NULL DEFAULT 0,
  reserved numeric(14, 3) NOT NULL DEFAULT 0,
  value numeric(14, 2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, item_id, location_id, bin_key),
  CHECK (on_hand >= 0),
  CHECK (reserved >= 0),
  CHECK (reserved <= on_hand)
);

CREATE TABLE IF NOT EXISTS fleet.inv_reservation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  item_id uuid NOT NULL REFERENCES fleet.inv_item (id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES fleet.inv_location (id) ON DELETE RESTRICT,
  qty numeric(14, 3) NOT NULL CHECK (qty > 0),
  work_order_line_id uuid,
  requisition_id uuid,
  kit_issue_id uuid,
  status text NOT NULL DEFAULT 'held'
    CHECK (status IN ('held', 'released', 'consumed', 'expired')),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inv_reservation_org_status_idx ON fleet.inv_reservation (organization_id, status);

-- ---------------------------------------------------------------------------
-- Receiving & purchasing
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fleet.inv_receipt (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  ref_no text NOT NULL,
  po_id uuid,
  vendor_id uuid REFERENCES fleet.inv_vendor (id) ON DELETE SET NULL,
  location_id uuid NOT NULL REFERENCES fleet.inv_location (id) ON DELETE RESTRICT,
  received_on date NOT NULL DEFAULT CURRENT_DATE,
  logged_at timestamptz NOT NULL DEFAULT now(),
  batch_code text,
  customs_status text,
  dock_check_verified_at timestamptz,
  movement_id uuid REFERENCES fleet.inv_movement (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS inv_receipt_org_ref_uidx ON fleet.inv_receipt (organization_id, ref_no);

CREATE TABLE IF NOT EXISTS fleet.inv_purchase_order (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  number text NOT NULL,
  vendor_id uuid REFERENCES fleet.inv_vendor (id) ON DELETE SET NULL,
  ship_to_location_id uuid REFERENCES fleet.inv_location (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft', 'awaiting_approval', 'ordered', 'part_received', 'received',
      'staged', 'closed', 'cancelled'
    )),
  initiated_by uuid,
  ordered_at timestamptz,
  expected_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  payment_status text NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'settled')),
  expense_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS inv_po_org_number_uidx ON fleet.inv_purchase_order (organization_id, number);

CREATE TABLE IF NOT EXISTS fleet.inv_purchase_order_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  po_id uuid NOT NULL REFERENCES fleet.inv_purchase_order (id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES fleet.inv_item (id) ON DELETE RESTRICT,
  qty_ordered numeric(14, 3) NOT NULL CHECK (qty_ordered > 0),
  qty_received numeric(14, 3) NOT NULL DEFAULT 0 CHECK (qty_received >= 0),
  unit_price numeric(14, 2),
  landed_unit_cost numeric(14, 2)
);

CREATE TABLE IF NOT EXISTS fleet.inv_po_cost (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  po_id uuid NOT NULL REFERENCES fleet.inv_purchase_order (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('freight', 'duty', 'handling', 'courier')),
  label text,
  payee text,
  amount numeric(14, 2) NOT NULL CHECK (amount >= 0)
);

CREATE TABLE IF NOT EXISTS fleet.inv_requisition (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  ref_no text NOT NULL,
  requested_by uuid,
  for_vehicle_id text REFERENCES fleet.vehicles (id) ON DELETE SET NULL,
  for_user_id uuid,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'approved', 'issued', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS inv_requisition_org_ref_uidx ON fleet.inv_requisition (organization_id, ref_no);

CREATE TABLE IF NOT EXISTS fleet.inv_requisition_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  requisition_id uuid NOT NULL REFERENCES fleet.inv_requisition (id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES fleet.inv_item (id) ON DELETE RESTRICT,
  qty numeric(14, 3) NOT NULL CHECK (qty > 0)
);

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
  asset_id uuid NOT NULL REFERENCES fleet.inv_ass