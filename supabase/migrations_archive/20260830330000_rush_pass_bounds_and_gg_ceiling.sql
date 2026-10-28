-- Rush Pass free-delivery bounds (audit defect E)
ALTER TABLE delivery.rush_pass_plans
  ADD COLUMN IF NOT EXISTS max_free_delivery_km numeric NOT NULL DEFAULT 8
    CHECK (max_free_delivery_km > 0);

ALTER TABLE delivery.rush_pass_plans
  ADD COLUMN IF NOT EXISTS monthly_subsidy_budget_jmd numeric
    CHECK (monthly_subsidy_budget_jmd IS NULL OR monthly_subsidy_budget_jmd > 0);

COMMENT ON COLUMN delivery.rush_pass_plans.max_free_delivery_km IS
  'Road km above which Pass still cuts service fee but charges normal delivery';
COMMENT ON COLUMN delivery.rush_pass_plans.monthly_subsidy_budget_jmd IS
  'Cap on platform delivery subsidy per membership period; defaults to price_jmd when null';

UPDATE delivery.rush_pass_plans
SET
  max_free_delivery_km = COALESCE(NULLIF(max_free_delivery_km, 0), 8),
  monthly_subsidy_budget_jmd = COALESCE(monthly_subsidy_budget_jmd, price_jmd),
  updated_at = now()
WHERE slug = 'rush_pass_standard';

-- Seed platform rush_pass + GG ceiling into active global rules
UPDATE delivery.global_pricing_profiles
SET
  rules = COALESCE(rules, '{}'::jsonb)
    || jsonb_build_object(
      'rush_pass',
      COALESCE(
        rules->'rush_pass',
        jsonb_build_object(
          'max_free_delivery_km', 8,
          'monthly_subsidy_budget_jmd', 1500
        )
      )
    )
    || jsonb_build_object(
      'growth_guarantee',
      COALESCE(rules->'growth_guarantee', '{}'::jsonb)
        || jsonb_build_object(
          'max_credit_jmd_per_period',
          COALESCE(
            (rules->'growth_guarantee'->>'max_credit_jmd_per_period')::numeric,
            50000
          )
        )
    ),
  updated_at = now()
WHERE is_active = true;
