-- Optional Restaurant Management: capabilities, in-store orders, BOM inventory, print jobs

-- Merchant capabilities (Roam-only default)
ALTER TABLE delivery.merchants
  ADD COLUMN IF NOT EXISTS capabilities text[] NOT NULL DEFAULT ARRAY['roam_delivery']::text[];

ALTER TABLE delivery.merchants
  DROP CONSTRAINT IF EXISTS merchants_capabilities_roam_required;

ALTER TABLE delivery.merchants
  ADD CONSTRAINT merchants_capabilities_roam_required
  CHECK ('roam_delivery' = ANY (capabilities));

CREATE INDEX IF NOT EXISTS idx_merchants_capabilities
  ON delivery.merchants USING GIN (capabilities);

-- Order channel + fulfillment (Roam defaults preserved)
ALTER TABLE delivery.orders
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'roam_app',
  ADD COLUMN IF NOT EXISTS fulfillment_type text NOT NULL DEFAULT 'delivery';

UPDATE delivery.orders
SET channel = 'roam_app', fulfillment_type = 'delivery'
WHERE channel IS NULL OR fulfillment_type IS NULL;

ALTER TABLE delivery.orders
  ALTER COLUMN customer_id DROP NOT NULL;

ALTER TABLE delivery.orders
  DROP CONSTRAINT IF EXISTS orders_customer_required_for_roam;

ALTER TABLE delivery.orders
  ADD CONSTRAINT orders_customer_required_for_roam
  CHECK (
    (channel = 'roam_app' AND customer_id IS NOT NULL)
    OR channel IN ('in_store', 'phone')
  );

CREATE INDEX IF NOT EXISTS idx_orders_merchant_channel_status
  ON delivery.orders (merchant_id, channel, status);

-- In-store fulfillment extension
CREATE TABLE IF NOT EXISTS delivery.order_fulfillment (
  order_id uuid PRIMARY KEY REFERENCES delivery.orders(id) ON DELETE CASCADE,
  table_label text,
  seat_count integer,
  cashier_member_id uuid REFERENCES delivery.merchant_team_members(id) ON DELETE SET NULL,
  guest_name text,
  guest_phone text,
  receipt_number text,
  payment_intent_id text,
  terminal_reader_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- BOM inventory
CREATE TABLE IF NOT EXISTS delivery.ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES delivery.merchants(id) ON DELETE CASCADE,
  name text NOT NULL,
  unit text NOT NULL DEFAULT 'each',
  reorder_level numeric NOT NULL DEFAULT 0,
  cost_per_unit numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, name)
);

CREATE TABLE IF NOT EXISTS delivery.ingredient_stock (
  ingredient_id uuid PRIMARY KEY REFERENCES delivery.ingredients(id) ON DELETE CASCADE,
  quantity_on_hand numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS delivery.menu_item_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id uuid NOT NULL REFERENCES delivery.menu_items(id) ON DELETE CASCADE,
  ingredient_id uuid NOT NULL REFERENCES delivery.ingredients(id) ON DELETE CASCADE,
  quantity_per_serving numeric NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (menu_item_id, ingredient_id)
);

CREATE TABLE IF NOT EXISTS delivery.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id uuid NOT NULL REFERENCES delivery.ingredients(id) ON DELETE CASCADE,
  merchant_id uuid NOT NULL REFERENCES delivery.merchants(id) ON DELETE CASCADE,
  delta numeric NOT NULL,
  reason text NOT NULL,
  order_id uuid REFERENCES delivery.orders(id) ON DELETE SET NULL,
  member_id uuid REFERENCES delivery.merchant_team_members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_ingredient
  ON delivery.stock_movements (ingredient_id, created_at DESC);

-- Print jobs
CREATE TABLE IF NOT EXISTS delivery.print_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES delivery.merchants(id) ON DELETE CASCADE,
  order_id uuid REFERENCES delivery.orders(id) ON DELETE SET NULL,
  job_type text NOT NULL DEFAULT 'customer_receipt',
  payload jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sent', 'printed', 'failed')),
  printer_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_print_jobs_merchant_status
  ON delivery.print_jobs (merchant_id, status, created_at DESC);

-- Merchant print settings
ALTER TABLE delivery.merchants
  ADD COLUMN IF NOT EXISTS pos_printer_id text,
  ADD COLUMN IF NOT EXISTS pos_tax_rate_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pos_receipt_footer text,
  ADD COLUMN IF NOT EXISTS pos_show_in_store_on_counter boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pos_show_in_store_on_kitchen boolean NOT NULL DEFAULT false;

-- Extend job_station for POS cashier
ALTER TABLE delivery.merchant_team_members
  DROP CONSTRAINT IF EXISTS merchant_team_members_job_station_check;

ALTER TABLE delivery.merchant_team_members
  ADD CONSTRAINT merchant_team_members_job_station_check
  CHECK (job_station IS NULL OR job_station IN ('counter', 'kitchen', 'manager', 'pos'));

ALTER TABLE delivery.merchant_team_invites
  DROP CONSTRAINT IF EXISTS merchant_team_invites_job_station_check;

ALTER TABLE delivery.merchant_team_invites
  ADD CONSTRAINT merchant_team_invites_job_station_check
  CHECK (job_station IS NULL OR job_station IN ('counter', 'kitchen', 'manager', 'pos'));

-- RLS
ALTER TABLE delivery.order_fulfillment ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.ingredient_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.menu_item_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.print_jobs ENABLE ROW LEVEL SECURITY;

-- Service role handles writes; merchant members read via edge functions.
CREATE POLICY "Merchant team read ingredients" ON delivery.ingredients
  FOR SELECT USING (
    merchant_id IN (
      SELECT id FROM delivery.merchants WHERE owner_id = auth.uid()
      UNION
      SELECT merchant_id FROM delivery.merchant_team_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Merchant team read ingredient stock" ON delivery.ingredient_stock
  FOR SELECT USING (
    ingredient_id IN (
      SELECT i.id FROM delivery.ingredients i
      WHERE i.merchant_id IN (
        SELECT id FROM delivery.merchants WHERE owner_id = auth.uid()
        UNION
        SELECT merchant_id FROM delivery.merchant_team_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Merchant team read recipes" ON delivery.menu_item_recipes
  FOR SELECT USING (
    menu_item_id IN (
      SELECT mi.id FROM delivery.menu_items mi
      WHERE mi.merchant_id IN (
        SELECT id FROM delivery.merchants WHERE owner_id = auth.uid()
        UNION
        SELECT merchant_id FROM delivery.merchant_team_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Merchant team read stock movements" ON delivery.stock_movements
  FOR SELECT USING (
    merchant_id IN (
      SELECT id FROM delivery.merchants WHERE owner_id = auth.uid()
      UNION
      SELECT merchant_id FROM delivery.merchant_team_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Merchant team read print jobs" ON delivery.print_jobs
  FOR SELECT USING (
    merchant_id IN (
      SELECT id FROM delivery.merchants WHERE owner_id = auth.uid()
      UNION
      SELECT merchant_id FROM delivery.merchant_team_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Merchant team read order fulfillment" ON delivery.order_fulfillment
  FOR SELECT USING (
    order_id IN (
      SELECT o.id FROM delivery.orders o
      WHERE o.merchant_id IN (
        SELECT id FROM delivery.merchants WHERE owner_id = auth.uid()
        UNION
        SELECT merchant_id FROM delivery.merchant_team_members WHERE user_id = auth.uid()
      )
    )
  );
