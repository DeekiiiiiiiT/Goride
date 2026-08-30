-- Phase 2 Growth Guarantee + Phase 3 Rush Pass
-- dominant_assigned_at already added in 20260830310000

-- ─── Growth Guarantee: idempotent merchant adjustments ───────────────────────
ALTER TABLE payments.merchant_adjustments
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS merchant_adjustments_idempotency_key_uidx
  ON payments.merchant_adjustments (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN payments.merchant_adjustments.idempotency_key IS
  'Unique key for cron credits e.g. gg:{merchant_id}:{yyyy-mm}';

-- Seed growth_guarantee into active global rules if missing
UPDATE delivery.global_pricing_profiles
SET
  rules = COALESCE(rules, '{}'::jsonb) || jsonb_build_object(
    'growth_guarantee',
    COALESCE(
      rules->'growth_guarantee',
      jsonb_build_object(
        'enabled', true,
        'tier_slugs', jsonb_build_array('dominant'),
        'months_from_assignment', 6,
        'min_orders_per_month', 20
      )
    )
  ),
  updated_at = now()
WHERE is_active = true;

-- ─── Rush Pass plans + memberships ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery.rush_pass_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  price_jmd numeric NOT NULL CHECK (price_jmd >= 0),
  billing_period_days int NOT NULL DEFAULT 30 CHECK (billing_period_days > 0),
  free_delivery boolean NOT NULL DEFAULT true,
  service_fee_multiplier numeric NOT NULL DEFAULT 0.5
    CHECK (service_fee_multiplier >= 0 AND service_fee_multiplier <= 1),
  eligible_tier_slugs text[] NOT NULL DEFAULT ARRAY['growth', 'dominant']::text[],
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS delivery.rush_pass_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES delivery.customers(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES delivery.rush_pass_plans(id),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'past_due', 'cancelled', 'expired')),
  current_period_start timestamptz NOT NULL,
  current_period_end timestamptz NOT NULL,
  source text NOT NULL DEFAULT 'wipay'
    CHECK (source IN ('wipay', 'admin_grant')),
  auto_renew boolean NOT NULL DEFAULT true,
  last_payment_intent_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rush_pass_memberships_customer_status_idx
  ON delivery.rush_pass_memberships (customer_id, status);

CREATE INDEX IF NOT EXISTS rush_pass_memberships_period_end_idx
  ON delivery.rush_pass_memberships (current_period_end)
  WHERE status = 'active';

ALTER TABLE delivery.rush_pass_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.rush_pass_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rush_pass_plans_service ON delivery.rush_pass_plans;
CREATE POLICY rush_pass_plans_service ON delivery.rush_pass_plans
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS rush_pass_plans_auth_select ON delivery.rush_pass_plans;
CREATE POLICY rush_pass_plans_auth_select ON delivery.rush_pass_plans
  FOR SELECT TO authenticated USING (is_active = true);

DROP POLICY IF EXISTS rush_pass_memberships_service ON delivery.rush_pass_memberships;
CREATE POLICY rush_pass_memberships_service ON delivery.rush_pass_memberships
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS rush_pass_memberships_owner_select ON delivery.rush_pass_memberships;
CREATE POLICY rush_pass_memberships_owner_select ON delivery.rush_pass_memberships
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM delivery.customers c
      WHERE c.id = rush_pass_memberships.customer_id
        AND c.user_id = auth.uid()
    )
  );

GRANT ALL ON delivery.rush_pass_plans TO service_role;
GRANT ALL ON delivery.rush_pass_memberships TO service_role;
GRANT SELECT ON delivery.rush_pass_plans TO authenticated;
GRANT SELECT ON delivery.rush_pass_memberships TO authenticated;

INSERT INTO delivery.rush_pass_plans (
  slug, name, price_jmd, billing_period_days, free_delivery, service_fee_multiplier, eligible_tier_slugs, is_active
)
VALUES (
  'rush_pass_standard',
  'Rush Pass',
  1500,
  30,
  true,
  0.5,
  ARRAY['growth', 'dominant']::text[],
  true
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  price_jmd = EXCLUDED.price_jmd,
  billing_period_days = EXCLUDED.billing_period_days,
  free_delivery = EXCLUDED.free_delivery,
  service_fee_multiplier = EXCLUDED.service_fee_multiplier,
  eligible_tier_slugs = EXCLUDED.eligible_tier_slugs,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- Persist Pass on orders (pricing_snapshot also stores flags)
ALTER TABLE delivery.orders
  ADD COLUMN IF NOT EXISTS rush_pass_membership_id uuid
    REFERENCES delivery.rush_pass_memberships(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS orders_rush_pass_membership_id_idx
  ON delivery.orders (rush_pass_membership_id)
  WHERE rush_pass_membership_id IS NOT NULL;

COMMENT ON COLUMN delivery.orders.rush_pass_membership_id IS
  'Active Rush Pass membership applied at place-order (nullable)';

COMMENT ON TABLE delivery.rush_pass_plans IS
  'Customer subscription plans: free delivery + reduced service fee at eligible tiers';
COMMENT ON TABLE delivery.rush_pass_memberships IS
  'Per-customer Rush Pass period; activated via WiPay or admin grant';

-- Seed distance_addon under customer.service_fee if missing (off by default)
UPDATE delivery.global_pricing_profiles
SET rules = jsonb_set(
  rules,
  '{customer,service_fee,distance_addon}',
  COALESCE(
    rules#>'{customer,service_fee,distance_addon}',
    jsonb_build_object('enabled', false, 'threshold_km', 5, 'per_km_jmd', 20, 'max_jmd', 200)
  ),
  true
),
updated_at = now()
WHERE is_active = true;
