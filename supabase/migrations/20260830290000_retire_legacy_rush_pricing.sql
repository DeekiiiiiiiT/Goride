-- Retire Legacy Model A + market base delivery.
-- Tier base_delivery_fee_jmd is the sole starting customer delivery fee.

-- 1) Fill null bases only (do not overwrite live commercial values)
UPDATE delivery.merchant_tiers
SET base_delivery_fee_jmd = CASE slug
  WHEN 'economy' THEN 750
  WHEN 'growth' THEN 450
  WHEN 'dominant' THEN 150
  ELSE 450
END
WHERE base_delivery_fee_jmd IS NULL;
-- 2) Assign Growth to any merchant still missing a tier
UPDATE delivery.merchants m
SET pricing_tier_id = t.id
FROM delivery.merchant_tiers t
WHERE m.pricing_tier_id IS NULL
  AND t.slug = 'growth';

-- 3) Lock tier base column
ALTER TABLE delivery.merchant_tiers
  ALTER COLUMN base_delivery_fee_jmd SET NOT NULL;

ALTER TABLE delivery.merchant_tiers
  DROP CONSTRAINT IF EXISTS merchant_tiers_base_delivery_fee_jmd_check;

ALTER TABLE delivery.merchant_tiers
  ADD CONSTRAINT merchant_tiers_base_delivery_fee_jmd_check
  CHECK (base_delivery_fee_jmd >= 0);

COMMENT ON COLUMN delivery.merchant_tiers.base_delivery_fee_jmd IS
  'Starting customer delivery fee for this tier (sole source; market base retired).';

-- 4) Strip legacy keys from pricing profile / layer JSON blobs
CREATE OR REPLACE FUNCTION delivery.strip_legacy_pricing_keys(rules jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  out jsonb := COALESCE(rules, '{}'::jsonb);
  delivery jsonb;
  customer jsonb;
  rider jsonb;
  platform jsonb;
BEGIN
  -- Flat root keys
  out := out - 'pricing_v2_enabled' - 'courier_delivery_share';

  IF out ? 'delivery' AND jsonb_typeof(out->'delivery') = 'object' THEN
    delivery := (out->'delivery') - 'base_fee_jmd';
    out := jsonb_set(out, '{delivery}', delivery);
  END IF;

  -- Nested party namespaces
  IF out ? 'platform' AND jsonb_typeof(out->'platform') = 'object' THEN
    platform := (out->'platform') - 'pricing_v2_enabled';
    out := jsonb_set(out, '{platform}', platform);
  END IF;

  IF out ? 'customer' AND jsonb_typeof(out->'customer') = 'object' THEN
    customer := out->'customer';
    IF customer ? 'delivery' AND jsonb_typeof(customer->'delivery') = 'object' THEN
      delivery := (customer->'delivery') - 'base_fee_jmd';
      customer := jsonb_set(customer, '{delivery}', delivery);
    END IF;
    out := jsonb_set(out, '{customer}', customer);
  END IF;

  IF out ? 'rider' AND jsonb_typeof(out->'rider') = 'object' THEN
    rider := (out->'rider') - 'courier_delivery_share';
    out := jsonb_set(out, '{rider}', rider);
  END IF;

  RETURN out;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'delivery' AND table_name = 'global_pricing_profiles'
      AND column_name = 'rules'
  ) THEN
    UPDATE delivery.global_pricing_profiles
    SET rules = delivery.strip_legacy_pricing_keys(rules)
    WHERE rules IS NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'delivery' AND table_name = 'parish_pricing_profiles'
      AND column_name = 'rules'
  ) THEN
    UPDATE delivery.parish_pricing_profiles
    SET rules = delivery.strip_legacy_pricing_keys(rules)
    WHERE rules IS NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'delivery' AND table_name = 'market_pricing_profiles'
      AND column_name = 'rules'
  ) THEN
    UPDATE delivery.market_pricing_profiles
    SET rules = delivery.strip_legacy_pricing_keys(rules)
    WHERE rules IS NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'delivery' AND table_name = 'pricing_rule_layers'
      AND column_name = 'rules'
  ) THEN
    UPDATE delivery.pricing_rule_layers
    SET rules = delivery.strip_legacy_pricing_keys(rules)
    WHERE rules IS NOT NULL;
  END IF;
END $$;

DROP FUNCTION IF EXISTS delivery.strip_legacy_pricing_keys(jsonb);
