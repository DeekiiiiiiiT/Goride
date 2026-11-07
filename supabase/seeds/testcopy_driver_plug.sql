-- Test copy: Roam Driver + Roam Plug customers (MM F01 fleet org). Passwords in docs/test-copy-guide.md
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_org uuid := 'cccccccc-cccc-4ccc-8ccc-0000000000f1'::uuid;
  v_org_text text := 'cccccccc-cccc-4ccc-8ccc-0000000000f1';
  v_driver_user uuid := '10300001-0000-4000-8000-000000000001'::uuid;
  v_plug_user uuid := '10300002-0000-4000-8000-000000000002'::uuid;
  v_driver_pw text := crypt('TestCopyDriver2026!', gen_salt('bf'));
  v_plug_pw text := crypt('TestCopyPlug2026!', gen_salt('bf'));
  v_vehicle text := 'mm_f01_5179kz';
  v_profile uuid := '10300001-0000-4000-8000-000000000010'::uuid;
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token, email_change_token_new, email_change_token_current,
    email_change, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_driver_user, 'authenticated', 'authenticated',
    'testcopy-driver@local.test', v_driver_pw, now(), '', '', '', '', '',
    jsonb_build_object(
      'provider', 'email', 'providers', jsonb_build_array('email'),
      'role', 'driver', 'roles', jsonb_build_array('driver'),
      'organizationId', v_org_text, 'productLine', 'fleet', 'assignedVehicleId', v_vehicle
    ),
    jsonb_build_object('full_name', 'Test Copy Driver'),
    now(), now()
  )
  ON CONFLICT (id) DO UPDATE SET
    encrypted_password = EXCLUDED.encrypted_password,
    raw_app_meta_data = EXCLUDED.raw_app_meta_data,
    email_confirmed_at = now();

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token, email_change_token_new, email_change_token_current,
    email_change, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_plug_user, 'authenticated', 'authenticated',
    'testcopy-customer@local.test', v_plug_pw, now(), '', '', '', '', '',
    jsonb_build_object(
      'provider', 'email', 'providers', jsonb_build_array('email'),
      'role', 'explorer_user', 'roles', jsonb_build_array('explorer_user'),
      'productLine', 'plug'
    ),
    jsonb_build_object('full_name', 'Test Copy Customer', 'app', 'plug'),
    now(), now()
  )
  ON CONFLICT (id) DO UPDATE SET
    encrypted_password = EXCLUDED.encrypted_password,
    raw_app_meta_data = EXCLUDED.raw_app_meta_data,
    email_confirmed_at = now();

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  SELECT gen_random_uuid(), u.id,
    jsonb_build_object('sub', u.id::text, 'email', u.email),
    'email', u.email, now(), now(), now()
  FROM auth.users u
  WHERE u.email IN ('testcopy-driver@local.test', 'testcopy-customer@local.test')
    AND NOT EXISTS (
      SELECT 1 FROM auth.identities i WHERE i.user_id = u.id AND i.provider = 'email'
    );

  INSERT INTO public.driver_profiles (
    id, user_id, mode, fleet_id, fleet_joined_at, fleet_role, status, onboarding_complete, display_name
  ) VALUES (
    v_profile, v_driver_user, 'fleet', v_org, now(), 'driver', 'active', true, 'Test Copy Driver'
  )
  ON CONFLICT (user_id) DO UPDATE SET
    fleet_id = EXCLUDED.fleet_id,
    status = 'active',
    onboarding_complete = true,
    display_name = EXCLUDED.display_name;

  INSERT INTO fleet.drivers (id, legacy_kv_id, organization_id, user_id, assigned_vehicle_id, name, service_lines)
  VALUES (
    'testcopy-driver-fleet-row', 'driver:testcopy-driver-fleet-row', v_org_text, v_driver_user::text, v_vehicle, 'Test Copy Driver', ARRAY['rideshare']
  )
  ON CONFLICT (id) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    user_id = EXCLUDED.user_id,
    assigned_vehicle_id = EXCLUDED.assigned_vehicle_id;
END $$;

COMMIT;
