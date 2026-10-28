-- Fleet Team Management: org-scoped staff seats + one workforce membership.

-- ---------------------------------------------------------------------------
-- platform.user_roles / pending_invites: allow an organization scope
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT con.conname, rel.relname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'platform'
      AND rel.relname IN ('user_roles', 'pending_invites')
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%scope_type%'
  LOOP
    EXECUTE format('ALTER TABLE platform.%I DROP CONSTRAINT %I', r.relname, r.conname);
  END LOOP;
END $$;

ALTER TABLE platform.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_user_id_role_id_key;

ALTER TABLE platform.user_roles
  ADD CONSTRAINT user_roles_scope_type_check
  CHECK (scope_type IN ('global', 'product', 'market', 'organization'));

ALTER TABLE platform.pending_invites
  ADD CONSTRAINT pending_invites_scope_type_check
  CHECK (scope_type IN ('global', 'product', 'market', 'organization'));

ALTER TABLE platform.user_roles
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE platform.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_status_check;
ALTER TABLE platform.user_roles
  ADD CONSTRAINT user_roles_status_check
  CHECK (status IN ('active', 'suspended'));

CREATE UNIQUE INDEX IF NOT EXISTS user_roles_user_role_scope_uidx
  ON platform.user_roles (
    user_id,
    role_id,
    scope_type,
    COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

ALTER TABLE platform.pending_invites
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- Staff roles (fleet + enterprise seats)
-- ---------------------------------------------------------------------------
INSERT INTO platform.roles (name, display_name, description, level, product_key, is_system) VALUES
  ('fleet_owner', 'Fleet Owner', 'Owns the fleet dashboard', 900, 'fleet', TRUE),
  ('fleet_manager', 'Fleet Manager', 'Operates the fleet; cannot manage staff or the Fleet Tag', 700, 'fleet', TRUE),
  ('fleet_accountant', 'Fleet Accountant', 'Financial read access', 500, 'fleet', TRUE),
  ('fleet_viewer', 'Fleet Viewer', 'Read-only dashboard', 300, 'fleet', TRUE),
  ('enterprise_owner', 'Enterprise Owner', 'Owns the enterprise dashboard', 900, 'enterprise', TRUE),
  ('enterprise_dispatcher', 'Dispatcher', 'Enterprise operations', 700, 'enterprise', TRUE),
  ('enterprise_customs', 'Customs', 'Enterprise customs', 700, 'enterprise', TRUE),
  ('enterprise_warehouse', 'Warehouse', 'Enterprise warehouse', 700, 'enterprise', TRUE),
  ('enterprise_finance', 'Finance', 'Enterprise finance', 500, 'enterprise', TRUE),
  ('enterprise_viewer', 'Viewer', 'Enterprise read-only', 300, 'enterprise', TRUE)
ON CONFLICT (name) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      description = EXCLUDED.description,
      level = EXCLUDED.level,
      product_key = EXCLUDED.product_key;

-- Backfill seats from app_metadata for people who already have a staff role.
INSERT INTO platform.user_roles (user_id, role_id, scope_type, scope_id, granted_at, status)
SELECT u.id,
       r.id,
       'organization',
       (u.raw_app_meta_data->>'organizationId')::uuid,
       NOW(),
       'active'
FROM auth.users u
JOIN platform.roles r ON r.name = u.raw_app_meta_data->>'role'
WHERE COALESCE(u.raw_app_meta_data->>'organizationId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND r.name IN (
    'fleet_manager', 'fleet_accountant', 'fleet_viewer',
    'enterprise_dispatcher', 'enterprise_customs', 'enterprise_warehouse',
    'enterprise_finance', 'enterprise_viewer'
  )
  AND NOT EXISTS (
    SELECT 1 FROM platform.user_roles ur
    WHERE ur.user_id = u.id
      AND ur.role_id = r.id
      AND ur.scope_type = 'organization'
      AND ur.scope_id = (u.raw_app_meta_data->>'organizationId')::uuid
  );

-- ---------------------------------------------------------------------------
-- Workforce: one active fleet per service line
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fleet.workforce_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_line TEXT NOT NULL CHECK (service_line IN ('rideshare', 'rush_delivery')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'offboarding', 'ended')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  joined_via TEXT NOT NULL DEFAULT 'migration'
    CHECK (joined_via IN ('fleet_tag', 'invite_code', 'roam_tag_invite', 'migration')),
  join_request_id UUID NULL,
  invite_id UUID NULL,
  ended_at TIMESTAMPTZ NULL,
  ended_by UUID NULL,
  ended_reason TEXT NULL CHECK (ended_reason IS NULL OR ended_reason IN ('fleet_removed', 'worker_left', 'roam_action')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS workforce_memberships_open_line_uidx
  ON fleet.workforce_memberships (user_id, service_line)
  WHERE status <> 'ended';

CREATE INDEX IF NOT EXISTS workforce_memberships_org_status_idx
  ON fleet.workforce_memberships (organization_id, status);

INSERT INTO fleet.workforce_memberships (
  organization_id, user_id, service_line, status, joined_at, joined_via
)
SELECT dp.fleet_id::uuid,
       dp.user_id,
       'rideshare',
       'active',
       COALESCE(dp.fleet_joined_at, NOW()),
       'migration'
FROM public.driver_profiles dp
WHERE dp.mode = 'fleet'
  AND dp.fleet_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = dp.fleet_id)
  AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = dp.user_id)
  AND NOT EXISTS (
    SELECT 1 FROM fleet.workforce_memberships m
    WHERE m.user_id = dp.user_id
      AND m.service_line = 'rideshare'
      AND m.status <> 'ended'
  );

