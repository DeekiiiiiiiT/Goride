-- Merchant ↔ delivery market (town) association for same-town order gating.
ALTER TABLE delivery.merchants
  ADD COLUMN IF NOT EXISTS market_id uuid REFERENCES delivery.service_markets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_merchants_market_id ON delivery.merchants(market_id);

COMMENT ON COLUMN delivery.merchants.market_id IS
  'Assigned delivery town (service_markets). Required for discovery and order eligibility; must match customer dropoff market.';
