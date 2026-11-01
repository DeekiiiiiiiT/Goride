-- Fleet inventory engine (Phase 1): typed fleet.inv_* tables, hash-chained ledger, RLS, storage, org_part_stock compat view.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- Settings & master data
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fleet.inv_settings (
  organization_id text PRIMARY KEY,
  fleet_support_phone text,
  safety_notice_text text,
  monthly_procurement_cap_jmd numeric(14, 2),
  fiscal_year_start_month smallint NOT NULL DEFAULT 4
    CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
  approval_threshold_jmd numeric(14, 2) NOT NULL DEFAULT 20000,
  approval_rule_code text,
  approval_rule_name text,
  write_off_rule_code text,
  scrap_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fleet.inv_category (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  parent_id uuid REFERENCES fleet.inv_category (id) ON DELETE SET NULL,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inv_category_org_idx ON fleet.inv_category (organization_id, sort_order);

CREATE TABLE IF NOT EXISTS fleet.inv_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  sku text NOT NULL,
  short_code text,
  name text NOT NULL,
  description text,
  model text,
  category_id uuid REFERENCES fleet.inv_category (id) ON DELETE SET NULL,
  tracking text NOT NULL DEFAULT 'quantity'
    CHECK (tracking IN ('quantity', 'serial')),
  uom text NOT NULL DEFAULT 'ea',
  part_master_id uuid REFERENCES public.part_master (id) ON DELETE SET NULL,
  universal_part_id uuid,
  default_vendor_id uuid,
  default_unit_cost numeric(14, 2),
  warranty_months integer,
  warranty_type text,
  inspection_interval_days integer,
  inspection_kind text,
  specs jsonb NOT NULL DEFAULT '{}'::jsonb,
  icon text,
  photo_path text,
  lifecycle text,
  superseded_by_item_id uuid REFERENCES fleet.inv_item (id) ON DELETE SET NULL,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inv_item_one_catalog_target CHECK (
    NOT (part_master_id IS NOT NULL AND universal_part_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS inv_item_org_sku_uidx ON fleet.inv_item (organization_id, lower(sku));
CREATE INDEX IF NOT EXISTS inv_item_org_part_idx ON fleet.inv_item (organization_id, part_master_id)
  WHERE part_master_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS inv_item_org_universal_idx ON fleet.inv_item (organization_id, universal_part_id)
  WHERE universal_part_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS fleet.inv_location (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('warehouse', 'vehicle', 'person', 'virtual')),
  region_code text,
  vehicle_id text REFERENCES fleet.vehicles (id) ON DELETE SET NULL,
  user_id uuid,
  address text,
  lat double precision,
  lng double precision,
  photo_path text,
  is_default boolean NOT NULL DEFAULT false,
  is_secure boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS inv_location_org_code_uidx ON fleet.inv_location (organization_id, lower(code));

CREATE TABLE IF NOT EXISTS fleet.inv_bin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  location_id uuid NOT NULL REFERENCES fleet.inv_location (id) ON DELETE CASCADE,
  code text NOT NULL,
  zone text,
  capacity_units numeric(14, 3),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS inv_bin_location_code_uidx ON fleet.inv_bin (location_id, lower(code));

CREATE TABLE IF NOT EXISTS fleet.inv_vendor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  name text NOT NULL,
  phone text,
  description text,
  tags text[] NOT NULL DEFAULT '{}'::text[],
  dominion_supplier_id uuid REFERENCES public.supplier (id) ON DELETE SET NULL,
  lead_time_days integer,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inv_vendor_org_idx ON fleet.inv_vendor (organization_id, is_active);

CREATE TABLE IF NOT EXISTS fleet.inv_reorder_policy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  item_id uuid NOT NULL REFERENCES fleet.inv_item (id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES fleet.inv_location (id) ON DELETE CASCADE,
  reorder_point numeric(14, 3) NOT NULL DEFAULT 0,
  reorder_qty numeric(14, 3) NOT NULL DEFAULT 0,
  safety_stock numeric(14, 3) NOT NULL DEFAULT 0,
  preferred_vendor_id uuid REFERENCES fleet.inv_vendor (id) ON DELETE SET NULL,
  computed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, item_id, location_id)
);

CREATE TABLE IF NOT EXISTS fleet.inv_scan_device (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('rfid_gate', 'handheld', 'usb', 'phone')),
  location_id uuid REFERENCES fleet.inv_location (id) ON DELETE SET NULL,
  pairing_code text,
  paired_at timestamptz,
  last_seen_at timestamptz,
  reads_ok bigint NOT NULL DEFAULT 0,
  reads_total bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

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

-- ---------------------------------------------------------------------------
-- Kits
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fleet.kit_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  classification text CHECK (classification IN ('rideshare', 'delivery', 'executive')),
  applies_text text,
  body_type text,
  compliance_badge text,
  compliance_text text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS kit_template_org_code_uidx ON fleet.kit_template (organization_id, lower(code));

CREATE TABLE IF NOT EXISTS fleet.kit_template_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  template_id uuid NOT NULL REFERENCES fleet.kit_template (id) ON DELETE CASCADE,
  version integer NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_sync', 'production', 'archived')),
  change_note text,
  author uuid,
  revision_hash text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, version)
);

CREATE TABLE IF NOT EXISTS fleet.kit_template_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  version_id uuid NOT NULL REFERENCES fleet.kit_template_version (id) ON DELETE CASCADE,
  line_type text NOT NULL DEFAULT 'item'
    CHECK (line_type IN ('item', 'linked_toll_tag', 'linked_fuel_card')),
  item_id uuid REFERENCES fleet.inv_item (id) ON DELETE SET NULL,
  qty_required numeric(14, 3) NOT NULL DEFAULT 1 CHECK (qty_required > 0),
  required boolean NOT NULL DEFAULT true,
  blocks_road_clearance boolean NOT NULL DEFAULT false,
  install_position text,
  variant_note text,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS fleet.vehicle_kit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  vehicle_id text NOT NULL REFERENCES fleet.vehicles (id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES fleet.kit_template (id) ON DELETE RESTRICT,
  version_id uuid NOT NULL REFERENCES fleet.kit_template_version (id) ON DELETE RESTRICT,
  home_location_id uuid REFERENCES fleet.inv_location (id) ON DELETE SET NULL,
  verification_status text NOT NULL DEFAULT 'pending_verification'
    CHECK (verification_status IN ('verified', 'pending_verification')),
  last_inspected_at timestamptz,
  last_inspected_by uuid,
  overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, vehicle_id)
);

