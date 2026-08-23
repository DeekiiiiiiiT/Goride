-- Dash Ops console manages couriers — grant courier product perms to dash roles.

INSERT INTO platform.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM platform.roles r
JOIN platform.permissions p ON p.key IN (
  'courier.portal.access', 'courier.users.read', 'courier.users.write',
  'courier.compliance.read', 'courier.compliance.approve',
  'courier.presence.read', 'courier.ledger.read'
)
WHERE r.name = 'dash_admin'
ON CONFLICT DO NOTHING;

INSERT INTO platform.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM platform.roles r
JOIN platform.permissions p ON p.key IN (
  'courier.portal.access', 'courier.users.read', 'courier.compliance.read',
  'courier.presence.read', 'courier.ledger.read'
)
WHERE r.name = 'dash_ops'
ON CONFLICT DO NOTHING;
