-- Customer push subscriptions (web + native) and item favorites sync

-- ---------------------------------------------------------------------------
-- Push subscriptions for Roam Rush customers (order-status alerts)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS delivery.customer_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  channel text NOT NULL DEFAULT 'web',
  p256dh text,
  auth text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_user_id, endpoint)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'customer_push_subscriptions_channel_check'
  ) THEN
    ALTER TABLE delivery.customer_push_subscriptions
      ADD CONSTRAINT customer_push_subscriptions_channel_check
      CHECK (channel IN ('web', 'fcm', 'apns'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_customer_push_subscriptions_user
  ON delivery.customer_push_subscriptions(customer_user_id);

ALTER TABLE delivery.customer_push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customer manages own push subscriptions" ON delivery.customer_push_subscriptions;
CREATE POLICY "Customer manages own push subscriptions" ON delivery.customer_push_subscriptions
  FOR ALL
  USING (customer_user_id = auth.uid())
  WITH CHECK (customer_user_id = auth.uid());

GRANT ALL ON delivery.customer_push_subscriptions TO authenticated, service_role;

COMMENT ON TABLE delivery.customer_push_subscriptions IS
  'Customer push endpoints: Web Push and native FCM/APNs for order-status alerts';
COMMENT ON COLUMN delivery.customer_push_subscriptions.channel IS
  'web = browser Push API; fcm/apns = Capacitor native token (endpoint stores fcm:<token> or apns:<token>)';

-- Align courier table with native channel support (subscribe payload may include channel)
ALTER TABLE delivery.courier_push_subscriptions
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'web';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'courier_push_subscriptions_channel_check'
  ) THEN
    ALTER TABLE delivery.courier_push_subscriptions
      ADD CONSTRAINT courier_push_subscriptions_channel_check
      CHECK (channel IN ('web', 'fcm', 'apns'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Item favorites (merchant favorites already in customer_favorites)
-- menu_item_id is text so UUID catalog ids and legacy client keys both sync
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS delivery.customer_favorite_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES delivery.customers(id) ON DELETE CASCADE,
  merchant_id uuid NOT NULL REFERENCES delivery.merchants(id) ON DELETE CASCADE,
  menu_item_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, merchant_id, menu_item_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_favorite_items_customer
  ON delivery.customer_favorite_items(customer_id);

CREATE INDEX IF NOT EXISTS idx_customer_favorite_items_merchant
  ON delivery.customer_favorite_items(merchant_id);

ALTER TABLE delivery.customer_favorite_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers select own favorite items" ON delivery.customer_favorite_items;
CREATE POLICY "Customers select own favorite items"
  ON delivery.customer_favorite_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM delivery.customers c
      WHERE c.id = customer_favorite_items.customer_id
        AND c.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Customers insert own favorite items" ON delivery.customer_favorite_items;
CREATE POLICY "Customers insert own favorite items"
  ON delivery.customer_favorite_items FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM delivery.customers c
      WHERE c.id = customer_favorite_items.customer_id
        AND c.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Customers delete own favorite items" ON delivery.customer_favorite_items;
CREATE POLICY "Customers delete own favorite items"
  ON delivery.customer_favorite_items FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM delivery.customers c
      WHERE c.id = customer_favorite_items.customer_id
        AND c.user_id = (SELECT auth.uid())
    )
  );

GRANT SELECT, INSERT, DELETE ON delivery.customer_favorite_items TO authenticated;
GRANT ALL ON delivery.customer_favorite_items TO service_role;

COMMENT ON TABLE delivery.customer_favorite_items IS
  'Customer saved menu items for Roam Rush favorites sync';
