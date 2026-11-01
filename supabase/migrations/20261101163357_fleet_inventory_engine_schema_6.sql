
-- ---------------------------------------------------------------------------
-- Ledger & balances
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fleet.inv_movement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  ref_no text NOT NULL,
  batch_no text,
  type text NOT NULL,
  reference_type text,
  reference_id uuid,
  reason text,
  memo text,
  reverses_movement_id uuid REFERENCES fleet.inv_movement (id) ON DELETE SET NULL,
  approval_id uuid,
  idempotency_key text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS inv_movement_org_ref_uidx ON fleet.inv_movement (organization_id, ref_no);
CREATE UNIQUE INDEX IF NOT EXISTS inv_movement_org_idempotency_uidx
  ON fleet.inv_movement (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS inv_movement_org_created_idx ON fleet.inv_movement (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS fleet.inv_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  movement_id uuid NOT NULL REFERENCES fleet.inv_movement (id) ON DELETE RESTRICT,
  item_id uuid NOT NULL REFERENCES fleet.inv_item (id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES fleet.inv_location (id) ON DELETE RESTRICT,
  bin_id uuid REFERENCES fleet.inv_bin (id) ON DELETE SET NULL,
  asset_id uuid,
  qty_delta numeric(14, 3) NOT NULL CHECK (qty_delta <> 0),
  unit_cost numeric(14, 2),
  currency text NOT NULL DEFAULT 'JMD',
  block_no bigint NOT NULL,
  prev_hash text NOT NULL,
  row_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS inv_ledger_org_block_uidx ON fleet.inv_ledger (organization_id, block_no);
CREATE INDEX IF NOT EXISTS inv_ledger_org_item_idx ON fleet.inv_ledger (organization_id, item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS inv_ledger_movement_idx ON fleet.inv_ledger (movement_id);

CREATE TABLE IF NOT EXISTS fleet.inv_chain_check (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT now(),
  entries bigint NOT NULL DEFAULT 0,
  head_block bigint,
  head_hash text,
  ok boolean NOT NULL,
  broken_at_block bigint,
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