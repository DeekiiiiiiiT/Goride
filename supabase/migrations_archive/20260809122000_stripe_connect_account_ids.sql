-- Stripe Connect Express account ids for Dash payouts (additive).

ALTER TABLE delivery.merchants
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id text;

ALTER TABLE delivery.courier_profiles
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id text;

CREATE INDEX IF NOT EXISTS merchants_stripe_connect_account_id_idx
  ON delivery.merchants (stripe_connect_account_id)
  WHERE stripe_connect_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS courier_profiles_stripe_connect_account_id_idx
  ON delivery.courier_profiles (stripe_connect_account_id)
  WHERE stripe_connect_account_id IS NOT NULL;
