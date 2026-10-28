-- Customer merchant favorites for RoamDash soft launch

CREATE TABLE IF NOT EXISTS delivery.customer_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES delivery.customers(id) ON DELETE CASCADE,
  merchant_id uuid NOT NULL REFERENCES delivery.merchants(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, merchant_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_favorites_customer
  ON delivery.customer_favorites(customer_id);

CREATE INDEX IF NOT EXISTS idx_customer_favorites_merchant
  ON delivery.customer_favorites(merchant_id);

ALTER TABLE delivery.customer_favorites ENABLE ROW LEVEL SECURITY;

-- Customer owns rows via customers.user_id = auth.uid()
CREATE POLICY "Customers select own favorites"
  ON delivery.customer_favorites FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM delivery.customers c
      WHERE c.id = customer_favorites.customer_id
        AND c.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Customers insert own favorites"
  ON delivery.customer_favorites FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM delivery.customers c
      WHERE c.id = customer_favorites.customer_id
        AND c.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Customers delete own favorites"
  ON delivery.customer_favorites FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM delivery.customers c
      WHERE c.id = customer_favorites.customer_id
        AND c.user_id = (SELECT auth.uid())
    )
  );

GRANT SELECT, INSERT, DELETE ON delivery.customer_favorites TO authenticated;
GRANT ALL ON delivery.customer_favorites TO service_role;
