
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