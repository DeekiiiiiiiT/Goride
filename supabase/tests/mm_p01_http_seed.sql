-- P-01 / P-02 HTTP fixture (COMMIT). Users password: MmP01Local2026!
-- Emails: mm-p01-fleet@local.test, mm-p01-analyst@local.test, mm-p01-support@local.test, mm-p01-owner@local.test
-- Verified TOTP (local only): secret JBSWY3DPEHPK3PXP — mm-p01-real-routes.mjs completes MFA after password sign-in.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_org text := 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001';
  v_fleet uuid := '10100001-0000-4000-8000-000000000001'::uuid;
  v_analyst uuid := '10100002-0000-4000-8000-000000000002'::uuid;
  v_support uuid := '10100004-0000-4000-8000-000000000004'::uuid;
  v_owner uuid := '10100003-0000-4000-8000-000000000003'::uuid;
  v_totp text := 'JBSWY3DPEHPK3PXP';
  v_part uuid := 'e2000003-0000-4000-8000-000000000099'::uuid;
  v_eng uuid := 'e2000001-0000-4000-8000-000000000001'::uuid;
  v_plat uuid := 'e2000002-0000-4000-8000-000000000010'::uuid;
  v_car uuid := 'e2000005-0000-4000-8000-000000000010'::uuid;
  v_vehicle text := 'fx_vehicle_mm';
  v_kv text := 'fx_legacy_mm';
  v_sched_id uuid;
  v_pw text := crypt('MmP01Local2026!', gen_salt('bf'));
  v_cat uuid;
  rec record;
  v_rule_id uuid;
  v_idx int := 0;
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token, email_change_token_new, email_change_token_current,
    email_change,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
    (
      '00000000-0000-0000-0000-000000000000', v_fleet, 'authenticated', 'authenticated',
      'mm-p01-fleet@local.test', v_pw, now(),
      '', '', '', '', '',
      jsonb_build_object(
        'provider', 'email', 'providers', jsonb_build_array('email'),
        'role', 'fleet_manager', 'roles', jsonb_build_array('fleet_manager'),
        'organizationId', v_org, 'productLine', 'fleet'
      ),
      '{}'::jsonb, now(), now()
    ),
    (
      '00000000-0000-0000-0000-000000000000', v_analyst, 'authenticated', 'authenticated',
      'mm-p01-analyst@local.test', v_pw, now(),
      '', '', '', '', '',
      jsonb_build_object(
        'provider', 'email', 'providers', jsonb_build_array('email'),
        'role', 'platform_analyst', 'roles', jsonb_build_array('platform_analyst')
      ),
      '{}'::jsonb, now(), now()
    ),
    (
      '00000000-0000-0000-0000-000000000000', v_support, 'authenticated', 'authenticated',
      'mm-p01-support@local.test', v_pw, now(),
      '', '', '', '', '',
      jsonb_build_object(
        'provider', 'email', 'providers', jsonb_build_array('email'),
        'role', 'platform_support', 'roles', jsonb_build_array('platform_support')
      ),
      '{}'::jsonb, now(), now()
    ),
    (
      '00000000-0000-0000-0000-000000000000', v_owner, 'authenticated', 'authenticated',
      'mm-p01-owner@local.test', v_pw, now(),
      '', '', '', '', '',
      jsonb_build_object(
        'provider', 'email', 'providers', jsonb_build_array('email'),
        'role', 'platform_owner', 'roles', jsonb_build_array('platform_owner')
      ),
      jsonb_build_object('full_name', 'MM P01 Owner'),
      now(), now()
    )
  ON CONFLICT (id) DO UPDATE SET
    encrypted_password = EXCLUDED.encrypted_password,
    confirmation_token = '',
    recovery_token = '',
    email_change_token_new = '',
    email_change_token_current = '',
    email_change = '',
    raw_app_meta_data = EXCLUDED.raw_app_meta_data,
    raw_user_meta_data = EXCLUDED.raw_user_meta_data,
    email_confirmed_at = now();

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  SELECT gen_random_uuid(), u.id,
    jsonb_build_object('sub', u.id::text, 'email', u.email),
    'email', u.email, now(), now(), now()
  FROM auth.users u
  WHERE u.email IN (
    'mm-p01-fleet@local.test', 'mm-p01-analyst@local.test', 'mm-p01-support@local.test', 'mm-p01-owner@local.test'
  )
  AND NOT EXISTS (
    SELECT 1 FROM auth.identities i WHERE i.user_id = u.id AND i.provider = 'email'
  );

  DELETE FROM auth.mfa_factors
  WHERE user_id IN (v_analyst, v_support, v_owner);

  INSERT INTO auth.mfa_factors (
    id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret
  ) VALUES
    (
      '101000f2-0000-4000-8000-000000000002'::uuid, v_analyst, 'P02 local TOTP', 'totp', 'verified', now(), now(), v_totp
    ),
    (
      '101000f2-0000-4000-8000-000000000004'::uuid, v_support, 'P02 local TOTP', 'totp', 'verified', now(), now(), v_totp
    ),
    (
      '101000f2-0000-4000-8000-000000000003'::uuid, v_owner, 'P02 local TOTP', 'totp', 'verified', now(), now(), v_totp
    )
  ON CONFLICT (id) DO UPDATE SET
    status = 'verified',
    secret = EXCLUDED.secret,
    updated_at = now();

  INSERT INTO public.platform_feature_flags (name, enabled)
  VALUES ('maintenance_master_governance', true)
  ON CONFLICT (name) DO UPDATE SET enabled = EXCLUDED.enabled;

  INSERT INTO public.organizations (id, owner_id, name, slug, product_line, status)
  VALUES (v_org::uuid, v_fleet, 'MM P01 Fixture Org', 'mm-p01-fixture', 'fleet', 'active')
  ON CONFLICT (id) DO UPDATE SET owner_id = EXCLUDED.owner_id;

  INSERT INTO public.engine_family (id, code) VALUES (v_eng, 'FX-ENG') ON CONFLICT DO NOTHING;
  INSERT INTO public.vehicle_platform (id, code, maker, label) VALUES
    (v_plat, 'FX-M900A', 'FxToyota', 'Fx M900A') ON CONFLICT DO NOTHING;

  INSERT INTO public.maintenance_service_categories (
    id, code, name, kind, op_code, icon_key, sort_order, is_part, position_aware
  ) VALUES (
    v_part, 'fx-mm-part', 'Fx MM Part', 'component', 'FX-MM', 'wrench', 9999, true, false
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.vehicle_catalog (
    id, make, model, chassis_code, production_start_year, production_end_year,
    platform_id, engine_family_id, vehicle_class
  ) VALUES (
    v_car, 'FxToyota', 'FxRoomy', 'FX-M900A', 2018, 2022, v_plat, v_eng, 'car'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO fleet.vehicles (
    id, organization_id, license_plate, legacy_kv_id, vehicle_catalog_id, year, make, model, status
  ) VALUES (
    v_vehicle, v_org, 'fx_plate_mm', v_kv, v_car::text, 2018, 'FxToyota', 'FxRoomy', 'Active'
  ) ON CONFLICT (id) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    vehicle_catalog_id = EXCLUDED.vehicle_catalog_id;

  -- Fleet table read-through uses payload_json; catalog gate reads KV shape from there.
  UPDATE fleet.vehicles
  SET payload_json = jsonb_build_object(
    'vehicle_catalog_id', v_car::text,
    'catalogStatus', 'matched',
    'licensePlate', 'fx_plate_mm',
    'make', 'FxToyota',
    'model', 'FxRoomy',
    'year', 2018,
    'status', 'Active'
  )
  WHERE id = v_vehicle;

  INSERT INTO public.kv_store_37f42386 (key, value)
  VALUES (
    'vehicle:' || v_vehicle,
    jsonb_build_object(
      'id', v_vehicle,
      'organizationId', v_org,
      'licensePlate', 'fx_plate_mm',
      'make', 'FxToyota',
      'model', 'FxRoomy',
      'year', 2018,
      'status', 'Active',
      'vehicle_catalog_id', v_car::text,
      'catalogStatus', 'matched'
    )
  )
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

  -- Global Roam rules: migration 20261106131000_mm_seed_16_part_rules.sql (16 parts). P-01 adds fx-glob only.

  INSERT INTO public.maintenance_task_templates (
    id, task_name, task_code, template_scope, component_id, interval_km, interval_months,
    status, source_type, confidence, applicable_vehicle_classes
  ) VALUES (
    'e2000010-0000-4000-8000-000000000005'::uuid, 'Fx global rule', 'fx-glob', 'global', v_part,
    1000, 1, 'active', 'roam_policy', 'uncertain', ARRAY['car']::text[]
  ) ON CONFLICT (id) DO UPDATE SET status = 'active', component_id = EXCLUDED.component_id;

  INSERT INTO fleet.odometer_readings (
    id, organization_id, vehicle_id, reading, reading_date, recorded_at, source,
    legacy_kv_id, is_voided, is_anomaly
  ) VALUES (
    'e20000f1-0000-4000-8000-000000000099'::uuid,
    v_org, v_vehicle, 50000, current_date, now(), 'manual', v_kv, false, false
  ) ON CONFLICT (id) DO UPDATE SET reading = EXCLUDED.reading;

  PERFORM public.recompute_component_schedules_for_car(v_org, v_vehicle);

  SELECT vcs.id INTO v_sched_id
  FROM public.vehicle_component_schedule vcs
  WHERE vcs.organization_id = v_org AND vcs.vehicle_id = v_vehicle AND vcs.category_id = v_part
  LIMIT 1;

  UPDATE public.vehicle_component_schedule vcs
  SET next_due_km = 49000, next_due_date = current_date - 1
  WHERE vcs.id = v_sched_id;

  DELETE FROM fleet.maintenance_alerts
  WHERE organization_id = v_org AND vehicle_id = v_vehicle AND category_id = v_part;

  INSERT INTO fleet.maintenance_alerts (
    id, organization_id, alert_key, vehicle_id, category_id, position, alert_date, severity,
    status, component_schedule_id, due_km, due_date, created_at
  ) VALUES (
    'e20000c0-0000-4000-8000-000000000001'::uuid,
    v_org, 'fx-mm-open', v_vehicle, v_part, NULL, current_date - 1, 'overdue',
    'open', v_sched_id, 49000, current_date - 1, now()
  ) ON CONFLICT (id) DO UPDATE SET status = 'open', component_schedule_id = EXCLUDED.component_schedule_id;
END $$;

COMMIT;
