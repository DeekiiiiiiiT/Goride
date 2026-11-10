-- Inventory done-test base fixture (org slug test-org-inv). Password: InvDoneLocal2026!
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_org text := 'f6010000-0000-4000-8000-000000000099';
  v_org_uuid uuid := 'f6010000-0000-4000-8000-000000000099'::uuid;
  v_owner uuid := 'a6010001-0000-4000-8000-000000000001'::uuid;
  v_approver uuid := 'a6010002-0000-4000-8000-000000000002'::uuid;
  v_viewer uuid := 'a6010003-0000-4000-8000-000000000003'::uuid;
  v_driver uuid := 'a6010004-0000-4000-8000-000000000004'::uuid;
  v_pw text := crypt('InvDoneLocal2026!', gen_salt('bf'));
  v_main_loc uuid;
  v_pump uuid;
  v_tri uuid;
  v_ext uuid;
  v_kit_tpl uuid;
  v_kit_ver uuid;
  v_v1 text := 'test-org-inv-veh-001';
  v_v2 text := 'test-org-inv-veh-002';
BEGIN
  INSERT INTO public.platform_feature_flags (name, enabled) VALUES
    ('fleet_inventory_phase0_security', true),
    ('fleet_inventory_phase1_engine', true),
    ('fleet_inventory_phase2_stock', true),
    ('fleet_inventory_phase3_kits', true),
    ('fleet_inventory_phase4_assets', false),
    ('fleet_inventory_phase5_maintenance', false),
    ('fleet_inventory_phase6_purchasing', false),
    ('fleet_inventory_phase7_counts', false),
    ('fleet_inventory_phase8_telematics', false),
    ('inv_road_clearance_gate', true)
  ON CONFLICT (name) DO UPDATE SET enabled = EXCLUDED.enabled;

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token, email_change_token_new, email_change_token_current,
    email_change, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
  (
    '00000000-0000-0000-0000-000000000000', v_owner, 'authenticated', 'authenticated',
    'inv-done-owner@local.test', v_pw, now(), '', '', '', '', '',
    jsonb_build_object(
      'provider', 'email', 'providers', jsonb_build_array('email'),
      'role', 'fleet_owner', 'roles', jsonb_build_array('fleet_owner'),
      'organizationId', v_org, 'productLine', 'fleet'
    ),
    jsonb_build_object('full_name', 'Inv Done Owner'), now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000', v_approver, 'authenticated', 'authenticated',
    'inv-done-approver@local.test', v_pw, now(), '', '', '', '', '',
    jsonb_build_object(
      'provider', 'email', 'providers', jsonb_build_array('email'),
      'role', 'fleet_accountant', 'roles', jsonb_build_array('fleet_accountant'),
      'organizationId', v_org, 'productLine', 'fleet'
    ),
    jsonb_build_object('full_name', 'Inv Done Approver'), now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000', v_viewer, 'authenticated', 'authenticated',
    'inv-done-viewer@local.test', v_pw, now(), '', '', '', '', '',
    jsonb_build_object(
      'provider', 'email', 'providers', jsonb_build_array('email'),
      'role', 'fleet_viewer', 'roles', jsonb_build_array('fleet_viewer'),
      'organizationId', v_org, 'productLine', 'fleet'
    ),
    jsonb_build_object('full_name', 'Inv Done Viewer'), now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000', v_driver, 'authenticated', 'authenticated',
    'inv-done-driver@local.test', v_pw, now(), '', '', '', '', '',
    jsonb_build_object(
      'provider', 'email', 'providers', jsonb_build_array('email'),
      'role', 'driver', 'roles', jsonb_build_array('driver'),
      'organizationId', v_org, 'productLine', 'fleet', 'assignedVehicleId', v_v1
    ),
    jsonb_build_object('full_name', 'Inv Done Driver'), now(), now()
  )
  ON CONFLICT (id) DO UPDATE SET
    encrypted_password = EXCLUDED.encrypted_password,
    raw_app_meta_data = EXCLUDED.raw_app_meta_data,
    email_confirmed_at = now();

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  SELECT gen_random_uuid(), v_owner, jsonb_build_object('sub', v_owner::text, 'email', 'inv-done-owner@local.test'),
    'email', 'inv-done-owner@local.test', now(), now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = v_owner AND i.provider = 'email');

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  SELECT gen_random_uuid(), v_approver, jsonb_build_object('sub', v_approver::text, 'email', 'inv-done-approver@local.test'),
    'email', 'inv-done-approver@local.test', now(), now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = v_approver AND i.provider = 'email');

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  SELECT gen_random_uuid(), v_viewer, jsonb_build_object('sub', v_viewer::text, 'email', 'inv-done-viewer@local.test'),
    'email', 'inv-done-viewer@local.test', now(), now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = v_viewer AND i.provider = 'email');

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  SELECT gen_random_uuid(), v_driver, jsonb_build_object('sub', v_driver::text, 'email', 'inv-done-driver@local.test'),
    'email', 'inv-done-driver@local.test', now(), now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = v_driver AND i.provider = 'email');

  INSERT INTO public.organizations (id, owner_id, name, slug, product_line, status)
  VALUES (v_org_uuid, v_owner, 'Inventory Done Test Org', 'test-org-inv', 'fleet', 'active')
  ON CONFLICT (id) DO UPDATE SET
    owner_id = EXCLUDED.owner_id,
    slug = EXCLUDED.slug,
    product_line = EXCLUDED.product_line;

  INSERT INTO platform.user_roles (user_id, role_id, scope_type, scope_id, granted_at, status)
  SELECT v_approver, r.id, 'organization', v_org_uuid, now(), 'active'
  FROM platform.roles r
  WHERE r.name = 'fleet_accountant'
    AND NOT EXISTS (
      SELECT 1 FROM platform.user_roles ur
      WHERE ur.user_id = v_approver AND ur.role_id = r.id AND ur.scope_type = 'organization'
        AND ur.scope_id = v_org_uuid
    );

  INSERT INTO platform.user_roles (user_id, role_id, scope_type, scope_id, granted_at, status)
  SELECT v_viewer, r.id, 'organization', v_org_uuid, now(), 'active'
  FROM platform.roles r
  WHERE r.name = 'fleet_viewer'
    AND NOT EXISTS (
      SELECT 1 FROM platform.user_roles ur
      WHERE ur.user_id = v_viewer AND ur.role_id = r.id AND ur.scope_type = 'organization'
        AND ur.scope_id = v_org_uuid
    );

  -- Driver app needs a finished profile, or it shows the "How do you drive?" onboarding.
  INSERT INTO public.driver_profiles (user_id, mode, fleet_id, status, onboarding_complete, display_name)
  SELECT v_driver, 'fleet', v_org_uuid, 'active', true, 'Inv Done Driver'
  WHERE NOT EXISTS (SELECT 1 FROM public.driver_profiles p WHERE p.user_id = v_driver);
  UPDATE public.driver_profiles
     SET mode = 'fleet', fleet_id = v_org_uuid, status = 'active', onboarding_complete = true
   WHERE user_id = v_driver;

  INSERT INTO fleet.inv_settings (organization_id)
  VALUES (v_org)
  ON CONFLICT (organization_id) DO NOTHING;

  IF NOT EXISTS (SELECT 1 FROM fleet.inv_location WHERE organization_id = v_org AND lower(code) = 'main') THEN
    INSERT INTO fleet.inv_location (organization_id, code, name, kind, is_default)
    VALUES (v_org, 'MAIN', 'Main store', 'warehouse', true);
  END IF;
  SELECT id INTO v_main_loc FROM fleet.inv_location WHERE organization_id = v_org AND lower(code) = 'main' LIMIT 1;

  INSERT INTO fleet.inv_item (organization_id, sku, name, tracking, uom, default_unit_cost)
  VALUES
    (v_org, 'ZZ-TEST-PUMP', 'Tyre pump', 'quantity', 'ea', 6500),
    (v_org, 'ZZ-TEST-TRI', 'Warning triangle', 'quantity', 'ea', 1200),
    (v_org, 'ZZ-TEST-VEST', 'Reflective vest', 'quantity', 'ea', 2500),
    (v_org, 'ZZ-TEST-DASH', 'Dash camera', 'serial', 'ea', 45998.85),
    (v_org, 'ZZ-TEST-EXT', 'Fire extinguisher', 'quantity', 'ea', 8000)
  ON CONFLICT DO NOTHING;

  UPDATE fleet.inv_item SET name = 'Tyre pump', default_unit_cost = 6500
    WHERE organization_id = v_org AND lower(sku) = lower('ZZ-TEST-PUMP');
  UPDATE fleet.inv_item SET name = 'Warning triangle', default_unit_cost = 1200
    WHERE organization_id = v_org AND lower(sku) = lower('ZZ-TEST-TRI');
  UPDATE fleet.inv_item SET name = 'Reflective vest', default_unit_cost = 2500
    WHERE organization_id = v_org AND lower(sku) = lower('ZZ-TEST-VEST');
  UPDATE fleet.inv_item SET name = 'Dash camera', tracking = 'serial', default_unit_cost = 45998.85
    WHERE organization_id = v_org AND lower(sku) = lower('ZZ-TEST-DASH');
  UPDATE fleet.inv_item SET name = 'Fire extinguisher', default_unit_cost = 8000
    WHERE organization_id = v_org AND lower(sku) = lower('ZZ-TEST-EXT');

  SELECT id INTO v_pump FROM fleet.inv_item WHERE organization_id = v_org AND sku = 'ZZ-TEST-PUMP';
  SELECT id INTO v_tri FROM fleet.inv_item WHERE organization_id = v_org AND sku = 'ZZ-TEST-TRI';
  SELECT id INTO v_ext FROM fleet.inv_item WHERE organization_id = v_org AND sku = 'ZZ-TEST-EXT';

  INSERT INTO fleet.vehicles (id, organization_id, license_plate, legacy_kv_id)
  VALUES
    (v_v1, v_org, 'TEST-001', 'legacy-' || v_v1),
    (v_v2, v_org, 'TEST-002', 'legacy-' || v_v2)
  ON CONFLICT (id) DO UPDATE SET license_plate = EXCLUDED.license_plate;

  IF NOT EXISTS (SELECT 1 FROM fleet.kit_template WHERE organization_id = v_org AND lower(code) = lower('ZZ-TEST-RIDESHARE-KIT')) THEN
    INSERT INTO fleet.kit_template (organization_id, code, name, classification)
    VALUES (v_org, 'ZZ-TEST-RIDESHARE-KIT', 'ZZ Rideshare car kit', 'rideshare');
  END IF;

  SELECT id INTO v_kit_tpl FROM fleet.kit_template WHERE organization_id = v_org AND lower(code) = lower('ZZ-TEST-RIDESHARE-KIT');

  IF NOT EXISTS (
    SELECT 1 FROM fleet.kit_template_version
    WHERE organization_id = v_org AND template_id = v_kit_tpl AND status = 'production'
  ) THEN
    INSERT INTO fleet.kit_template_version (organization_id, template_id, version, status)
    VALUES (v_org, v_kit_tpl, 1, 'production');
  END IF;

  SELECT id INTO v_kit_ver FROM fleet.kit_template_version
  WHERE organization_id = v_org AND template_id = v_kit_tpl AND status = 'production' LIMIT 1;

  DELETE FROM fleet.kit_template_line WHERE organization_id = v_org AND version_id = v_kit_ver;

  INSERT INTO fleet.kit_template_line (
    organization_id, version_id, line_type, item_id, qty_required, required, blocks_road_clearance, install_position, sort_order
  ) VALUES
    (v_org, v_kit_ver, 'linked_toll_tag', NULL, 1, true, false, NULL, 1),
    (v_org, v_kit_ver, 'linked_fuel_card', NULL, 1, true, false, NULL, 2),
    (v_org, v_kit_ver, 'item', v_pump, 1, true, true, 'Boot', 3),
    (v_org, v_kit_ver, 'item', v_tri, 1, true, true, NULL, 4),
    (v_org, v_kit_ver, 'item', v_ext, 2, true, true, NULL, 5);

  INSERT INTO fleet.vehicle_kit (organization_id, vehicle_id, template_id, version_id)
  VALUES
    (v_org, v_v1, v_kit_tpl, v_kit_ver),
    (v_org, v_v2, v_kit_tpl, v_kit_ver)
  ON CONFLICT (organization_id, vehicle_id) DO UPDATE
    SET template_id = EXCLUDED.template_id, version_id = EXCLUDED.version_id;

  INSERT INTO fleet.inv_chain_check (organization_id, ok, checked_at, entries, checked_by)
  VALUES (v_org, true, now(), 0, 'done-test-seed');
END $$;

COMMIT;
