-- Grant ALL product admin roles to the ops admin account in one run.
-- Product admins must NOT also be platform super admin (separate accounts).
-- Run in Supabase Dashboard → SQL Editor, then sign out/in on each admin portal.

DO $$
DECLARE
  v_email TEXT := 'prodigiousinvestments101@gmail.com';
  v_user_id UUID;
  v_role_name TEXT;
  v_role_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(v_email);
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found: %', v_email;
  END IF;

  IF EXISTS (
    SELECT 1 FROM platform.user_roles ur
    JOIN platform.roles r ON r.id = ur.role_id
    WHERE ur.user_id = v_user_id AND r.product_key IS NULL AND r.level >= 900
  ) THEN
    RAISE EXCEPTION 'User % is platform super admin. Use a separate account for product admin.', v_email;
  END IF;

  FOREACH v_role_name IN ARRAY ARRAY[
    'fleet_admin', 'enterprise_admin', 'dash_admin', 'rides_admin',
    'driver_admin', 'haul_admin', 'courier_admin'
  ]
  LOOP
    SELECT id INTO v_role_id FROM platform.roles WHERE name = v_role_name;
    IF v_role_id IS NULL THEN
      RAISE EXCEPTION 'Role not found: %', v_role_name;
    END IF;

    INSERT INTO platform.user_roles (user_id, role_id, granted_by)
    VALUES (v_user_id, v_role_id, NULL)
    ON CONFLICT (user_id, role_id) DO NOTHING;
  END LOOP;

  UPDATE auth.users
  SET raw_app_meta_data = jsonb_set(
    jsonb_set(
      COALESCE(raw_app_meta_data, '{}'::jsonb),
      '{roles}',
      (
        SELECT COALESCE(jsonb_agg(DISTINCT to_jsonb(r)), '[]'::jsonb)
        FROM (
          SELECT jsonb_array_elements_text(
            '["fleet_admin","enterprise_admin","dash_admin","rides_admin","driver_admin","haul_admin","courier_admin"]'::jsonb
          ) AS r
        ) merged
      ),
      true
    ),
    '{role}',
    '"rides_admin"',
    true
  )
  WHERE id = v_user_id;

  INSERT INTO platform.permission_audit_log (actor_user_id, target_user_id, action, role_name, metadata)
  VALUES (NULL, v_user_id, 'role.granted', 'all_product_admin', jsonb_build_object(
    'source', 'provision_all_product_admins.sql'
  ));

  RAISE NOTICE 'Granted all product admin roles to %', v_email;
END $$;
