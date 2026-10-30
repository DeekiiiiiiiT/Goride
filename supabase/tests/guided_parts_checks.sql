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
  INSERT INTO public.maintenance_service_categories (id, code, name, kind, op_code, parent_id)
  SELECT v.id, v.code, v.name, v.kind, v.op_code, v.parent_id
  FROM (VALUES
    ('b1000000-0000-4000-8000-000000000001'::uuid, 'sys_engine', 'Engine', 'system', 'ENG', NULL::uuid),
    ('b1000000-0000-4000-8000-000000000002'::uuid, 'sys_filters', 'Filters', 'system', 'FILT', NULL::uuid),
    ('a1000000-0000-4000-8000-000000000001'::uuid, 'oil', 'Engine oil & filter', 'component', 'ENG-OIL', 'b1000000-0000-4000-8000-000000000001'::uuid),
    ('a1000000-0000-4000-8000-000000000007'::uuid, 'air_filter', 'Engine Air Filter', 'component', 'FILT-AIR', 'b1000000-0000-4000-8000-000000000002'::uuid),
    ('a1000000-0000-4000-8000-000000000011'::uuid, 'spark', 'Spark plugs', 'component', 'ENG-SPARK', 'b1000000-0000-4000-8000-000000000001'::uuid),
    ('a1000000-0000-4000-8000-000000000012'::uuid, 'therm', 'Thermostat', 'component', 'ENG-THERM', 'b1000000-0000-4000-8000-000000000001'::uuid),
    ('a1000000-0000-4000-8000-000000000013'::uuid, 'cabin', 'Cabin filter', 'component', 'HVAC-CABIN', 'b1000000-0000-4000-8000-000000000002'::uuid),
    ('a1000000-0000-4000-8000-000000000014'::uuid, 'pads', 'Brake pads', 'component', 'BRK-PADS', NULL::uuid),
    ('a1000000-0000-4000-8000-000000000015'::uuid, 'belt', 'Drive belt', 'component', 'BELT-SERP', 'b1000000-0000-4000-8000-000000000001'::uuid),
    ('a1000000-0000-4000-8000-000000000016'::uuid, 'wiper', 'Wiper', 'component', 'LGT-WIPER', NULL::uuid),
    ('a1000000-0000-4000-8000-000000000017'::uuid, 'rotor', 'Brake rotor', 'component', 'BRK-ROTOR', NULL::uuid),
    ('a1000000-0000-4000-8000-000000000018'::uuid, 'shock', 'Shock', 'component', 'SUS-SHOCK', NULL::uuid)
  ) AS v(id, code, name, kind, op_code, parent_id)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.maintenance_service_categories c WHERE c.op_code = v.op_code OR c.code = v.code
  );

  INSERT INTO public.part_category (slug, label)
  SELECT v.slug, v.label
  FROM (VALUES
    ('engine-components', 'Engine components'),
    ('cooling', 'Cooling'),
    ('electrical-computers', 'Electrical'),
    ('brake', 'Brake'),
    ('suspension', 'Suspension'),
    ('lighting-mirrors', 'Lighting'),
    ('hvac', 'HVAC')
  ) AS v(slug, label)
  WHERE NOT EXISTS (SELECT 1 FROM public.part_category c WHERE c.slug = v.slug);

  INSERT INTO public.spec_key (key, label, value_type)
  SELECT v.key, v.label, v.value_type
  FROM (VALUES
    ('wiper_driver_mm', 'Driver wiper mm', 'number'),
    ('wiper_connector', 'Wiper connector', 'text')
  ) AS v(key, label, value_type)
  WHERE NOT EXISTS (SELECT 1 FROM public.spec_key s WHERE s.key = v.key);

  SELECT id INTO v_oil FROM public.maintenance_service_categories WHERE op_code = 'ENG-OIL';
  SELECT id INTO v_air FROM public.maintenance_service_categories WHERE op_code = 'FILT-AIR';
  SELECT id INTO v_cat FROM public.part_category LIMIT 1;
  IF v_oil IS NULL OR v_air IS NULL OR v_cat IS NULL THEN
    RAISE EXCEPTION 'guided parts checks need the oil, air, and parts category rows';
  END IF;

  INSERT INTO public.vehicle_platform (id, code, label, maker)
  VALUES ('dddddddd-dddd-4ddd-8ddd-dddddddddd01', 'GDTEST-BODY', 'Guided test body', 'Guided');
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
      'evidenceUrl', 'https://example.com/air',
      'parts', jsonb_build_array(
        jsonb_build_object('manufacturer', 'TestCo', 'partNumber', 'GD-ATOMIC-1', 'name', 'Air filter', 'kind', 'oem')
      )
    ));
    RAISE EXCEPTION 'a broken save should have failed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'a broken save should have failed' THEN
      RAISE;
    END IF;
    IF SQLERRM NOT ILIKE '%job or a category%' THEN
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
  ) THEN
    RAISE EXCEPTION 'a powertrain listing reached the turbo with a different engine';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.parts_for_vehicle('dddddddd-dddd-4ddd-8ddd-dddddddddd13', v_oil, NULL)
    WHERE oem_part_number = 'GD-OIL-1' AND tier = 3
  ) THEN
    RAISE EXCEPTION 'the same engine should see this oil filter as engine compatible';
  END IF;

  BEGIN
    PERFORM public.save_guided_part(jsonb_build_object(
      'variantId', 'dddddddd-dddd-4ddd-8ddd-dddddddddd11',
      'evidenceUrl', 'https://example.com/air',
      'parts', jsonb_build_array(
        jsonb_build_object('manufacturer', 'TestCo', 'partNumber', 'GD-AIR-1', 'name', 'Air filter', 'kind', 'oem')
      )
    ));
    RAISE EXCEPTION 'a part with no job or category should have been rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'a part with no job or category should have been rejected' THEN
      RAISE;
    END IF;
    IF SQLERRM NOT ILIKE '%job or a category%' THEN
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

