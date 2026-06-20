-- Grant Dash Courier Admin Portal access to a specific user by email.
-- Run in Supabase Dashboard → SQL Editor.
-- Replace the email below, then Run.

UPDATE auth.users
SET raw_app_meta_data =
  COALESCE(raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object(
    'role', 'courier_admin',
    'roles', jsonb_build_array('courier_admin')
  )
WHERE email = 'your-admin@email.com';
