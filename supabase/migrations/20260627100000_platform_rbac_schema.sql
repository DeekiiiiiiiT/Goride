-- Enterprise RBAC: platform schema, roles, permissions, user_roles, audit log.
-- Phase 1 + Phase 2 (identity separation trigger).

CREATE SCHEMA IF NOT EXISTS platform;
GRANT USAGE ON SCHEMA platform TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  level INT NOT NULL,
  product_key TEXT NULL,
  is_system BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT roles_product_key_check CHECK (
    product_key IS NULL OR product_key IN (
      'fleet', 'enterprise', 'dash', 'rides', 'driver', 'haul', 'courier'
    )
  )
);

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  product_key TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT permissions_product_key_check CHECK (
    product_key IS NULL OR product_key IN (
      'fleet', 'enterprise', 'dash', 'rides', 'driver', 'haul', 'courier'
    )
  )
);

-- ---------------------------------------------------------------------------
-- Role ↔ Permission junction
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform.role_permissions (
  role_id UUID NOT NULL REFERENCES platform.roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES platform.permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (role_id, permission_id)
);

-- ---------------------------------------------------------------------------
-- User ↔ Role assignments (authoritative for admin access)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES platform.roles(id) ON DELETE CASCADE,
  granted_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NULL,
  UNIQUE (user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON platform.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON platform.user_roles(role_id);

-- ---------------------------------------------------------------------------
-- Permission audit log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform.permission_audit_log (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT NULL,
  resource_id TEXT NULL,
  permission_key TEXT NULL,
  role_name TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address INET NULL,
  user_agent TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_permission_audit_actor_created
  ON platform.permission_audit_log(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_permission_audit_action_created
  ON platform.permission_audit_log(action, created_at DESC);

-- ---------------------------------------------------------------------------
-- Seed roles
-- ---------------------------------------------------------------------------
INSERT INTO platform.roles (name, display_name, description, level, product_key, is_system) VALUES
  ('platform_owner', 'Platform Owner', 'Full platform sovereignty', 1000, NULL, TRUE),
  ('platform_support', 'Platform Support', 'Cross-product support and read access', 950, NULL, TRUE),
  ('platform_analyst', 'Platform Analyst', 'Read-only analytics across products', 500, NULL, TRUE),
  ('superadmin', 'Super Admin (legacy)', 'Legacy alias for platform_owner', 1000, NULL, TRUE),
  ('fleet_admin', 'Fleet Admin', 'Roam Fleet product administration', 800, 'fleet', TRUE),
  ('fleet_ops', 'Fleet Operations', 'Roam Fleet read-only operations', 700, 'fleet', TRUE),
  ('enterprise_admin', 'Enterprise Admin', 'Roam Enterprise administration', 800, 'enterprise', TRUE),
  ('enterprise_ops', 'Enterprise Operations', 'Roam Enterprise read-only ops', 700, 'enterprise', TRUE),
  ('dash_admin', 'Dash Admin', 'Roam Dash product administration', 800, 'dash', TRUE),
  ('dash_ops', 'Dash Operations', 'Roam Dash read-only operations', 700, 'dash', TRUE),
  ('rides_admin', 'Rides Admin', 'Roam Rides product administration', 800, 'rides', TRUE),
  ('rides_ops', 'Rides Operations', 'Roam Rides read-only operations', 700, 'rides', TRUE),
  ('driver_admin', 'Driver Admin', 'Roam Driver product administration', 800, 'driver', TRUE),
  ('driver_ops', 'Driver Operations', 'Roam Driver read-only operations', 700, 'driver', TRUE),
  ('haul_admin', 'Haul Admin', 'Roam Haul product administration', 800, 'haul', TRUE),
  ('haul_ops', 'Haul Operations', 'Roam Haul read-only operations', 700, 'haul', TRUE),
  ('courier_admin', 'Courier Admin', 'Dash Courier product administration', 800, 'courier', TRUE),
  ('courier_ops', 'Courier Operations', 'Dash Courier read-only operations', 700, 'courier', TRUE)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Seed permissions (global + per-product)
-- ---------------------------------------------------------------------------
INSERT INTO platform.permissions (key, display_name, description, category, product_key) VALUES
  ('users.read', 'View Users', 'View user profiles and directories', 'users', NULL),
  ('users.create', 'Create Users', 'Create new user accounts', 'users', NULL),
  ('users.edit', 'Edit Users', 'Edit user profiles', 'users', NULL),
  ('users.delete', 'Delete Users', 'Permanently delete user accounts', 'users', NULL),
  ('users.manage_roles', 'Manage Roles', 'Assign and revoke admin roles', 'users', NULL),
  ('users.suspend', 'Suspend Users', 'Temporarily suspend user accounts', 'users', NULL),
  ('users.ban', 'Ban Users', 'Ban user accounts', 'users', NULL),
  ('financial.read', 'View Financial Data', 'View transactions and settlements', 'financial', NULL),
  ('financial.edit', 'Edit Financial Data', 'Modify financial records', 'financial', NULL),
  ('financial.refunds', 'Process Refunds', 'Issue refunds and credits', 'financial', NULL),
  ('financial.settlements', 'Manage Settlements', 'Override settlement rules', 'financial', NULL),
  ('system.config', 'System Configuration', 'Modify platform configuration', 'system', NULL),
  ('system.billing', 'Billing Management', 'Manage billing and subscriptions', 'system', NULL),
  ('system.security', 'Security Settings', 'View security logs and settings', 'system', NULL),
  ('analytics.view', 'View Analytics', 'View analytics dashboards', 'analytics', NULL),
  ('analytics.export', 'Export Analytics', 'Export analytics data', 'analytics', NULL),
  ('roles.manage', 'Manage Role Definitions', 'Create and edit role definitions', 'system', NULL),
  ('audit.read', 'View Audit Log', 'View permission and admin audit logs', 'system', NULL)
ON CONFLICT (key) DO NOTHING;

-- Per-product portal + ops permissions
INSERT INTO platform.permissions (key, display_name, description, category, product_key)
SELECT
  p.product || '.portal.access',
  initcap(p.product) || ' Portal Access',
  'Access ' || initcap(p.product) || ' admin portal',
  'portal',
  p.product
FROM (VALUES
  ('fleet'), ('enterprise'), ('dash'), ('rides'), ('driver'), ('haul'), ('courier')
) AS p(product)
ON CONFLICT (key) DO NOTHING;

INSERT INTO platform.permissions (key, display_name, description, category, product_key)
SELECT
  p.product || '.' || a.action,
  initcap(p.product) || ' ' || initcap(replace(a.action, '.', ' ')),
  initcap(p.product) || ' ' || a.action,
  split_part(a.action, '.', 1),
  p.product
FROM (VALUES
  ('fleet'), ('enterprise'), ('dash'), ('rides'), ('driver'), ('haul'), ('courier')
) AS p(product)
CROSS JOIN (VALUES
  ('users.read'),
  ('users.write'),
  ('compliance.read'),
  ('compliance.approve'),
  ('ledger.read'),
  ('support.write'),
  ('settings.read'),
  ('settings.write'),
  ('presence.read')
) AS a(action)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Seed role_permissions
-- ---------------------------------------------------------------------------

-- platform_owner → all permissions
INSERT INTO platform.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM platform.roles r
CROSS JOIN platform.permissions p
WHERE r.name = 'platform_owner'
ON CONFLICT DO NOTHING;

-- superadmin (legacy) → same as platform_owner
INSERT INTO platform.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM platform.roles r
CROSS JOIN platform.permissions p
WHERE r.name = 'superadmin'
ON CONFLICT DO NOTHING;

-- platform_support → read + portal access + limited write
INSERT INTO platform.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM platform.roles r
JOIN platform.permissions p ON p.key IN (
  'users.read', 'users.suspend',
  'financial.read', 'financial.refunds',
  'analytics.view',
  'audit.read'
) OR p.key LIKE '%.portal.access'
  OR p.key LIKE '%.users.read'
  OR p.key LIKE '%.compliance.read'
  OR p.key LIKE '%.ledger.read'
  OR p.key LIKE '%.presence.read'
WHERE r.name = 'platform_support'
ON CONFLICT DO NOTHING;

-- platform_analyst → analytics + read only
INSERT INTO platform.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM platform.roles r
JOIN platform.permissions p ON p.key IN (
  'users.read', 'analytics.view', 'analytics.export', 'financial.read'
)
WHERE r.name = 'platform_analyst'
ON CONFLICT DO NOTHING;

-- Product admin roles → global users.read + full product permissions
INSERT INTO platform.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM platform.roles r
JOIN platform.permissions p ON (
  p.key = 'users.read'
  OR (p.product_key IS NOT NULL AND p.product_key = r.product_key)
)
WHERE r.name LIKE '%_admin' AND r.product_key IS NOT NULL
ON CONFLICT DO NOTHING;

-- Product ops roles → global users.read + product read permissions
INSERT INTO platform.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM platform.roles r
JOIN platform.permissions p ON (
  p.key = 'users.read'
  OR (
    p.product_key IS NOT NULL
    AND p.product_key = r.product_key
    AND p.key NOT LIKE '%.write'
    AND p.key NOT LIKE '%.approve'
  )
)
WHERE r.name LIKE '%_ops' AND r.product_key IS NOT NULL
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION platform.user_has_permission(
  p_user_id UUID,
  p_permission_key TEXT
) RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = platform, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM platform.user_roles ur
    JOIN platform.role_permissions rp ON rp.role_id = ur.role_id
    JOIN platform.permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = p_user_id
      AND p.key = p_permission_key
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
  );
$$;

CREATE OR REPLACE FUNCTION platform.user_permission_keys(p_user_id UUID)
RETURNS TEXT[]
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = platform, public
AS $$
  SELECT COALESCE(array_agg(DISTINCT p.key ORDER BY p.key), ARRAY[]::TEXT[])
  FROM platform.user_roles ur
  JOIN platform.role_permissions rp ON rp.role_id = ur.role_id
  JOIN platform.permissions p ON p.id = rp.permission_id
  WHERE ur.user_id = p_user_id
    AND (ur.expires_at IS NULL OR ur.expires_at > NOW());
$$;

CREATE OR REPLACE FUNCTION platform.user_max_role_level(p_user_id UUID)
RETURNS INT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = platform, public
AS $$
  SELECT COALESCE(MAX(r.level), 0)
  FROM platform.user_roles ur
  JOIN platform.roles r ON r.id = ur.role_id
  WHERE ur.user_id = p_user_id
    AND (ur.expires_at IS NULL OR ur.expires_at > NOW());
$$;

CREATE OR REPLACE FUNCTION platform.is_platform_user(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = platform, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM platform.user_roles ur
    JOIN platform.roles r ON r.id = ur.role_id
    WHERE ur.user_id = p_user_id
      AND r.product_key IS NULL
      AND r.level >= 900
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
  );
$$;

CREATE OR REPLACE FUNCTION platform.current_user_is_platform_staff()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = platform, public
AS $$
  SELECT platform.user_max_role_level(auth.uid()) >= 950;
$$;

CREATE OR REPLACE FUNCTION platform.current_user_is_platform_owner()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = platform, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM platform.user_roles ur
    JOIN platform.roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid()
      AND r.name IN ('platform_owner', 'superadmin')
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
  );
$$;

CREATE OR REPLACE FUNCTION platform.user_has_product_access(
  p_user_id UUID,
  p_product_key TEXT
) RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = platform, public
AS $$
  SELECT platform.is_platform_user(p_user_id)
    OR platform.user_has_permission(p_user_id, p_product_key || '.portal.access');
$$;

-- ---------------------------------------------------------------------------
-- Identity separation (Phase 2): platform vs product admin on separate accounts
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION platform.enforce_identity_separation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, public
AS $$
DECLARE
  new_role_product_key TEXT;
  new_role_level INT;
  existing_is_platform BOOLEAN;
  existing_is_product BOOLEAN;
BEGIN
  SELECT product_key, level INTO new_role_product_key, new_role_level
  FROM platform.roles WHERE id = NEW.role_id;

  SELECT EXISTS (
    SELECT 1 FROM platform.user_roles ur
    JOIN platform.roles r ON r.id = ur.role_id
    WHERE ur.user_id = NEW.user_id
      AND ur.id IS DISTINCT FROM NEW.id
      AND r.product_key IS NULL
      AND r.level >= 900
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
  ) INTO existing_is_platform;

  SELECT EXISTS (
    SELECT 1 FROM platform.user_roles ur
    JOIN platform.roles r ON r.id = ur.role_id
    WHERE ur.user_id = NEW.user_id
      AND ur.id IS DISTINCT FROM NEW.id
      AND r.product_key IS NOT NULL
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
  ) INTO existing_is_product;

  IF new_role_product_key IS NULL AND new_role_level >= 900 AND existing_is_product THEN
    RAISE EXCEPTION 'Cannot assign platform role to user with product admin roles. Use separate accounts.';
  END IF;

  IF new_role_product_key IS NOT NULL AND existing_is_platform THEN
    RAISE EXCEPTION 'Cannot assign product admin role to platform super admin. Use separate accounts.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_identity_separation ON platform.user_roles;
CREATE TRIGGER trg_enforce_identity_separation
  BEFORE INSERT OR UPDATE ON platform.user_roles
  FOR EACH ROW EXECUTE FUNCTION platform.enforce_identity_separation();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE platform.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.permission_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY platform_roles_select ON platform.roles
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY platform_permissions_select ON platform.permissions
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY platform_role_permissions_select ON platform.role_permissions
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY platform_user_roles_select_own ON platform.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR platform.current_user_is_platform_staff());

