-- Web push subscriptions for merchant order alerts
CREATE TABLE IF NOT EXISTS delivery.merchant_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid REFERENCES delivery.merchants(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_merchant_push_subscriptions_merchant
  ON delivery.merchant_push_subscriptions(merchant_id);

ALTER TABLE delivery.merchant_push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Merchant owner manages push subscriptions" ON delivery.merchant_push_subscriptions;
CREATE POLICY "Merchant owner manages push subscriptions" ON delivery.merchant_push_subscriptions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM delivery.merchants
      WHERE id = merchant_push_subscriptions.merchant_id
        AND owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM delivery.merchants
      WHERE id = merchant_push_subscriptions.merchant_id
        AND owner_id = auth.uid()
    )
  );

GRANT ALL ON delivery.merchant_push_subscriptions TO authenticated, service_role;

COMMENT ON TABLE delivery.merchant_push_subscriptions IS 'Web Push endpoints for merchant new-order alerts';
