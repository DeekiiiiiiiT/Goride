-- Parts import by area — behavioral regression (audit PI-16). Rolls back.
BEGIN;

-- Schema-only CI has no garage seed; brakes system id is referenced by migrations but not inserted without prod seed.
INSERT INTO public.maintenance_service_categories (id, code, name, kind, icon_key, sort_order)
VALUES ('b1000000-0000-4000-8000-000000000004', 'pi-brakes-system', 'Brakes', 'system', 'brakes', 4)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.maintenance_service_categories (id, code, name, kind, icon_key, sort_order)
VALUES ('b1000000-0000-4000-8000-000000000001', 'pi-engine-system', 'Engine', 'system', 'engine', 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.maintenance_service_categories (id, code, name, kind, op_code, parent_id, icon_key, sort_order, is_part, position_aware)
VALUES
  ('c1000000-0000-4000-8000-000000000006', 'pi-brk-pads', 'Brake pads', 'component', 'BRK-PADS', 'b1000000-0000-4000-8000-000000000004', 'brakes', 60, true, true),
  ('c1000000-0000-4000-8000-000000000001', 'pi-eng-oil', 'Oil filter', 'component', 'ENG-OIL', 'b1000000-0000-4000-8000-000000000001', 'engine', 10, true, false)
ON CONFLICT (id) DO NOTHING;

-- Minimal catalog + brakes area (uses seeded system id from migrations)
INSERT INTO public.engine_family (id, code) VALUES
  ('11111111-1111-4111-8111-111111111101', 'PI-1NZ-FE')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.vehicle_platform (id, code, maker) VALUES
  ('22222222-2222-4222-8222-222222222201', 'PI-M900A', 'Toyota')
ON CONFLICT (maker, code) DO NOTHING;

INSERT INTO public.vehicle_catalog (id, make, model, chassis_code, engine_code, production_start_year, production_end_year, platform_id, engine_family_id)
VALUES
  ('33333333-3333-4333-8333-333333333331', 'Toyota', 'Passo', 'PI-M900A', 'PI-1NZ-FE', 2018, 2024,
    '22222222-2222-4222-8222-222222222201', '11111111-1111-4111-8111-111111111101'),
  ('33333333-3333-4333-8333-333333333332', 'Toyota', 'Passo', 'PI-M900B', 'PI-1NZ-FE', 2018, 2024,
    '22222222-2222-4222-8222-222222222201', '11111111-1111-4111-8111-111111111101'),
  ('33333333-3333-4333-8333-333333333333', 'Toyota', 'Passo', 'PI-M900C', 'PI-1NZ-FE', 2018, 2024,
    '22222222-2222-4222-8222-222222222201', '11111111-1111-4111-8111-111111111101')
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
  v_area uuid := 'b1000000-0000-4000-8000-000000000004'::uuid;
  v_batch1 uuid := '44444444-4444-4444-8444-444444444441'::uuid;
  v_batch2 uuid := '44444444-4444-4444-8444-444444444442'::uuid;
  v_batch3 uuid := '44444444-4444-4444-8444-444444444443'::uuid;
  v_promote jsonb;
  v_preflight jsonb;
  v_row record;
  v_issues jsonb;
  v_bad int;
  v_part uuid;
  v_decision text;
  v_undo jsonb;
  v_side text;
  v_batch_side uuid := '44444444-4444-4444-8444-444444444445'::uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.maintenance_service_categories WHERE id = v_area) THEN
    RAISE EXCEPTION 'Brakes system row missing — run full migration replay';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.part_category WHERE area_id = v_area) THEN
    INSERT INTO public.part_category (label, slug, sort_order, area_id)
    VALUES ('Brakes', 'pi-brakes', 100, v_area);
  END IF;

  -- PI-12: no part_import_* RPC for anon/authenticated
  SELECT count(*) INTO v_bad
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname LIKE 'part_import\_%'
    AND (
      has_function_privilege('anon', p.oid, 'EXECUTE')
      OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
    );
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'PI-12: % part_import_* functions still executable by anon/authenticated', v_bad;
  END IF;

  INSERT INTO public.part_import_batch (id, code, area_id, template_version, file_name, file_sha256, status)
  VALUES
    (v_batch1, 'PI-CHK-BRK-1', v_area, 1, 'pi-three-cars.csv', 'pi-sha-three-cars', 'uploaded'),
    (v_batch2, 'PI-CHK-BRK-2', v_area, 1, 'pi-three-cars.csv', 'pi-sha-three-cars-2', 'uploaded'),
    (v_batch3, 'PI-CHK-ERR', v_area, 1, 'pi-errors.csv', 'pi-sha-errors', 'uploaded');

  PERFORM public.part_import_insert_staged_rows(v_batch1, jsonb_build_array(
    jsonb_build_object('line_no', 1, 'raw', jsonb_build_object(
      'vehicle', '33333333-3333-4333-8333-333333333331', 'part_type', 'BRK-PADS', 'brand', 'Toyota',
      'part_number', 'PI-04465-A', 'part_name', 'Pad', 'match_type', 'oem', 'year_from', '2018', 'year_to', '2024',
      'source_url', 'https://example.com/a', 'position', 'Front', 'side', 'Left')),
    jsonb_build_object('line_no', 2, 'raw', jsonb_build_object(
      'vehicle', '33333333-3333-4333-8333-333333333332', 'part_type', 'BRK-PADS', 'brand', 'Toyota',
      'part_number', 'PI-04465-A', 'part_name', 'Pad', 'match_type', 'oem', 'year_from', '2018', 'year_to', '2024',
      'source_url', 'https://example.com/a', 'position', 'Front', 'side', 'Left')),
    jsonb_build_object('line_no', 3, 'raw', jsonb_build_object(
      'vehicle', '33333333-3333-4333-8333-333333333333', 'part_type', 'BRK-PADS', 'brand', 'Toyota',
      'part_number', 'PI-04465-A', 'part_name', 'Pad', 'match_type', 'oem', 'year_from', '2018', 'year_to', '2024',
      'source_url', 'https://example.com/a', 'position', 'Front', 'side', 'left'))
  ));

  UPDATE public.part_import_row
  SET vehicle_catalog_id = (raw->>'vehicle')::uuid
  WHERE batch_id = v_batch1;

  PERFORM public.part_import_validate(v_batch1);

  FOR v_row IN
    SELECT r.line_no, r.status, r.issues, r.normalized
    FROM public.part_import_row r
    WHERE r.batch_id = v_batch1 AND r.line_no IN (1, 2, 3)
  LOOP
    -- Labels (new brand, untrusted source, unusual number) never block: 'labelled' rows still promote.
    IF v_row.status NOT IN ('valid', 'labelled') THEN
      RAISE EXCEPTION 'batch1 line % expected valid or labelled, got % issues %', v_row.line_no, v_row.status, v_row.issues;
    END IF;
    IF coalesce(v_row.normalized->>'side', '') <> 'left' THEN
      RAISE EXCEPTION 'batch1 line % expected normalized side left, got %', v_row.line_no, v_row.normalized->>'side';
    END IF;
  END LOOP;

  v_promote := public.part_import_promote(v_batch1, NULL);
  IF coalesce((v_promote->>'partsCreated')::int, 0) <> 1
     OR coalesce((v_promote->>'fitsCreated')::int, 0) <> 3 THEN
    RAISE EXCEPTION 'promote batch1 expected 1 part / 3 fits, got %', v_promote;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.part_listing pl
    JOIN public.part_master pm ON pm.interchange_group_id = pl.interchange_group_id
    WHERE pm.oem_part_number = 'PI-04465-A'
      AND pl.side = 'left'
  ) THEN
    RAISE EXCEPTION 'PI-18: promoted fit should have side left';
  END IF;

  INSERT INTO public.part_import_batch (id, code, area_id, template_version, file_name, file_sha256, status)
  VALUES (v_batch_side, 'PI-CHK-SIDE', v_area, 1, 'pi-side-mix.csv', 'pi-sha-side', 'uploaded');

  PERFORM public.part_import_insert_staged_rows(v_batch_side, jsonb_build_array(
    jsonb_build_object('line_no', 1, 'raw', jsonb_build_object(
      'vehicle', '33333333-3333-4333-8333-333333333331', 'part_type', 'BRK-PADS', 'brand', 'Toyota',
      'part_number', 'PI-SIDE-A', 'part_name', 'Pad A', 'match_type', 'oem', 'year_from', '2018', 'year_to', '2024',
      'source_url', 'https://example.com/side-a', 'position', 'Front', 'side', 'Left')),
    jsonb_build_object('line_no', 2, 'raw', jsonb_build_object(
      'vehicle', '33333333-3333-4333-8333-333333333332', 'part_type', 'BRK-PADS', 'brand', 'Toyota',
      'part_number', 'PI-SIDE-A', 'part_name', 'Pad A', 'match_type', 'oem', 'year_from', '2018', 'year_to', '2024',
      'source_url', 'https://example.com/side-a', 'position', 'Front', 'side', 'left')),
    jsonb_build_object('line_no', 3, 'raw', jsonb_build_object(
      'vehicle', '33333333-3333-4333-8333-333333333333', 'part_type', 'BRK-PADS', 'brand', 'Toyota',
      'part_number', 'PI-SIDE-A', 'part_name', 'Pad A', 'match_type', 'oem', 'year_from', '2018', 'year_to', '2024',
      'source_url', 'https://example.com/side-a', 'position', 'Front', 'side', 'Up'))
  ));
  UPDATE public.part_import_row SET vehicle_catalog_id = (raw->>'vehicle')::uuid WHERE batch_id = v_batch_side;
  PERFORM public.part_import_validate(v_batch_side);

  IF NOT EXISTS (
    SELECT 1 FROM public.part_import_row
    WHERE batch_id = v_batch_side AND line_no = 3 AND status = 'error'
  ) THEN
    RAISE EXCEPTION 'PI-18: line 3 with side Up should be error';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(
      (SELECT issues FROM public.part_import_row WHERE batch_id = v_batch_side AND line_no = 3)
    ) elem WHERE elem->>'code' = 'SIDE_INVALID'
  ) THEN
    RAISE EXCEPTION 'PI-18: line 3 should have SIDE_INVALID';
  END IF;
  FOR v_row IN
    SELECT line_no, status FROM public.part_import_row
    WHERE batch_id = v_batch_side AND line_no IN (1, 2)
  LOOP
    IF v_row.status NOT IN ('valid', 'labelled') THEN
      RAISE EXCEPTION 'PI-18: line % should stay valid or labelled beside Up row, got %', v_row.line_no, v_row.status;
    END IF;
  END LOOP;

  v_promote := public.part_import_promote(v_batch_side, NULL);
  IF coalesce((v_promote->>'partsCreated')::int, 0) <> 1
     OR coalesce((v_promote->>'fitsCreated')::int, 0) <> 2 THEN
    RAISE EXCEPTION 'PI-18: promote with Up row expected 1 part / 2 fits, got %', v_promote;
  END IF;

  PERFORM public.part_import_insert_staged_rows(v_batch2, jsonb_build_array(
    jsonb_build_object('line_no', 1, 'raw', jsonb_build_object(
      'vehicle', '33333333-3333-4333-8333-333333333331', 'part_type', 'BRK-PADS', 'brand', 'Toyota',
      'part_number', 'PI-04465-A', 'part_name', 'Pad', 'match_type', 'oem', 'year_from', '2018', 'year_to', '2024',
      'source_url', 'https://example.com/a', 'position', 'Front', 'side', 'Left')),
    jsonb_build_object('line_no', 2, 'raw', jsonb_build_object(
      'vehicle', '33333333-3333-4333-8333-333333333332', 'part_type', 'BRK-PADS', 'brand', 'Toyota',
      'part_number', 'PI-04465-A', 'part_name', 'Pad', 'match_type', 'oem', 'year_from', '2018', 'year_to', '2024',
      'source_url', 'https://example.com/a', 'position', 'Front', 'side', 'Left')),
    jsonb_build_object('line_no', 3, 'raw', jsonb_build_object(
      'vehicle', '33333333-3333-4333-8333-333333333333', 'part_type', 'BRK-PADS', 'brand', 'Toyota',
      'part_number', 'PI-04465-A', 'part_name', 'Pad', 'match_type', 'oem', 'year_from', '2018', 'year_to', '2024',
      'source_url', 'https://example.com/a', 'position', 'Front', 'side', 'left'))
  ));
  UPDATE public.part_import_row
  SET vehicle_catalog_id = (raw->>'vehicle')::uuid
  WHERE batch_id = v_batch2;

  PERFORM public.part_import_validate(v_batch2);

  FOR v_row IN
    SELECT r.line_no, r.status, r.issues
    FROM public.part_import_row r
    WHERE r.batch_id = v_batch2 AND r.line_no IN (1, 2, 3)
  LOOP
    IF v_row.status IS DISTINCT FROM 'unchanged' THEN
      RAISE EXCEPTION 'batch2 line % expected unchanged, got % issues %', v_row.line_no, v_row.status, v_row.issues;
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM public.part_import_row WHERE batch_id = v_batch2 AND status = 'unchanged') <> 3 THEN
    RAISE EXCEPTION 'second batch expected 3 unchanged rows';
  END IF;

  PERFORM public.part_import_insert_staged_rows(v_batch3, jsonb_build_array(
    jsonb_build_object('line_no', 1, 'raw', jsonb_build_object(
      'vehicle', '33333333-3333-4333-8333-333333333331', 'part_type', 'BRK-PADS', 'brand', 'Toyota',
      'part_number', 'PI-04465-B', 'part_name', 'Pad', 'match_type', 'oem', 'year_from', '2018', 'year_to', '2024',
      'source_url', 'https://example.com/b')),
    jsonb_build_object('line_no', 2, 'raw', jsonb_build_object(
      'vehicle', '33333333-3333-4333-8333-333333333331', 'part_type', 'ENG-OIL', 'brand', 'Toyota',
      'part_number', 'PI-FILTER-1', 'part_name', 'Oil filter', 'match_type', 'oem', 'year_from', '2018', 'year_to', '2024',
      'source_url', 'https://example.com/c', 'position', 'Front', 'side', 'left'))
  ));
  UPDATE public.part_import_row
  SET vehicle_catalog_id = (raw->>'vehicle')::uuid
  WHERE batch_id = v_batch3;

  PERFORM public.part_import_validate(v_batch3);

  FOR v_row IN
    SELECT r.line_no, r.status, r.issues
    FROM public.part_import_row r
    WHERE r.batch_id = v_batch3 AND r.line_no = 1
  LOOP
    IF v_row.status IS DISTINCT FROM 'error' THEN
      RAISE EXCEPTION 'batch3 line 1 expected error, got %', v_row.status;
    END IF;
  END LOOP;

  SELECT issues INTO v_issues FROM public.part_import_row WHERE batch_id = v_batch3 AND line_no = 1;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(v_issues, '[]'::jsonb)) elem
    WHERE elem->>'code' = 'PARAM_MISSING' AND elem->>'column' = 'position'
  ) THEN
    RAISE EXCEPTION 'missing position should yield PARAM_MISSING only';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(v_issues, '[]'::jsonb)) elem
    WHERE elem->>'code' = 'AREA_SPEC_MISSING' AND elem->>'column' = 'position'
  ) THEN
    RAISE EXCEPTION 'missing position must not also emit AREA_SPEC_MISSING';
  END IF;

  SELECT issues INTO v_issues FROM public.part_import_row WHERE batch_id = v_batch3 AND line_no = 2;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(v_issues, '[]'::jsonb)) elem
    WHERE elem->>'code' = 'DOMAIN_MISMATCH'
  ) THEN
    RAISE EXCEPTION 'ENG-OIL in Brakes file should yield DOMAIN_MISMATCH';
  END IF;

  SELECT pm.id INTO v_part FROM public.part_master pm WHERE pm.oem_part_number = 'PI-04465-A' LIMIT 1;
  IF v_part IS NULL THEN
    RAISE EXCEPTION 'expected promoted part PI-04465-A';
  END IF;

  UPDATE public.part_listing pl
  SET year_to = 2019
  FROM public.part_master pm
  WHERE pm.id = v_part AND pl.interchange_group_id = pm.interchange_group_id;

  v_preflight := public.part_import_undo_preflight(v_batch1);
  IF coalesce(v_preflight->>'ok', 'true')::boolean THEN
    RAISE EXCEPTION 'undo preflight should fail after manual fit edit';
  END IF;

  v_undo := public.part_import_undo(v_batch1, NULL);
  IF coalesce(v_undo->>'ok', 'false')::boolean THEN
    RAISE EXCEPTION 'undo should not succeed when preflight fails, got %', v_undo;
  END IF;

  IF (SELECT count(*) FROM public.part_listing pl JOIN public.part_master pm ON pm.interchange_group_id = pl.interchange_group_id WHERE pm.id = v_part) <> 3 THEN
    RAISE EXCEPTION 'undo blocked should leave 3 fits on catalog';
  END IF;

  UPDATE public.part_master SET catalog_decision = 'confirmed', name = 'Confirmed pad name' WHERE id = v_part;

  INSERT INTO public.part_import_batch (id, code, area_id, template_version, file_name, file_sha256, status)
  VALUES ('44444444-4444-4444-8444-444444444444'::uuid, 'PI-CHK-BRK-3', v_area, 1, 'pi-rename.csv', 'pi-sha-rename', 'uploaded');

  PERFORM public.part_import_insert_staged_rows('44444444-4444-4444-8444-444444444444'::uuid, jsonb_build_array(
    jsonb_build_object('line_no', 1, 'raw', jsonb_build_object(
      'vehicle', '33333333-3333-4333-8333-333333333331', 'part_type', 'BRK-PADS', 'brand', 'Toyota',
      'part_number', 'PI-04465-A', 'part_name', 'Different import name', 'match_type', 'oem',
      'year_from', '2018', 'year_to', '2024', 'source_url', 'https://example.com/a', 'position', 'Front', 'side', 'left'))
  ));
  UPDATE public.part_import_row
  SET vehicle_catalog_id = (raw->>'vehicle')::uuid
  WHERE batch_id = '44444444-4444-4444-8444-444444444444'::uuid;

  PERFORM public.part_import_validate('44444444-4444-4444-8444-444444444444'::uuid);
  PERFORM public.part_import_promote('44444444-4444-4444-8444-444444444444'::uuid, NULL);

  SELECT catalog_decision INTO v_decision FROM public.part_master WHERE id = v_part;
  IF v_decision IS DISTINCT FROM 'confirmed' THEN
    RAISE EXCEPTION 'confirmed part should keep catalog_decision after re-import, got %', v_decision;
  END IF;

  -- Rev 8: engine version + summary RPC
  IF public.part_import_engine_version() IS NULL OR length(public.part_import_engine_version()) < 3 THEN
    RAISE EXCEPTION 'part_import_engine_version missing';
  END IF;

  SELECT public.part_import_batch_summary(v_batch1) INTO v_promote;
  IF coalesce(v_promote->>'rowsTotal', '0')::int < 1 THEN
    RAISE EXCEPTION 'batch summary should report rows';
  END IF;

  SELECT public.part_import_list_rows(v_batch1, NULL, NULL, NULL, 10, 0) INTO v_undo;
  IF coalesce(v_undo->>'total', '0')::int < 1 THEN
    RAISE EXCEPTION 'list_rows should return total';
  END IF;
END $$;

ROLLBACK;
