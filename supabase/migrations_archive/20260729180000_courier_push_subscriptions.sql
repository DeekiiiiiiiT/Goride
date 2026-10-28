-- Courier web-push subscriptions for offer alerts
CREATE TABLE IF NOT EXISTS delivery.courier_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text,
  auth text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (courier_user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_courier_push_subscriptions_courier
  ON delivery.courier_push_subscriptions(courier_user_id);

ALTER TABLE delivery.courier_push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Courier manages own push subscriptions" ON delivery.courier_push_subscriptions;
CREATE POLICY "Courier manages own push subscriptions" ON delivery.courier_push_subscriptions
  FOR ALL
  USING (courier_user_id = auth.uid())
  WITH CHECK (courier_user_id = auth.uid());

GRANT ALL ON delivery.courier_push_subscriptions TO authenticated, service_role;

COMMENT ON TABLE delivery.courier_push_subscriptions IS 'Web Push endpoints for courier offer alerts';
