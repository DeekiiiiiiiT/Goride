-- Unified person spine for Rush user management (Phase 1)

CREATE TABLE IF NOT EXISTS platform.identities (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  primary_email TEXT,
  primary_phone TEXT,
  display_name TEXT,
  global_status TEXT NOT NULL DEFAULT 'active'
    CHECK (global_status IN ('active', 'restricted', 'suspended', 'banned', 'deleted')),
  status_reason TEXT,
  status_changed_at TIMESTAMPTZ,
  status_changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  risk_score INT NOT NULL DEFAULT 0,
  mfa_enrolled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_identities_global_status ON platform.identities(global_status);
CREATE INDEX IF NOT EXISTS idx_identities_primary_email ON platform.identities(primary_email);

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
  COALESCE(m.operational_status, 'active') AS status,
  m.market_id
FROM delivery.merchants m
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

-- Backfill identities from all persona sources
INSERT INTO platform.identities (user_id, primary_email, primary_phone, display_name, global_status)
SELECT DISTINCT ON (u.id)
  u.id,
  COALESCE(u.email, c.email, cp.email),
  COALESCE(c.phone, cp.phone),
  COALESCE(c.name, cp.display_name, u.raw_user_meta_data->>'full_name'),
  'active'
FROM auth.users u
LEFT JOIN delivery.customers c ON c.user_id = u.id
LEFT JOIN delivery.courier_profiles cp ON cp.user_id = u.id
LEFT JOIN delivery.merchants m ON m.owner_id = u.id
LEFT JOIN delivery.merchant_team_members mtm ON mtm.user_id = u.id
WHERE c.user_id IS NOT NULL
   OR cp.user_id IS NOT NULL
   OR m.owner_id IS NOT NULL
   OR mtm.user_id IS NOT NULL
ON CONFLICT (user_id) DO UPDATE SET
  primary_email = COALESCE(EXCLUDED.primary_email, platform.identities.primary_email),
  primary_phone = COALESCE(EXCLUDED.primary_phone, platform.identities.primary_phone),
  display_name = COALESCE(EXCLUDED.display_name, platform.identities.display_name),
  updated_at = NOW();

GRANT SELECT ON platform.identities TO service_role;
GRANT SELECT ON platform.identity_personas TO service_role;
