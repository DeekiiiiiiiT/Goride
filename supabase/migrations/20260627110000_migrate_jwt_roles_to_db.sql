-- Migrate existing JWT app_metadata.roles into platform.user_roles.
-- Idempotent: ON CONFLICT DO NOTHING.

INSERT INTO platform.user_roles (user_id, role_id, granted_by, granted_at)
SELECT
  u.id,
  r.id,
  NULL,
  NOW()
FROM auth.users u
CROSS JOIN LATERAL jsonb_array_elements_text(
  COALESCE(u.raw_app_meta_data->'roles', '[]'::jsonb)
) AS role_name
JOIN platform.roles r ON r.name = role_name
WHERE jsonb_array_length(COALESCE(u.raw_app_meta_data->'roles', '[]'::jsonb)) > 0
ON CONFLICT (user_id, role_id) DO NOTHING;

-- Also migrate single app_metadata.role when roles[] is empty
INSERT INTO platform.user_roles (user_id, role_id, granted_by, granted_at)
SELECT
  u.id,
  r.id,
  NULL,
  NOW()
FROM auth.users u
JOIN platform.roles r ON r.name = u.raw_app_meta_data->>'role'
WHERE u.raw_app_meta_data->>'role' IS NOT NULL
  AND u.raw_app_meta_data->>'role' <> ''
  AND (
    u.raw_app_meta_data->'roles' IS NULL
    OR jsonb_array_length(COALESCE(u.raw_app_meta_data->'roles', '[]'::jsonb)) = 0
  )
ON CONFLICT (user_id, role_id) DO NOTHING;

-- Log migration batch
INSERT INTO platform.permission_audit_log (action, metadata)
VALUES (
  'migration.jwt_roles_to_db',
  jsonb_build_object(
    'migrated_at', NOW(),
    'note', 'One-time JWT app_metadata role migration'
  )
);