CREATE TABLE IF NOT EXISTS fleet.inv_kit_compliance_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  snapshot_date date NOT NULL,
  vehicles integer NOT NULL DEFAULT 0,
  vehicles_complete integer NOT NULL DEFAULT 0,
  lines_required integer NOT NULL DEFAULT 0,
  lines_present integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, snapshot_date)
);

-- ---------------------------------------------------------------------------
-- Counts, alerts, approvals, audit
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fleet.inv_count_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  code text NOT NULL,
  location_id uuid NOT NULL REFERENCES fleet.inv_location (id) ON DELETE RESTRICT,
  bins uuid[] NOT NULL DEFAULT '{}'::uuid[],
  blind boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'submitted', 'under_audit', 'reconciled', 'closed')),
  submitted_by uuid,
  submitted_role text,
  clerk_id text,
  device_terminal text,
  submitted_at timestamptz,
  approved_by uuid,
  audit_hash text,
  movement_id uuid REFERENCES fleet.inv_movement (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS inv_count_session_org_code_uidx ON fleet.inv_count_session (organization_id, code);

CREATE TABLE IF NOT EXISTS fleet.inv_count_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  session_id uuid NOT NULL REFERENCES fleet.inv_count_session (id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES fleet.inv_item (id) ON DELETE RESTRICT,
  bin_id uuid REFERENCES fleet.inv_bin (id) ON DELETE SET NULL,
  expected_qty numeric(14, 3),
  counted_qty numeric(14, 3),
  reason text CHECK (reason IS NULL OR reason IN ('lost', 'found', 'damaged', 'miscounted')),
  unit_value numeric(14, 2),
  variance_value numeric(14, 2),
  line_status text NOT NULL DEFAULT 'exact'
    CHECK (line_status IN ('exact', 'pre_approved', 'needs_approval', 'recount'))
);

CREATE TABLE IF NOT EXISTS fleet.inv_alert (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  type text NOT NULL,
  chip_label text,
  severity text NOT NULL DEFAULT 'medium',
  title text NOT NULL,
  body text,
  entity_type text,
  entity_id uuid,
  assignee_id uuid,
  snoozed_until timestamptz,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  resolved_by uuid,
  resolved_at timestamptz,
  viewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inv_alert_org_status_idx ON fleet.inv_alert (organization_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS fleet.inv_approval (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  subject_type text NOT NULL CHECK (subject_type IN ('adjust', 'write_off', 'count', 'po')),
  subject_id uuid NOT NULL,
  amount numeric(14, 2),
  rule_code text,
  rule_name text,
  requested_by uuid NOT NULL,
  approved_by uuid,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  CHECK (approved_by IS NULL OR approved_by <> requested_by)
);

CREATE TABLE IF NOT EXISTS fleet.inv_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  before jsonb,
  after jsonb,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Driver reports
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fleet.inv_driver_report (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  report_no text NOT NULL,
  vehicle_id text NOT NULL REFERENCES fleet.vehicles (id) ON DELETE RESTRICT,
  kit_line_id uuid REFERENCES fleet.kit_template_line (id) ON DELETE SET NULL,
  asset_id uuid REFERENCES fleet.inv_asset (id) ON DELETE SET NULL,
  item_id uuid REFERENCES fleet.inv_item (id) ON DELETE SET NULL,
  issue text NOT NULL CHECK (issue IN ('damaged', 'missing', 'not_working')),
  note text,
  photo_paths text[] NOT NULL DEFAULT '{}'::text[],
  gps_lat double precision,
  gps_lng double precision,
  queued_area text,
  client_key text,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'seen', 'fixed')),
  seen_at timestamptz,
  seen_by uuid,
  fixed_at timestamptz,
  fleet_reply text,
  resolution_movement_id uuid REFERENCES fleet.inv_movement (id) ON DELETE SET NULL,
  driver_liability boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS inv_driver_report_org_no_uidx ON fleet.inv_driver_report (organization_id, report_no);
CREATE UNIQUE INDEX IF NOT EXISTS inv_driver_report_client_key_uidx
  ON fleet.inv_driver_report (organization_id, client_key)
  WHERE client_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS fleet.inv_driver_report_update (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  report_id uuid NOT NULL REFERENCES fleet.inv_driver_report (id) ON DELETE CASCADE,
  by_role text NOT NULL CHECK (by_role IN ('driver', 'fleet')),
  kind text NOT NULL CHECK (kind IN (
    'found_it', 'got_replacement', 'still_missing', 'replacement_en_route',
    'hub_collection_ready', 'urgent_safety_item'
  )),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Ledger triggers: immutable, hash chain, balance refresh
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fleet.inv_deny_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = fleet, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'inv_ledger is append-only';
END;
$$;

CREATE OR REPLACE FUNCTION fleet.inv_ledger_canonical(p_row fleet.inv_ledger)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = fleet, pg_temp
AS $$
  SELECT concat_ws(
    '|',
    p_row.organization_id,
    p_row.movement_id::text,
    p_row.item_id::text,
    p_row.location_id::text,
    COALESCE(p_row.bin_id::text, ''),
    COALESCE(p_row.asset_id::text, ''),
    p_row.qty_delta::text,
    COALESCE(p_row.unit_cost::text, ''),
    p_row.currency,
    p_row.block_no::text
  );
$$;

CREATE OR REPLACE FUNCTION fleet.inv_ledger_hash_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = fleet, pg_temp
AS $$
DECLARE
  v_prev_hash text;
  v_prev_block bigint;
  v_canonical text;
BEGIN
  IF NEW.block_no IS NOT NULL AND NEW.block_no > 0 AND NEW.row_hash IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT l.row_hash, l.block_no
  INTO v_prev_hash, v_prev_block
  FROM fleet.inv_ledger l
  WHERE l.organization_id = NEW.organization_id
  ORDER BY l.block_no DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    v_prev_hash := repeat('0', 64);
    NEW.block_no := 1;
  ELSE
    NEW.block_no := v_prev_block + 1;
    NEW.prev_hash := v_prev_hash;
  END IF;

  IF NEW.prev_hash IS NULL OR NEW.prev_hash = '' THEN
    NEW.prev_hash := v_prev_hash;
  END IF;

  v_canonical := fleet.inv_ledger_canonical(NEW);
  NEW.row_hash := encode(digest(NEW.prev_hash || '|' || v_canonical, 'sha256'), 'hex');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fleet.inv_ledger_refresh_balance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = fleet, pg_temp
AS $$
DECLARE
  v_line_value numeric(14, 2);
BEGIN
  v_line_value := COALESCE(NEW.unit_cost, 0) * NEW.qty_delta;

  INSERT INTO fleet.inv_balance (
    organization_id, item_id, location_id, bin_id, on_hand, value, updated_at
  )
  VALUES (
    NEW.organization_id, NEW.item_id, NEW.location_id, NEW.bin_id,
    NEW.qty_delta, v_line_value, now()
  )
  ON CONFLICT (organization_id, item_id, location_id, bin_key) DO UPDATE
  SET
    on_hand = fleet.inv_balance.on_hand + EXCLUDED.on_hand,
    value = fleet.inv_balance.value + EXCLUDED.value,
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inv_ledger_immutable ON fleet.inv_ledger;
CREATE TRIGGER trg_inv_ledger_immutable
  BEFORE UPDATE OR DELETE ON fleet.inv_ledger
  FOR EACH ROW EXECUTE FUNCTION fleet.inv_deny_ledger_mutation();

DROP TRIGGER IF EXISTS trg_inv_ledger_hash ON fleet.inv_ledger;
CREATE TRIGGER trg_inv_ledger_hash
  BEFORE INSERT ON fleet.inv_ledger
  FOR EACH ROW EXECUTE FUNCTION fleet.inv_ledger_hash_on_insert();

DROP TRIGGER IF EXISTS trg_inv_ledger_balance ON fleet.inv_ledger;
CREATE TRIGGER trg_inv_ledger_balance
  AFTER INSERT ON fleet.inv_ledger
  FOR EACH ROW EXECUTE FUNCTION fleet.inv_ledger_refresh_balance();

-- ---------------------------------------------------------------------------
-- RLS: SELECT via fleet.can_read_org; no authenticated writes
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'inv_settings', 'inv_category', 'inv_item', 'inv_location', 'inv_bin', 'inv_vendor',
    'inv_reorder_policy', 'inv_scan_device', 'inv_movement', 'inv_ledger', 'inv_chain_check',
    'inv_cost_layer', 'inv_balance', 'inv_reservation', 'inv_receipt', 'inv_purchase_order',
    'inv_purchase_order_line', 'inv_po_cost', 'inv_requisition', 'inv_requisition_line',
    'inv_asset', 'inv_asset_event', 'inv_asset_diagnostic', 'inv_document',
    'kit_template', 'kit_template_version', 'kit_template_line', 'vehicle_kit',
    'inv_kit_compliance_daily', 'inv_count_session', 'inv_count_line', 'inv_alert',
    'inv_approval', 'inv_audit_log', 'inv_driver_report', 'inv_driver_report_update'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE fleet.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON fleet.%I', t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON fleet.%I FOR SELECT TO authenticated USING (fleet.can_read_org(organization_id))',
      t || '_select', t
    );
    EXECUTE format('REVOKE ALL ON fleet.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON fleet.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON fleet.%I TO service_role', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Storage: inventory-docs (private)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'inventory-docs',
  'inventory-docs',
  false,
  20971520,
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
    'text/plain', 'text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]::text[]
)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- org_part_stock compatibility (INV-05)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.org_part_stock') IS NOT NULL
     AND to_regclass('public.org_part_stock_legacy') IS NULL THEN
    ALTER TABLE public.org_part_stock RENAME TO org_part_stock_legacy;
  END IF;
END $$;

CREATE OR REPLACE VIEW public.org_part_stock
WITH (security_invoker = true)
AS
SELECT
  (
    substr(h, 1, 8) || '-' || substr(h, 9, 4) || '-' || substr(h, 13, 4) || '-' ||
    substr(h, 17, 4) || '-' || substr(h, 21, 12)
  )::uuid AS id,
  s.organization_id,
  s.part_id,
  s.universal_part_id,
  s.qty,
  s.location,
  rp.reorder_point,
  s.updated_at,
  NULL::text AS batch_note,
  s.bin
FROM (
  SELECT
    b.organization_id,
    i.part_master_id AS part_id,
    i.universal_part_id,
    l.code AS location,
    max(b.bin_id::text) AS bin_id_text,
    sum(b.on_hand) AS qty,
    max(b.updated_at) AS updated_at,
    max(bin.code) AS bin
  FROM fleet.inv_balance b
  JOIN fleet.inv_item i ON i.id = b.item_id AND i.organization_id = b.organization_id
  JOIN fleet.inv_location l ON l.id = b.location_id AND l.organization_id = b.organization_id
  LEFT JOIN fleet.inv_bin bin ON bin.id = b.bin_id
  WHERE i.part_master_id IS NOT NULL OR i.universal_part_id IS NOT NULL
  GROUP BY b.organization_id, i.part_master_id, i.universal_part_id, l.code
) s
LEFT JOIN LATERAL (
  SELECT p.reorder_point
  FROM fleet.inv_reorder_policy p
  JOIN fleet.inv_item ii ON ii.id = p.item_id
  JOIN fleet.inv_location ll ON ll.id = p.location_id
  WHERE p.organization_id = s.organization_id
    AND ii.part_master_id IS NOT DISTINCT FROM s.part_id
    AND ii.universal_part_id IS NOT DISTINCT FROM s.universal_part_id
    AND ll.code = s.location
  LIMIT 1
) rp ON true
CROSS JOIN LATERAL (
  SELECT md5(
    s.organization_id || '|' ||
    COALESCE(s.part_id::text, '') || '|' ||
    COALESCE(s.universal_part_id::text, '') || '|' ||
    COALESCE(s.location, '')
  ) AS h
) d;

COMMENT ON VIEW public.org_part_stock IS
  'Compatibility view over fleet.inv_balance for Find parts / parts_enterprise readers (INV-05).';

REVOKE ALL ON public.org_part_stock FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.org_part_stock TO service_role;
