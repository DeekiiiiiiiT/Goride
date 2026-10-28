-- Copy platform/product admin roles from user_metadata.role into app_metadata.
-- Consumer surface roles (driver, passenger) stay in user_metadata only.

UPDATE auth.users u
SET raw_app_meta_data =
  COALESCE(u.raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object(
    'role', u.raw_user_meta_data->>'role',
    'roles', jsonb_build_array(u.raw_user_meta_data->>'role')
  )
WHERE (u.raw_user_meta_data->>'role') IN (
  'platform_owner',
  'platform_support',
  'platform_analyst',
  'superadmin',
  'dash_admin',
  'dash_ops',
  'rides_admin',
  'rides_ops',
  'driver_admin',
  'driver_ops'
)
AND (
  u.raw_app_meta_data->'roles' IS NULL
  OR jsonb_array_length(COALESCE(u.raw_app_meta_data->'roles', '[]'::jsonb)) = 0
);
