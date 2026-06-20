-- Grant Dash Courier Admin Portal access to the platform admin account.
-- Preserves existing roles and adds courier_admin.
-- Run in Supabase Dashboard → SQL Editor, then sign out/in at courier.roamdash.co/admin.

UPDATE auth.users
SET raw_app_meta_data = jsonb_set(
  jsonb_set(
    COALESCE(raw_app_meta_data, '{}'::jsonb),
    '{roles}',
    (
      SELECT COALESCE(jsonb_agg(DISTINCT to_jsonb(r)), '[]'::jsonb)
      FROM (
        SELECT jsonb_array_elements_text(
          COALESCE(raw_app_meta_data->'roles', '[]'::jsonb) || '["courier_admin"]'::jsonb
        ) AS r
      ) merged
    ),
    true
  ),
  '{role}',
  to_jsonb(COALESCE(raw_app_meta_data->>'role', 'courier_admin')),
  true
)
WHERE email = 'prodigiousinvestments101@gmail.com';
