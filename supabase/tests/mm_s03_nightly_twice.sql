-- S-03 done-test: run nightly twice → at most one open alert per part (fixture car).
BEGIN;

CREATE TEMP TABLE mm_truth_log (case_id text PRIMARY KEY, note text);

DO $$
DECLARE
  v_org text := 'fx_org_mm';
  v_part uuid := 'e2000003-0000-4000-8000-000000000099'::uuid;
  v_eng uuid := 'e2000001-0000-4000-8000-000000000001'::uuid;
  v_plat uuid := 'e2000002-0000-4000-8000-000000000010'::uuid;
  v_car uuid := 'e2000005-0000-4000-8000-000000000010'::uuid;
  v_vehicle text := 'fx_vehicle_mm';
  v_cnt int;
  v_run uuid;
BEGIN
  INSERT INTO public.engine_family (id, code) VALUES (v_eng, 'FX-ENG')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.vehicle_platform (id, code, maker, label) VALUES
    (v_plat, 'FX-M900A', 'FxToyota', 'Fx M900A')
  ON CONFLICT DO NOTHING;

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
    id, organization_id, license_plate, legacy_kv_id, vehicle_catalog_id, year
  ) VALUES (
    v_vehicle, v_org, 'fx_plate_mm', 'fx_legacy_mm', v_car::text, 2018
  ) ON CONFLICT (id) DO UPDATE SET vehicle_catalog_id = EXCLUDED.vehicle_catalog_id;

  INSERT INTO public.maintenance_task_templates (
    id, task_name, task_code, template_scope, component_id, interval_km, interval_months,
    status, source_type, confidence, applicable_vehicle_classes
  ) VALUES (
    'e2000010-0000-4000-8000-000000000005'::uuid, 'Fx global rule', 'fx-glob', 'global', v_part,
    1000, 1, 'active', 'roam_policy', 'uncertain', ARRAY['car']::text[]
  ) ON CONFLICT (id) DO UPDATE SET status = 'active', interval_km = 1000;

  INSERT INTO fleet.odometer_readings (
    id, organization_id, vehicle_id, reading, reading_date, recorded_at, source,
    legacy_kv_id, is_voided, is_anomaly
  ) VALUES (
    'e20000f0-0000-4000-8000-000000000099'::uuid,
    v_org,
    v_vehicle,
    50000,
    current_date,
    now(),
    'manual',
    'fx_legacy_mm',
    false,
    false
  ) ON CONFLICT (id) DO UPDATE SET reading = EXCLUDED.reading;

  PERFORM public.recompute_component_schedules_for_car(v_org, v_vehicle);

  UPDATE public.vehicle_component_schedule vcs
  SET next_due_km = 49000, next_due_date = current_date - 1, schedule_status = 'active'
  WHERE vcs.organization_id = v_org AND vcs.vehicle_id = v_vehicle AND vcs.category_id = v_part;

  v_run := fleet.run_maintenance_nightly_check(v_org);
  v_run := fleet.run_maintenance_nightly_check(v_org);

  SELECT count(*) INTO v_cnt
  FROM fleet.maintenance_alerts a
  WHERE a.organization_id = v_org
    AND a.vehicle_id = v_vehicle
    AND a.category_id = v_part
    AND a.status = 'open';

  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'S-03 nightly twice failed: % open alerts (expected 1)', v_cnt;
  END IF;

  INSERT INTO mm_truth_log VALUES ('S03_nightly_twice_one_open', 'ok');
END $$;

SELECT * FROM mm_truth_log;

ROLLBACK;
