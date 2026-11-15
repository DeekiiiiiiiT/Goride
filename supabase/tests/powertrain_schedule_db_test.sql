-- Powertrain S1 schedule + job_fit_models tests (done-test 7).

BEGIN;

DO $$
DECLARE
  v_org text := 'pt_s1_sched_org_fix';
  v_bev uuid := 'f3000001-0000-4000-8000-000000000001'::uuid;
  v_ice uuid := 'f3000002-0000-4000-8000-000000000002'::uuid;
  v_veh_bev text := 'pt_s1_bev_plate';
  v_veh_ice text := 'pt_s1_ice_plate';
  v_veh_unlink text := 'pt_s1_unlink_plate';
  v_oil uuid;
  v_sched uuid;
  v_cnt int;
  v_st text;
  v_reason text;
  v_run uuid;
  v_fit int;
  v_models int;
  v_spark uuid;
  v_ev uuid;
  v_job uuid;
BEGIN
  INSERT INTO public.vehicle_catalog (
    id, make, model, vehicle_class, fuel_type, engine_type, fuel_category,
    powertrain, fuel, powertrain_status
  ) VALUES
    (v_bev, 'PTS1', 'BevFix', 'car', 'Electric', 'BEV', 'Electric', 'bev', 'electric', 'confirmed'),
    (v_ice, 'PTS1', 'IceFix', 'car', 'Petrol', 'Turbo', 'Gas', 'ice', 'petrol', 'confirmed')
  ON CONFLICT (id) DO UPDATE SET
    powertrain = EXCLUDED.powertrain,
    fuel = EXCLUDED.fuel,
    powertrain_status = 'confirmed';

  INSERT INTO fleet.vehicles (
    id, organization_id, license_plate, legacy_kv_id, vehicle_catalog_id, year
  ) VALUES
    (v_veh_bev, v_org, 'pt_s1_bev', 'pt_s1_bev', v_bev::text, 2022),
    (v_veh_ice, v_org, 'pt_s1_ice', 'pt_s1_ice', v_ice::text, 2022),
    (v_veh_unlink, v_org, 'pt_s1_ul', 'pt_s1_ul', NULL, 2022)
  ON CONFLICT (id) DO UPDATE SET vehicle_catalog_id = EXCLUDED.vehicle_catalog_id;

  SELECT id INTO v_oil FROM public.maintenance_service_categories
  WHERE code = 'oil' AND kind = 'component' LIMIT 1;
  IF v_oil IS NULL THEN RAISE EXCEPTION 'oil job missing'; END IF;

  INSERT INTO public.maintenance_task_templates (
    id, task_name, task_code, template_scope, component_id, interval_km, interval_months,
    status, source_type, confidence, applicable_vehicle_classes
  ) VALUES (
    'f3000010-0000-4000-8000-000000000010'::uuid,
    'PTS1 oil rule', 'pts1-oil', 'global', v_oil,
    5000, 6, 'active', 'roam_policy', 'uncertain', ARRAY['car']::text[]
  ) ON CONFLICT (id) DO UPDATE SET status = 'active', component_id = EXCLUDED.component_id;

  DELETE FROM public.vehicle_component_schedule
  WHERE organization_id = v_org AND vehicle_id IN (v_veh_bev, v_veh_ice, v_veh_unlink) AND category_id = v_oil;

  PERFORM public.recompute_component_schedules_for_car(v_org, v_veh_bev);
  SELECT count(*) INTO v_cnt FROM public.vehicle_component_schedule
  WHERE organization_id = v_org AND vehicle_id = v_veh_bev AND category_id = v_oil;
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'bev should have no oil schedule row, got %', v_cnt;
  END IF;

  INSERT INTO public.vehicle_component_schedule (
    id, organization_id, vehicle_id, category_id, position, schedule_status, baseline_odometer, baseline_date, baseline_source, updated_at
  ) VALUES (
    'f3000020-0000-4000-8000-000000000020'::uuid,
    v_org, v_veh_bev, v_oil, NULL, 'active', 0, current_date, 'bootstrap', now()
  ) ON CONFLICT (id) DO UPDATE SET schedule_status = 'active', retired_reason = NULL;

  v_st := public.mm_recompute_schedule_row(v_org, v_veh_bev, v_oil, NULL, 'f3000020-0000-4000-8000-000000000020'::uuid);
  IF v_st <> 'retired_no_fit' THEN
    RAISE EXCEPTION 'expected retired_no_fit, got %', v_st;
  END IF;

  SELECT schedule_status, retired_reason INTO v_st, v_reason
  FROM public.vehicle_component_schedule WHERE id = 'f3000020-0000-4000-8000-000000000020'::uuid;
  IF v_st <> 'retired' OR v_reason <> 'Job doesn''t fit this car''s powertrain' THEN
    RAISE EXCEPTION 'retire reason wrong: % / %', v_st, v_reason;
  END IF;

  v_run := fleet.run_maintenance_nightly_check(v_org);
  v_run := fleet.run_maintenance_nightly_check(v_org);

  SELECT schedule_status INTO v_st FROM public.vehicle_component_schedule
  WHERE id = 'f3000020-0000-4000-8000-000000000020'::uuid;
  IF v_st <> 'retired' THEN RAISE EXCEPTION 'second nightly changed retired row to %', v_st; END IF;

  PERFORM public.recompute_component_schedules_for_car(v_org, v_veh_unlink);
  PERFORM public.recompute_component_schedules_for_car(v_org, v_veh_ice);
  SELECT schedule_status INTO v_st FROM public.vehicle_component_schedule
  WHERE organization_id = v_org AND vehicle_id = v_veh_ice AND category_id = v_oil
  ORDER BY id LIMIT 1;
  IF v_st IS NULL OR v_st = 'retired' THEN
    RAISE EXCEPTION 'ice car oil row expected active, got %', v_st;
  END IF;

  UPDATE public.maintenance_service_categories
  SET fits_powertrains = ARRAY['ice','bev']::text[]
  WHERE id = v_oil;

  v_st := public.mm_recompute_schedule_row(v_org, v_veh_bev, v_oil, NULL, 'f3000020-0000-4000-8000-000000000020'::uuid);
  IF v_st NOT IN ('updated', 'created') THEN
    RAISE EXCEPTION 'widened rule expected update, got %', v_st;
  END IF;
  SELECT retired_reason INTO v_reason FROM public.vehicle_component_schedule
  WHERE id = 'f3000020-0000-4000-8000-000000000020'::uuid;
  IF v_reason IS NOT NULL THEN
    RAISE EXCEPTION 'retired_reason should clear, got %', v_reason;
  END IF;

  SELECT id INTO v_spark FROM public.maintenance_service_categories WHERE code = 'spark_plugs' AND kind = 'component';
  SELECT id INTO v_ev FROM public.maintenance_service_categories WHERE code = 'ev_charging_port' AND kind = 'component';
  FOREACH v_job IN ARRAY ARRAY[v_spark, v_ev, v_oil]
  LOOP
    IF v_job IS NULL THEN CONTINUE; END IF;
    SELECT j.fits INTO v_fit FROM public.job_fit_count(v_job, NULL) j LIMIT 1;
    SELECT count(*) INTO v_models FROM public.job_fit_models(v_job, NULL, 100000);
    IF v_models IS DISTINCT FROM v_fit THEN
      RAISE EXCEPTION 'job_fit_models mismatch for %', v_job;
    END IF;
  END LOOP;

  RAISE NOTICE 'powertrain_schedule_db_test: ok';
END $$;

ROLLBACK;