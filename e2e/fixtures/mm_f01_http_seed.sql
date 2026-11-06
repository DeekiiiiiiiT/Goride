-- F01 fleet maintenance master e2e (COMMIT). Password: MmF01Local2026!
-- Email: mm-f01-fleet@local.test — set E2E_FLEET_EMAIL / E2E_FLEET_PASSWORD to match for Playwright.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_org text := 'cccccccc-cccc-4ccc-8ccc-0000000000f1';
  v_mgr uuid := '10200001-0000-4000-8000-000000000001'::uuid;
  v_viewer uuid := '10200002-0000-4000-8000-000000000002'::uuid;
  v_pw text := crypt('MmF01Local2026!', gen_salt('bf'));
  v_eng uuid := 'e2000001-0000-4000-8000-000000000001'::uuid;
  v_plat uuid := 'e2000002-0000-4000-8000-000000000010'::uuid;
  v_car uuid := 'e2000005-0000-4000-8000-000000000010'::uuid;
  v_5179 text := 'mm_f01_5179kz';
  v_1505 text := 'mm_f01_1505lm';
  v_kv5179 text := 'mm_kv_5179kz';
  v_kv1505 text := 'mm_kv_1505lm';
  v_cat_tire uuid;
  v_cat_cabin uuid;
  v_cat_oil uuid;
  v_cat_brk uuid;
  v_cat_cool uuid;
  v_sched record;
