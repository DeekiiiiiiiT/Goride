-- Soft-launch follow-up: promo_code on orders, RLS coverage, search_path pins, FK indexes

-- 1) Persist applied promo code on orders (optional audit trail)
ALTER TABLE delivery.orders
  ADD COLUMN IF NOT EXISTS promo_code text;

CREATE INDEX IF NOT EXISTS orders_promo_code_idx
  ON delivery.orders (promo_code)
  WHERE promo_code IS NOT NULL;

-- Ensure courier GPS columns exist (idempotent with soft-launch favorites migration)
ALTER TABLE delivery.orders
  ADD COLUMN IF NOT EXISTS courier_lat double precision,
  ADD COLUMN IF NOT EXISTS courier_lng double precision,
  ADD COLUMN IF NOT EXISTS courier_location_updated_at timestamptz;

-- 2) Fix broken refunds policy from soft-launch (payment_intent_id does not exist)
DROP POLICY IF EXISTS refunds_select_customer ON payments.refunds;
CREATE POLICY refunds_select_customer ON payments.refunds
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM delivery.orders o
      JOIN delivery.customers c ON c.id = o.customer_id
      WHERE o.id = refunds.order_id
        AND c.user_id = (SELECT auth.uid())
    )
  );

-- 3) courier_availability — courier can read/update own row (driver_id = auth.uid)
DROP POLICY IF EXISTS courier_availability_select_own ON delivery.courier_availability;
CREATE POLICY courier_availability_select_own ON delivery.courier_availability
  FOR SELECT TO authenticated
  USING (driver_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS courier_availability_update_own ON delivery.courier_availability;
CREATE POLICY courier_availability_update_own ON delivery.courier_availability
  FOR UPDATE TO authenticated
  USING (driver_id = (SELECT auth.uid()))
  WITH CHECK (driver_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS courier_availability_insert_own ON delivery.courier_availability;
CREATE POLICY courier_availability_insert_own ON delivery.courier_availability
  FOR INSERT TO authenticated
  WITH CHECK (driver_id = (SELECT auth.uid()));

-- 4) courier_payouts — courier can SELECT own (courier_id stored as auth user id)
DROP POLICY IF EXISTS courier_payouts_select_own ON payments.courier_payouts;
CREATE POLICY courier_payouts_select_own ON payments.courier_payouts
  FOR SELECT TO authenticated
  USING (courier_id = (SELECT auth.uid()));

-- 5) merchant_adjustments — merchant owner SELECT
DROP POLICY IF EXISTS merchant_adjustments_select_owner ON payments.merchant_adjustments;
CREATE POLICY merchant_adjustments_select_owner ON payments.merchant_adjustments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM delivery.merchants m
      WHERE m.id = merchant_adjustments.merchant_id
        AND m.owner_id = (SELECT auth.uid())
    )
  );

-- 6) Customer-readable active promotions (list/redeem still primarily via edge)
DROP POLICY IF EXISTS merchant_promotions_select_active_customers ON delivery.merchant_promotions;
CREATE POLICY merchant_promotions_select_active_customers ON delivery.merchant_promotions
  FOR SELECT TO authenticated
  USING (status = 'active');

-- 7) Pin search_path on delivery helper functions (mutable search_path audit)
CREATE OR REPLACE FUNCTION delivery.generate_order_number()
RETURNS text
LANGUAGE plpgsql
SET search_path = delivery, pg_temp
AS $$
DECLARE
  new_number text;
  year_part text;
  seq_part text;
BEGIN
  year_part := to_char(now(), 'YYYY');
  SELECT LPAD((COALESCE(MAX(SUBSTRING(order_number FROM 9)::integer), 0) + 1)::text, 6, '0')
  INTO seq_part
  FROM delivery.orders
  WHERE order_number LIKE 'RD-' || year_part || '-%';

  new_number := 'RD-' || year_part || '-' || seq_part;
  RETURN new_number;
END;
$$;

CREATE OR REPLACE FUNCTION delivery.set_order_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = delivery, pg_temp
AS $$
BEGIN
  IF NEW.order_number IS NULL THEN
    NEW.order_number := delivery.generate_order_number();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION delivery.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = delivery, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- 8) FK indexes commonly flagged
CREATE INDEX IF NOT EXISTS refunds_order_id_idx ON payments.refunds (order_id);
CREATE INDEX IF NOT EXISTS refunds_transaction_id_idx ON payments.refunds (transaction_id);
CREATE INDEX IF NOT EXISTS merchant_adjustments_merchant_id_idx
  ON payments.merchant_adjustments (merchant_id);
CREATE INDEX IF NOT EXISTS courier_availability_driver_id_idx
  ON delivery.courier_availability (driver_id);
CREATE INDEX IF NOT EXISTS courier_availability_active_order_id_idx
  ON delivery.courier_availability (active_order_id);

-- merchant_payouts → merchants FK (idempotent; may already exist from schema audit)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'merchant_payouts_merchant_id_fkey'
  ) THEN
    ALTER TABLE payments.merchant_payouts
      ADD CONSTRAINT merchant_payouts_merchant_id_fkey
      FOREIGN KEY (merchant_id) REFERENCES delivery.merchants(id);
  END IF;
EXCEPTION
  WHEN others THEN NULL;
END $$;
