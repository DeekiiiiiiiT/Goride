-- Transfer platform ownership. Run the whole script once, inside one transaction.
-- Do not run this to repeat the 2026-10-25 switch. That switch is already in place.
--
-- 1. Set the two emails below.
-- 2. Run this file in the Supabase SQL editor.
-- The script stops if the new owner cannot sign in, or if the role check fails.
-- It adds platform_owner to the new account and removes it from the old one.
-- Other roles (fleet, driver, product admin) stay on both accounts.

DO $$
DECLARE
  v_new_email text := 'CHANGE_ME_NEW_OWNER@example.com';
  v_old_email text := 'CHANGE_ME_OLD_OWNER@example.com';
  v_new_id uuid;
  v_old_id uuid;
  v_role_id uuid;
BEGIN
  IF v_new_email ILIKE 'CHANGE_ME%' OR v_old_email ILIKE 'CHANGE_ME%' THEN
    RAISE EXCEPTION 'Set v_new_email and v_old_email before running transfer_platform_ownership.sql';
  END IF;

  IF lower(v_new_email) = 'prodigiousinvestments101@gmail.com' THEN
    RAISE EXCEPTION 'prodigiousinvestments101@gmail.com must not become the platform owner';
  END IF;

  SELECT id INTO v_new_id FROM auth.users WHERE lower(email) = lower(v_new_email);
  IF v_new_id IS NULL THEN
    RAISE EXCEPTION 'New owner not found: %. Create the account first.', v_new_email;
  END IF;

  SELECT id INTO v_old_id FROM auth.users WHERE lower(email) = lower(v_old_email);
  IF v_old_id IS NULL THEN
    RAISE EXCEPTION 'Previous owner not found: %', v_old_email;
  END IF;

  IF v_new_id = v_old_id THEN
    RAISE EXCEPTION 'New owner and previous owner are the same account';
  END IF;

  IF NOT (
    COALESCE(btrim((SELECT encrypted_password FROM auth.users WHERE id = v_new_id)), '') <> ''
    OR EXISTS (
      SELECT 1 FROM auth.identities i
      WHERE i.user_id = v_new_id AND i.provider = 'google'
    )
  ) THEN
    RAISE EXCEPTION 'New owner % cannot sign in: no password and no Google identity', v_new_email;
  END IF;

  SELECT id INTO v_role_id FROM platform.roles WHERE name = 'platform_owner';
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'Role platform_owner was not found';
  END IF;

  INSERT INTO platform.user_roles (user_id, role_id, granted_by, scope_type, status)
  SELECT v_new_id, v_role_id, NULL, 'global', 'active'
  WHERE NOT EXISTS (
    SELECT 1 FROM platform.user_roles
    WHERE user_id = v_new_id
      AND role_id = v_role_id
      AND scope_type = 'global'
  );

  UPDATE auth.users
  SET raw_app_meta_data = platform.merge_app_metadata_roles(
    raw_app_meta_data,
    ARRAY['platform_owner'],
    '{}'::text[]
  )
  WHERE id = v_new_id;

  DELETE FROM platform.user_roles ur
  USING platform.roles r
  WHERE ur.role_id = r.id
    AND r.name IN ('platform_owner', 'superadmin')
    AND ur.user_id = v_old_id;

  UPDATE auth.users
  SET raw_app_meta_data = platform.merge_app_metadata_roles(
    raw_app_meta_data,
    '{}'::text[],
    ARRAY['platform_owner', 'superadmin']
  )
  WHERE id = v_old_id
    AND (
      platform.jwt_role_texts(raw_app_meta_data)
        && ARRAY['platform_owner', 'superadmin']::text[]
    );

  INSERT INTO platform.permission_audit_log (actor_user_id, target_user_id, action, role_name, metadata)
  VALUES
    (NULL, v_new_id, 'role.granted', 'platform_owner', jsonb_build_object('source', 'transfer_ownership.sql')),
    (NULL, v_old_id, 'role.revoked', 'platform_owner', jsonb_build_object('source', 'transfer_ownership.sql'));

  PERFORM platform.assert_role_consistency();

  RAISE NOTICE 'Transferred platform_owner from % to %', v_old_email, v_new_email;
END $$;
