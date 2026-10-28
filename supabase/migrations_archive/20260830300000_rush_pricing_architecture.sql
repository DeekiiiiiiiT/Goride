-- Rush pricing architecture: global delivery fee, merchant inflation, no legacy model.
-- Pre-launch: no backwards compatibility.

-- 1) Merchant-owned menu inflation
ALTER TABLE delivery.merchants
  ADD COLUMN IF NOT EXISTS menu_inflation_percent numeric NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'merchants_menu_inflation_percent_check'
      AND conrelid = 'delivery.merchants'::regclass
  ) THEN
    ALTER TABLE delivery.merchants
      ADD CONSTRAINT merchants_menu_inflation_percent_check
      CHECK (menu_inflation_percent >= 0 AND menu_inflation_percent <= 1);
  END IF;
END $$;

-- Backfill from current tier before dropping tier column
UPDATE delivery.merchants m
SET menu_inflation_percent = COALESCE(t.menu_inflation_percent, 0)
FROM delivery.merchant_tiers t
WHERE m.pricing_tier_id = t.id
  AND (m.menu_inflation_percent = 0 OR m.menu_inflation_percent IS NULL);

-- 2) Order margin + promo attribution
ALTER TABLE delivery.orders
  ADD COLUMN IF NOT EXISTS contribution_jmd numeric;

ALTER TABLE delivery.orders
  ADD COLUMN IF NOT EXISTS promo_funded_by text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_promo_funded_by_check'
      AND conrelid = 'delivery.orders'::regclass
  ) THEN
    ALTER TABLE delivery.orders
      ADD CONSTRAINT orders_promo_funded_by_check
      CHECK (
        promo_funded_by IS NULL
        OR promo_funded_by IN ('merchant', 'platform', 'shared')
      );
  END IF;
END $$;

-- 3) Drop tier delivery base + inflation (demand goods only)
ALTER TABLE delivery.merchant_tiers
  DROP COLUMN IF EXISTS base_delivery_fee_jmd;

ALTER TABLE delivery.merchant_tiers
  DROP COLUMN IF EXISTS menu_inflation_percent;

-- 4) Drop pricing_model — every order is Model B
ALTER TABLE delivery.orders
  DROP COLUMN IF EXISTS pricing_model;

-- 5) Reseed active global rules to target architecture
UPDATE delivery.global_pricing_profiles
SET
  rules = jsonb_strip_nulls(
    jsonb_build_object(
      'platform', jsonb_build_object(
        'max_menu_inflation_percent', 0.25
      ),
      'customer', jsonb_build_object(
        'delivery', jsonb_build_object(
          'base_jmd', 450,
          'included_km', 0,
          'per_km_jmd', 60,
          'per_extra_km_jmd', 60
        ),
        'service_fee', jsonb_build_object(
          'mode', 'marginal',
          'avg_rate', 0.115,
          'override_rate', 0.085,
          'override_threshold_jmd', 5000,
          'min_jmd', 150,
          'max_jmd', 2500,
          'flat_jmd', 120,
          'percent', 0.05
        ),
        'min_order_subtotal_jmd', 600,
        'small_order_threshold_jmd', 800,
        'small_order_fee_jmd', 150,
        'card_processing_fee_percent', 0.045,
        'launch_promos', jsonb_build_object(
          'free_delivery_first_n_orders', 0
        )
      ),
      'rider', jsonb_build_object(
        'courier_base_pay_jmd', 150,
        'courier_per_km_jmd', 60,
        'courier_min_pay_jmd', 350,
        'road_distance_multiplier', 1.4,
        'tip_processing_from_rider', true,
        'cod', jsonb_build_object('pause_threshold_jmd', 10000)
      ),
      'partner', jsonb_build_object(),
      'guardrails', jsonb_build_object(
        'min_delivery_margin_jmd', 100,
        'min_order_contribution_jmd', 150
      )
    )
  ),
  updated_at = now()
WHERE is_active = true;

-- Strip retired keys from parish/market override layers if present
UPDATE delivery.parish_pricing_profiles
SET rules = (
  rules
  #- '{customer,delivery,max_fee_jmd}'
  #- '{customer,hard_min_order_subtotal_jmd}'
  #- '{delivery,max_fee_jmd}'
  #- '{hard_min_order_subtotal_jmd}'
  #- '{platform,commission_base}'
  #- '{commission_base}'
),
updated_at = now()
WHERE rules IS NOT NULL;

UPDATE delivery.market_pricing_profiles
SET rules = (
  rules
  #- '{customer,delivery,max_fee_jmd}'
  #- '{customer,hard_min_order_subtotal_jmd}'
  #- '{delivery,max_fee_jmd}'
  #- '{hard_min_order_subtotal_jmd}'
  #- '{platform,commission_base}'
  #- '{commission_base}'
),
updated_at = now()
WHERE rules IS NOT NULL;

COMMENT ON COLUMN delivery.merchants.menu_inflation_percent IS
  'Merchant-chosen menu markup 0–1; capped by platform.max_menu_inflation_percent';
COMMENT ON COLUMN delivery.orders.contribution_jmd IS
  'True platform contribution: commission + service + delivery_platform + small_order - peak (excludes GCT/WiPay)';
COMMENT ON COLUMN delivery.orders.promo_funded_by IS
  'Who funds food discount: merchant | platform | shared';
