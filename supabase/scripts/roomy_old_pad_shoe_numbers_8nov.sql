-- RB-24: older Toyota pad and shoe numbers for the 2WD Roomy / Tank (M900A).
-- Source: Toyota's catalogue on Partsouq.
--   Frame M900A-0049265 (built 2017): pad kit 04491-B1190 (earlier 04491-B1032), 2016-11 to 2019-01;
--                                     shoe kit 04495-B1310 (earlier 04495-B2400), 2016-11 to 2019-05.
--   Frame M900A-0344862 (built 2019): pad kit 04491-B1190 from 2019-01; shoe kit 04495-B2430.
-- What this does:
--   1. Pads: 04491-B1190 records that it replaces Toyota 04491-B1032 (04465-B1190 is untouched; it stays Needs checking).
--   2. Shoes: adds Toyota 04495-B1310 to the same card as 04495-B2400, makes both Confirmed for 2016–2019,
--      and links the 2WD Roomy + Tank to that card for 2016–2019.
--   3. Shoes: 04495-B2430 now starts in 2019 (it was 2016–2020).
-- All-or-nothing: if any check fails, nothing is kept. Safe to run twice.

BEGIN;

DO $$
DECLARE
  v_actor uuid := '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823';
  v_src2017 text := 'https://partsouq.com/en/search/all?q=M900A-0049265';
  v_cars uuid[] := ARRAY['3cd9cbf3-a804-4817-82db-400cf6abf13a', 'a72af492-48f6-420f-92b3-69452f01c186']::uuid[]; -- Roomy 2WD, Tank 2WD (2016–2020)
  v_pad uuid;
  v_old_shoe public.part_master%ROWTYPE;
  v_new_shoe uuid;
  v_b2430_group uuid;
  v_car uuid;
