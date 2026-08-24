-- Merchant-owner person-level account status (Partner access), separate from store operational_status.

CREATE TABLE IF NOT EXISTS delivery.merchant_owner_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  account_status TEXT NOT NULL DEFAULT 'active'
    CHECK (account_status IN ('active', 'suspended')),
  suspended_at TIMESTAMPTZ,
  suspended_reason TEXT,
  suspended_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchant_owner_profiles_account_status
  ON delivery.merchant_owner_profiles(account_status);

-- Backfill one profile per current store owner
INSERT INTO delivery.merchant_owner_profiles (user_id, account_status)
SELECT DISTINCT m.owner_id, 'active'
FROM delivery.merchants m
WHERE m.owner_id IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

-- Keep profiles in sync when a merchant gains/changes owner
CREATE OR REPLACE FUNCTION delivery.trg_ensure_merchant_owner_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = delivery, auth, public
AS $$
BEGIN
  IF NEW.owner_id IS NOT NULL THEN
    INSERT INTO delivery.merchant_owner_profiles (user_id, account_status)
    VALUES (NEW.owner_id, 'active')
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_merchant_owner_profile ON delivery.merchants;
CREATE TRIGGER ensure_merchant_owner_profile
  AFTER INSERT OR UPDATE OF owner_id ON delivery.merchants
  FOR EACH ROW EXECUTE FUNCTION delivery.trg_ensure_merchant_owner_profile();

-- Persona directory: merchant_owner status is person-level, not store operational_status
CREATE OR REPLACE VIEW platform.identity_personas AS
SELECT
  c.user_id,
  'customer'::TEXT AS persona,
  c.id AS ref_id,
  COALESCE(c.account_status, 'active') AS status,
  NULL::UUID AS market_id
FROM delivery.customers c
UNION ALL
SELECT
  cp.user_id,
  'courier'::TEXT AS persona,
  cp.user_id AS ref_id,
  cp.status,
  NULL::UUID AS market_id
FROM delivery.courier_profiles cp
UNION ALL
SELECT
  m.owner_id AS user_id,
  'merchant_owner'::TEXT AS persona,
  m.id AS ref_id,
  COALESCE(mop.account_status, 'active') AS status,
  m.market_id
FROM delivery.merchants m
LEFT JOIN delivery.merchant_owner_profiles mop ON mop.user_id = m.owner_id
WHERE m.owner_id IS NOT NULL
UNION ALL
SELECT
  mtm.user_id,
  'merchant_staff'::TEXT AS persona,
  mtm.id AS ref_id,
  'active'::TEXT AS status,
  m.market_id
FROM delivery.merchant_team_members mtm
JOIN delivery.merchants m ON m.id = mtm.merchant_id
WHERE mtm.user_id IS NOT NULL;

GRANT SELECT ON delivery.merchant_owner_profiles TO service_role;
GRANT SELECT ON platform.identity_personas TO service_role;
GRANT SELECT ON platform.identity_personas TO authenticated;
