-- Grant Rides Admin Portal access (roam-s.co/admin) to a specific user by email.
-- Preserves any existing roles in app_metadata and adds rides_admin.
-- Run in Supabase Dashboard → SQL Editor, then sign out/in at roam-s.co/admin.

UPDATE auth.users
SET raw_app_meta_data = jsonb_set(
  jsonb_set(
    COALESCE(raw_app_meta_data, '{}'::jsonb),
    '{roles}',
    (
      SELECT COALESCE(jsonb_agg(DISTINCT to_jsonb(r)), '[]'::jsonb)
      FROM (
        SELECT jsonb_array_elements_text(
          COALESCE(raw_app_meta_data->'roles', '[]'::jsonb) || '["rides_admin"]'::jsonb
        ) AS r
      ) merged
    ),
    true
  ),
  '{role}',
  '"rides_admin"',
  true
)
WHERE email = 'prodigiousinvestments101@gmail.com';