INSERT INTO fleet.workforce_memberships (
  organization_id, user_id, service_line, status, joined_at, joined_via
)
SELECT cp.fleet_id::uuid,
       cp.user_id,
       'rush_delivery',
       'active',
       COALESCE(cp.fleet_joined_at, NOW()),
       'migration'
FROM delivery.courier_profiles cp
WHERE cp.mode = 'fleet'
  AND cp.fleet_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = cp.fleet_id)
  AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = cp.user_id)
  AND NOT EXISTS (
    SELECT 1 FROM fleet.workforce_memberships m
    WHERE m.user_id = cp.user_id
      AND m.service_line = 'rush_delivery'
      AND m.status <> 'ended'
  );

-- Drift check: profiles that do not match an open membership. Schedule this in ops.
CREATE OR REPLACE VIEW fleet.workforce_membership_drift AS
SELECT 'rideshare_profile_without_membership'::text AS kind,
       dp.user_id,
       dp.fleet_id::text AS profile_fleet_id,
       NULL::text AS membership_fleet_id
FROM public.driver_profiles dp
WHERE dp.mode = 'fleet'
  AND dp.fleet_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM fleet.workforce_memberships m
    WHERE m.user_id = dp.user_id
      AND m.service_line = 'rideshare'
      AND m.status <> 'ended'
      AND m.organization_id::text = dp.fleet_id::text
  )
UNION ALL
SELECT 'rush_profile_without_membership',
       cp.user_id,
       cp.fleet_id::text,
       NULL
FROM delivery.courier_profiles cp
WHERE cp.mode = 'fleet'
  AND cp.fleet_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM fleet.workforce_memberships m
    WHERE m.user_id = cp.user_id
      AND m.service_line = 'rush_delivery'
      AND m.status <> 'ended'
      AND m.organization_id::text = cp.fleet_id::text
  );

-- ---------------------------------------------------------------------------
-- Owner actions: optional MFA gate + two-step ownership transfer
-- ---------------------------------------------------------------------------
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS require_owner_mfa BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS platform.ownership_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  from_user_id UUID NOT NULL,
  to_user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'cancelled', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '48 hours'),
  accepted_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS ownership_transfers_pending_idx
  ON platform.ownership_transfers (organization_id, status);

GRANT ALL ON fleet.workforce_memberships TO service_role;
GRANT ALL ON platform.ownership_transfers TO service_role;
GRANT SELECT ON fleet.workforce_membership_drift TO service_role;
