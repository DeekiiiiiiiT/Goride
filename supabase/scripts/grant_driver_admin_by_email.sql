-- Grant Driver Admin Portal access to a specific user by email.
-- Run in Supabase Dashboard → SQL Editor.
-- Replace the email below, then Run.

UPDATE auth.users
SET raw_app_meta_data =
  COALESCE(raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object(
    'role', 'driver_admin',
    'roles', jsonb_build_array('driver_admin')
  )
WHERE email = 'prodigiousinvestments101@gmail.com';