BEGIN
  -- 1. Pads ---------------------------------------------------------------
  SELECT id INTO v_pad FROM public.part_master
  WHERE manufacturer = 'Toyota' AND oem_part_number = '04491-B1190' LIMIT 1;
  IF v_pad IS NULL THEN RAISE EXCEPTION 'Toyota 04491-B1190 not found. Nothing was changed.'; END IF;

  INSERT INTO public.part_oe_reference (part_id, reference_type, oe_brand, oe_number, oe_number_norm, evidence_url, created_by)
  SELECT v_pad, 'replaces', 'Toyota', '04491-B1032', public.part_import_norm_number('04491-B1032'), v_src2017, v_actor
  WHERE NOT EXISTS (
    SELECT 1 FROM public.part_oe_reference r
    WHERE r.part_id = v_pad AND r.oe_number_norm = public.part_import_norm_number('04491-B1032')
  );

  -- 2. Shoes: 04495-B1310 joins 04495-B2400's card ---------------------------
  SELECT * INTO v_old_shoe FROM public.part_master
  WHERE manufacturer = 'Toyota' AND oem_part_number = '04495-B2400' LIMIT 1;
  IF v_old_shoe.id IS NULL OR v_old_shoe.interchange_group_id IS NULL THEN
    RAISE EXCEPTION 'Toyota 04495-B2400 (with a card) not found. Nothing was changed.';
  END IF;

  SELECT id INTO v_new_shoe FROM public.part_master
  WHERE manufacturer = 'Toyota' AND oem_part_number = '04495-B1310' LIMIT 1;
  IF v_new_shoe IS NULL THEN
    INSERT INTO public.part_master (
      category_id, name, oem_part_number, manufacturer, part_kind,
      interchange_group_id, maintenance_component_id, evidence_url,
      catalog_decision, source_type, verified_by, verified_at, updated_at
    ) VALUES (
      v_old_shoe.category_id, 'Rear brake shoes', '04495-B1310', 'Toyota', 'oem',
      v_old_shoe.interchange_group_id, v_old_shoe.maintenance_component_id, v_src2017,
      'confirmed', 'car_maker_catalogue', v_actor, now(), now()
    ) RETURNING id INTO v_new_shoe;
  ELSIF (SELECT interchange_group_id FROM public.part_master WHERE id = v_new_shoe) IS DISTINCT FROM v_old_shoe.interchange_group_id THEN
    RAISE EXCEPTION '04495-B1310 is already on file in a different card. Nothing was changed. Send this to Claude.';
  END IF;

  -- The old number is Toyota's own original number: Confirmed, same source.
  UPDATE public.part_master
  SET catalog_decision = 'confirmed', source_type = 'car_maker_catalogue', evidence_url = v_src2017,
      verified_by = v_actor, verified_at = coalesce(verified_at, now()), updated_at = now()
  WHERE id = v_old_shoe.id;

  INSERT INTO public.part_oe_reference (part_id, reference_type, oe_brand, oe_number, oe_number_norm, evidence_url, created_by)
  SELECT v_new_shoe, 'replaces', 'Toyota', '04495-B2400', public.part_import_norm_number('04495-B2400'), v_src2017, v_actor
  WHERE NOT EXISTS (
    SELECT 1 FROM public.part_oe_reference r
    WHERE r.part_id = v_new_shoe AND r.oe_number_norm = public.part_import_norm_number('04495-B2400')
  );

  -- Card fits for the 2WD Roomy + Tank: rear, 2016–2019, source = Toyota catalogue (trust follows the source).
  FOREACH v_car IN ARRAY v_cars LOOP
    UPDATE public.part_listing
    SET evidence_url = v_src2017, year_from = 2016, year_to = 2019
    WHERE interchange_group_id = v_old_shoe.interchange_group_id AND vehicle_catalog_id = v_car;
    IF NOT FOUND THEN
      INSERT INTO public.part_listing (interchange_group_id, vehicle_catalog_id, position, year_from, year_to, evidence_url, origin)
      VALUES (v_old_shoe.interchange_group_id, v_car, 'rear', 2016, 2019, v_src2017, 'manual');
    END IF;
  END LOOP;

  PERFORM public.part_match_recompute(v_old_shoe.interchange_group_id, NULL);

  -- 3. 04495-B2430 starts in 2019 -------------------------------------------
  SELECT interchange_group_id INTO v_b2430_group FROM public.part_master
  WHERE manufacturer = 'Toyota' AND oem_part_number = '04495-B2430' LIMIT 1;
  IF v_b2430_group IS NULL THEN RAISE EXCEPTION 'Toyota 04495-B2430 not found. Nothing was changed.'; END IF;
  IF v_b2430_group = v_old_shoe.interchange_group_id THEN
    RAISE EXCEPTION '04495-B2430 and 04495-B2400 share a card already. Nothing was changed. Send this to Claude.';
  END IF;
  UPDATE public.part_listing SET year_from = 2019
  WHERE interchange_group_id = v_b2430_group AND vehicle_catalog_id = ANY (v_cars);
END $$;

COMMIT;

-- Check (expect: shoe card rows with 2016–2019 confirmed, B2430 rows 2019–2020, and two "replaces" rows).
SELECT 'shoe fit' AS what, pm.oem_part_number AS number, pm.catalog_decision AS part, c.model,
       pl.year_from || '–' || pl.year_to AS years, pl.trust::text AS fit
FROM public.part_master pm
JOIN public.part_listing pl ON pl.interchange_group_id = pm.interchange_group_id
JOIN public.vehicle_catalog c ON c.id = pl.vehicle_catalog_id
WHERE pm.manufacturer = 'Toyota' AND pm.oem_part_number IN ('04495-B2400', '04495-B1310', '04495-B2430')
  AND pl.vehicle_catalog_id IN ('3cd9cbf3-a804-4817-82db-400cf6abf13a', 'a72af492-48f6-420f-92b3-69452f01c186')
UNION ALL
SELECT 'replaces', pm.oem_part_number, r.oe_number, NULL, NULL, NULL
FROM public.part_oe_reference r JOIN public.part_master pm ON pm.id = r.part_id
WHERE pm.manufacturer = 'Toyota' AND pm.oem_part_number IN ('04491-B1190', '04495-B1310')
ORDER BY 1, 2, 4;
