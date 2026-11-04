-- Add-a-part behavioural done tests (audit § Done test). Rolls back; run after add-a-part migrations.
BEGIN;

INSERT INTO auth.users (id, email)
SELECT '11111111-1111-4111-8111-111111111111'::uuid, 'ap-done-test@example.com'
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users u WHERE u.id = '11111111-1111-4111-8111-111111111111'::uuid
);

DO $$
DECLARE
  v_actor uuid := '11111111-1111-4111-8111-111111111111'::uuid;
  v_brk_pads uuid;
  v_eng_oil uuid;
  v_wiper uuid;
  v_brk_area uuid;
  v_cat uuid;
  v_platform uuid := 'a0900002-0000-4000-8000-000000000010'::uuid;
  v_engine uuid := 'a0900001-0000-4000-8000-000000000010'::uuid;
  v_engine_big uuid := 'a0900001-0000-4000-8000-000000000011'::uuid;
  v_roomy uuid := 'a0900005-0000-4000-8000-000000000010'::uuid;
  v_car uuid;
  v_i int;
  v_save jsonb;
  v_batch uuid;
  v_part uuid;
  v_group uuid;
  v_preview jsonb;
  v_undo jsonb;
  v_cnt int;
  v_detail jsonb;
  v_area_cs uuid;
  v_batch_cs uuid;
