-- Native (FCM/APNs) device tokens alongside Web Push subscriptions.
ALTER TABLE delivery.merchant_push_subscriptions
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'web';

ALTER TABLE delivery.merchant_push_subscriptions
  ALTER COLUMN p256dh DROP NOT NULL,
  ALTER COLUMN auth DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'merchant_push_subscriptions_channel_check'
  ) THEN
    ALTER TABLE delivery.merchant_push_subscriptions
      ADD CONSTRAINT merchant_push_subscriptions_channel_check
      CHECK (channel IN ('web', 'fcm', 'apns'));
  END IF;
END $$;

COMMENT ON COLUMN delivery.merchant_push_subscriptions.channel IS
  'web = browser Push API; fcm/apns = Capacitor native device token (endpoint stores fcm:<token> or apns:<token>)';

COMMENT ON TABLE delivery.merchant_push_subscriptions IS
  'Merchant push endpoints: Web Push and native FCM/APNs device tokens for new-order alerts';
