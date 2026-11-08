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
  v_brk_hose uuid;
  v_brk_hbcable uuid;
  v_brk_abs uuid;
  v_eng_oil uuid;
  v_eng_o2 uuid;
  v_wiper uuid;
  v_brk_area uuid;
  v_cat uuid;
  v_platform uuid := 'a0900002-0000-4000-8000-000000000010'::uuid;
  v_engine uuid := 'a0900001-0000-4000-8000-000000000010'::uuid;
  v_engine_big uuid := 'a0900001-0000-4000-8000-000000000011'::uuid;
  v_engine_eng uuid := 'a0900001-0000-4000-8000-000000000012'::uuid;
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
  v_pm_name text;
  v_expected_name text;
BEGIN
  SELECT c.id, c.parent_id INTO v_brk_pads, v_brk_area
  FROM public.maintenance_service_categories c
  WHERE c.op_code = 'BRK-PADS' AND c.is_part IS TRUE AND c.part_type_status = 'active'
  LIMIT 1;
  IF v_brk_pads IS NULL THEN
    RAISE EXCEPTION 'Done test setup: BRK-PADS part type missing';
  END IF;

  SELECT c.id INTO v_brk_hose FROM public.maintenance_service_categories c
  WHERE c.op_code = 'BRK-HOSE' AND c.is_part IS TRUE AND c.part_type_status = 'active' LIMIT 1;
  IF v_brk_hose IS NULL THEN RAISE EXCEPTION 'Done test setup: BRK-HOSE missing'; END IF;

  SELECT c.id INTO v_brk_hbcable FROM public.maintenance_service_categories c
  WHERE c.op_code = 'BRK-HBCABLE' AND c.is_part IS TRUE AND c.part_type_status = 'active' LIMIT 1;
  IF v_brk_hbcable IS NULL THEN RAISE EXCEPTION 'Done test setup: BRK-HBCABLE missing'; END IF;

  SELECT c.id INTO v_brk_abs FROM public.maintenance_service_categories c
  WHERE c.op_code = 'BRK-ABS' AND c.is_part IS TRUE AND c.part_type_status = 'active' LIMIT 1;
  IF v_brk_abs IS NULL THEN RAISE EXCEPTION 'Done test setup: BRK-ABS missing'; END IF;

  SELECT c.id INTO v_eng_oil FROM public.maintenance_service_categories c
  WHERE c.op_code = 'ENG-OIL' AND c.is_part IS TRUE AND c.part_type_status = 'active' LIMIT 1;
  IF v_eng_oil IS NULL THEN RAISE EXCEPTION 'Done test setup: ENG-OIL missing'; END IF;

  SELECT c.id INTO v_eng_o2 FROM public.maintenance_service_categories c
  WHERE c.op_code = 'ENG-O2' AND c.is_part IS TRUE AND c.part_type_status = 'active' LIMIT 1;
  IF v_eng_o2 IS NULL THEN RAISE EXCEPTION 'Done test setup: ENG-O2 missing'; END IF;

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
    (v_engine_big, 'AP-DONE-BIG'),
    (v_engine_eng, 'AP-DONE-ENG2')
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

  -- Since 3b-09 a part is Confirmed only from a trusted site for its maker:
  -- make MK Kashiyama's own site trusted for this test.
  INSERT INTO public.trusted_source (kind, maker, domain)
  SELECT 'part_maker', 'MK Kashiyama', 'mk-kashiyama.co.jp'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.trusted_source
    WHERE kind = 'part_maker' AND maker_norm = 'mk kashiyama' AND domain = 'mk-kashiyama.co.jp'
  );

  -- Done test 1: MK Kashiyama brake pads, 7 cars, OE replaces, verified
  v_save := public.save_self_serve_part(jsonb_build_object(
    'actorId', v_actor,
    'partTypeId', v_brk_pads,
    'brand', 'MK Kashiyama',
    'partNumber', 'D0051MH-DONE',
    'sourceType', 'part_maker_catalogue',
    'evidenceUrl', 'https://www.mk-kashiyama.co.jp/catalog/d0051',
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

  -- 5-14: no typed name → type + position, never part number
  SELECT pm.name INTO v_pm_name FROM public.part_master pm WHERE pm.id = v_part;
  IF btrim(v_pm_name) = btrim('D0051MH-DONE') THEN
    RAISE EXCEPTION '5-14 failed: name equals part number';
  END IF;
  SELECT public.self_serve_default_part_name(
    coalesce(c.plain_name, c.name),
    c.position_scheme,
    'front',
    NULL
  ) INTO v_expected_name
  FROM public.maintenance_service_categories c
  WHERE c.id = v_brk_pads;
  IF v_pm_name IS DISTINCT FROM v_expected_name THEN
    RAISE EXCEPTION '5-14 failed: expected name %, got %', v_expected_name, v_pm_name;
  END IF;

  v_save := public.save_self_serve_part(jsonb_build_object(
    'actorId', v_actor,
    'partTypeId', v_brk_pads,
    'brand', 'NamedCo',
    'partNumber', 'NAMED-PADS-001',
    'name', 'Owner custom pad name',
    'sourceType', 'part_maker_catalogue',
    'evidenceUrl', 'https://example.com/named',
    'fitMode', 'specific',
    'listings', jsonb_build_array(jsonb_build_object(
      'vehicleId', 'a0900005-0000-4000-8000-000000000004',
      'position', 'Front'
    ))
  ));
  IF NOT EXISTS (
    SELECT 1 FROM public.part_master pm
    WHERE pm.oem_part_number_norm = public.part_import_norm_number('NAMED-PADS-001')
      AND pm.name = 'Owner custom pad name'
  ) THEN
    RAISE EXCEPTION '5-14 failed: explicit name was not kept';
  END IF;

  -- 5-14: rear left + rear right → "Rear <type>" with no side in the name
  v_save := public.save_self_serve_part(jsonb_build_object(
    'actorId', v_actor,
    'partTypeId', v_brk_hose,
    'brand', 'Toyota',
    'partNumber', 'HOSE-DUAL-SIDE',
    'sourceType', 'part_maker_catalogue',
    'evidenceUrl', 'https://example.com/hose-dual',
    'fitMode', 'specific',
    'listings', jsonb_build_array(
      jsonb_build_object('vehicleId', v_roomy::text, 'position', 'Rear', 'side', 'Left'),
      jsonb_build_object('vehicleId', v_roomy::text, 'position', 'Rear', 'side', 'Right')
    )
  ));
  SELECT public.self_serve_default_part_name(
    coalesce(c.plain_name, c.name),
    c.position_scheme,
    'rear',
    NULL
  ) INTO v_expected_name
  FROM public.maintenance_service_categories c
  WHERE c.id = v_brk_hose;
  SELECT pm.name INTO v_pm_name
  FROM public.part_master pm
  WHERE pm.id = (v_save->>'partId')::uuid;
  IF v_pm_name IS DISTINCT FROM v_expected_name THEN
    RAISE EXCEPTION '5-14 dual-side failed: expected %, got %', v_expected_name, v_pm_name;
  END IF;
  IF position(',' IN v_pm_name) > 0 THEN
    RAISE EXCEPTION '5-14 dual-side failed: name must not include a side: %', v_pm_name;
  END IF;

  -- 5-11 / 5-12: axle_numbered — rear cable No.2 without side; duplicate fit = already on file
  v_save := public.save_self_serve_part(jsonb_build_object(
    'actorId', v_actor,
    'partTypeId', v_brk_hbcable,
    'brand', 'Toyota',
    'partNumber', 'CABLE-511-REAR2',
    'sourceType', 'part_maker_catalogue',
    'evidenceUrl', 'https://example.com/cable-511',
    'fitMode', 'specific',
    'listings', jsonb_build_array(jsonb_build_object(
      'vehicleId', v_roomy::text,
      'position', 'Rear',
      'catalogueNumber', 2
    ))
  ));
  SELECT pm.name INTO v_pm_name
  FROM public.part_master pm WHERE pm.id = (v_save->>'partId')::uuid;
  IF v_pm_name IS DISTINCT FROM 'Rear handbrake cable No.2' THEN
    RAISE EXCEPTION '5-11 failed: expected Rear handbrake cable No.2, got %', v_pm_name;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.part_listing pl
    JOIN public.part_master pm ON pm.interchange_group_id = pl.interchange_group_id
    WHERE pm.id = (v_save->>'partId')::uuid
      AND pl.vehicle_catalog_id = v_roomy
      AND pl.position = 'rear'
      AND pl.side IS NULL
      AND pl.catalogue_number = 2
  ) THEN
    RAISE EXCEPTION '5-11 failed: listing missing rear catalogue_number 2';
  END IF;
  BEGIN
    PERFORM public.save_self_serve_part(jsonb_build_object(
      'actorId', v_actor,
      'partTypeId', v_brk_hbcable,
      'brand', 'Toyota',
      'partNumber', 'CABLE-511-REAR2',
      'sourceType', 'part_maker_catalogue',
      'evidenceUrl', 'https://example.com/cable-511',
      'fitMode', 'specific',
      'listings', jsonb_build_array(jsonb_build_object(
        'vehicleId', v_roomy::text,
        'position', 'Rear',
        'catalogueNumber', 2
      ))
    ));
    RAISE EXCEPTION '5-11 failed: duplicate save should not succeed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%Nothing new to save%' THEN
      RAISE;
    END IF;
  END;

  -- 5-14 capitals: acronym plain names keep capitals when position is prefixed
  IF public.self_serve_default_part_name('ABS wheel sensor', 'axle_left_right', 'front', 'left')
    IS DISTINCT FROM 'Front ABS wheel sensor, left' THEN
    RAISE EXCEPTION '5-14 capitals failed: ABS wheel sensor front left';
  END IF;
  IF public.self_serve_default_part_name('Brake caliper', 'axle_left_right', 'front', 'right')
    IS DISTINCT FROM 'Front brake caliper, right' THEN
    RAISE EXCEPTION '5-14 capitals failed: Brake caliper front right';
  END IF;
  v_save := public.save_self_serve_part(jsonb_build_object(
    'actorId', v_actor,
    'partTypeId', v_brk_abs,
    'brand', 'Toyota',
    'partNumber', 'ABS-SAVE-LEFT',
    'sourceType', 'part_maker_catalogue',
    'evidenceUrl', 'https://example.com/abs-left',
    'fitMode', 'specific',
    'listings', jsonb_build_array(
      jsonb_build_object('vehicleId', v_roomy::text, 'position', 'Front', 'side', 'Left')
    )
  ));
  IF NOT EXISTS (
    SELECT 1 FROM public.part_master pm
    WHERE pm.id = (v_save->>'partId')::uuid
      AND pm.name = 'Front ABS wheel sensor, left'
  ) THEN
    RAISE EXCEPTION '5-14 capitals failed: save ABS front left name';
  END IF;

  -- Done test 2 / AS4-01: engine fit, 22 cars, exclude one
  FOR v_i IN 1..22 LOOP
    v_car := ('a0900006-0000-4000-8000-000000000' || lpad(v_i::text, 3, '0'))::uuid;
    INSERT INTO public.vehicle_catalog (
      id, make, model, chassis_code, production_start_year, production_end_year,
      platform_id, engine_family_id, engine_code
    ) VALUES (
      v_car, 'Toyota', 'EngCar' || v_i, 'EN' || v_i, 2018, 2022,
      v_platform, v_engine_eng, 'AP-DONE-ENG2'
    ) ON CONFLICT (id) DO NOTHING;
  END LOOP;

  v_preview := public.self_serve_part_add_preview(jsonb_build_object(
    'fitMode', 'engine',
    'engineFamilyId', v_engine_eng,
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
    'engineFamilyId', v_engine_eng,
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

  -- AS7-02: new car on same engine family picks up engine-fit part via catalog sync
  v_car := 'a0900006-0000-4000-8000-000000000023'::uuid;
  INSERT INTO public.vehicle_catalog (
    id, make, model, chassis_code, production_start_year, production_end_year,
    platform_id, engine_family_id, engine_code
  ) VALUES (
    v_car, 'Toyota', 'EngCarLate', 'EN23', 2020, 2024,
    v_platform, v_engine_eng, 'AP-DONE-ENG2'
  ) ON CONFLICT (id) DO NOTHING;

  IF NOT EXISTS (
    SELECT 1 FROM public.parts_for_vehicle(v_car, v_eng_oil, 2020) p WHERE p.part_id = v_part
  ) THEN
    RAISE EXCEPTION 'AS7-02 failed: new catalog car missing engine-fit oil filter';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.parts_for_vehicle(
      'a0900006-0000-4000-8000-000000000001'::uuid, v_eng_oil, 2018
    ) p WHERE p.part_id = v_part
  ) THEN
    RAISE EXCEPTION 'AS7-02 regression: excluded car still sees oil filter after sync';
  END IF;

  -- AS7-01: O2 sensor by engine with before_cat position
  v_car := 'a0900008-0000-4000-8000-000000000001'::uuid;
  INSERT INTO public.vehicle_catalog (
    id, make, model, chassis_code, production_start_year, production_end_year,
    platform_id, engine_family_id, engine_code
  ) VALUES (
    v_car, 'Toyota', 'O2Car', 'O2X1', 2018, 2022,
    v_platform, v_engine, 'AP-DONE-1KR'
  ) ON CONFLICT (id) DO NOTHING;

  v_save := public.save_self_serve_part(jsonb_build_object(
    'actorId', v_actor,
    'partTypeId', v_eng_o2,
    'brand', 'Denso',
    'partNumber', 'O2-BEFORE-DONE',
    'sourceType', 'part_maker_catalogue',
    'evidenceUrl', 'https://example.com/o2',
    'fitMode', 'engine',
    'engineFamilyId', v_engine,
    'position', 'before_cat'
  ));
  v_part := (v_save->>'partId')::uuid;

  IF NOT EXISTS (
    SELECT 1 FROM public.part_listing pl
    JOIN public.part_master pm ON pm.interchange_group_id = pl.interchange_group_id
    WHERE pm.id = v_part AND pl.vehicle_catalog_id = v_car AND pl.position = 'before_cat'
  ) THEN
    RAISE EXCEPTION 'AS7-01 failed: before_cat listing missing on O2 engine save';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.parts_for_vehicle(v_car, v_eng_o2, 2019) p
    WHERE p.part_id = v_part AND p.position = 'before_cat'
  ) THEN
    RAISE EXCEPTION 'AS7-01 failed: parts_for_vehicle missing O2 before_cat part';
  END IF;

  v_undo := public.part_import_undo(v_batch, v_actor);
  IF coalesce((v_undo->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Done test 2 undo failed: %', v_undo;
  END IF;
  SELECT count(*)::int INTO v_cnt FROM public.part_listing_exclusion e WHERE e.interchange_group_id = v_group;
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'Done test 2 undo failed: exclusions remain';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.part_listing pl
    WHERE pl.vehicle_catalog_id = 'a0900006-0000-4000-8000-000000000023'::uuid
      AND pl.interchange_group_id = v_group
  ) THEN
    RAISE EXCEPTION 'AS8-02 failed: engine-sync listing remains on late car after undo';
  END IF;

  -- AS8-02: by-engine save on existing part; new car sync; undo drops sync listing
  v_save := public.save_self_serve_part(jsonb_build_object(
    'actorId', v_actor,
    'partTypeId', v_eng_oil,
    'brand', 'Toyota',
    'partNumber', '04152-SYNC-EXIST',
    'sourceType', 'car_maker_catalogue',
    'evidenceUrl', 'https://example.com/oil-exist',
    'fitMode', 'specific',
    -- Oil filters have no position (scheme 'none'); AS-04 rejects one.
    'listings', jsonb_build_array(jsonb_build_object(
      'vehicleId', 'a0900005-0000-4000-8000-000000000004'
    ))
  ));
  v_part := (v_save->>'partId')::uuid;
  v_save := public.save_self_serve_part(jsonb_build_object(
    'actorId', v_actor,
    'partTypeId', v_eng_oil,
    'brand', 'Toyota',
    'partNumber', '04152-SYNC-EXIST',
    'existingPartId', v_part,
    'sourceType', 'car_maker_catalogue',
    'evidenceUrl', 'https://example.com/oil-exist-eng',
    'fitMode', 'engine',
    'engineFamilyId', v_engine_eng
  ));
  v_batch := (v_save->>'batchId')::uuid;
  v_group := (v_save->>'groupId')::uuid;
  v_car := 'a0900009-0000-4000-8000-000000000001'::uuid;
  INSERT INTO public.vehicle_catalog (
    id, make, model, chassis_code, production_start_year, production_end_year,
    platform_id, engine_family_id, engine_code
  ) VALUES (
    v_car, 'Toyota', 'SyncLate', 'SY1', 2021, 2024,
    v_platform, v_engine_eng, 'AP-DONE-ENG2'
  ) ON CONFLICT (id) DO NOTHING;
  IF NOT EXISTS (
    SELECT 1 FROM public.part_listing pl
    WHERE pl.interchange_group_id = v_group AND pl.vehicle_catalog_id = v_car
  ) THEN
    RAISE EXCEPTION 'AS8-02 setup failed: expected engine-sync listing on fixture car';
  END IF;
  v_undo := public.part_import_undo(v_batch, v_actor);
  IF coalesce((v_undo->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'AS8-02 undo failed: %', v_undo;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.part_listing pl
    WHERE pl.interchange_group_id = v_group AND pl.vehicle_catalog_id = v_car
  ) THEN
    RAISE EXCEPTION 'AS8-02 failed: fixture car still has listing after undo';
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
    'specValue', '525',
    'position', 'driver'
  ));
  IF NOT EXISTS (
    SELECT 1 FROM public.parts_for_vehicle(v_roomy, v_wiper, 2019) p
    WHERE p.oem_part_number = 'AP-WIPER-525'
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

  -- 5-14: no self-serve part should still use part number as name
  SELECT count(*)::int INTO v_cnt
  FROM public.part_master pm
  WHERE pm.maintenance_component_id IS NOT NULL
    AND btrim(pm.name) = btrim(pm.oem_part_number);
  IF v_cnt > 0 THEN
    RAISE EXCEPTION '5-14 backfill guard failed: % part(s) still have name = part number', v_cnt;
  END IF;

  -- AS4-05: engine detail caps vehicles at 200
  FOR v_i IN 1..201 LOOP
    INSERT INTO public.vehicle_catalog (
      id, make, model, chassis_code, production_start_year, production_end_year,
      platform_id, engine_family_id, engine_code
    ) VALUES (
      ('a0900007-0000-4000-8000-' || lpad(v_i::text, 12, '0'))::uuid,
      'Toyota', 'LoadCar' || v_i, 'LD' || v_i, 2010, 2020,
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