-- Five-category assertions: sister, engine, year, exclusion, both positions, mixed maker.
DO $$
DECLARE
  v_tier int;
  v_count int;
BEGIN
  INSERT INTO public.vehicle_platform (id, code, maker, label) VALUES
    ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01', 'EE-M900', 'Toyota', 'M900'),
    ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee02', 'EE-M900', 'Daihatsu', 'M900 Thor'),
    ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee03', 'EE-M910', 'Toyota', 'M910'),
    ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee05', 'EE-VITZ', 'Toyota', 'Vitz'),
    ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee09', 'EE-M900-FAMILY', 'family', 'Roomy / Tank / Thor / Justy · 2WD (M900)');
  UPDATE public.vehicle_platform
  SET parent_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee09',
      family_evidence_url = 'https://toyota-club.net/files/techdata/ttx/tank.htm'
  WHERE id IN (
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01',
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee02'
  );
  INSERT INTO public.engine_family (id, code) VALUES
    ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee04', 'EE-1KR-FE');
  INSERT INTO public.vehicle_catalog (
    id, make, model, year, chassis_code, engine_code, platform_id, engine_family_id, production_start_year, production_end_year
  ) VALUES
    ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee11', 'Toyota', 'Roomy', 2016, 'M900A', '1KR-FE',
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee04', 2016, 2020),
    ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee12', 'Toyota', 'Tank', 2016, 'M900A', '1KR-FE',
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee02', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee04', 2016, 2020),
    ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee13', 'Toyota', 'Vitz', 2016, 'KSP130', '1KR-FE',
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee05', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee04', 2016, 2020),
    ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee14', 'Toyota', 'Roomy', 2016, 'M910A', '1KR-FE',
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee03', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee04', 2016, 2020);

  PERFORM public.save_guided_part(jsonb_build_object(
    'variantId', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee11',
    'componentOpCode', 'FILT-AIR',
    'yearFrom', 2018,
    'evidenceUrl', 'https://example.com/ee-air',
    'parts', jsonb_build_array(
      jsonb_build_object('manufacturer', 'Toyota', 'partNumber', 'EE-AIR-1', 'name', 'Air filter', 'kind', 'oem')
    )
  ));
  SELECT p.tier INTO v_tier
  FROM public.parts_for_vehicle('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee12', NULL, 2019) p
  WHERE p.oem_part_number = 'EE-AIR-1';
  IF v_tier IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'Tank should be a sister match (2), got %', v_tier;
  END IF;

  PERFORM public.save_guided_part(jsonb_build_object(
    'variantId', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee11',
    'componentOpCode', 'ENG-OIL',
    'yearFrom', 2016,
    'yearTo', 2022,
    'evidenceUrl', 'https://example.com/ee-oil',
    'parts', jsonb_build_array(
      jsonb_build_object('manufacturer', 'Toyota', 'partNumber', 'EE-OIL-1', 'name', 'Oil filter', 'kind', 'oem'),
      jsonb_build_object('manufacturer', 'Drivejoy', 'partNumber', 'EE-OIL-AM', 'name', 'Oil filter', 'kind', 'aftermarket')
    )
  ));
  SELECT p.tier INTO v_tier
  FROM public.parts_for_vehicle('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee13', NULL, 2019) p
  WHERE p.oem_part_number = 'EE-OIL-1';
  IF v_tier IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'Vitz should be engine compatible (3), got %', v_tier;
  END IF;
  SELECT p.tier INTO v_tier
  FROM public.parts_for_vehicle('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee13', NULL, 2012) p
  WHERE p.oem_part_number = 'EE-OIL-1';
  IF v_tier IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'Vitz KSP130 (2012) should be engine compatible (3), got %', v_tier;
  END IF;
  SELECT p.tier INTO v_tier
  FROM public.parts_for_vehicle('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee14', NULL, 2019) p
  WHERE p.oem_part_number = 'EE-OIL-1';
  IF v_tier IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'M910 should be engine compatible (3), got %', v_tier;
  END IF;
  SELECT p.tier INTO v_tier
  FROM public.parts_for_vehicle('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee11', NULL, 2019) p
  WHERE p.oem_part_number = 'EE-AIR-1';
  IF v_tier IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'A body part on its own car should be tier 1, got %', v_tier;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.parts_for_vehicle('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee11', NULL, 2016) p
    WHERE p.oem_part_number = 'EE-AIR-1'
  ) THEN
    RAISE EXCEPTION 'Year cut-off must hide a 2018 listing from a 2016 car';
  END IF;
  SELECT p.tier INTO v_tier
  FROM public.parts_for_vehicle('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee11', NULL, 2019) p
  WHERE p.oem_part_number = 'EE-OIL-AM';
  IF v_tier IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION 'Aftermarket should be tier 4 where the OEM listing reaches, got %', v_tier;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.parts_for_vehicle('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee13', NULL, 2019) p
    WHERE p.oem_part_number = 'EE-OIL-AM' AND p.tier <> 4
  ) THEN
    RAISE EXCEPTION 'Aftermarket must stay tier 4 on an engine match';
  END IF;

  PERFORM public.save_guided_part(jsonb_build_object(
    'variantId', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee11',
    'componentOpCode', 'BRK-PADS',
    'position', 'rear',
    'evidenceUrl', 'https://example.com/ee-pads',
    'parts', jsonb_build_array(
      jsonb_build_object('manufacturer', 'Toyota', 'partNumber', 'EE-PAD-1', 'name', 'Pads', 'kind', 'oem')
    )
  ));
  PERFORM public.save_guided_part(jsonb_build_object(
    'variantId', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee11',
    'componentOpCode', 'BRK-PADS',
    'position', 'front',
    'groupId', (
      SELECT interchange_group_id FROM public.part_master WHERE oem_part_number = 'EE-PAD-1' LIMIT 1
    ),
    'evidenceUrl', 'https://example.com/ee-pads',
    'parts', jsonb_build_array(
      jsonb_build_object('manufacturer', 'Toyota', 'partNumber', 'EE-PAD-1', 'name', 'Pads', 'kind', 'oem')
    )
  ));
  SELECT count(DISTINCT p.position) INTO v_count
  FROM public.parts_for_vehicle('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee11', NULL, 2019) p
  WHERE p.oem_part_number = 'EE-PAD-1';
  IF v_count IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'Front and rear must both come back, got %', v_count;
  END IF;

  PERFORM public.admin_exclude_listing(jsonb_build_object(
    'groupId', (SELECT interchange_group_id FROM public.part_master WHERE oem_part_number = 'EE-OIL-1' LIMIT 1),
    'variantId', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee12',
    'reason', 'Not this Tank',
    'evidenceUrl', 'https://example.com/ee-exclude'
  ));
  IF EXISTS (
    SELECT 1 FROM public.parts_for_vehicle('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee12', NULL, 2019) p
    WHERE p.oem_part_number = 'EE-OIL-1'
  ) THEN
    RAISE EXCEPTION 'Exclusion should remove the Tank';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.parts_for_vehicle('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee11', NULL, 2019) p
    WHERE p.oem_part_number = 'EE-OIL-1'
  ) THEN
    RAISE EXCEPTION 'Exclusion must leave the listed car';
  END IF;

  BEGIN
    INSERT INTO public.vehicle_catalog (
      id, make, model, year, chassis_code, platform_id, production_start_year
    ) VALUES (
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee15', 'Daihatsu', 'Thor', 2016, 'M900S',
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01', 2016
    );
    RAISE EXCEPTION 'mixed-maker trigger should have raised';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%mixed-maker trigger should have raised%' THEN
      RAISE;
    END IF;
    IF SQLERRM NOT ILIKE '%two makers%' THEN
      RAISE;
    END IF;
  END;

  PERFORM public.save_guided_part(jsonb_build_object(
    'variantId', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee11',
    'groupId', (SELECT interchange_group_id FROM public.part_master WHERE oem_part_number = 'EE-AIR-1' LIMIT 1),
    'componentOpCode', 'FILT-AIR',
    'yearFrom', 2018,
    'evidenceUrl', 'https://example.com/ee-air',
    'tickedVariantIds', jsonb_build_array('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee14'),
    'parts', jsonb_build_array(
      jsonb_build_object('manufacturer', 'Toyota', 'partNumber', 'EE-AIR-1', 'name', 'Air filter', 'kind', 'oem')
    )
  ));
  IF NOT EXISTS (
    SELECT 1 FROM public.part_listing
    WHERE vehicle_catalog_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee14'
      AND interchange_group_id = (SELECT interchange_group_id FROM public.part_master WHERE oem_part_number = 'EE-AIR-1' LIMIT 1)
  ) THEN
    RAISE EXCEPTION 'Ticking a car should list it';
  END IF;
  PERFORM public.save_guided_part(jsonb_build_object(
    'variantId', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee11',
    'groupId', (SELECT interchange_group_id FROM public.part_master WHERE oem_part_number = 'EE-AIR-1' LIMIT 1),
    'componentOpCode', 'FILT-AIR',
    'yearFrom', 2018,
    'evidenceUrl', 'https://example.com/ee-air',
    'tickedVariantIds', '[]'::jsonb,
    'parts', jsonb_build_array(
      jsonb_build_object('manufacturer', 'Toyota', 'partNumber', 'EE-AIR-1', 'name', 'Air filter', 'kind', 'oem')
    )
  ));
  IF EXISTS (
    SELECT 1 FROM public.part_listing
    WHERE vehicle_catalog_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee14'
      AND interchange_group_id = (SELECT interchange_group_id FROM public.part_master WHERE oem_part_number = 'EE-AIR-1' LIMIT 1)
  ) THEN
    RAISE EXCEPTION 'Unticking a car should remove its listing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.parts_for_vehicle('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee11', NULL, 2019) p
    WHERE p.oem_part_number = 'EE-AIR-1'
  ) THEN
    RAISE EXCEPTION 'Untick must leave the car you are editing';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.part_master
    WHERE upper(btrim(coalesce(manufacturer, ''))) = 'OEM SPEC'
  ) THEN
    RAISE EXCEPTION 'OEM spec must not be a manufacturer';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.part_master WHERE oem_part_number_norm = '0415240060'
  ) AND (
    SELECT p.tier
    FROM public.vehicle_catalog vc,
    LATERAL public.parts_for_vehicle(vc.id, NULL, 2019) p
    WHERE lower(vc.make) = 'toyota'
      AND lower(vc.model) = 'tank'
      AND upper(coalesce(vc.chassis_code, '')) = 'M910A'
      AND p.oem_part_number = '04152-40060'
      AND p.part_kind = 'oem'
    LIMIT 1
  ) IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'Tank M910A oil filter should be tier 3';
  END IF;
END $$;

ROLLBACK;
