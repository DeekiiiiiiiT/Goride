-- Plug accounts that only stored a role the phone could edit get the real
-- server role. Never copy platform_owner out of user metadata.

UPDATE auth.users
SET
  raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'explorer_user'),
  raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) - 'role'
WHERE COALESCE(raw_app_meta_data->>'role', '') = ''
  AND raw_user_meta_data->>'role' = 'explorer_user';
