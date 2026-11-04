-- AS3-01 / AS4-04 smoke: car_specs validate marks bad spec_key as error (not invalid)
DO $$
DECLARE
  v_batch uuid := gen_random_uuid();
  v_area uuid;
  v_vehicle uuid := 'a0900005-0000-4000-8000-000000000001'::uuid;
  v_platform uuid := 'a0900002-0000-4000-8000-000000000001'::uuid;
  v_engine uuid := 'a0900001-0000-4000-8000-000000000001'::uuid;
  v_s1 text;
  v_s2 text;
BEGIN
  SELECT public.part_import_template_area_id('car_specs') INTO v_area;

  INSERT INTO public.engine_family (id, code) VALUES (v_engine, 'AP-SMOKE-1KR')
  ON CONFLICT (code) DO UPDATE SET code = EXCLUDED.code;

  INSERT INTO public.vehicle_platform (id, code, maker, label)
  VALUES (v_platform, 'AP-M900A', 'Toyota', 'Toyota · AP-M900A')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.vehicle_catalog (
    id, make, model, chassis_code, production_start_year, production_end_year,
    platform_id, engine_family_id, engine_code
  ) VALUES (
    v_vehicle, 'Toyota', 'Roomy', 'M900A', 2019, 2022,
    v_platform, v_engine, '1KR-FE'
  )
  ON CONFLICT (id) DO UPDATE SET
    make = EXCLUDED.make,
    model = EXCLUDED.model,
    chassis_code = EXCLUDED.chassis_code,
    platform_id = EXCLUDED.platform_id,
    engine_family_id = EXCLUDED.engine_family_id;

  INSERT INTO public.part_import_batch (id, code, area_id, template_version, file_name, status, import_kind)
  VALUES (v_batch, 'SMOKE-CS-PROOF', v_area, 1, 'smoke-proof.csv', 'uploaded', 'car_specs');
  INSERT INTO public.part_import_row (batch_id, line_no, raw, vehicle_catalog_id)
  VALUES
    (v_batch, 1, jsonb_build_object('spec_key','wiper_driver_mm','spec_value','525','source_url','https://example.com/g'), v_vehicle),
    (v_batch, 2, jsonb_build_object('spec_key','not_a_real_key','spec_value','1','source_url','https://example.com/b'), v_vehicle);
  PERFORM public.part_import_validate_car_specs_rows(v_batch);
  SELECT status INTO v_s1 FROM public.part_import_row WHERE batch_id = v_batch AND line_no = 1;
  SELECT status INTO v_s2 FROM public.part_import_row WHERE batch_id = v_batch AND line_no = 2;
  IF v_s1 <> 'valid' THEN RAISE EXCEPTION 'Expected line 1 valid, got %', v_s1; END IF;
  IF v_s2 <> 'error' THEN RAISE EXCEPTION 'Expected line 2 error, got %', v_s2; END IF;
  DELETE FROM public.part_import_row WHERE batch_id = v_batch;
  DELETE FROM public.part_import_batch WHERE id = v_batch;
  DELETE FROM public.vehicle_catalog WHERE id = v_vehicle;
  DELETE FROM public.vehicle_platform WHERE id = v_platform;
  DELETE FROM public.engine_family WHERE id = v_engine;
END $$;
