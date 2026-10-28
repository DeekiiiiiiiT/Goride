-- Rush marketplace pricing: tiers, dual menu prices, courier ladder columns, small-order fee.
-- Forces Model B everywhere; reseeds Economy / Growth / Dominant.

-- ─── Tier columns ───────────────────────────────────────────────────────────
ALTER TABLE delivery.merchant_tiers
  ADD COLUMN IF NOT EXISTS base_delivery_fee_jmd numeric,
  ADD COLUMN IF NOT EXISTS menu_inflation_percent numeric DEFAULT 0;

COMMENT ON COLUMN delivery.merchant_tiers.base_delivery_fee_jmd IS
  'Customer-facing base delivery fee; replaces market base when set.';
COMMENT ON COLUMN delivery.merchant_tiers.menu_inflation_percent IS
  '0–1 multiplier applied to in-store → marketplace price (e.g. 0.20 = 20%).';

-- ─── Tier assignment history ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery.merchant_tier_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES delivery.merchants(id) ON DELETE CASCADE,
  tier_id uuid NOT NULL REFERENCES delivery.merchant_tiers(id),
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  changed_by uuid,
  agreed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS merchant_tier_assignments_merchant_idx
  ON delivery.merchant_tier_assignments (merchant_id, effective_from DESC);

-- ─── Dual menu prices ───────────────────────────────────────────────────────
ALTER TABLE delivery.menu_items
  ADD COLUMN IF NOT EXISTS in_store_price numeric,
  ADD COLUMN IF NOT EXISTS marketplace_price numeric;

UPDATE delivery.menu_items
SET in_store_price = COALESCE(in_store_price, price),
    marketplace_price = COALESCE(marketplace_price, price)
WHERE in_store_price IS NULL OR marketplace_price IS NULL;

COMMENT ON COLUMN delivery.menu_items.in_store_price IS 'Merchant in-store / kitchen price (JMD).';
COMMENT ON COLUMN delivery.menu_items.marketplace_price IS 'Customer-facing Roam Rush price (JMD).';
COMMENT ON COLUMN delivery.menu_items.price IS 'Alias of marketplace_price during transition.';

-- Keep price synced to marketplace_price on write via trigger
CREATE OR REPLACE FUNCTION delivery.sync_menu_item_price_alias()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.marketplace_price IS NOT NULL THEN
    NEW.price := NEW.marketplace_price;
  ELSIF NEW.in_store_price IS NOT NULL AND NEW.price IS NULL THEN
    NEW.marketplace_price := NEW.in_store_price;
    NEW.price := NEW.in_store_price;
  END IF;
  IF NEW.in_store_price IS NULL AND NEW.price IS NOT NULL THEN
    NEW.in_store_price := NEW.price;
  END IF;
  IF NEW.marketplace_price IS NULL AND NEW.price IS NOT NULL THEN
    NEW.marketplace_price := NEW.price;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_menu_item_price_alias ON delivery.menu_items;
CREATE TRIGGER trg_sync_menu_item_price_alias
  BEFORE INSERT OR UPDATE ON delivery.menu_items
  FOR EACH ROW
  EXECUTE FUNCTION delivery.sync_menu_item_price_alias();

-- ─── Order money columns ────────────────────────────────────────────────────
ALTER TABLE delivery.orders
  ADD COLUMN IF NOT EXISTS platform_delivery_subsidy_jmd numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS small_order_fee numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS courier_base_pay_jmd numeric,
  ADD COLUMN IF NOT EXISTS courier_distance_pay_jmd numeric;

COMMENT ON COLUMN delivery.orders.platform_delivery_subsidy_jmd IS
  'Platform cost when courier pay exceeds customer delivery fee.';
COMMENT ON COLUMN delivery.orders.small_order_fee IS
  'Customer small-order fee when subtotal below threshold.';

-- ─── Force Model B on all pricing profiles ──────────────────────────────────
UPDATE delivery.global_pricing_profiles
SET rules = jsonb_set(
  COALESCE(rules, '{}'::jsonb),
  '{platform,pricing_v2_enabled}',
  'true'::jsonb,
  true
);

UPDATE delivery.parish_pricing_profiles
SET rules = jsonb_set(
  COALESCE(rules, '{}'::jsonb),
  '{platform,pricing_v2_enabled}',
  'true'::jsonb,
  true
);