BEGIN
  INSERT INTO public.platform_feature_flags (name, enabled)
  VALUES ('maintenance_master_governance', true)
  ON CONFLICT (name) DO UPDATE SET enabled = EXCLUDED.enabled;

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token, email_change_token_new, email_change_token_current,
    email_change, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_mgr, 'authenticated', 'authenticated',
    'mm-f01-fleet@local.test', v_pw, now(),
    '', '', '', '', '',
    jsonb_build_object(
      'provider', 'email', 'providers', jsonb_build_array('email'),
      'role', 'fleet_owner', 'roles', jsonb_build_array('fleet_owner'),
      'organizationId', v_org, 'productLine', 'fleet'
    ),
    jsonb_build_object('full_name', 'MM F01 Manager'),
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
    '00000000-0000-0000-0000-000000000000', v_viewer, 'authenticated', 'authenticated',
    'mm-f01-viewer@local.test', v_pw, now(),
    '', '', '', '', '',
    jsonb_build_object(
      'provider', 'email', 'providers', jsonb_build_array('email'),
      'role', 'fleet_viewer', 'roles', jsonb_build_array('fleet_viewer'),
      'organizationId', v_org, 'productLine', 'fleet'
    ),
    jsonb_build_object('full_name', 'MM F01 Viewer'),
    now(), now()
  )
  ON CONFLICT (id) DO UPDATE SET
    encrypted_password = EXCLUDED.encrypted_password,
    raw_app_meta_data = EXCLUDED.raw_app_meta_data,
    email_confirmed_at = now();

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  SELECT gen_random_uuid(), v_viewer,
    jsonb_build_object('sub', v_viewer::text, 'email', 'mm-f01-viewer@local.test'),
    'email', 'mm-f01-viewer@local.test', now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM auth.identities i WHERE i.user_id = v_viewer AND i.provider = 'email'
  );

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  SELECT gen_random_uuid(), v_mgr,
    jsonb_build_object('sub', v_mgr::text, 'email', 'mm-f01-fleet@local.test'),
    'email', 'mm-f01-fleet@local.test', now(), now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM auth.identities i WHERE i.user_id = v_mgr AND i.provider = 'email'
  );

  INSERT INTO public.organizations (id, owner_id, name, slug, product_line, status)
  VALUES (v_org::uuid, v_mgr, 'MM F01 Fleet Org', 'mm-f01-fleet', 'fleet', 'active')
  ON CONFLICT (id) DO UPDATE SET owner_id = EXCLUDED.owner_id;

  INSERT INTO public.engine_family (id, code) VALUES (v_eng, 'FX-ENG') ON CONFLICT DO NOTHING;
  INSERT INTO public.vehicle_platform (id, code, maker, label) VALUES
    (v_plat, 'FX-M900A', 'FxToyota', 'Fx M900A') ON CONFLICT DO NOTHING;

  SELECT id INTO v_cat_tire FROM public.maintenance_service_categories WHERE upper(coalesce(op_code, '')) = 'TIRE-REPL' LIMIT 1;
  SELECT id INTO v_cat_cabin FROM public.maintenance_service_categories WHERE upper(coalesce(op_code, '')) = 'HVAC-CABIN' LIMIT 1;
  SELECT id INTO v_cat_oil FROM public.maintenance_service_categories WHERE upper(coalesce(op_code, '')) IN ('ENG-OIL', 'OIL') ORDER BY CASE WHEN upper(op_code) = 'ENG-OIL' THEN 0 ELSE 1 END LIMIT 1;
  SELECT id INTO v_cat_brk FROM public.maintenance_service_categories WHERE upper(coalesce(op_code, '')) = 'BRK-FLUID' LIMIT 1;
  SELECT id INTO v_cat_cool FROM public.maintenance_service_categories WHERE upper(coalesce(op_code, '')) = 'FLD-COOL' LIMIT 1;

  INSERT INTO fleet.vehicles (
    id, organization_id, license_plate, legacy_kv_id, vehicle_catalog_id, year, make, model, status, severe_duty
  ) VALUES
    (v_5179, v_org, '5179KZ', v_kv5179, v_car::text, 2018, 'Toyota', 'Roomy', 'Active', true),
    (v_1505, v_org, '1505LM', v_kv1505, v_car::text, 2019, 'Toyota', 'Roomy', 'Active', false)
  ON CONFLICT (id) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    license_plate = EXCLUDED.license_plate,
    vehicle_catalog_id = EXCLUDED.vehicle_catalog_id,
    severe_duty = EXCLUDED.severe_duty;

  UPDATE fleet.vehicles SET payload_json = jsonb_build_object(
    'vehicle_catalog_id', v_car::text, 'catalogStatus', 'matched',
    'licensePlate', '5179KZ', 'make', 'Toyota', 'model', 'Roomy', 'year', 2018, 'status', 'Active'
  ) WHERE id = v_5179;

  UPDATE fleet.vehicles SET payload_json = jsonb_build_object(
    'vehicle_catalog_id', v_car::text, 'catalogStatus', 'matched',
    'licensePlate', '1505LM', 'make', 'Toyota', 'model', 'Roomy', 'year', 2019, 'status', 'Active'
  ) WHERE id = v_1505;

  INSERT INTO public.kv_store_37f42386 (key, value) VALUES
    ('vehicle:' || v_5179, jsonb_build_object('id', v_5179, 'organizationId', v_org, 'licensePlate', '5179KZ', 'make', 'Toyota', 'model', 'Roomy', 'year', 2018, 'status', 'Active', 'vehicle_catalog_id', v_car::text)),
    ('vehicle:' || v_1505, jsonb_build_object('id', v_1505, 'organizationId', v_org, 'licensePlate', '1505LM', 'make', 'Toyota', 'model', 'Roomy', 'year', 2019, 'status', 'Active', 'vehicle_catalog_id', v_car::text))
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

  INSERT INTO fleet.odometer_readings (
    id, organization_id, vehicle_id, reading, reading_date, recorded_at, source, legacy_kv_id, is_voided, is_anomaly
  ) VALUES (
    'f20100f1-0000-4000-8000-000000000179'::uuid,
    v_org, v_5179, 195432, date '2026-11-02', timestamptz '2026-11-02 14:00:00+00', 'manual', v_kv5179, false, false
  ) ON CONFLICT (id) DO UPDATE SET reading = EXCLUDED.reading, reading_date = EXCLUDED.reading_date;

  DELETE FROM fleet.odometer_readings WHERE organization_id = v_org AND vehicle_id = v_1505;
  DELETE FROM public.kv_store_37f42386 WHERE key LIKE 'odometer_reading:' || v_1505 || '%';

  PERFORM public.recompute_component_schedules_for_car(v_org, v_5179);
  PERFORM public.recompute_component_schedules_for_car(v_org, v_1505);

  IF v_cat_tire IS NOT NULL THEN
    UPDATE public.vehicle_component_schedule vcs
    SET next_due_km = 163000, next_due_date = current_date + 400, schedule_status = 'active'
    WHERE vcs.organization_id = v_org AND vcs.vehicle_id = v_5179 AND vcs.category_id = v_cat_tire AND coalesce(vcs.position, 'LF') = 'LF';
    UPDATE public.vehicle_component_schedule vcs
    SET next_due_km = 163000, next_due_date = current_date + 400, schedule_status = 'active'
    WHERE vcs.organization_id = v_org AND vcs.vehicle_id = v_5179 AND vcs.category_id = v_cat_tire AND coalesce(vcs.position, 'RF') = 'RF';
  END IF;

  IF v_cat_cabin IS NOT NULL THEN
    UPDATE public.vehicle_component_schedule vcs
    SET next_due_km = 131952, next_due_date = current_date - 30, schedule_status = 'active'
    WHERE vcs.organization_id = v_org AND vcs.vehicle_id = v_5179 AND vcs.category_id = v_cat_cabin AND vcs.position IS NULL;
  END IF;

  IF v_cat_oil IS NOT NULL THEN
    UPDATE public.vehicle_component_schedule vcs
    SET next_due_km = 190000, next_due_date = current_date - 5, schedule_status = 'active'
    WHERE vcs.organization_id = v_org AND vcs.vehicle_id = v_5179 AND vcs.category_id = v_cat_oil AND vcs.position IS NULL;
  END IF;

  IF v_cat_brk IS NOT NULL THEN
    UPDATE public.vehicle_component_schedule vcs
    SET next_due_km = 161952, next_due_date = date '2028-10-14', schedule_status = 'active',
        baseline_odometer = 121952, baseline_date = date '2026-11-02', baseline_source = 'bootstrap',
        rule_revision_no = 2, computed_at = timestamptz '2026-11-04 12:00:00+00'
    WHERE vcs.organization_id = v_org AND vcs.vehicle_id = v_5179 AND vcs.category_id = v_cat_brk AND vcs.position IS NULL;
  END IF;

  IF v_cat_cool IS NOT NULL THEN
    UPDATE public.vehicle_component_schedule vcs
    SET next_due_km = 221952, next_due_date = date '2031-10-14', schedule_status = 'active'
    WHERE vcs.organization_id = v_org AND vcs.vehicle_id = v_5179 AND vcs.category_id = v_cat_cool AND vcs.position IS NULL;
  END IF;

  UPDATE public.vehicle_component_schedule vcs
  SET schedule_status = 'odometer_needed', next_due_km = NULL, next_due_date = current_date + 365
  WHERE vcs.organization_id = v_org AND vcs.vehicle_id = v_1505 AND vcs.next_due_km IS NOT NULL;

  FOR v_sched IN
    SELECT vcs.id, vcs.category_id, vcs.position, vcs.next_due_km, vcs.next_due_date
    FROM public.vehicle_component_schedule vcs
    WHERE vcs.organization_id = v_org AND vcs.vehicle_id = v_5179
      AND (
        (vcs.next_due_km IS NOT NULL AND vcs.next_due_km < 195432)
        OR (vcs.next_due_date IS NOT NULL AND vcs.next_due_date < current_date)
      )
    LIMIT 6
  LOOP
    DELETE FROM fleet.maintenance_alerts
    WHERE organization_id = v_org AND vehicle_id = v_5179 AND category_id = v_sched.category_id
      AND coalesce(position, '-') = coalesce(v_sched.position, '-');
    INSERT INTO fleet.maintenance_alerts (
      id, organization_id, alert_key, vehicle_id, category_id, position, alert_date, severity,
      status, component_schedule_id, due_km, due_date, created_at
    ) VALUES (
      gen_random_uuid(), v_org, 'mm-f01-open-' || v_sched.id::text, v_5179, v_sched.category_id, v_sched.position,
      current_date - 3, 'overdue', 'open', v_sched.id, v_sched.next_due_km, v_sched.next_due_date, now() - interval '3 days'
    );
  END LOOP;

  INSERT INTO fleet.maintenance_alerts (
    id, organization_id, alert_key, vehicle_id, category_id, position, alert_date, severity,
    status, resolution_reason, resolved_at, created_at
  ) VALUES (
    'f20100a0-0000-4000-8000-000000000001'::uuid,
    v_org, 'mm-f01-closed', v_5179, coalesce(v_cat_oil, v_cat_tire), NULL,
    current_date - 30, 'overdue', 'resolved', 'performed', now() - interval '2 days', now() - interval '30 days'
  ) ON CONFLICT (id) DO UPDATE SET status = 'resolved', resolution_reason = 'performed';

  IF v_cat_oil IS NOT NULL THEN
    UPDATE public.maintenance_task_templates mtt
    SET status = 'needs_checking'
    FROM public.vehicle_component_schedule vcs
    WHERE vcs.rule_id = mtt.id
      AND vcs.organization_id = v_org
      AND vcs.vehicle_id = v_5179
      AND vcs.category_id = v_cat_oil;
  END IF;

  IF v_cat_cool IS NOT NULL THEN
    UPDATE public.vehicle_component_schedule vcs
    SET schedule_status = 'retired'
    WHERE vcs.organization_id = v_org AND vcs.vehicle_id = v_5179 AND vcs.category_id = v_cat_cool;
  END IF;

  INSERT INTO fleet.maintenance_job_runs (
    id, organization_id, job_name, started_at, finished_at, success, vehicles_checked, alerts_written
  ) VALUES (
    'f20100a1-0000-4000-8000-000000000002'::uuid,
    v_org,
    'nightly_maintenance_check',
    timestamptz '2026-11-05 07:00:00+00',
    timestamptz '2026-11-05 07:05:00+00',
    true,
    2,
    5
  ) ON CONFLICT (id) DO UPDATE SET
    success = EXCLUDED.success,
    started_at = EXCLUDED.started_at,
    finished_at = EXCLUDED.finished_at,
    vehicles_checked = EXCLUDED.vehicles_checked,
    alerts_written = EXCLUDED.alerts_written;

  INSERT INTO platform.roles (name, display_name, description, level, product_key, is_system) VALUES
    ('fleet_viewer', 'Fleet Viewer', 'Read-only dashboard', 300, 'fleet', TRUE)
  ON CONFLICT (name) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    level = EXCLUDED.level,
    product_key = EXCLUDED.product_key;

  INSERT INTO platform.user_roles (user_id, role_id, scope_type, scope_id, granted_at, status)
  SELECT v_viewer, r.id, 'organization', v_org::uuid, now(), 'active'
  FROM platform.roles r
  WHERE r.name = 'fleet_viewer'
    AND NOT EXISTS (
      SELECT 1 FROM platform.user_roles ur
      WHERE ur.user_id = v_viewer
        AND ur.role_id = r.id
        AND ur.scope_type = 'organization'
        AND ur.scope_id = v_org::uuid
    );
END $$;

COMMIT;
