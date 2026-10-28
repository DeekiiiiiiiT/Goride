-- Customer marketing/order notification opt-ins (honored at send time).
ALTER TABLE delivery.customers
  ADD COLUMN IF NOT EXISTS notification_prefs jsonb NOT NULL DEFAULT '{
    "orderUpdates": true,
    "promotions": true,
    "newRestaurants": false,
    "personalizedPicks": true,
    "emailNewsletters": true,
    "smsUpdates": true
  }'::jsonb;

COMMENT ON COLUMN delivery.customers.notification_prefs IS
  'Opt-ins: orderUpdates, promotions, newRestaurants, personalizedPicks, emailNewsletters, smsUpdates';
