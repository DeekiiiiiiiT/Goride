-- Provision Platform Super Admin (Roam Dominion / roamenterprise.co/admin).
-- MUST be a different email from product admins (e.g. NOT prodigiousinvestments101@gmail.com).
--
-- Prerequisite: user already exists in Supabase Auth → Users.
-- After running: sign out and sign back in at Roam Dominion.
--
-- Change the email on the line below if needed, then Run.

DO $$
DECLARE
  v_email TEXT := 'sadikithomas@hotmail.com';
  v_user_id UUID;
  v_role_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(v_email);
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found: %. Create the account first in Supabase Dashboard → Authentication → Users → Add user.', v_email;
  END IF;

  IF EXISTS (
    SELECT 1 FROM platform.user_roles ur
    JOIN platform.roles r ON r.id = ur.role_id
    WHERE ur.user_id = v_user_id AND r.product_key IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'User % already has product admin roles. Platform super admin must use a separate account.', v_email;
  END IF;

  SELECT id INTO v_role_id FROM platform.roles WHERE name = 'platform_owner';
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'Role platform_owner not found. Run migration 20260627100000_platform_rbac_schema.sql first.';
  END IF;

  INSERT INTO platform.user_roles (user_id, role_id, granted_by)
  VALUES (v_user_id, v_role_id, NULL)
  ON CONFLICT (user_id, role_id) DO NOTHING;

  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('role', 'platform_owner', 'roles', jsonb_build_array('platform_owner'))
  WHERE id = v_user_id;

  INSERT INTO platform.permission_audit_log (actor_user_id, target_user_id, action, role_name, metadata)
  VALUES (NULL, v_user_id, 'role.granted', 'platform_owner', jsonb_build_object('source', 'provision_platform_admin.sql'));

  RAISE NOTICE 'Granted platform_owner to %', v_email;
END $$;
