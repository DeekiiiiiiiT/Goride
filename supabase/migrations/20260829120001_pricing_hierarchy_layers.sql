-- Pricing hierarchy: Default (global) → Parish → Town (market).
-- Town overrides parish; parish overrides default. Missing layers inherit upward.

CREATE TABLE IF NOT EXISTS delivery.global_pricing_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  effective_from timestamptz NOT NULL DEFAULT now(),
  rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (version)
);

CREATE INDEX IF NOT EXISTS idx_global_pricing_profiles_active
  ON delivery.global_pricing_profiles(is_active)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS delivery.parish_pricing_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parish_id uuid NOT NULL REFERENCES delivery.service_parishes(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  effective_from timestamptz NOT NULL DEFAULT now(),
  rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (parish_id, version)
);

CREATE INDEX IF NOT EXISTS idx_parish_pricing_profiles_active
  ON delivery.parish_pricing_profiles(parish_id, is_active)
  WHERE is_active = true;

ALTER TABLE delivery.pricing_change_log
  ADD COLUMN IF NOT EXISTS parish_id uuid REFERENCES delivery.service_parishes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scope text;

COMMENT ON TABLE delivery.global_pricing_profiles IS
  'Platform default pricing rules. Inherited by every market unless parish/town override exists.';
COMMENT ON TABLE delivery.parish_pricing_profiles IS
  'Optional parish-level pricing overrides (Default ← Parish ← Town).';
COMMENT ON COLUMN delivery.pricing_change_log.scope IS
  'Pricing layer: global | parish | market';

-- Seed active global defaults from Spanish Town profile when present, else launch defaults.
DO $$
DECLARE
  seed_rules jsonb;
BEGIN
  IF EXISTS (
    SELECT 1 FROM delivery.global_pricing_profiles WHERE is_active = true LIMIT 1
  ) THEN
    RETURN;
  END IF;

  SELECT p.rules INTO seed_rules
  FROM delivery.market_pricing_profiles p
  JOIN delivery.service_markets m ON m.id = p.market_id
  WHERE p.is_active = true
    AND m.slug = 'spanish-town'
  ORDER BY p.version DESC
  LIMIT 1;

  IF seed_rules IS NULL THEN
    seed_rules := '{
      "pricing_v2_enabled": false,
      "delivery": {"base_fee_jmd": 400, "included_km": 2, "per_extra_km_jmd": 60, "max_fee_jmd": 1500},
      "service_fee": {
        "mode": "marginal",
        "avg_rate": 0.15,
        "override_rate": 0.09,
        "override_threshold_jmd": 5000,
        "min_jmd": 150,
        "max_jmd": 2500,
        "flat_jmd": 120,
        "percent": 0.05
      },
      "courier_delivery_share": 0.8,
      "launch_promos": {"free_delivery_first_n_orders": 3},
      "cod": {"pause_threshold_jmd": 10000},
      "tax_rate_percent": 16.5,
      "min_order_subtotal_jmd": 800,
      "card_processing_fee_percent": 0.045
    }'::jsonb;
  END IF;

  INSERT INTO delivery.global_pricing_profiles (version, is_active, rules)
  VALUES (1, true, seed_rules);
END $$;

GRANT ALL ON delivery.global_pricing_profiles TO service_role;
GRANT ALL ON delivery.parish_pricing_profiles TO service_role;

ALTER TABLE delivery.global_pricing_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.parish_pricing_profiles ENABLE ROW LEVEL SECURITY;
