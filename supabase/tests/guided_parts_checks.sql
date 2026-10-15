-- Guided parts checks. Rolls back. Run after migrations, not on production.
BEGIN;

DO $$
DECLARE
  v_oil uuid;
  v_air uuid;
  v_cat uuid;
  v_before int;
  v_after int;
  v_group uuid;
  v_kind text;
  v_ready boolean;
  v_cell text;
  v_spec text;
  v_match int;
  v_core text;
BEGIN
  SELECT id INTO v_oil FROM public.maintenance_service_categories WHERE op_code = 'ENG-OIL';
  SELECT id INTO v_air FROM public.maintenance_service_categories WHERE op_code = 'FILT-AIR';
  SELECT id INTO v_cat FROM public.part_category LIMIT 1;
  IF v_oil IS NULL OR v_air IS NULL OR v_cat IS NULL THEN
    RAISE EXCEPTION 'guided parts checks need the oil, air, and parts category rows';
  END IF;

  INSERT INTO public.vehicle_platform (id, code, label)
  VALUES ('dddddddd-dddd-4ddd-8ddd-dddddddddd01', 'GDTEST-BODY', 'Guided test body');
  INSERT INTO public.engine_family (id, code)
  VALUES
    ('dddddddd-dddd-4ddd-8ddd-dddddddddd02', 'GDTEST-FE'),
    ('dddddddd-dddd-4ddd-8ddd-dddddddddd03', 'GDTEST-VET');
  INSERT INTO public.vehicle_catalog (
    id, make, model, year, chassis_code, engine_code, platform_id, engine_family_id, production_start_year, production_end_year
  ) VALUES
    ('dddddddd-dddd-4ddd-8ddd-dddddddddd11', 'Guided', 'Roomy', 2016, 'GDTEST-BODY', 'GDTEST-FE',
      'dddddddd-dddd-4ddd-8ddd-dddddddddd01', 'dddddddd-dddd-4ddd-8ddd-dddddddddd02', 2016, 2020),
    ('dddddddd-dddd-4ddd-8ddd-dddddddddd12', 'Guided', 'Turbo', 2016, 'GDTEST-BODY', 'GDTEST-VET',
      'dddddddd-dddd-4ddd-8ddd-dddddddddd01', 'dddddddd-dddd-4ddd-8ddd-dddddddddd03', 2016, 2020),
    ('dddddddd-dddd-4ddd-8ddd-dddddddddd13', 'Guided', 'Sister', 2016, 'GDTEST-OTHER', 'GDTEST-FE',
      NULL, 'dddddddd-dddd-4ddd-8ddd-dddddddddd02', 2016, 2020);

  SELECT count(*) INTO v_before FROM public.part_master WHERE oem_part_number = 'GD-ATOMIC-1';
  BEGIN
    PERFORM public.save_guided_part(jsonb_build_object(
      'variantId', 'dddddddd-dddd-4ddd-8ddd-dddddddddd11',
      'componentOpCode', 'FILT-AIR',
      'fit', 'engine_family',
      'evidenceUrl', 'https://example.com/air',
      'parts', jsonb_build_array(
        jsonb_build_object('manufacturer', 'TestCo', 'partNumber', 'GD-ATOMIC-1', 'name', 'Air filter', 'kind', 'oem'),
        jsonb_build_object('manufacturer', 'TestCo', 'partNumber', 'GD-ATOMIC-2', 'name', 'Air filter', 'kind', 'oem')
      )
    ));
    RAISE EXCEPTION 'a broken save should have failed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'a broken save should have failed' THEN
      RAISE;
    END IF;
  END;
  SELECT count(*) INTO v_after FROM public.part_master WHERE oem_part_number = 'GD-ATOMIC-1';
  IF v_after <> v_before THEN
    RAISE EXCEPTION 'save_guided_part was not atomic';
  END IF;

  PERFORM public.save_guided_part(jsonb_build_object(
    'variantId', 'dddddddd-dddd-4ddd-8ddd-dddddddddd11',
    'componentOpCode', 'ENG-OIL',
    'fit', 'catalog_variant',
    'evidenceUrl', 'https://example.com/oil',
    'parts', jsonb_build_array(
      jsonb_build_object('manufacturer', 'TestCo', 'partNumber', 'GD-OIL-1', 'name', 'Oil filter', 'kind', 'oem'),
      jsonb_build_object('manufacturer', 'Drivejoy', 'partNumber', 'GD-OIL-2', 'name', 'Oil filter', 'kind', 'aftermarket')
    )
  ));
  SELECT r.target_kind INTO v_kind
  FROM public.interchange_fitment_rule r
  JOIN public.part_master pm ON pm.interchange_group_id = r.interchange_group_id
  WHERE pm.oem_part_number = 'GD-OIL-1';
  IF v_kind IS DISTINCT FROM 'catalog_variant' THEN
    RAISE EXCEPTION 'a this-vehicle save reached a wider fit (%)', v_kind;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.parts_for_vehicle('dddddddd-dddd-4ddd-8ddd-dddddddddd12', v_oil, NULL)
    WHERE oem_part_number = 'GD-OIL-1'
  ) OR EXISTS (
    SELECT 1 FROM public.parts_for_vehicle('dddddddd-dddd-4ddd-8ddd-dddddddddd13', v_oil, NULL)
    WHERE oem_part_number = 'GD-OIL-1'
  ) THEN
    RAISE EXCEPTION 'a this-vehicle oil filter reached the turbo or the sister';
  END IF;

  BEGIN
    PERFORM public.save_guided_part(jsonb_build_object(
      'variantId', 'dddddddd-dddd-4ddd-8ddd-dddddddddd11',
      'componentOpCode', 'FILT-AIR',
      'fit', 'engine_family',
      'evidenceUrl', 'https://example.com/air',
      'parts', jsonb_build_array(
        jsonb_build_object('manufacturer', 'TestCo', 'partNumber', 'GD-AIR-1', 'name', 'Air filter', 'kind', 'oem')
      )
    ));
    RAISE EXCEPTION 'engine fit should have been rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'engine fit should have been rejected' THEN
      RAISE;
    END IF;
  END;

  PERFORM public.save_guided_part(jsonb_build_object(
    'variantId', 'dddddddd-dddd-4ddd-8ddd-dddddddddd11',
    'componentOpCode', 'ENG-OIL',
    'fit', 'platform',
    'tickedVariantIds', jsonb_build_array('dddddddd-dddd-4ddd-8ddd-dddddddddd11'),
    'evidenceUrl', 'https://example.com/oil-body',
    'parts', jsonb_build_array(
      jsonb_build_object('manufacturer', 'TestCo', 'partNumber', 'GD-OIL-BODY', 'name', 'Oil filter', 'kind', 'oem')
    )
  ));
  SELECT r.target_kind, r.interchange_group_id INTO v_kind, v_group
  FROM public.interchange_fitment_rule r
  JOIN public.part_master pm ON pm.interchange_group_id = r.interchange_group_id
  WHERE pm.oem_part_number = 'GD-OIL-BODY';
  IF v_kind IS DISTINCT FROM 'catalog_variant' THEN
    RAISE EXCEPTION 'a mixed-engine body was stored as %', v_kind;
  END IF;

  BEGIN
    PERFORM public.save_guided_part(jsonb_build_object(
      'variantId', 'dddddddd-dddd-4ddd-8ddd-dddddddddd11',
      'componentOpCode', 'ENG-OIL',
      'fit', 'catalog_variant',
      'parts', jsonb_build_array(
        jsonb_build_object('manufacturer', 'TestCo', 'partNumber', 'GD-OIL-NOSRC', 'name', 'Oil filter', 'kind', 'oem')
      )
    ));
    RAISE EXCEPTION 'missing source should have been rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'missing source should have been rejected' THEN
      RAISE;
    END IF;
  END;

  FOREACH v_core IN ARRAY ARRAY[
    'ENG-OIL', 'ENG-SPARK', 'ENG-THERM', 'FILT-AIR', 'HVAC-CABIN',
    'BRK-PADS', 'BELT-SERP', 'LGT-WIPER', 'BRK-ROTOR', 'SUS-SHOCK'
  ]
  LOOP
    PERFORM public.save_component_applicability(jsonb_build_object(
      'variantId', 'dddddddd-dddd-4ddd-8ddd-dddddddddd13',
      'componentOpCode', v_core,
      'scope', 'variant',
      'applicable', false,
      'reason', 'Not on this test car'
    ));
  END LOOP;
  SELECT r.ready, r.cells->>'LGT-WIPER' INTO v_ready, v_cell
  FROM public.variant_parts_readiness r
  WHERE r.variant_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddd13';
  IF v_ready IS DISTINCT FROM true OR v_cell IS DISTINCT FROM 'not_applicable' THEN
    RAISE EXCEPTION 'not-applicable did not satisfy readiness (% %)', v_ready, v_cell;
  END IF;

  PERFORM public.save_catalog_spec(jsonb_build_object(
    'variantId', 'dddddddd-dddd-4ddd-8ddd-dddddddddd11',
    'specKey', 'wiper_driver_mm',
    'value', '525',
    'scope', 'platform',
    'evidenceUrl', 'https://example.com/wiper-body'
  ));
  PERFORM public.save_catalog_spec(jsonb_build_object(
    'variantId', 'dddddddd-dddd-4ddd-8ddd-dddddddddd11',
    'specKey', 'wiper_driver_mm',
    'value', '500',
    'scope', 'variant',
    'evidenceUrl', 'https://example.com/wiper-car'
  ));
  SELECT value INTO v_spec
  FROM public.specs_for_variant('dddddddd-dddd-4ddd-8ddd-dddddddddd11', 2018)
  WHERE spec_key = 'wiper_driver_mm';
  IF v_spec IS DISTINCT FROM '500' THEN
    RAISE EXCEPTION 'variant spec did not beat the body spec (%)', v_spec;
  END IF;

  PERFORM public.save_catalog_spec(jsonb_build_object(
    'variantId', 'dddddddd-dddd-4ddd-8ddd-dddddddddd11',
    'specKey', 'wiper_connector',
    'value', 'U-hook',
    'scope', 'variant',
    'evidenceUrl', 'https://example.com/hook'
  ));
  PERFORM public.save_universal_part(jsonb_build_object(
    'specKey', 'wiper_driver_mm',
    'specValue', '500',
    'manufacturer', 'Bosch',
    'partNumber', 'GD-BLADE-500',
    'name', 'Blade 500',
    'extra', jsonb_build_object('connector', 'U-hook'),
    'evidenceUrl', 'https://example.com/blade'
  ));
  PERFORM public.save_universal_part(jsonb_build_object(
    'specKey', 'wiper_driver_mm',
    'specValue', '500',
    'manufacturer', 'Other',
    'partNumber', 'GD-BLADE-BAY',
    'name', 'Blade bayonet',
    'extra', jsonb_build_object('connector', 'Bayonet'),
    'evidenceUrl', 'https://example.com/blade-bay'
  ));
  SELECT count(*) INTO v_match
  FROM public.universal_parts_for_variant('dddddddd-dddd-4ddd-8ddd-dddddddddd11', 2018)
  WHERE part_number = 'GD-BLADE-500';
  IF v_match <> 1 THEN
    RAISE EXCEPTION 'U-hook blade did not match';
  END IF;
  SELECT count(*) INTO v_match
  FROM public.universal_parts_for_variant('dddddddd-dddd-4ddd-8ddd-dddddddddd11', 2018)
  WHERE part_number = 'GD-BLADE-BAY';
  IF v_match <> 0 THEN
    RAISE EXCEPTION 'bayonet blade matched a U-hook car';
  END IF;
END $$;

ROLLBACK;