BEGIN
  SELECT c.id, c.parent_id INTO v_brk_pads, v_brk_area
  FROM public.maintenance_service_categories c
  WHERE c.op_code = 'BRK-PADS' AND c.is_part IS TRUE AND c.part_type_status = 'active'
  LIMIT 1;
  IF v_brk_pads IS NULL THEN
    RAISE EXCEPTION 'Done test setup: BRK-PADS part type missing';
  END IF;

  SELECT c.id INTO v_eng_oil FROM public.maintenance_service_categories c
  WHERE c.op_code = 'ENG-OIL' AND c.is_part IS TRUE AND c.part_type_status = 'active' LIMIT 1;
  IF v_eng_oil IS NULL THEN RAISE EXCEPTION 'Done test setup: ENG-OIL missing'; END IF;

  SELECT c.id INTO v_wiper FROM public.maintenance_service_categories c
  WHERE c.op_code = 'LGT-WIPER' AND c.is_part IS TRUE AND c.part_type_status = 'active' LIMIT 1;
  IF v_wiper IS NULL THEN RAISE EXCEPTION 'Done test setup: LGT-WIPER missing'; END IF;

  SELECT pc.id INTO v_cat FROM public.part_category pc WHERE pc.area_id = v_brk_area LIMIT 1;
  IF v_cat IS NULL THEN
    INSERT INTO public.part_category (label, slug, sort_order, area_id)
    VALUES ('Brakes (done test)', 'ap-done-brakes', 999, v_brk_area)
    RETURNING id INTO v_cat;
  END IF;

  INSERT INTO public.engine_family (id, code) VALUES
    (v_engine, 'AP-DONE-1KR'),
    (v_engine_big, 'AP-DONE-BIG')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.vehicle_platform (id, code, maker, label)
  VALUES (v_platform, 'AP-M900A', 'Toyota', 'Toyota · AP-M900A')
  ON CONFLICT DO NOTHING;

  -- Seven cars for done test 1 (specific / brake pads)
  FOR v_i IN 1..7 LOOP
    v_car := ('a0900005-0000-4000-8000-000000000' || lpad(v_i::text, 3, '0'))::uuid;
    INSERT INTO public.vehicle_catalog (
      id, make, model, chassis_code, production_start_year, production_end_year,
      platform_id, engine_family_id, engine_code
    ) VALUES (
      v_car, 'Toyota', 'DoneCar' || v_i, 'APX' || v_i, 2018, 2022,
      v_platform, v_engine, 'AP-DONE-1KR'
    ) ON CONFLICT (id) DO NOTHING;
  END LOOP;

  v_roomy := 'a0900005-0000-4000-8000-000000000010'::uuid;
  INSERT INTO public.vehicle_catalog (
    id, make, model, chassis_code, production_start_year, production_end_year,
    platform_id, engine_family_id, engine_code
  ) VALUES (
    v_roomy, 'Toyota', 'Roomy', 'M900A', 2019, 2022,
    v_platform, v_engine, 'AP-DONE-1KR'
  ) ON CONFLICT (id) DO NOTHING;

  -- Done test 1: MK Kashiyama brake pads, 7 cars, OE replaces, verified
  v_save := public.save_self_serve_part(jsonb_build_object(
    'actorId', v_actor,
    'partTypeId', v_brk_pads,
    'brand', 'MK Kashiyama',
    'partNumber', 'D0051MH-DONE',
    'sourceType', 'part_maker_catalogue',
    'evidenceUrl', 'https://example.com/d0051',
    'fitMode', 'specific',
    'listings', (
      SELECT jsonb_agg(jsonb_build_object(
        'vehicleId', ('a0900005-0000-4000-8000-000000000' || lpad(g::text, 3, '0'))::text,
        'position', 'Front'
      ))
      FROM generate_series(1, 7) g
    ),
    'factoryNumbers', jsonb_build_array(
      jsonb_build_object('brand', 'Toyota', 'number', '04465-B1190'),
      jsonb_build_object('brand', 'Daihatsu', 'number', '04465-B1190')
    )
  ));
  IF coalesce(v_save->>'catalogDecision', '') <> 'confirmed' THEN
    RAISE EXCEPTION 'Done test 1 failed: expected confirmed, got %', v_save->>'catalogDecision';
  END IF;
  v_part := (v_save->>'partId')::uuid;
  IF NOT EXISTS (
    SELECT 1 FROM public.parts_for_vehicle(
      'a0900005-0000-4000-8000-000000000001'::uuid, v_brk_pads, 2018
    ) p WHERE p.part_id = v_part AND p.position = 'front'
  ) THEN
    RAISE EXCEPTION 'Done test 1 failed: part not on first car via parts_for_vehicle';
  END IF;

  -- Done test 2 / AS4-01: engine fit, 22 cars, exclude one
  FOR v_i IN 1..22 LOOP
    v_car := ('a0900006-0000-4000-8000-000000000' || lpad(v_i::text, 3, '0'))::uuid;
    INSERT INTO public.vehicle_catalog (
      id, make, model, chassis_code, production_start_year, production_end_year,
      platform_id, engine_family_id, engine_code
    ) VALUES (
      v_car, 'Toyota', 'EngCar' || v_i, 'EN' || v_i, 2018, 2022,
      v_platform, v_engine, 'AP-DONE-1KR'
    ) ON CONFLICT (id) DO NOTHING;
  END LOOP;

  v_preview := public.self_serve_part_add_preview(jsonb_build_object(
    'fitMode', 'engine',
    'engineFamilyId', v_engine,
    'excludedVehicleIds', jsonb_build_array('a0900006-0000-4000-8000-000000000001')
  ));
  IF (v_preview->>'carCount')::int <> 21 THEN
    RAISE EXCEPTION 'Done test 2 preview failed: expected 21 cars, got %', v_preview->>'carCount';
  END IF;

  v_save := public.save_self_serve_part(jsonb_build_object(
    'actorId', v_actor,
    'partTypeId', v_eng_oil,
    'brand', 'Toyota',
    'partNumber', '04152-40060-DONE',
    'sourceType', 'car_maker_catalogue',
    'evidenceUrl', 'https://example.com/oil',
    'fitMode', 'engine',
    'engineFamilyId', v_engine,
    'excludedVehicleIds', jsonb_build_array('a0900006-0000-4000-8000-000000000001')
  ));
  v_batch := (v_save->>'batchId')::uuid;
  v_part := (v_save->>'partId')::uuid;
  v_group := (v_save->>'groupId')::uuid;

  SELECT count(*)::int INTO v_cnt FROM public.part_listing_exclusion e
  WHERE e.interchange_group_id = v_group
    AND e.vehicle_catalog_id = 'a0900006-0000-4000-8000-000000000001'::uuid;
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'AS4-01 failed: expected 1 exclusion row, got %', v_cnt;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.parts_for_vehicle(
      'a0900006-0000-4000-8000-000000000001'::uuid, v_eng_oil, 2018
    ) p WHERE p.part_id = v_part
  ) THEN
    RAISE EXCEPTION 'Done test 2 failed: excluded car still sees oil filter';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.parts_for_vehicle(
      'a0900006-0000-4000-8000-000000000002'::uuid, v_eng_oil, 2018
    ) p WHERE p.part_id = v_part
  ) THEN
    RAISE EXCEPTION 'Done test 2 failed: non-excluded car missing oil filter';
  END IF;

  v_undo := public.part_import_undo(v_batch, v_actor);
  IF coalesce((v_undo->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Done test 2 undo failed: %', v_undo;
  END IF;
  SELECT count(*)::int INTO v_cnt FROM public.part_listing_exclusion e WHERE e.interchange_group_id = v_group;
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'Done test 2 undo failed: exclusions remain';
  END IF;

  -- Done test 3: spec on Roomy then wiper by spec
  DELETE FROM public.catalog_spec_value
  WHERE vehicle_catalog_id = v_roomy AND spec_key = 'wiper_driver_mm';
  INSERT INTO public.catalog_spec_value (spec_key, scope, vehicle_catalog_id, value, evidence_url)
  VALUES ('wiper_driver_mm', 'variant', v_roomy, '525', 'https://example.com/w');

  v_preview := public.self_serve_part_add_preview(jsonb_build_object(
    'fitMode', 'spec',
    'specKey', 'wiper_driver_mm',
    'specValue', '525'
  ));
  IF (v_preview->>'carCount')::int < 1 THEN
    RAISE EXCEPTION 'Done test 3 preview failed: expected at least 1 car';
  END IF;

  v_save := public.save_self_serve_part(jsonb_build_object(
    'actorId', v_actor,
    'partTypeId', v_wiper,
    'brand', 'Bosch',
    'partNumber', 'AP-WIPER-525',
    'sourceType', 'part_maker_catalogue',
    'evidenceUrl', 'https://example.com/wiper',
    'fitMode', 'spec',
    'specKey', 'wiper_driver_mm',
    'specValue', '525'
  ));
  IF NOT EXISTS (
    SELECT 1 FROM public.parts_for_vehicle(v_roomy, v_wiper, 2019) p
    WHERE p.part_id = (v_save->>'partId')::uuid
  ) THEN
    RAISE EXCEPTION 'Done test 3 failed: Roomy missing wiper part';
  END IF;

  -- Done test 4: other source → pending
  v_save := public.save_self_serve_part(jsonb_build_object(
    'actorId', v_actor,
    'partTypeId', v_brk_pads,
    'brand', 'Generic',
    'partNumber', 'OTHER-SRC-DONE',
    'sourceType', 'other',
    'evidenceUrl', 'https://example.com/other',
    'fitMode', 'specific',
    'listings', jsonb_build_array(jsonb_build_object(
      'vehicleId', 'a0900005-0000-4000-8000-000000000001',
      'position', 'Front'
    ))
  ));
  IF coalesce(v_save->>'catalogDecision', '') <> 'pending' THEN
    RAISE EXCEPTION 'Done test 4 failed: expected pending, got %', v_save->>'catalogDecision';
  END IF;
  IF v_save->>'trustLabel' NOT LIKE 'Needs checking%' THEN
    RAISE EXCEPTION 'Done test 4 failed: trust label %', v_save->>'trustLabel';
  END IF;

  -- Done test 5: duplicate brand+number adds fits only
  v_save := public.save_self_serve_part(jsonb_build_object(
    'actorId', v_actor,
    'partTypeId', v_brk_pads,
    'brand', 'DupCo',
    'partNumber', 'DUP-001',
    'sourceType', 'part_maker_catalogue',
    'evidenceUrl', 'https://example.com/dup',
    'fitMode', 'specific',
    'listings', jsonb_build_array(jsonb_build_object(
      'vehicleId', 'a0900005-0000-4000-8000-000000000001',
      'position', 'Front'
    ))
  ));
  v_part := (v_save->>'partId')::uuid;
  v_save := public.save_self_serve_part(jsonb_build_object(
    'actorId', v_actor,
    'partTypeId', v_brk_pads,
    'brand', 'DupCo',
    'partNumber', 'DUP-001',
    'existingPartId', v_part,
    'sourceType', 'part_maker_catalogue',
    'evidenceUrl', 'https://example.com/dup2',
    'fitMode', 'specific',
    'listings', jsonb_build_array(jsonb_build_object(
      'vehicleId', 'a0900005-0000-4000-8000-000000000002',
      'position', 'Front'
    ))
  ));
  SELECT count(*)::int INTO v_cnt FROM public.part_master pm
  WHERE upper(pm.manufacturer) = 'DUPCO' AND pm.oem_part_number_norm = public.part_import_norm_number('DUP-001');
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'Done test 5 failed: expected 1 part_master, got %', v_cnt;
  END IF;
  SELECT count(*)::int INTO v_cnt FROM public.part_listing pl
  JOIN public.part_master pm ON pm.interchange_group_id = pl.interchange_group_id
  WHERE pm.id = v_part;
  IF v_cnt < 2 THEN
    RAISE EXCEPTION 'Done test 5 failed: expected 2 listings on same part';
  END IF;

  -- Done test 6: undo window closed for self_serve_add after 24h
  v_save := public.save_self_serve_part(jsonb_build_object(
    'actorId', v_actor,
    'partTypeId', v_brk_pads,
    'brand', 'UndoWin',
    'partNumber', 'UNDO-WIN',
    'sourceType', 'part_maker_catalogue',
    'evidenceUrl', 'https://example.com/uw',
    'fitMode', 'specific',
    'listings', jsonb_build_array(jsonb_build_object(
      'vehicleId', 'a0900005-0000-4000-8000-000000000003',
      'position', 'Front'
    ))
  ));
  v_batch := (v_save->>'batchId')::uuid;
  UPDATE public.part_import_batch SET promoted_at = now() - interval '25 hours' WHERE id = v_batch;
  BEGIN
    PERFORM public.part_import_undo(v_batch, v_actor);
    RAISE EXCEPTION 'Done test 6 failed: undo should raise after 24h';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%Rollback window closed%' AND SQLERRM NOT LIKE '%window closed%' THEN
      RAISE;
    END IF;
  END;

  -- Done test 12: car_specs import good row + undo
  SELECT public.part_import_template_area_id('car_specs') INTO v_area_cs;
  v_batch_cs := gen_random_uuid();
  INSERT INTO public.part_import_batch (id, code, area_id, template_version, file_name, status, import_kind)
  VALUES (v_batch_cs, 'AP-DONE-CS', v_area_cs, 1, 'done.csv', 'uploaded', 'car_specs');
  INSERT INTO public.part_import_row (batch_id, line_no, raw, vehicle_catalog_id, accepted)
  VALUES (
    v_batch_cs, 1,
    jsonb_build_object('spec_key', 'wiper_driver_mm', 'spec_value', '600', 'source_url', 'https://example.com/cs'),
    v_roomy, true
  );
  PERFORM public.part_import_validate_car_specs_rows(v_batch_cs);
  UPDATE public.part_import_batch SET status = 'checked' WHERE id = v_batch_cs;
  PERFORM public.part_import_promote_car_specs(v_batch_cs, v_actor);
  IF NOT EXISTS (
    SELECT 1 FROM public.catalog_spec_value sv
    WHERE sv.vehicle_catalog_id = v_roomy AND sv.spec_key = 'wiper_driver_mm' AND sv.value = '600'
  ) THEN
    RAISE EXCEPTION 'Done test 12 failed: spec value not promoted';
  END IF;
  v_undo := public.part_import_undo(v_batch_cs, v_actor);
  IF coalesce((v_undo->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Done test 12 undo failed: %', v_undo;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.catalog_spec_value sv
    WHERE sv.vehicle_catalog_id = v_roomy AND sv.spec_key = 'wiper_driver_mm' AND sv.value = '600'
  ) THEN
    RAISE EXCEPTION 'Done test 12 failed: spec value still present after undo';
  END IF;

  -- AS4-05: engine detail caps vehicles at 200
  FOR v_i IN 1..201 LOOP
    INSERT INTO public.vehicle_catalog (
      id, make, model, chassis_code, production_start_year, production_end_year,
      platform_id, engine_family_id, engine_code
    ) VALUES (
      ('a0900007-0000-4000-8000-' || lpad(v_i::text, 12, '0'))::uuid,
      'Load', 'Car' || v_i, 'LD' || v_i, 2010, 2020,
      v_platform, v_engine_big, 'AP-DONE-BIG'
    ) ON CONFLICT (id) DO NOTHING;
  END LOOP;

  v_detail := public.self_serve_engine_family_detail(v_engine_big);
  IF jsonb_array_length(coalesce(v_detail->'vehicles', '[]'::jsonb)) <> 200 THEN
    RAISE EXCEPTION 'AS4-05 failed: expected 200 vehicles in detail, got %',
      jsonb_array_length(coalesce(v_detail->'vehicles', '[]'::jsonb));
  END IF;
END $$;

ROLLBACK;