CREATE POLICY platform_user_roles_insert_owner ON platform.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (platform.current_user_is_platform_owner());

CREATE POLICY platform_user_roles_update_owner ON platform.user_roles
  FOR UPDATE TO authenticated
  USING (platform.current_user_is_platform_owner())
  WITH CHECK (platform.current_user_is_platform_owner());

CREATE POLICY platform_user_roles_delete_owner ON platform.user_roles
  FOR DELETE TO authenticated
  USING (platform.current_user_is_platform_owner());

CREATE POLICY platform_audit_select_staff ON platform.permission_audit_log
  FOR SELECT TO authenticated
  USING (platform.current_user_is_platform_staff());

GRANT ALL ON ALL TABLES IN SCHEMA platform TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA platform TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA platform TO authenticated, service_role;

-- Public RPC wrappers for edge functions
CREATE OR REPLACE FUNCTION public.rbac_user_has_permission(
  p_user_id UUID,
  p_permission_key TEXT
) RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = platform, public
AS $$ SELECT platform.user_has_permission(p_user_id, p_permission_key); $$;

CREATE OR REPLACE FUNCTION public.rbac_user_permission_keys(p_user_id UUID)
RETURNS TEXT[]
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = platform, public
AS $$ SELECT platform.user_permission_keys(p_user_id); $$;

CREATE OR REPLACE FUNCTION public.rbac_user_max_role_level(p_user_id UUID)
RETURNS INT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = platform, public
AS $$ SELECT platform.user_max_role_level(p_user_id); $$;

CREATE OR REPLACE FUNCTION public.rbac_is_platform_user(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = platform, public
AS $$ SELECT platform.is_platform_user(p_user_id); $$;

CREATE OR REPLACE FUNCTION public.rbac_user_has_product_access(
  p_user_id UUID,
  p_product_key TEXT
) RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = platform, public
AS $$ SELECT platform.user_has_product_access(p_user_id, p_product_key); $$;

GRANT EXECUTE ON FUNCTION public.rbac_user_has_permission(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rbac_user_permission_keys(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rbac_user_max_role_level(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rbac_is_platform_user(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rbac_user_has_product_access(UUID, TEXT) TO authenticated, service_role;
