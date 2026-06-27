-- Enterprise inventory foundation (additive — legacy ingredients tables unchanged)

-- Hierarchy
CREATE TABLE IF NOT EXISTS delivery.inventory_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS delivery.inventory_regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES delivery.inventory_companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);

CREATE TABLE IF NOT EXISTS delivery.inventory_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id uuid NOT NULL REFERENCES delivery.inventory_regions(id) ON DELETE CASCADE,
  name text NOT NULL,
  group_type text NOT NULL DEFAULT 'corporate' CHECK (group_type IN ('corporate', 'franchise')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (region_id, name)
);

CREATE TABLE IF NOT EXISTS delivery.inventory_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES delivery.inventory_groups(id) ON DELETE CASCADE,
  merchant_id uuid REFERENCES delivery.merchants(id) ON DELETE SET NULL,
  name text NOT NULL,
  node_type text NOT NULL CHECK (node_type IN ('storefront', 'commissary', 'warehouse')),
  timezone text NOT NULL DEFAULT 'America/Jamaica',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, name)
);

CREATE INDEX IF NOT EXISTS idx_inventory_nodes_merchant ON delivery.inventory_nodes(merchant_id);

ALTER TABLE delivery.merchants
  ADD COLUMN IF NOT EXISTS inventory_mode text NOT NULL DEFAULT 'legacy'
    CHECK (inventory_mode IN ('legacy', 'enterprise'));

ALTER TABLE delivery.merchants
  ADD COLUMN IF NOT EXISTS inventory_company_id uuid REFERENCES delivery.inventory_companies(id) ON DELETE SET NULL;

ALTER TABLE delivery.merchants
  ADD COLUMN IF NOT EXISTS enterprise_inventory_shadow boolean NOT NULL DEFAULT false;

-- UOM
CREATE TABLE IF NOT EXISTS delivery.uom_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES delivery.inventory_companies(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  dimension text NOT NULL CHECK (dimension IN ('count', 'weight', 'volume')),
  is_base boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);

CREATE TABLE IF NOT EXISTS delivery.item_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES delivery.inventory_companies(id) ON DELETE CASCADE,
  legacy_ingredient_id uuid REFERENCES delivery.ingredients(id) ON DELETE SET NULL,
  sku text,
  upc text,
  name text NOT NULL,
  is_global boolean NOT NULL DEFAULT true,
  storage_zone text CHECK (storage_zone IN ('walk_in', 'dry', 'freezer', 'ambient')),
  base_uom_id uuid NOT NULL REFERENCES delivery.uom_definitions(id),
  purchase_uom_id uuid NOT NULL REFERENCES delivery.uom_definitions(id),
  storage_uom_id uuid NOT NULL REFERENCES delivery.uom_definitions(id),
  recipe_uom_id uuid NOT NULL REFERENCES delivery.uom_definitions(id),
  reorder_level_base numeric(20,8) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_item_master_company_sku
  ON delivery.item_master(company_id, sku) WHERE sku IS NOT NULL;

CREATE TABLE IF NOT EXISTS delivery.uom_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES delivery.item_master(id) ON DELETE CASCADE,
  from_uom_id uuid NOT NULL REFERENCES delivery.uom_definitions(id),
  to_uom_id uuid NOT NULL REFERENCES delivery.uom_definitions(id),
  factor numeric(20,8) NOT NULL CHECK (factor > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, from_uom_id, to_uom_id)
);

CREATE TABLE IF NOT EXISTS delivery.item_node_settings (
  node_id uuid NOT NULL REFERENCES delivery.inventory_nodes(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES delivery.item_master(id) ON DELETE CASCADE,
  reorder_level_base numeric(20,8),
  is_active boolean NOT NULL DEFAULT true,
  PRIMARY KEY (node_id, item_id)
);

-- Vendors
CREATE TABLE IF NOT EXISTS delivery.vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES delivery.inventory_companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  contact_email text,
  contact_phone text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);

