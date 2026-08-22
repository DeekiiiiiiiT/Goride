-- Rush Model B pricing engine: merchant tiers, market profiles, order snapshots, COD ledger.

-- ---------------------------------------------------------------------------
-- Merchant tiers (Basic / Standard / Premium)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS delivery.merchant_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  commission_rate numeric NOT NULL CHECK (commission_rate >= 0 AND commission_rate <= 1),
  search_boost integer NOT NULL DEFAULT 0,
  default_delivery_radius_km numeric NOT NULL DEFAULT 8,
  promo_eligible boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Market pricing profiles (versioned rules per service market)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS delivery.market_pricing_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES delivery.service_markets(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  effective_from timestamptz NOT NULL DEFAULT now(),
  rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (market_id, version)
);

CREATE INDEX IF NOT EXISTS idx_market_pricing_profiles_active
  ON delivery.market_pricing_profiles(market_id, is_active)
  WHERE is_active = true;

-- ---------------------------------------------------------------------------
-- Pricing change audit log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS delivery.pricing_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid REFERENCES delivery.service_markets(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  action text NOT NULL,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pricing_change_log_market
  ON delivery.pricing_change_log(market_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Merchant pricing columns
-- ---------------------------------------------------------------------------
ALTER TABLE delivery.merchants
  ADD COLUMN IF NOT EXISTS pricing_tier_id uuid REFERENCES delivery.merchant_tiers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS merchant_commission_rate numeric
    CHECK (merchant_commission_rate IS NULL OR (merchant_commission_rate >= 0 AND merchant_commission_rate <= 1)),
  ADD COLUMN IF NOT EXISTS service_fee_override jsonb;

COMMENT ON COLUMN delivery.merchants.pricing_tier_id IS 'Merchant pricing tier (Basic/Standard/Premium).';
COMMENT ON COLUMN delivery.merchants.merchant_commission_rate IS 'Per-merchant commission override; NULL uses tier default.';
COMMENT ON COLUMN delivery.merchants.service_fee_override IS 'Optional service fee override: { "mode": "flat"|"percent", "amount": number, "min": number, "max": number }.';

-- Map legacy commission_rate overrides to service_fee_override (Model A → transition)
UPDATE delivery.merchants
SET service_fee_override = jsonb_build_object(
  'mode', 'percent',
  'amount', commission_rate,
  'min', 0,
  'max', 99999
)
WHERE commission_rate IS NOT NULL
  AND service_fee_override IS NULL;

-- ---------------------------------------------------------------------------
-- Order pricing snapshot columns (Model B)
-- ---------------------------------------------------------------------------
ALTER TABLE delivery.orders
  ADD COLUMN IF NOT EXISTS distance_km numeric,
  ADD COLUMN IF NOT EXISTS merchant_commission_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_fee numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_fee_platform_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_fee_courier_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pricing_profile_version integer,
  ADD COLUMN IF NOT EXISTS pricing_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS pricing_model text DEFAULT 'legacy';

COMMENT ON COLUMN delivery.orders.pricing_model IS 'legacy = Model A; v2 = Model B tiered pricing.';
COMMENT ON COLUMN delivery.orders.service_fee IS 'Customer-facing service fee (Model B). platform_fee kept for compat.';

-- ---------------------------------------------------------------------------
-- COD cash ledger (schema; logic wired in Phase 3)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS delivery.courier_cash_balances (
  courier_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance_jmd numeric NOT NULL DEFAULT 0 CHECK (balance_jmd >= 0),
  pause_threshold_jmd numeric NOT NULL DEFAULT 10000,
  is_paused boolean NOT NULL DEFAULT false,
  paused_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS delivery.courier_cash_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id uuid REFERENCES delivery.orders(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('collected', 'settled', 'adjustment')),
  amount_jmd numeric NOT NULL,
  balance_after numeric NOT NULL,
  settlement_method text,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_courier_cash_events_courier
  ON delivery.courier_cash_events(courier_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- RLS: service role only (admin edge functions)
-- ---------------------------------------------------------------------------
ALTER TABLE delivery.merchant_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.market_pricing_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.pricing_change_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.courier_cash_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.courier_cash_events ENABLE ROW LEVEL SECURITY;

GRANT ALL ON delivery.merchant_tiers TO service_role;
GRANT ALL ON delivery.market_pricing_profiles TO service_role;
GRANT ALL ON delivery.pricing_change_log TO service_role;
GRANT ALL ON delivery.courier_cash_balances TO service_role;
GRANT ALL ON delivery.courier_cash_events TO service_role;

-- ---------------------------------------------------------------------------
-- Seed merchant tiers
-- ---------------------------------------------------------------------------
INSERT INTO delivery.merchant_tiers (slug, name, commission_rate, search_boost, default_delivery_radius_km, promo_eligible, sort_order)
VALUES
  ('basic', 'Basic', 0.12, 0, 6, false, 10),
  ('standard', 'Standard', 0.20, 5, 10, true, 20),
  ('premium', 'Premium', 0.25, 10, 15, true, 30)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  commission_rate = EXCLUDED.commission_rate,
  search_boost = EXCLUDED.search_boost,
  default_delivery_radius_km = EXCLUDED.default_delivery_radius_km,
  promo_eligible = EXCLUDED.promo_eligible,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- Seed Spanish Town market pricing profile (launch defaults)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  st_market_id uuid;
  basic_tier_id uuid;
BEGIN
  SELECT id INTO st_market_id FROM delivery.service_markets WHERE slug = 'spanish_town' LIMIT 1;
  SELECT id INTO basic_tier_id FROM delivery.merchant_tiers WHERE slug = 'standard' LIMIT 1;

  IF st_market_id IS NOT NULL THEN
    INSERT INTO delivery.market_pricing_profiles (market_id, version, is_active, rules)
    VALUES (
      st_market_id,
      1,
      true,
      jsonb_build_object(
        'pricing_v2_enabled', false,
        'delivery', jsonb_build_object(
          'base_fee_jmd', 400,
          'included_km', 2,
          'per_extra_km_jmd', 60,
          'max_fee_jmd', 1500
        ),
        'service_fee', jsonb_build_object(
          'mode', 'flat',
          'flat_jmd', 120,
          'percent', 0.05,
          'min_jmd', 100,
          'max_jmd', 200
        ),
        'courier_delivery_share', 0.80,
        'cod', jsonb_build_object(
          'pause_threshold_jmd', 10000
        ),
        'launch_promos', jsonb_build_object(
          'free_delivery_first_n_orders', 3
        ),
        'tax_rate_percent', 16.5
      )
    )
    ON CONFLICT (market_id, version) DO UPDATE SET
      rules = EXCLUDED.rules,
      is_active = true,
      updated_at = now();

    -- Assign standard tier to Spanish Town demo merchants
    UPDATE delivery.merchants
    SET pricing_tier_id = basic_tier_id
    WHERE slug IN ('island-grill', 'marios-pizza', 'burger-spot', 'green-life')
      AND pricing_tier_id IS NULL;
  END IF;
END $$;

-- Kingston market profile (disabled v2 by default)
DO $$
DECLARE
  k_market_id uuid;
BEGIN
  SELECT id INTO k_market_id FROM delivery.service_markets WHERE slug = 'kingston' LIMIT 1;
  IF k_market_id IS NOT NULL THEN
    INSERT INTO delivery.market_pricing_profiles (market_id, version, is_active, rules)
    VALUES (
      k_market_id,
      1,
      true,
      jsonb_build_object(
        'pricing_v2_enabled', false,
        'delivery', jsonb_build_object(
          'base_fee_jmd', 350,
          'included_km', 2,
          'per_extra_km_jmd', 50,
          'max_fee_jmd', 1200
        ),
        'service_fee', jsonb_build_object(
          'mode', 'percent',
          'flat_jmd', 100,
          'percent', 0.05,
          'min_jmd', 100,
          'max_jmd', 200
        ),
        'courier_delivery_share', 0.80,
        'cod', jsonb_build_object('pause_threshold_jmd', 10000),
        'launch_promos', jsonb_build_object('free_delivery_first_n_orders', 0),
        'tax_rate_percent', 16.5
      )
    )
    ON CONFLICT (market_id, version) DO NOTHING;
  END IF;
END $$;
