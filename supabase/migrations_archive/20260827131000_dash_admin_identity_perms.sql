-- Grant dash_admin identity permissions per Part F matrix (F18)

INSERT INTO platform.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM platform.roles r
JOIN platform.permissions p ON p.key IN (
  'identity.read',
  'identity.status.restrict',
  'sessions.revoke',
  'merchant.staff.read',
  'merchant.staff.revoke',
  'roles.grant',
  'invites.manage',
  'audit.read'
)
WHERE r.name = 'dash_admin'
ON CONFLICT DO NOTHING;

INSERT INTO platform.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM platform.roles r
JOIN platform.permissions p ON p.key IN (
  'identity.read',
  'identity.status.restrict',
  'sessions.revoke',
  'merchant.staff.read',
  'merchant.staff.revoke',
  'roles.grant'
)
WHERE r.name = 'courier_admin'
ON CONFLICT DO NOTHING;