CREATE TABLE IF NOT EXISTS delivery.vendor_catalogs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES delivery.vendors(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES delivery.item_master(id) ON DELETE CASCADE,
  vendor_sku text NOT NULL,
  pack_size numeric(20,8) NOT NULL DEFAULT 1,
  pack_uom_id uuid NOT NULL REFERENCES delivery.uom_definitions(id),
  current_price numeric(20,8) NOT NULL DEFAULT 0,
  contract_end_date date,
  is_preferred boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendor_id, vendor_sku)
);

CREATE TABLE IF NOT EXISTS delivery.vendor_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id uuid NOT NULL REFERENCES delivery.vendor_catalogs(id) ON DELETE CASCADE,
  unit_price numeric(20,8) NOT NULL,
  effective_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'receiving'
);

-- Purchase orders & receiving
CREATE TABLE IF NOT EXISTS delivery.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id uuid NOT NULL REFERENCES delivery.inventory_nodes(id),
  vendor_id uuid NOT NULL REFERENCES delivery.vendors(id),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('draft', 'open', 'partial', 'closed', 'cancelled')),
  ordered_at timestamptz NOT NULL DEFAULT now(),
  expected_at timestamptz,
  created_by uuid REFERENCES delivery.merchant_team_members(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS delivery.purchase_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES delivery.purchase_orders(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES delivery.item_master(id),
  catalog_id uuid REFERENCES delivery.vendor_catalogs(id),
  qty_ordered numeric(20,8) NOT NULL CHECK (qty_ordered > 0),
  uom_id uuid NOT NULL REFERENCES delivery.uom_definitions(id),
  unit_price numeric(20,8) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS delivery.receiving_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES delivery.purchase_orders(id),
  received_at timestamptz NOT NULL DEFAULT now(),
  received_by uuid REFERENCES delivery.merchant_team_members(id),
  notes text
);

CREATE TABLE IF NOT EXISTS delivery.receiving_variances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receiving_id uuid NOT NULL REFERENCES delivery.receiving_events(id) ON DELETE CASCADE,
  po_line_id uuid NOT NULL REFERENCES delivery.purchase_order_lines(id),
  variance_type text NOT NULL CHECK (variance_type IN ('short', 'damage', 'overage')),
  qty numeric(20,8) NOT NULL,
  uom_id uuid NOT NULL REFERENCES delivery.uom_definitions(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Recipes v2
CREATE TABLE IF NOT EXISTS delivery.recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES delivery.inventory_companies(id) ON DELETE CASCADE,
  menu_item_id uuid REFERENCES delivery.menu_items(id) ON DELETE CASCADE,
  name text NOT NULL,
  yield_pct numeric(8,4) NOT NULL DEFAULT 100
    CHECK (yield_pct > 0 AND yield_pct <= 100),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (menu_item_id)
);

CREATE TABLE IF NOT EXISTS delivery.recipe_ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES delivery.recipes(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES delivery.item_master(id),
  qty_required numeric(20,8) NOT NULL CHECK (qty_required > 0),
  uom_id uuid NOT NULL REFERENCES delivery.uom_definitions(id),
  yield_pct numeric(8,4) NOT NULL DEFAULT 100
    CHECK (yield_pct > 0 AND yield_pct <= 100),
  sort_order int NOT NULL DEFAULT 0,
  UNIQUE (recipe_id, item_id)
);

-- Ledger (immutable SSOT)
CREATE TABLE IF NOT EXISTS delivery.inventory_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id uuid NOT NULL REFERENCES delivery.inventory_nodes(id),
  item_id uuid NOT NULL REFERENCES delivery.item_master(id),
  quantity numeric(20,8) NOT NULL,
  uom_id uuid NOT NULL REFERENCES delivery.uom_definitions(id),
  quantity_base numeric(20,8) NOT NULL,
  transaction_type text NOT NULL CHECK (transaction_type IN (
    'receiving', 'pos_depletion', 'waste', 'transfer_in', 'transfer_out',
    'physical_adjustment', 'prep_production', 'prep_consumption'
  )),
  reference_type text,
  reference_id uuid,
  unit_cost_base numeric(20,8),
  idempotency_key text,
  created_by uuid REFERENCES delivery.merchant_team_members(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_ledger_no_zero CHECK (quantity_base <> 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_ledger_idempotency
  ON delivery.inventory_ledger(idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_ledger_node_item_time
  ON delivery.inventory_ledger(node_id, item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_ledger_type_time
  ON delivery.inventory_ledger(transaction_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_ledger_reference
  ON delivery.inventory_ledger(reference_type, reference_id);

CREATE TABLE IF NOT EXISTS delivery.inventory_balances (
  node_id uuid NOT NULL REFERENCES delivery.inventory_nodes(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES delivery.item_master(id) ON DELETE CASCADE,
  quantity_base numeric(20,8) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (node_id, item_id)
);

CREATE TABLE IF NOT EXISTS delivery.inventory_cost_layers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id uuid NOT NULL REFERENCES delivery.inventory_nodes(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES delivery.item_master(id) ON DELETE CASCADE,
  ledger_id uuid NOT NULL REFERENCES delivery.inventory_ledger(id) ON DELETE CASCADE,
  qty_remaining_base numeric(20,8) NOT NULL CHECK (qty_remaining_base >= 0),
  unit_cost_base numeric(20,8) NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_cost_layers_fifo
  ON delivery.inventory_cost_layers(node_id, item_id, received_at);

-- Transfers
CREATE TABLE IF NOT EXISTS delivery.inventory_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_node_id uuid NOT NULL REFERENCES delivery.inventory_nodes(id),
  to_node_id uuid NOT NULL REFERENCES delivery.inventory_nodes(id),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_transit', 'received', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  received_at timestamptz,
  CHECK (from_node_id <> to_node_id)
);

CREATE TABLE IF NOT EXISTS delivery.inventory_transfer_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL REFERENCES delivery.inventory_transfers(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES delivery.item_master(id),
  qty numeric(20,8) NOT NULL CHECK (qty > 0),
  uom_id uuid NOT NULL REFERENCES delivery.uom_definitions(id)
);

-- Physical counts
CREATE TABLE IF NOT EXISTS delivery.physical_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id uuid NOT NULL REFERENCES delivery.inventory_nodes(id),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'submitted', 'posted', 'cancelled')),
  blind_mode boolean NOT NULL DEFAULT true,
  count_date date NOT NULL DEFAULT CURRENT_DATE,
  created_by uuid REFERENCES delivery.merchant_team_members(id),
  posted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS delivery.physical_count_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  count_id uuid NOT NULL REFERENCES delivery.physical_counts(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES delivery.item_master(id),
  counted_qty numeric(20,8),
  counted_uom_id uuid REFERENCES delivery.uom_definitions(id),
  counted_base numeric(20,8),
  UNIQUE (count_id, item_id)
);

-- Balance refresh trigger
CREATE OR REPLACE FUNCTION delivery.refresh_inventory_balance()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO delivery.inventory_balances (node_id, item_id, quantity_base, updated_at)
  VALUES (NEW.node_id, NEW.item_id, NEW.quantity_base, now())
  ON CONFLICT (node_id, item_id) DO UPDATE
    SET quantity_base = delivery.inventory_balances.quantity_base + EXCLUDED.quantity_base,
        updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inventory_ledger_balance ON delivery.inventory_ledger;
CREATE TRIGGER trg_inventory_ledger_balance
  AFTER INSERT ON delivery.inventory_ledger
  FOR EACH ROW EXECUTE FUNCTION delivery.refresh_inventory_balance();

CREATE OR REPLACE FUNCTION delivery.deny_ledger_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'inventory_ledger is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_inventory_ledger_immutable ON delivery.inventory_ledger;
CREATE TRIGGER trg_inventory_ledger_immutable
  BEFORE UPDATE OR DELETE ON delivery.inventory_ledger
  FOR EACH ROW EXECUTE FUNCTION delivery.deny_ledger_mutation();

-- Variance report function
CREATE OR REPLACE FUNCTION delivery.inventory_variance_report(
  p_node_id uuid,
  p_start timestamptz,
  p_end timestamptz
) RETURNS TABLE (
  item_id uuid,
  item_name text,
  starting_qty_base numeric,
  received_qty_base numeric,
  transfer_in_qty_base numeric,
  wasted_qty_base numeric,
  transfer_out_qty_base numeric,
  theoretical_depletion_base numeric,
  theoretical_ending_base numeric,
  actual_count_base numeric,
  variance_qty_base numeric,
  variance_cost numeric
) LANGUAGE sql STABLE AS $$
  WITH bounds AS (
    SELECT p_node_id AS node_id, p_start AS start_at, p_end AS end_at
  ),
  ledger AS (
    SELECT l.* FROM delivery.inventory_ledger l, bounds b WHERE l.node_id = b.node_id
  ),
  starting AS (
    SELECT item_id, COALESCE(SUM(quantity_base), 0) AS qty
    FROM ledger, bounds b WHERE created_at < b.start_at GROUP BY item_id
  ),
  period AS (
    SELECT item_id,
      SUM(CASE WHEN transaction_type = 'receiving' THEN quantity_base ELSE 0 END) AS received,
      SUM(CASE WHEN transaction_type = 'transfer_in' THEN quantity_base ELSE 0 END) AS xfer_in,
      SUM(CASE WHEN transaction_type = 'waste' THEN ABS(quantity_base) ELSE 0 END) AS wasted,
      SUM(CASE WHEN transaction_type = 'transfer_out' THEN ABS(quantity_base) ELSE 0 END) AS xfer_out,
      SUM(CASE WHEN transaction_type = 'pos_depletion' THEN ABS(quantity_base) ELSE 0 END) AS theoretical_dep
    FROM ledger, bounds b
    WHERE created_at >= b.start_at AND created_at < b.end_at
    GROUP BY item_id
  ),
  latest_count AS (
    SELECT DISTINCT ON (pci.item_id)
      pci.item_id, pci.counted_base
    FROM delivery.physical_count_items pci
    JOIN delivery.physical_counts pc ON pc.id = pci.count_id
    JOIN bounds b ON pc.node_id = b.node_id
    WHERE pc.status = 'posted' AND pc.posted_at <= b.end_at
    ORDER BY pci.item_id, pc.posted_at DESC
  )
  SELECT
    im.id,
    im.name,
    COALESCE(s.qty, 0),
    COALESCE(p.received, 0),
    COALESCE(p.xfer_in, 0),
    COALESCE(p.wasted, 0),
    COALESCE(p.xfer_out, 0),
    COALESCE(p.theoretical_dep, 0),
    COALESCE(s.qty, 0) + COALESCE(p.received, 0) + COALESCE(p.xfer_in, 0)
      - COALESCE(p.wasted, 0) - COALESCE(p.xfer_out, 0) - COALESCE(p.theoretical_dep, 0),
    lc.counted_base,
    lc.counted_base - (
      COALESCE(s.qty, 0) + COALESCE(p.received, 0) + COALESCE(p.xfer_in, 0)
      - COALESCE(p.wasted, 0) - COALESCE(p.xfer_out, 0) - COALESCE(p.theoretical_dep, 0)
    ),
    0::numeric
  FROM delivery.item_master im
  JOIN delivery.inventory_nodes nd ON nd.id = p_node_id
  JOIN delivery.inventory_groups g ON g.id = nd.group_id
  JOIN delivery.inventory_regions r ON r.id = g.region_id
  LEFT JOIN starting s ON s.item_id = im.id
  LEFT JOIN period p ON p.item_id = im.id
  LEFT JOIN latest_count lc ON lc.item_id = im.id
  WHERE im.company_id = r.company_id;
$$;

-- RLS (read for merchant team; writes via service role)
ALTER TABLE delivery.inventory_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.inventory_regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.inventory_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.inventory_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.uom_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.item_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.uom_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.item_node_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.vendor_catalogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.vendor_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.purchase_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.receiving_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.receiving_variances ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.inventory_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.inventory_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.inventory_cost_layers ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.inventory_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.inventory_transfer_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.physical_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.physical_count_items ENABLE ROW LEVEL SECURITY;

-- Simplified read policy via merchant linkage on nodes
CREATE POLICY "Merchant team read inventory nodes" ON delivery.inventory_nodes
  FOR SELECT USING (
    merchant_id IN (
      SELECT id FROM delivery.merchants WHERE owner_id = auth.uid()
      UNION
      SELECT merchant_id FROM delivery.merchant_team_members WHERE user_id = auth.uid()
    )
  );