UPDATE delivery.market_pricing_profiles
SET rules = jsonb_set(
  COALESCE(rules, '{}'::jsonb),
  '{platform,pricing_v2_enabled}',
  'true'::jsonb,
  true
);

-- Also set flat key for any legacy flat blobs
UPDATE delivery.global_pricing_profiles
SET rules = jsonb_set(COALESCE(rules, '{}'::jsonb), '{pricing_v2_enabled}', 'true'::jsonb, true);
UPDATE delivery.parish_pricing_profiles
SET rules = jsonb_set(COALESCE(rules, '{}'::jsonb), '{pricing_v2_enabled}', 'true'::jsonb, true);
UPDATE delivery.market_pricing_profiles
SET rules = jsonb_set(COALESCE(rules, '{}'::jsonb), '{pricing_v2_enabled}', 'true'::jsonb, true);

-- Seed courier ladder + small-order defaults into global profile when missing
UPDATE delivery.global_pricing_profiles
SET rules = rules
  || jsonb_build_object(
    'rider', COALESCE(rules->'rider', '{}'::jsonb) || jsonb_build_object(
      'courier_base_pay_jmd', COALESCE((rules->'rider'->>'courier_base_pay_jmd')::numeric, 250),
      'courier_per_km_jmd', COALESCE((rules->'rider'->>'courier_per_km_jmd')::numeric, 80),
      'courier_min_pay_jmd', COALESCE((rules->'rider'->>'courier_min_pay_jmd')::numeric, 350)
    ),
    'customer', COALESCE(rules->'customer', '{}'::jsonb) || jsonb_build_object(
      'hard_min_order_subtotal_jmd', COALESCE((rules->'customer'->>'hard_min_order_subtotal_jmd')::numeric, 400),
      'small_order_threshold_jmd', COALESCE((rules->'customer'->>'small_order_threshold_jmd')::numeric, 1500),
      'small_order_fee_jmd', COALESCE((rules->'customer'->>'small_order_fee_jmd')::numeric, 400),
      'min_order_subtotal_jmd', COALESCE((rules->'customer'->>'min_order_subtotal_jmd')::numeric, 1500)
    ),
    'platform', COALESCE(rules->'platform', '{}'::jsonb) || jsonb_build_object(
      'max_menu_inflation_percent', COALESCE((rules->'platform'->>'max_menu_inflation_percent')::numeric, 0.25),
      'pricing_v2_enabled', true
    )
  );

-- ─── Reseed tiers: Economy / Growth / Dominant ──────────────────────────────
-- Rename existing rows in place when slugs match basic/standard/premium
UPDATE delivery.merchant_tiers SET
  slug = 'economy',
  name = 'Economy',
  commission_rate = 0.15,
  base_delivery_fee_jmd = 900,
  menu_inflation_percent = 0,
  search_boost = 0,
  promo_eligible = false,
  sort_order = 1
WHERE slug = 'basic';

UPDATE delivery.merchant_tiers SET
  slug = 'growth',
  name = 'Growth',
  commission_rate = 0.25,
  base_delivery_fee_jmd = 450,
  menu_inflation_percent = 0.10,
  search_boost = 10,
  promo_eligible = true,
  sort_order = 2
WHERE slug = 'standard';

UPDATE delivery.merchant_tiers SET
  slug = 'dominant',
  name = 'Dominant',
  commission_rate = 0.30,
  base_delivery_fee_jmd = 150,
  menu_inflation_percent = 0.20,
  search_boost = 50,
  promo_eligible = true,
  sort_order = 3
WHERE slug = 'premium';

INSERT INTO delivery.merchant_tiers (
  slug, name, commission_rate, base_delivery_fee_jmd, menu_inflation_percent,
  search_boost, promo_eligible, sort_order, is_active
)
VALUES
  ('economy', 'Economy', 0.15, 900, 0, 0, false, 1, true),
  ('growth', 'Growth', 0.25, 450, 0.10, 10, true, 2, true),
  ('dominant', 'Dominant', 0.30, 150, 0.20, 50, true, 3, true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  commission_rate = EXCLUDED.commission_rate,
  base_delivery_fee_jmd = EXCLUDED.base_delivery_fee_jmd,
  menu_inflation_percent = EXCLUDED.menu_inflation_percent,
  search_boost = EXCLUDED.search_boost,
  promo_eligible = EXCLUDED.promo_eligible,
  sort_order = EXCLUDED.sort_order,
  is_active = true;
