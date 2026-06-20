-- Provision a Product Admin (separate account from platform super admin).
-- Run in Supabase Dashboard → SQL Editor.
-- Replace email and product_key, then Run.
-- Valid product_key: fleet, enterprise, dash, rides, driver, haul, courier

DO $$
DECLARE
  v_email TEXT := 'prodigiousinvestments101@gmail.com';
  v_product_key TEXT := 'courier';
  v_role_name TEXT;
  v_user_id UUID;
  v_role_id UUID;
BEGIN
  v_role_name := v_product_key || '_admin';

  SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found: %. Create the account in Supabase Auth first.', v_email;
  END IF;

  IF EXISTS (
    SELECT 1 FROM platform.user_roles ur
    JOIN platform.roles r ON r.id = ur.role_id
    WHERE ur.user_id = v_user_id AND r.product_key IS NULL AND r.level >= 900
  ) THEN
    RAISE EXCEPTION 'User % is a platform super admin. Use a separate account for product admin.', v_email;
  END IF;

  SELECT id INTO v_role_id FROM platform.roles WHERE name = v_role_name;
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'Role not found: %', v_role_name;
  END IF;

  INSERT INTO platform.user_roles (user_id, role_id, granted_by)
  VALUES (v_user_id, v_role_id, NULL)
  ON CONFLICT (user_id, role_id) DO NOTHING;

  UPDATE auth.users
  SET raw_app_meta_data = jsonb_set(
    jsonb_set(
      COALESCE(raw_app_meta_data, '{}'::jsonb),
      '{roles}',
      (
        SELECT COALESCE(jsonb_agg(DISTINCT to_jsonb(r)), '[]'::jsonb)
        FROM (
          SELECT jsonb_array_elements_text(
            COALESCE(raw_app_meta_data->'roles', '[]'::jsonb) || to_jsonb(v_role_name)
          ) AS r
        ) merged
      ),
      true
    ),
    '{role}',
    to_jsonb(v_role_name),
    true
  )
  WHERE id = v_user_id;

  INSERT INTO platform.permission_audit_log (actor_user_id, target_user_id, action, role_name, metadata)
  VALUES (NULL, v_user_id, 'role.granted', v_role_name, jsonb_build_object(
    'source', 'provision_product_admin.sql',
    'product_key', v_product_key
  ));

  RAISE NOTICE 'Granted % to %', v_role_name, v_email;
END $$;
