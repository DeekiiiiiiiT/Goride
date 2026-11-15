-- Powertrain D1 behaviour tests (audit done-tests 9, 10, 12, 14-18, 20-25, 27 + save 16, 24).

BEGIN;

DO $$
DECLARE
  v_caught boolean;
  v_id uuid;
  v_id2 uuid;
  v_job uuid;
  v_job2 uuid;
  v_group uuid;
  v_pt text;
  v_fu text;
  v_st text;
  v_fits text;
  v_cnt int;
  v_cnt2 int;
  v_cnt3 int;
  v_log_before bigint;
  v_log_after bigint;
  v_wo uuid;
  v_line uuid;
  v_org text := 'pt-d1-test-org-never-real';
  v_veh text := 'pt-d1-test-veh-never-real';
  v_actor uuid := 'b1111111-1111-4111-8111-111111111111';
  v_oil uuid;
  v_spark uuid;
  v_hv_job uuid;
  v_n bigint;
  v_m bigint;
  v_ver int;
BEGIN
  -- Done-test 12: derivation rules on fixtures (one row per rule + hydrogen non-fc)
  INSERT INTO public.vehicle_catalog (
    id, make, model, vehicle_class, fuel_type, engine_type, fuel_category
  ) VALUES
    ('f0000001-0000-4000-8000-000000000001', 'PT', 'Rule1', 'car', NULL, NULL, NULL),
    ('f0000002-0000-4000-8000-000000000002', 'PT', 'Rule2', 'car', 'Hybrid(petrol)', 'Turbo', 'Gas'),
    ('f0000003-0000-4000-8000-000000000003', 'PT', 'Rule3', 'car', 'Petrol', 'Mild Hybrid', 'Gas'),
    ('f0000004-0000-4000-8000-000000000004', 'PT', 'Rule4', 'car', 'Electric', 'BEV', 'Electric'),
    ('f0000005-0000-4000-8000-000000000005', 'PT', 'Rule5', 'car', 'Hydrogen', 'Fuel Cell', 'Hydrogen'),
    ('f0000006-0000-4000-8000-000000000006', 'PT', 'Rule6', 'car', 'Hydrogen', 'ICE', 'Hydrogen'),
    ('f0000007-0000-4000-8000-000000000007', 'PT', 'Rule7', 'car', 'Hybrid(petrol)', 'PHEV', 'Hybrid'),
    ('f0000008-0000-4000-8000-000000000008', 'PT', 'Rule8', 'car', 'Petrol/Electric', 'Range Extender', 'Hybrid'),
    ('f0000009-0000-4000-8000-000000000009', 'PT', 'Rule9', 'car', 'Hybrid(petrol)', 'Hybrid', 'Hybrid'),
    ('f0000010-0000-4000-8000-000000000010', 'PT', 'Rule10', 'car', 'Hybrid(diesel)', 'Hybrid', 'Diesel'),
    ('f0000011-0000-4000-8000-000000000011', 'PT', 'Rule11', 'car', 'Petrol', 'Turbo', 'Gas'),
    ('f0000012-0000-4000-8000-000000000012', 'PT', 'Rule12', 'car', 'Diesel', 'Turbo', 'Diesel'),
    ('f0000013-0000-4000-8000-000000000013', 'PT', 'Rule13', 'car', 'CNG', 'Inline-4', 'CNG'),
    ('f0000014-0000-4000-8000-000000000014', 'PT', 'Rule6b', 'car', 'Electric/Hybrid', 'Hybrid', 'Hybrid');

  PERFORM set_config('part_match.busy', 'on', true);
  UPDATE public.vehicle_catalog vc
  SET powertrain = r.powertrain, fuel = r.fuel, powertrain_status = r.status
  FROM (
    SELECT c.id, d.powertrain, d.fuel, d.status
    FROM public.vehicle_catalog c
    CROSS JOIN LATERAL public.vehicle_catalog_derive_powertrain(
      c.fuel_type, c.engine_type, c.fuel_category
    ) d
    WHERE c.id::text LIKE 'f000000%'
  ) r
  WHERE r.id = vc.id;

  SELECT powertrain, fuel, status INTO v_pt, v_fu, v_st
  FROM public.vehicle_catalog_derive_powertrain(NULL, NULL, NULL);
  IF v_st IS DISTINCT FROM 'needs_check' THEN
    RAISE EXCEPTION 'rule1 expected needs_check got %/%/%', v_pt, v_fu, v_st;
  END IF;

  SELECT c.powertrain, c.fuel, c.powertrain_status INTO v_pt, v_fu, v_st
  FROM public.vehicle_catalog c WHERE c.id = 'f0000003-0000-4000-8000-000000000003';
  IF v_pt <> 'mhev' OR v_fu <> 'petrol' OR v_st <> 'derived' THEN
    RAISE EXCEPTION 'rule3 mhev mismatch %/%/%', v_pt, v_fu, v_st;
  END IF;

  SELECT c.powertrain, c.fuel INTO v_pt, v_fu
  FROM public.vehicle_catalog c WHERE c.id = 'f0000006-0000-4000-8000-000000000006';
  IF v_pt IS NOT NULL OR v_fu <> 'hydrogen' THEN
    RAISE EXCEPTION 'rule6 hydrogen non-fc expected null/hydrogen got %/%', v_pt, v_fu;
  END IF;

  -- Done-test 10: transition table 3b
  INSERT INTO public.vehicle_catalog (
    id, make, model, vehicle_class, fuel_type, engine_type, fuel_category
  ) VALUES (
    'f0000020-0000-4000-8000-000000000020', 'PT', 'TrgNew', 'car', 'Petrol', 'Turbo', 'Gas'
  );
  SELECT powertrain_status INTO v_st FROM public.vehicle_catalog WHERE id = 'f0000020-0000-4000-8000-000000000020';
  IF v_st <> 'derived' THEN RAISE EXCEPTION 'insert derived expected derived got %', v_st; END IF;

  UPDATE public.vehicle_catalog
  SET fuel_type = 'Electric', engine_type = 'BEV', fuel_category = 'Electric'
  WHERE id = 'f0000020-0000-4000-8000-000000000020';
  SELECT powertrain, fuel, powertrain_status INTO v_pt, v_fu, v_st
  FROM public.vehicle_catalog WHERE id = 'f0000020-0000-4000-8000-000000000020';
  IF v_pt <> 'bev' OR v_fu <> 'electric' THEN RAISE EXCEPTION 'derived update bev failed'; END IF;

  INSERT INTO public.vehicle_catalog (
    id, make, model, vehicle_class, fuel_type, engine_type, fuel_category,
    powertrain, fuel, powertrain_status, powertrain_last_confirmed_by, powertrain_last_confirmed_at
  ) VALUES (
    'f0000021-0000-4000-8000-000000000021', 'PT', 'TrgConfirmed', 'car',
    'Petrol', 'Turbo', 'Gas', 'ice', 'petrol', 'confirmed', v_actor, now()
  );

  UPDATE public.vehicle_catalog
  SET fuel_type = 'Petrol', engine_type = 'Mild Hybrid Turbo', fuel_category = 'Gas'
  WHERE id = 'f0000021-0000-4000-8000-000000000021';
  SELECT powertrain_status, powertrain_note INTO v_st, v_pt
  FROM public.vehicle_catalog WHERE id = 'f0000021-0000-4000-8000-000000000021';
  IF v_st <> 'needs_check' OR v_pt IS NULL OR position('re-confirm' in v_pt) = 0 THEN
    RAISE EXCEPTION 'confirmed drift should land needs_check with note';
  END IF;

  UPDATE public.vehicle_catalog
  SET powertrain = 'ice', fuel = 'petrol', powertrain_status = 'confirmed',
      powertrain_note = NULL
  WHERE id = 'f0000021-0000-4000-8000-000000000021';
  UPDATE public.vehicle_catalog
  SET engine_type = 'Turbo I4'
  WHERE id = 'f0000021-0000-4000-8000-000000000021';
  SELECT powertrain_status, powertrain_note INTO v_st, v_pt
  FROM public.vehicle_catalog WHERE id = 'f0000021-0000-4000-8000-000000000021';
  IF v_st <> 'confirmed' OR v_pt IS NOT NULL THEN
    RAISE EXCEPTION 'confirmed same derived values should stay confirmed';
  END IF;

  -- Done-test 14: inheritance
  INSERT INTO public.maintenance_service_categories (
    id, code, name, kind, status, fits_powertrains, fits_fuels, parent_id
  ) VALUES (
    'f0000101-0000-4000-8000-000000000101', 'pt_test_grp', 'PT test group', 'system', 'active',
    ARRAY['ice','hev'], ARRAY['petrol'], NULL
  );
  INSERT INTO public.maintenance_service_categories (
    id, code, name, kind, status, parent_id
  ) VALUES (
    'f0000102-0000-4000-8000-000000000102', 'pt_test_inherit', 'PT inherit', 'component', 'active',
    'f0000101-0000-4000-8000-000000000101'
  );
  INSERT INTO public.maintenance_service_categories (
    id, code, name, kind, status, fits_powertrains, parent_id
  ) VALUES (
    'f0000103-0000-4000-8000-000000000103', 'pt_test_pt_only', 'PT pt only', 'component', 'active',
    ARRAY['bev'], 'f0000101-0000-4000-8000-000000000101'
  );

  SELECT e.fits_powertrains, e.fits_fuels INTO v_pt, v_fu
  FROM public._job_fit_effective_lists('f0000102-0000-4000-8000-000000000102'::uuid) e;
  IF v_pt IS NULL OR v_fu IS NULL THEN RAISE EXCEPTION 'inherit expected group lists'; END IF;

  SELECT public._job_fit_for_model(
    'f0000102-0000-4000-8000-000000000102'::uuid,
    'f0000011-0000-4000-8000-000000000011'::uuid
  ) INTO v_fits;
  IF v_fits <> 'yes' THEN RAISE EXCEPTION 'inherit ice/petrol expected yes got %', v_fits; END IF;

  v_caught := false;
  BEGIN
    UPDATE public.maintenance_service_categories
    SET fits_powertrains = ARRAY[]::text[]
    WHERE id = 'f0000103-0000-4000-8000-000000000103';
  EXCEPTION WHEN check_violation THEN v_caught := true; END;
  IF NOT v_caught THEN RAISE EXCEPTION 'empty fits_powertrains should be refused'; END IF;

  -- Done-test 15: exceptions
  SELECT public._job_fit_for_model(
    'f0000102-0000-4000-8000-000000000102'::uuid,
    'f0000011-0000-4000-8000-000000000011'::uuid
  ) INTO v_fits;
  IF v_fits <> 'yes' THEN RAISE EXCEPTION 'pre-exception yes expected'; END IF;

  INSERT INTO public.catalog_component_applicability (
    scope, vehicle_catalog_id, component_id, applicable, reason
  ) VALUES (
    'variant', 'f0000011-0000-4000-8000-000000000011',
    'f0000102-0000-4000-8000-000000000102', false, 'pt-d1 test'
  );
  SELECT public._job_fit_for_model(
    'f0000102-0000-4000-8000-000000000102'::uuid,
    'f0000011-0000-4000-8000-000000000011'::uuid
  ) INTO v_fits;
  IF v_fits <> 'no' THEN RAISE EXCEPTION 'model exception false expected no'; END IF;

  -- Done-test 9 / 18: six model kinds + NULL job id skip
  SELECT count(*) INTO v_cnt FROM public.job_fits_car(NULL, NULL) f;
  IF v_cnt = 0 THEN RAISE EXCEPTION 'job_fits_car all jobs returned none'; END IF;

  SELECT count(*) INTO v_cnt
  FROM public.job_fits_car(
    'f0000004-0000-4000-8000-000000000004'::uuid,
    ARRAY['f0000102-0000-4000-8000-000000000102'::uuid, NULL::uuid]
  );
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'null job id should be skipped, got % rows', v_cnt; END IF;

  SELECT count(*) INTO v_cnt
  FROM public.job_fits_car(
    'f0000001-0000-4000-8000-000000000001'::uuid,
    ARRAY['f0000102-0000-4000-8000-000000000102'::uuid]
  ) f
  WHERE f.fits = 'unknown';
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'needs_check model should be unknown'; END IF;

  -- Done-test 20: fuel_category-only correction
  INSERT INTO public.vehicle_catalog (
    id, make, model, vehicle_class, fuel_type, engine_type, fuel_category
  ) VALUES (
    'f0000022-0000-4000-8000-000000000022', 'PT', 'GasHybridFix', 'car',
    'Hybrid(petrol)', 'Hybrid', 'Gas'
  );
  SELECT powertrain_status INTO v_st FROM public.vehicle_catalog WHERE id = 'f0000022-0000-4000-8000-000000000022';
  IF v_st <> 'needs_check' THEN RAISE EXCEPTION 'gas disagreement should be needs_check'; END IF;
  UPDATE public.vehicle_catalog SET fuel_category = 'Hybrid' WHERE id = 'f0000022-0000-4000-8000-000000000022';
  SELECT powertrain, powertrain_status INTO v_pt, v_st
  FROM public.vehicle_catalog WHERE id = 'f0000022-0000-4000-8000-000000000022';
  IF v_pt <> 'hev' OR v_st <> 'derived' THEN RAISE EXCEPTION 'category fix should derive hev'; END IF;

  -- Done-test 21: mhev
  SELECT public._job_fit_for_model(
    (SELECT id FROM public.maintenance_service_categories WHERE code = 'ELEC-START' LIMIT 1),
    'f0000003-0000-4000-8000-000000000003'::uuid
  ) INTO v_fits;
  IF v_fits <> 'yes' THEN RAISE EXCEPTION 'mhev should fit starter'; END IF;
  SELECT public._job_fit_for_model(
    (SELECT id FROM public.maintenance_service_categories WHERE code = 'ELEC-ALT' LIMIT 1),
    'f0000003-0000-4000-8000-000000000003'::uuid
  ) INTO v_fits;
  IF v_fits <> 'no' THEN RAISE EXCEPTION 'mhev should not fit alternator'; END IF;

  -- Done-test 17 / 23
  v_caught := false;
  BEGIN
    UPDATE public.maintenance_service_categories SET is_high_voltage = true
    WHERE id = 'f0000101-0000-4000-8000-000000000101';
  EXCEPTION WHEN check_violation THEN v_caught := true; END;
  IF NOT v_caught THEN RAISE EXCEPTION 'group high_voltage should be refused'; END IF;

  -- Done-test 27: All saves full list
  SELECT id INTO v_job FROM public.maintenance_service_categories WHERE code = 'spark_plugs';
  UPDATE public.maintenance_service_categories
  SET fits_powertrains = ARRAY['ice','mhev','hev','phev','erev','bev','fcev']
  WHERE id = v_job;
  SELECT cardinality(fits_powertrains) INTO v_cnt
  FROM public.maintenance_service_categories WHERE id = v_job;
  IF v_cnt <> 7 THEN RAISE EXCEPTION 'all powertrain list should have 7 codes'; END IF;
  SELECT fits INTO v_cnt FROM public.job_fit_count(v_job, NULL);
  IF v_cnt IS NULL THEN RAISE EXCEPTION 'job_fit_count failed'; END IF;

  -- Done-test 25: job_fit_count vs job_fits_car + overrides
  SELECT fits INTO v_cnt FROM public.job_fit_count(v_job, NULL);
  SELECT count(*) INTO v_cnt2
  FROM public.vehicle_catalog c
  WHERE c.vehicle_class = 'car'
    AND (
      SELECT f.fits
      FROM public.job_fits_car(c.id, ARRAY[v_job]) f
      LIMIT 1
    ) = 'yes';
  IF v_cnt IS DISTINCT FROM v_cnt2 THEN
    RAISE EXCEPTION 'job_fit_count fits % <> job_fits_car %', v_cnt, v_cnt2;
  END IF;

  UPDATE public.maintenance_service_categories
  SET fits_powertrains = ARRAY['hev','phev','erev','bev','fcev'],
      fits_fuels = NULL
  WHERE id = 'f0000101-0000-4000-8000-000000000101';
  UPDATE public.maintenance_service_categories
  SET fits_powertrains = ARRAY['hev'],
      fits_fuels = NULL,
      parent_id = 'f0000101-0000-4000-8000-000000000101'
  WHERE id = 'f0000102-0000-4000-8000-000000000102';

  SELECT fits INTO v_cnt FROM public.job_fit_count(
    'f0000102-0000-4000-8000-000000000102'::uuid,
    NULL
  );
  SELECT fits INTO v_cnt2 FROM public.job_fit_count(
    'f0000102-0000-4000-8000-000000000102'::uuid,
    '{"fits_powertrains":null}'::jsonb
  );
  SELECT fits INTO v_cnt3 FROM public.job_fit_count(
    'f0000102-0000-4000-8000-000000000102'::uuid,
    jsonb_build_object(
      'fits_powertrains',
      jsonb_build_array('ice','mhev','hev','phev','erev','bev','fcev')
    )
  );
  IF v_cnt = v_cnt2 OR v_cnt2 = v_cnt3 OR v_cnt = v_cnt3 THEN
    RAISE EXCEPTION 'override states should give different counts (%, %, %)', v_cnt, v_cnt2, v_cnt3;
  END IF;

  v_caught := false;
  BEGIN
    PERFORM fits FROM public.job_fit_count(v_job, '{"fits_powertrains":[]}'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'job_fit_count_bad_override' THEN v_caught := true; ELSE RAISE; END IF;
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'empty override array should raise'; END IF;

  v_caught := false;
  BEGIN
    PERFORM fits FROM public.job_fit_count(v_job, '{"bad_key":[]}'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'job_fit_count_bad_override' THEN v_caught := true; ELSE RAISE; END IF;
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'bad override key should raise'; END IF;

  -- Done-test 22: part_match.busy
  SELECT c.id INTO v_id
  FROM public.vehicle_catalog c
  WHERE EXISTS (
    SELECT 1 FROM public.vehicle_oe_number von WHERE von.vehicle_catalog_id = c.id
  )
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    SELECT count(*) INTO v_log_before FROM public.part_match_recompute_log;
    PERFORM set_config('part_match.busy', 'on', true);
    UPDATE public.vehicle_catalog
    SET production_start_year = coalesce(production_start_year, 2020) + 1
    WHERE id = v_id;
    SELECT count(*) INTO v_log_after FROM public.part_match_recompute_log;
    UPDATE public.vehicle_catalog
    SET production_start_year = production_start_year - 1
    WHERE id = v_id;
    IF v_log_after > v_log_before THEN
      RAISE EXCEPTION 'part_match.busy no longer suppresses the year trigger';
    END IF;
    PERFORM set_config('part_match.busy', 'off', true);
    UPDATE public.vehicle_catalog
    SET production_start_year = coalesce(production_start_year, 2020) + 1
    WHERE id = v_id;
    SELECT count(*) INTO v_log_after FROM public.part_match_recompute_log;
    UPDATE public.vehicle_catalog
    SET production_start_year = production_start_year - 1
    WHERE id = v_id;
    IF v_log_after <= v_log_before THEN
      RAISE EXCEPTION 'expected year trigger work without part_match.busy';
    END IF;
  END IF;

  -- Done-tests 16 + 24: fleet_save_work_order fit_at_log
  INSERT INTO public.maintenance_service_categories (
    id, code, name, kind, status, fits_powertrains, parent_id
  ) VALUES (
    'f0000104-0000-4000-8000-000000000104', 'pt_test_bev_only', 'PT BEV only', 'component',
    'active', ARRAY['bev'], NULL
  );

  SELECT id INTO v_spark FROM public.maintenance_service_categories WHERE code = 'spark_plugs';
  IF v_spark IS NULL THEN RAISE EXCEPTION 'spark_plugs job missing'; END IF;

  INSERT INTO fleet.vehicles (
    id, organization_id, license_plate, legacy_kv_id, make, model, year, status, vehicle_catalog_id
  ) VALUES (
    v_veh, v_org, 'PTTST', 'pt-d1-legacy-kv-never-real', 'PT', 'Test', 2020, 'active',
    'f0000011-0000-4000-8000-000000000011'
  )
  ON CONFLICT (id) DO UPDATE SET vehicle_catalog_id = EXCLUDED.vehicle_catalog_id;

  v_wo := 'd1111111-1111-4111-8111-111111111111';
  PERFORM public.fleet_save_work_order(
    v_org, v_actor, 'draft',
    jsonb_build_object('id', v_wo, 'vehicle_id', v_veh),
    NULL, NULL,
    jsonb_build_array(jsonb_build_object(
      'component_id', v_spark, 'component_name', 'Spark Plugs', 'action', 'replace', 'line_total', 0
    ))
  );
  SELECT id, fit_at_log INTO v_line, v_fits
  FROM public.maintenance_work_order_lines WHERE work_order_id = v_wo LIMIT 1;
  IF v_fits <> 'yes' THEN RAISE EXCEPTION 'insert line expected fit yes for ice petrol spark got %', v_fits; END IF;

  SELECT version INTO v_ver FROM public.maintenance_work_orders WHERE id = v_wo;
  PERFORM public.fleet_save_work_order(
    v_org, v_actor, 'draft',
    jsonb_build_object('id', v_wo),
    v_wo, v_ver,
    jsonb_build_array(jsonb_build_object(
      'id', v_line, 'component_id', v_spark, 'component_name', 'Spark Plugs',
      'action', 'replace', 'line_total', 0, 'qty', 2
    ))
  );
  SELECT fit_at_log INTO v_fits FROM public.maintenance_work_order_lines WHERE id = v_line;
  IF v_fits <> 'yes' THEN RAISE EXCEPTION 'qty edit should keep fit_at_log yes got %', v_fits; END IF;

  UPDATE public.maintenance_service_categories
  SET fits_fuels = ARRAY['diesel'] WHERE id = v_spark;

  SELECT id INTO v_job2 FROM public.maintenance_service_categories WHERE code = 'pt_test_bev_only';

  SELECT version INTO v_ver FROM public.maintenance_work_orders WHERE id = v_wo;
  PERFORM public.fleet_save_work_order(
    v_org, v_actor, 'draft',
    jsonb_build_object('id', v_wo),
    v_wo, v_ver,
    jsonb_build_array(jsonb_build_object(
      'id', v_line, 'component_id', v_job2, 'component_name', 'PT BEV only',
      'action', 'replace', 'line_total', 0
    ))
  );
  SELECT fit_at_log INTO v_fits FROM public.maintenance_work_order_lines WHERE id = v_line;
  IF v_fits <> 'no' THEN RAISE EXCEPTION 'job change to BEV-only on ice petrol car should be no got %', v_fits; END IF;

  UPDATE public.maintenance_service_categories
  SET fits_fuels = ARRAY['petrol','cng','diesel'] WHERE id = v_spark;
  UPDATE public.maintenance_work_order_lines SET fit_at_log = 'no' WHERE id = v_line;

  SELECT version INTO v_ver FROM public.maintenance_work_orders WHERE id = v_wo;
  PERFORM public.fleet_save_work_order(
    v_org, v_actor, 'draft',
    jsonb_build_object('id', v_wo),
    v_wo, v_ver,
    jsonb_build_array(jsonb_build_object(
      'id', v_line, 'component_name', 'Spark Plugs',
      'action', 'replace', 'line_total', 0, 'qty', 2
    ))
  );
  SELECT fit_at_log INTO v_fits FROM public.maintenance_work_order_lines WHERE id = v_line;
  IF v_fits <> 'no' THEN RAISE EXCEPTION 'frozen no should stay no after rule widens got %', v_fits; END IF;

  SELECT count(*) INTO v_n
  FROM public.maintenance_work_order_lines l
  WHERE l.fit_at_log = 'no' AND l.voided_at IS NULL;
  SELECT count(*) INTO v_m
  FROM public.maintenance_work_order_lines l
  JOIN public.maintenance_work_orders wo ON wo.id = l.work_order_id
  JOIN fleet.vehicles v ON v.id = wo.vehicle_id AND v.organization_id::text = wo.organization_id
  WHERE l.fit_at_log = 'no' AND l.voided_at IS NULL
    AND (SELECT f.fits FROM public.job_fits_car(nullif(v.vehicle_catalog_id,'')::uuid, ARRAY[l.component_id]) f LIMIT 1) = 'no';
  IF v_n < 1 OR v_m < 1 THEN
    RAISE EXCEPTION 'past-lines N/M expected >=1 got %/%', v_n, v_m;
  END IF;

  RAISE NOTICE 'powertrain_db_test: ok';
END $$;

ROLLBACK;