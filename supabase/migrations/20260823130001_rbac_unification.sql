-- Phase 2: RBAC unification — scope columns, identity permissions, new roles

ALTER TABLE platform.user_roles
  ADD COLUMN IF NOT EXISTS scope_type TEXT NOT NULL DEFAULT 'global'
    CHECK (scope_type IN ('global', 'product', 'market')),
  ADD COLUMN IF NOT EXISTS scope_id UUID NULL;

CREATE INDEX IF NOT EXISTS idx_user_roles_scope ON platform.user_roles(scope_type, scope_id);

-- Identity management permission keys
INSERT INTO platform.permissions (key, display_name, description, category, product_key) VALUES
  ('identity.read', 'View Identity Profile', 'View unified person profile', 'users', NULL),
  ('identity.status.restrict', 'Restrict Persona', 'Persona-level suspend/restrict', 'users', NULL),
  ('identity.status.ban', 'Ban Identity', 'Global identity ban across all apps', 'users', NULL),
  ('identity.merge', 'Merge Identities', 'Merge duplicate identities', 'users', NULL),
  ('identity.pii.read', 'View Unmasked PII', 'View full unmasked PII', 'users', NULL),
  ('identity.export', 'Export Identity Data', 'GDPR/DPA data export', 'users', NULL),
  ('identity.delete', 'Delete Identity', 'Right-to-erasure workflows', 'users', NULL),
  ('sessions.read', 'View Sessions', 'View active sessions/devices', 'users', NULL),
  ('sessions.revoke', 'Revoke Sessions', 'Force sign-out', 'users', NULL),
  ('roles.grant', 'Grant Roles', 'Assign roles at or below own level', 'users', NULL),
  ('roles.grant_platform', 'Grant Platform Roles', 'Assign platform-tier roles', 'users', NULL),
  ('invites.manage', 'Manage Invites', 'Create/revoke pending invites', 'users', NULL),
  ('merchant.staff.read', 'View Merchant Staff', 'View merchant staff across stores', 'users', NULL),
  ('merchant.staff.revoke', 'Revoke Merchant Staff', 'Revoke merchant staff access', 'users', NULL),
  ('financial.refund.approve', 'Approve Refunds', 'Approve refunds above threshold', 'financial', NULL)
ON CONFLICT (key) DO NOTHING;

INSERT INTO platform.roles (name, display_name, description, level, product_key, is_system) VALUES
  ('identity_admin', 'Identity Admin', 'User management: roles, bans, merges, PII', 900, NULL, TRUE),
  ('support_agent', 'Support Agent', 'Read + refund + notes; no suspend or role grants', 600, 'dash', TRUE)
ON CONFLICT (name) DO NOTHING;

-- identity_admin permissions
INSERT INTO platform.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM platform.roles r
JOIN platform.permissions p ON p.key IN (
  'users.read', 'users.edit', 'users.manage_roles', 'users.suspend', 'users.ban',
  'identity.read', 'identity.status.restrict', 'identity.status.ban', 'identity.merge',
  'identity.pii.read', 'identity.export', 'identity.delete',
  'sessions.read', 'sessions.revoke', 'roles.grant', 'invites.manage',
  'merchant.staff.read', 'merchant.staff.revoke', 'audit.read',
  'dash.portal.access', 'dash.users.read', 'courier.portal.access', 'courier.users.read'
)
WHERE r.name = 'identity_admin'
ON CONFLICT DO NOTHING;

-- support_agent permissions
INSERT INTO platform.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM platform.roles r
JOIN platform.permissions p ON p.key IN (
  'users.read', 'identity.read', 'dash.portal.access', 'dash.users.read',
  'dash.support.write', 'financial.read', 'financial.refunds', 'sessions.read'
)
WHERE r.name = 'support_agent'
ON CONFLICT DO NOTHING;

-- Strip blanket product write from platform_support (least privilege)
DELETE FROM platform.role_permissions rp
USING platform.roles r, platform.permissions p
WHERE rp.role_id = r.id AND rp.permission_id = p.id
  AND r.name = 'platform_support'
  AND (p.key LIKE '%.users.write' OR p.key LIKE '%.settings.write' OR p.key = 'users.manage_roles');

-- Grant identity permissions to platform_owner (already has all via cross join, but ensure new keys)
INSERT INTO platform.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM platform.roles r
JOIN platform.permissions p ON (
  p.key LIKE 'identity.%'
  OR p.key IN (
    'sessions.read', 'sessions.revoke', 'roles.grant', 'roles.grant_platform',
    'invites.manage', 'merchant.staff.read', 'merchant.staff.revoke'
  )
)
WHERE r.name IN ('platform_owner', 'superadmin')
ON CONFLICT DO NOTHING;

-- Default existing grants to global scope
UPDATE platform.user_roles SET scope_type = 'global' WHERE scope_type IS NULL;
