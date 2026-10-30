-- Owner catalog seed for the Roomy sister set.
-- Facts used here are published: Toyota oil filter 04152-40060 (M900A, 2016-11 to 2022-09),
-- 0W-20 and 3.1 L with filter, CVT Fluid FE, coolant note left off (capacity is not a spec key),
-- wiper lengths 525 / 475 / 350 mm. No guessed bulb type or connector.

CREATE OR REPLACE FUNCTION public.roomy_seed_vehicle(
  p_make text,
  p_model text,
  p_chassis text,
  p_family uuid,
  p_engine uuid,
  p_start integer,
  p_end integer
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_id uuid;
  v_platform uuid;
BEGIN
  SELECT id INTO v_id
  FROM public.vehicle_catalog
  WHERE lower(make) = lower(p_make)
    AND lower(model) = lower(p_model)
    AND upper(coalesce(chassis_code, '')) = upper(p_chassis)
  ORDER BY production_start_year NULLS LAST
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    SELECT platform_id INTO v_platform FROM public.vehicle_catalog WHERE id = v_id;
    IF v_platform IS NOT NULL AND p_family IS NOT NULL THEN
      UPDATE public.vehicle_platform
      SET parent_id = p_family,
          family_evidence_url = 'http://www.toyota-club.net/files/techdata/ttx/tank.htm'
      WHERE id = v_platform
        AND maker IS DISTINCT FROM 'family'
        AND (parent_id IS NULL OR parent_id = p_family);
    END IF;
    IF p_engine IS NOT NULL THEN
      UPDATE public.vehicle_catalog
      SET engine_family_id = COALESCE(engine_family_id, p_engine),
          engine_code = COALESCE(engine_code, '1KR-FE'),
          production_start_year = COALESCE(production_start_year, p_start),
          production_end_year = COALESCE(production_end_year, p_end)
      WHERE id = v_id;
    END IF;
    RETURN v_id;
  END IF;

  SELECT id INTO v_platform
  FROM public.vehicle_platform
  WHERE maker = p_make
    AND code = p_chassis
    AND (parent_id IS NULL OR parent_id = p_family)
  LIMIT 1;

  IF v_platform IS NULL THEN
    INSERT INTO public.vehicle_platform (code, label, maker, parent_id, family_evidence_url)
    VALUES (
      p_chassis,
      p_make || ' ' || p_model || ' ' || p_chassis,
      p_make,
      p_family,
      'http://www.toyota-club.net/files/techdata/ttx/tank.htm'
    )
    RETURNING id INTO v_platform;
  ELSE
    UPDATE public.vehicle_platform
    SET parent_id = COALESCE(parent_id, p_family),
        family_evidence_url = COALESCE(NULLIF(btrim(family_evidence_url), ''), 'http://www.toyota-club.net/files/techdata/ttx/tank.htm')
    WHERE id = v_platform;
  END IF;

  INSERT INTO public.vehicle_catalog (
    make, model, year, chassis_code, engine_code, platform_id, engine_family_id,
    production_start_year, production_end_year
  ) VALUES (
    p_make, p_model, p_start, p_chassis,
    CASE WHEN p_engine IS NULL THEN NULL ELSE '1KR-FE' END,
    v_platform, p_engine, p_start, p_end
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

DO $$
DECLARE
  v_engine uuid;
  v_family_2wd uuid;
  v_family_4wd uuid;
  v_roomy uuid;
  v_thor uuid;
BEGIN
  SELECT id INTO v_engine FROM public.engine_family WHERE upper(code) = '1KR-FE' LIMIT 1;
  IF v_engine IS NULL THEN
    INSERT INTO public.engine_family (code) VALUES ('1KR-FE') RETURNING id INTO v_engine;
  END IF;

  SELECT id INTO v_family_2wd
  FROM public.vehicle_platform
  WHERE maker = 'family' AND label = 'Roomy / Tank / Thor / Justy · 2WD (M900)'
  LIMIT 1;
  IF v_family_2wd IS NULL THEN
    INSERT INTO public.vehicle_platform (code, label, maker, notes, family_evidence_url)
    VALUES (
      'M900-2WD-FAMILY',
      'Roomy / Tank / Thor / Justy · 2WD (M900)',
      'family',
      '2WD sisters',
      'http://www.toyota-club.net/files/techdata/ttx/tank.htm'
    )
    RETURNING id INTO v_family_2wd;
  END IF;

  SELECT id INTO v_family_4wd
  FROM public.vehicle_platform
  WHERE maker = 'family' AND label = 'Roomy / Tank / Thor / Justy · 4WD (M910)'
  LIMIT 1;
  IF v_family_4wd IS NULL THEN
    INSERT INTO public.vehicle_platform (code, label, maker, notes, family_evidence_url)
    VALUES (
      'M910-4WD-FAMILY',
      'Roomy / Tank / Thor / Justy · 4WD (M910)',
      'family',
      '4WD sisters',
      'http://www.toyota-club.net/files/techdata/ttx/tank.htm'
    )
    RETURNING id INTO v_family_4wd;
  END IF;

  v_roomy := public.roomy_seed_vehicle('Toyota', 'Roomy', 'M900A', v_family_2wd, v_engine, 2016, 2022);
  PERFORM public.roomy_seed_vehicle('Daihatsu', 'Thor', 'M900S', v_family_2wd, v_engine, 2016, 2022);
  PERFORM public.roomy_seed_vehicle('Subaru', 'Justy', 'M900F', v_family_2wd, v_engine, 2016, 2022);
  PERFORM public.roomy_seed_vehicle('Daihatsu', 'Thor', 'M910S', v_family_4wd, NULL, 2016, 2022);
  PERFORM public.roomy_seed_vehicle('Subaru', 'Justy', 'M910F', v_family_4wd, NULL, 2016, 2022);
  PERFORM public.roomy_seed_vehicle('Toyota', 'Tank', 'M910A', v_family_4wd, NULL, 2016, 2022);

  SELECT id INTO v_thor
  FROM public.vehicle_catalog
  WHERE lower(make) = 'daihatsu' AND lower(model) = 'thor' AND upper(chassis_code) = 'M900S'
  LIMIT 1;

  IF NOT EXISTS (
    SELECT 1
    FROM public.part_master pm
    JOIN public.part_listing pl ON pl.interchange_group_id = pm.interchange_group_id
    WHERE pm.oem_part_number = '04152-40060' AND pl.vehicle_catalog_id = v_roomy
  ) THEN
    PERFORM public.save_guided_part(jsonb_build_object(
      'variantId', v_roomy,
      'componentOpCode', 'ENG-OIL',
      'yearFrom', 2016,
      'yearTo', 2022,
      'evidenceUrl', 'http://www.toyota-club.net/files/techdata/ttx/tank.htm',
      'note', 'OEM oil filter for M900A. 0W-20, 3.1 L with filter.',
      'parts', jsonb_build_array(
        jsonb_build_object('manufacturer', 'Toyota', 'partNumber', '04152-40060', 'name', 'Oil filter', 'kind', 'oem'),
        jsonb_build_object('manufacturer', 'Union', 'partNumber', 'O-104', 'name', 'Oil filter', 'kind', 'aftermarket')
      )
    ));
  END IF;

  IF v_thor IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.part_master pm
    JOIN public.part_listing pl ON pl.interchange_group_id = pm.interchange_group_id
    WHERE pm.oem_part_number = '525' AND pl.vehicle_catalog_id = v_thor
  ) THEN
    PERFORM public.save_guided_part(jsonb_build_object(
      'variantId', v_thor,
      'componentOpCode', 'LGT-WIPER',
      'position', 'driver',
      'yearFrom', 2016,
      'yearTo', 2022,
      'evidenceUrl', 'https://wiper-wiper.com/2023/07/14/roomy/',
      'note', 'Driver blade length shared by the M900 body. Listed on Thor so Roomy sees it as a sister part.',
      'parts', jsonb_build_array(
        jsonb_build_object('manufacturer', 'OEM spec', 'partNumber', '525', 'name', 'Driver wiper 525 mm', 'kind', 'oem')
      )
    ));
  END IF;

  PERFORM public.save_catalog_spec(jsonb_build_object(
    'variantId', v_roomy, 'specKey', 'engine_oil_grade', 'value', '0W-20', 'scope', 'variant',
    'evidenceUrl', 'http://www.toyota-club.net/files/techdata/ttx/tank.htm'
  ));
  PERFORM public.save_catalog_spec(jsonb_build_object(
    'variantId', v_roomy, 'specKey', 'engine_oil_capacity_with_filter_l', 'value', '3.1', 'scope', 'variant',
    'evidenceUrl', 'http://www.toyota-club.net/files/techdata/ttx/tank.htm'
  ));
  PERFORM public.save_catalog_spec(jsonb_build_object(
    'variantId', v_roomy, 'specKey', 'wiper_driver_mm', 'value', '525', 'scope', 'variant',
    'evidenceUrl', 'https://wiper-wiper.com/2023/07/14/roomy/'
  ));
  PERFORM public.save_catalog_spec(jsonb_build_object(
    'variantId', v_roomy, 'specKey', 'wiper_passenger_mm', 'value', '475', 'scope', 'variant',
    'evidenceUrl', 'https://wiper-wiper.com/2023/07/14/roomy/'
  ));
  PERFORM public.save_catalog_spec(jsonb_build_object(
    'variantId', v_roomy, 'specKey', 'wiper_rear_mm', 'value', '350', 'scope', 'variant',
    'evidenceUrl', 'https://wiper-wiper.com/2023/07/14/roomy/'
  ));
  PERFORM public.save_catalog_spec(jsonb_build_object(
    'variantId', v_roomy, 'specKey', 'transmission_fluid', 'value', 'CVT Fluid FE', 'scope', 'variant',
    'evidenceUrl', 'http://www.toyota-club.net/files/techdata/ttx/tank.htm'
  ));

  PERFORM public.save_universal_part(jsonb_build_object(
    'specKey', 'engine_oil_grade', 'specValue', '0W-20',
    'manufacturer', 'Toyota', 'partNumber', '0W-20', 'name', 'Engine oil 0W-20',
    'evidenceUrl', 'http://www.toyota-club.net/files/techdata/ttx/tank.htm'
  ));
  PERFORM public.save_universal_part(jsonb_build_object(
    'specKey', 'wiper_driver_mm', 'specValue', '525',
    'manufacturer', 'OEM spec', 'partNumber', '525', 'name', 'Driver wiper 525 mm',
    'evidenceUrl', 'https://wiper-wiper.com/2023/07/14/roomy/'
  ));
  PERFORM public.save_universal_part(jsonb_build_object(
    'specKey', 'transmission_fluid', 'specValue', 'CVT Fluid FE',
    'manufacturer', 'Toyota', 'partNumber', 'CVT-FE', 'name', 'CVT Fluid FE',
    'evidenceUrl', 'http://www.toyota-club.net/files/techdata/ttx/tank.htm'
  ));
END $$;

DROP FUNCTION public.roomy_seed_vehicle(text, text, text, uuid, uuid, integer, integer);
