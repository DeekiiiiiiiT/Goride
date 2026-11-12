-- Maintenance discount done-test org. Password: MdDiscDone2026!
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_org text := 'd6010000-0000-4000-8000-000000000088';
  v_org_uuid uuid := 'd6010000-0000-4000-8000-000000000088'::uuid;
  v_owner uuid := 'd6010001-0000-4000-8000-000000000001'::uuid;
  v_pw text := crypt('MdDiscDone2026!', gen_salt('bf'));
  v_vehicle text := 'md-disc-veh-001';
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token, email_change_token_new, email_change_token_current,
    email_change, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_owner, 'authenticated', 'authenticated',
    'md-disc-done-owner@local.test', v_pw, now(), '', '', '', '', '',
    jsonb_build_object(
      'provider', 'email', 'providers', jsonb_build_array('email'),
      'role', 'fleet_owner', 'roles', jsonb_build_array('fleet_owner'),
      'organizationId', v_org, 'productLine', 'fleet'
    ),
    jsonb_build_object('full_name', 'Md Disc Done Owner'), now(), now()
  )
  ON CONFLICT (id) DO UPDATE SET
    encrypted_password = EXCLUDED.encrypted_password,
    raw_app_meta_data = EXCLUDED.raw_app_meta_data,
    email_confirmed_at = now();

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  SELECT gen_random_uuid(), v_owner, jsonb_build_object('sub', v_owner::text, 'email', 'md-disc-done-owner@local.test'),
    'email', 'md-disc-done-owner@local.test', now(), now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = v_owner AND i.provider = 'email');

  INSERT INTO public.organizations (id, owner_id, name, slug, product_line, status)
  VALUES (v_org_uuid, v_owner, 'Maintenance Discount Done Test', 'test-org-md-disc', 'fleet', 'active')
  ON CONFLICT (id) DO UPDATE SET
    owner_id = EXCLUDED.owner_id,
    slug = EXCLUDED.slug,
    product_line = EXCLUDED.product_line;

  INSERT INTO fleet.organization_settings (id, organization_id, legacy_kv_id, maintenance_discount_enabled)
  VALUES (v_org, v_org, 'org-settings-' || v_org, true)
  ON CONFLICT (id) DO UPDATE SET maintenance_discount_enabled = true;

  INSERT INTO fleet.vehicles (id, organization_id, license_plate, legacy_kv_id, status)
  VALUES (v_vehicle, v_org, 'MD-DISC-001', 'vehicle:' || v_vehicle, 'active')
  ON CONFLICT (id) DO UPDATE SET license_plate = EXCLUDED.license_plate, organization_id = EXCLUDED.organization_id;

  UPDATE fleet.vehicles v
     SET payload_json = jsonb_strip_nulls(jsonb_build_object(
           'id', v.id,
           'organizationId', v_org,
           'licensePlate', 'MD-DISC-001',
           'status', 'Active',
           'make', 'Test',
           'model', 'Discount',
           'year', '2024'
         ))
   WHERE v.id = v_vehicle;
END $$;

COMMIT;
