-- Soft-launch: courier location + RLS for deny-by-default tables
-- (customer_favorites table created in 20260729010000_customer_favorites.sql)

-- 1) Courier live location on orders (Phase 3)
ALTER TABLE delivery.orders
  ADD COLUMN IF NOT EXISTS courier_lat double precision,
  ADD COLUMN IF NOT EXISTS courier_lng double precision,
  ADD COLUMN IF NOT EXISTS courier_location_updated_at timestamptz;

-- 3) RLS policies for previously policy-less tables (owner/customer scoped reads)
-- order_events: customers can read events for their orders
DROP POLICY IF EXISTS order_events_select_customer ON delivery.order_events;
CREATE POLICY order_events_select_customer ON delivery.order_events
  FOR SELECT TO authenticated
  USING (
    order_id IN (
      SELECT o.id FROM delivery.orders o
      JOIN delivery.customers c ON c.id = o.customer_id
      WHERE c.user_id = (SELECT auth.uid())
    )
  );

-- order_disputes: customers can read/create their own
DROP POLICY IF EXISTS order_disputes_select_customer ON delivery.order_disputes;
CREATE POLICY order_disputes_select_customer ON delivery.order_disputes
  FOR SELECT TO authenticated
  USING (
    order_id IN (
      SELECT o.id FROM delivery.orders o
      JOIN delivery.customers c ON c.id = o.customer_id
      WHERE c.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS order_disputes_insert_customer ON delivery.order_disputes;
CREATE POLICY order_disputes_insert_customer ON delivery.order_disputes
  FOR INSERT TO authenticated
  WITH CHECK (
    order_id IN (
      SELECT o.id FROM delivery.orders o
      JOIN delivery.customers c ON c.id = o.customer_id
      WHERE c.user_id = (SELECT auth.uid())
    )
  );

-- carts: owner customer
DROP POLICY IF EXISTS carts_select_own ON delivery.carts;
CREATE POLICY carts_select_own ON delivery.carts
  FOR SELECT TO authenticated
  USING (
    customer_id IN (
      SELECT id FROM delivery.customers WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS carts_write_own ON delivery.carts;
CREATE POLICY carts_write_own ON delivery.carts
  FOR ALL TO authenticated
  USING (
    customer_id IN (
      SELECT id FROM delivery.customers WHERE user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    customer_id IN (
      SELECT id FROM delivery.customers WHERE user_id = (SELECT auth.uid())
    )
  );

-- refunds: customer can read refunds for their orders
DROP POLICY IF EXISTS refunds_select_customer ON payments.refunds;
CREATE POLICY refunds_select_customer ON payments.refunds
  FOR SELECT TO authenticated
  USING (
    order_id IN (
      SELECT o.id FROM delivery.orders o
      JOIN delivery.customers c ON c.id = o.customer_id
      WHERE c.user_id = (SELECT auth.uid())
    )
  );

-- courier_availability / payouts / adjustments: no customer access — service role only
-- Add explicit deny-safe SELECT for authenticated that matches nothing via false, or leave deny-by-default.
-- Prefer courier-scoped SELECT where courier identity exists via auth uid metadata later.

-- 4) Money / status checks (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_status_check'
  ) THEN
    ALTER TABLE delivery.orders
      ADD CONSTRAINT orders_status_check
      CHECK (status IN (
        'placed','accepted','preparing','ready','picked_up','in_transit','delivered','completed','cancelled'
      ));
  END IF;
EXCEPTION
  WHEN others THEN NULL;
END $$;

-- 5) Common FK indexes
CREATE INDEX IF NOT EXISTS orders_customer_id_idx ON delivery.orders (customer_id);
CREATE INDEX IF NOT EXISTS orders_merchant_id_idx ON delivery.orders (merchant_id);
CREATE INDEX IF NOT EXISTS orders_courier_id_idx ON delivery.orders (courier_id);
CREATE INDEX IF NOT EXISTS order_events_order_id_idx ON delivery.order_events (order_id);
