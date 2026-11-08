-- RB-23: Toyota genuine brake parts for the 4WD Roomy / Tank (M910A), 2016–2020.
-- Source: Toyota's catalogue on Partsouq for frame M910A-0059713 (Tank Roomy 2019, built 2016-11 to 2020-09).
-- 10 parts are the same as the 2WD (Variant M900,910): the 4WD cars are added to them.
-- 8 parts are 4WD-only (Variant M910): saved as new Toyota parts.
-- Cars: Roomy M910A 2016–2020 (7c71d591…) and Tank M910A (05d10289…), years 2016–2020, Confirmed.
-- All-or-nothing: if one save fails, none are kept. A part that already has both 4WD cars is skipped,
-- so running it twice changes nothing.

BEGIN;

-- SAME as 2WD: 04491-B1190 (diagram 4705)
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"a1000000-0000-4000-8000-00000000000a","brand":"Toyota","partNumber":"04491-B1190","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/catalog/toyota/diagram/JP/2019/TANK-ROOMY/M910A-AGBME/category/2/diagram/4705","fitMode":"specific","listings":[{"vehicleId":"7c71d591-6a4a-4763-a858-f3850129fba2","position":"Front","yearFrom":2016,"yearTo":2020,"trust":"confirmed"},{"vehicleId":"05d10289-3147-4092-9497-dabb039a08ed","position":"Front","yearFrom":2016,"yearTo":2020,"trust":"confirmed"}]}'::jsonb);
  RAISE NOTICE '04491-B1190: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN
    RAISE NOTICE '04491-B1190: already on file for both 4WD cars, skipped';
  ELSE
    RAISE;
  END IF;
END $$;

-- SAME: 47730-B1021 (diagram 4705)
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"c1000002-0000-4000-8000-000000000001","brand":"Toyota","partNumber":"47730-B1021","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/catalog/toyota/diagram/JP/2019/TANK-ROOMY/M910A-AGBME/category/2/diagram/4705","fitMode":"specific","listings":[{"vehicleId":"7c71d591-6a4a-4763-a858-f3850129fba2","position":"Front","side":"right","yearFrom":2016,"yearTo":2020,"trust":"confirmed"},{"vehicleId":"05d10289-3147-4092-9497-dabb039a08ed","position":"Front","side":"right","yearFrom":2016,"yearTo":2020,"trust":"confirmed"}]}'::jsonb);
  RAISE NOTICE '47730-B1021: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN
    RAISE NOTICE '47730-B1021: already on file for both 4WD cars, skipped';
  ELSE
    RAISE;
  END IF;
END $$;

-- SAME: 47750-B1021 (diagram 4705)
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"c1000002-0000-4000-8000-000000000001","brand":"Toyota","partNumber":"47750-B1021","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/catalog/toyota/diagram/JP/2019/TANK-ROOMY/M910A-AGBME/category/2/diagram/4705","fitMode":"specific","listings":[{"vehicleId":"7c71d591-6a4a-4763-a858-f3850129fba2","position":"Front","side":"left","yearFrom":2016,"yearTo":2020,"trust":"confirmed"},{"vehicleId":"05d10289-3147-4092-9497-dabb039a08ed","position":"Front","side":"left","yearFrom":2016,"yearTo":2020,"trust":"confirmed"}]}'::jsonb);
  RAISE NOTICE '47750-B1021: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN
    RAISE NOTICE '47750-B1021: already on file for both 4WD cars, skipped';
  ELSE
    RAISE;
  END IF;
END $$;

-- SAME: 43512-B1081 (diagram 4303)
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"79a131ec-f1db-480a-9e70-3f0400ae59b3","brand":"Toyota","partNumber":"43512-B1081","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/catalog/toyota/diagram/JP/2019/TANK-ROOMY/M910A-AGBME/category/2/diagram/4303","fitMode":"specific","listings":[{"vehicleId":"7c71d591-6a4a-4763-a858-f3850129fba2","position":"Front","yearFrom":2016,"yearTo":2020,"trust":"confirmed"},{"vehicleId":"05d10289-3147-4092-9497-dabb039a08ed","position":"Front","yearFrom":2016,"yearTo":2020,"trust":"confirmed"}]}'::jsonb);
  RAISE NOTICE '43512-B1081: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN
    RAISE NOTICE '43512-B1081: already on file for both 4WD cars, skipped';
  ELSE
    RAISE;
  END IF;
END $$;

-- SAME: 90049-22289 (diagram 4708)
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"c1000002-0000-4000-8000-000000000004","brand":"Toyota","partNumber":"90049-22289","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/catalog/toyota/diagram/JP/2019/TANK-ROOMY/M910A-AGBME/category/2/diagram/4708/illustration/47A574D","fitMode":"specific","listings":[{"vehicleId":"7c71d591-6a4a-4763-a858-f3850129fba2","position":"Front","catalogueNumber":1,"yearFrom":2016,"yearTo":2020,"trust":"confirmed"},{"vehicleId":"05d10289-3147-4092-9497-dabb039a08ed","position":"Front","catalogueNumber":1,"yearFrom":2016,"yearTo":2020,"trust":"confirmed"}]}'::jsonb);
  RAISE NOTICE '90049-22289: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN
    RAISE NOTICE '90049-22289: already on file for both 4WD cars, skipped';
  ELSE
    RAISE;
  END IF;
END $$;

-- SAME: 90049-22290 (diagram 4708)
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"c1000002-0000-4000-8000-000000000004","brand":"Toyota","partNumber":"90049-22290","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/catalog/toyota/diagram/JP/2019/TANK-ROOMY/M910A-AGBME/category/2/diagram/4708/illustration/47A574D","fitMode":"specific","listings":[{"vehicleId":"7c71d591-6a4a-4763-a858-f3850129fba2","position":"Front","catalogueNumber":2,"yearFrom":2016,"yearTo":2020,"trust":"confirmed"},{"vehicleId":"05d10289-3147-4092-9497-dabb039a08ed","position":"Front","catalogueNumber":2,"yearFrom":2016,"yearTo":2020,"trust":"confirmed"}]}'::jsonb);
  RAISE NOTICE '90049-22290: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN
    RAISE NOTICE '90049-22290: already on file for both 4WD cars, skipped';
  ELSE
    RAISE;
  END IF;
END $$;

-- SAME: 47201-B1190 (diagram 4702)
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"c1000002-0000-4000-8000-000000000005","brand":"Toyota","partNumber":"47201-B1190","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/catalog/toyota/diagram/JP/2019/TANK-ROOMY/M910A-AGBME/category/2/diagram/4702","fitMode":"specific","listings":[{"vehicleId":"7c71d591-6a4a-4763-a858-f3850129fba2","yearFrom":2016,"yearTo":2020,"trust":"confirmed"},{"vehicleId":"05d10289-3147-4092-9497-dabb039a08ed","yearFrom":2016,"yearTo":2020,"trust":"confirmed"}]}'::jsonb);
  RAISE NOTICE '47201-B1190: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN
    RAISE NOTICE '47201-B1190: already on file for both 4WD cars, skipped';
  ELSE
    RAISE;
  END IF;
END $$;

-- SAME: 46410-B1011 (diagram 4601)
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"c1000002-0000-4000-8000-000000000006","brand":"Toyota","partNumber":"46410-B1011","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/catalog/toyota/diagram/JP/2019/TANK-ROOMY/M910A-AGBME/category/2/diagram/4601","fitMode":"specific","listings":[{"vehicleId":"7c71d591-6a4a-4763-a858-f3850129fba2","position":"Front","catalogueNumber":1,"yearFrom":2016,"yearTo":2020,"trust":"confirmed"},{"vehicleId":"05d10289-3147-4092-9497-dabb039a08ed","position":"Front","catalogueNumber":1,"yearFrom":2016,"yearTo":2020,"trust":"confirmed"}]}'::jsonb);
  RAISE NOTICE '46410-B1011: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN
    RAISE NOTICE '46410-B1011: already on file for both 4WD cars, skipped';
  ELSE
    RAISE;
  END IF;
END $$;

-- SAME: 89542-B1040 (diagram 8414)
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"c1000002-0000-4000-8000-000000000007","brand":"Toyota","partNumber":"89542-B1040","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/catalog/toyota/diagram/JP/2019/TANK-ROOMY/M910A-AGBME/category/4/diagram/8414/illustration/84L855","fitMode":"specific","listings":[{"vehicleId":"7c71d591-6a4a-4763-a858-f3850129fba2","position":"Front","side":"right","yearFrom":2016,"yearTo":2020,"trust":"confirmed"},{"vehicleId":"05d10289-3147-4092-9497-dabb039a08ed","position":"Front","side":"right","yearFrom":2016,"yearTo":2020,"trust":"confirmed"}]}'::jsonb);
  RAISE NOTICE '89542-B1040: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN
    RAISE NOTICE '89542-B1040: already on file for both 4WD cars, skipped';
  ELSE
    RAISE;
  END IF;
END $$;

-- SAME: 89543-B1050 (diagram 8414)
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"c1000002-0000-4000-8000-000000000007","brand":"Toyota","partNumber":"89543-B1050","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/catalog/toyota/diagram/JP/2019/TANK-ROOMY/M910A-AGBME/category/4/diagram/8414/illustration/84L855","fitMode":"specific","listings":[{"vehicleId":"7c71d591-6a4a-4763-a858-f3850129fba2","position":"Front","side":"left","yearFrom":2016,"yearTo":2020,"trust":"confirmed"},{"vehicleId":"05d10289-3147-4092-9497-dabb039a08ed","position":"Front","side":"left","yearFrom":2016,"yearTo":2020,"trust":"confirmed"}]}'::jsonb);
  RAISE NOTICE '89543-B1050: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN
    RAISE NOTICE '89543-B1050: already on file for both 4WD cars, skipped';
  ELSE
    RAISE;
  END IF;
END $$;

-- NEW 4WD: 47560-B5010 (diagram 4706)
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"c1000002-0000-4000-8000-000000000003","brand":"Toyota","partNumber":"47560-B5010","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/catalog/toyota/diagram/JP/2019/TANK-ROOMY/M910A-AGBME/category/2/diagram/4706","fitMode":"specific","listings":[{"vehicleId":"7c71d591-6a4a-4763-a858-f3850129fba2","position":"Rear","side":"left","yearFrom":2016,"yearTo":2020,"trust":"confirmed"},{"vehicleId":"7c71d591-6a4a-4763-a858-f3850129fba2","position":"Rear","side":"right","yearFrom":2016,"yearTo":2020,"trust":"confirmed"},{"vehicleId":"05d10289-3147-4092-9497-dabb039a08ed","position":"Rear","side":"left","yearFrom":2016,"yearTo":2020,"trust":"confirmed"},{"vehicleId":"05d10289-3147-4092-9497-dabb039a08ed","position":"Rear","side":"right","yearFrom":2016,"yearTo":2020,"trust":"confirmed"}],"name":"Rear wheel cylinder (4WD)"}'::jsonb);
  RAISE NOTICE '47560-B5010: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN
    RAISE NOTICE '47560-B5010: already on file for both 4WD cars, skipped';
  ELSE
    RAISE;
  END IF;
END $$;

-- NEW: 04495-B1051 (diagram 4706)
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"f5a10001-0000-4000-8000-000000000002","brand":"Toyota","partNumber":"04495-B1051","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/catalog/toyota/diagram/JP/2019/TANK-ROOMY/M910A-AGBME/category/2/diagram/4706","fitMode":"specific","listings":[{"vehicleId":"7c71d591-6a4a-4763-a858-f3850129fba2","position":"Rear","yearFrom":2016,"yearTo":2020,"trust":"confirmed"},{"vehicleId":"05d10289-3147-4092-9497-dabb039a08ed","position":"Rear","yearFrom":2016,"yearTo":2020,"trust":"confirmed"}],"name":"Rear brake shoes (4WD)"}'::jsonb);
  RAISE NOTICE '04495-B1051: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN
    RAISE NOTICE '04495-B1051: already on file for both 4WD cars, skipped';
  ELSE
    RAISE;
  END IF;
END $$;

-- NEW: 42431-97502 (diagram 4102)
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"c1000002-0000-4000-8000-000000000002","brand":"Toyota","partNumber":"42431-97502","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/catalog/toyota/diagram/JP/2019/TANK-ROOMY/M910A-AGBME/category/2/diagram/4102","fitMode":"specific","listings":[{"vehicleId":"7c71d591-6a4a-4763-a858-f3850129fba2","position":"Rear","yearFrom":2016,"yearTo":2020,"trust":"confirmed"},{"vehicleId":"05d10289-3147-4092-9497-dabb039a08ed","position":"Rear","yearFrom":2016,"yearTo":2020,"trust":"confirmed"}],"name":"Rear brake drum (4WD)"}'::jsonb);
  RAISE NOTICE '42431-97502: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN
    RAISE NOTICE '42431-97502: already on file for both 4WD cars, skipped';
  ELSE
    RAISE;
  END IF;
END $$;

-- NEW: 90049-22186 (diagram 4708)
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"c1000002-0000-4000-8000-000000000004","brand":"Toyota","partNumber":"90049-22186","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/catalog/toyota/diagram/JP/2019/TANK-ROOMY/M910A-AGBME/category/2/diagram/4708/illustration/47A574D","fitMode":"specific","listings":[{"vehicleId":"7c71d591-6a4a-4763-a858-f3850129fba2","position":"Rear","side":"left","yearFrom":2016,"yearTo":2020,"trust":"confirmed"},{"vehicleId":"7c71d591-6a4a-4763-a858-f3850129fba2","position":"Rear","side":"right","yearFrom":2016,"yearTo":2020,"trust":"confirmed"},{"vehicleId":"05d10289-3147-4092-9497-dabb039a08ed","position":"Rear","side":"left","yearFrom":2016,"yearTo":2020,"trust":"confirmed"},{"vehicleId":"05d10289-3147-4092-9497-dabb039a08ed","position":"Rear","side":"right","yearFrom":2016,"yearTo":2020,"trust":"confirmed"}],"name":"Rear brake hose (4WD)"}'::jsonb);
  RAISE NOTICE '90049-22186: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN
    RAISE NOTICE '90049-22186: already on file for both 4WD cars, skipped';
  ELSE
    RAISE;
  END IF;
END $$;

-- NEW: 46420-B1120 (diagram 4601)
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"c1000002-0000-4000-8000-000000000006","brand":"Toyota","partNumber":"46420-B1120","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/catalog/toyota/diagram/JP/2019/TANK-ROOMY/M910A-AGBME/category/2/diagram/4601","fitMode":"specific","listings":[{"vehicleId":"7c71d591-6a4a-4763-a858-f3850129fba2","position":"Rear","catalogueNumber":2,"yearFrom":2016,"yearTo":2020,"trust":"confirmed"},{"vehicleId":"05d10289-3147-4092-9497-dabb039a08ed","position":"Rear","catalogueNumber":2,"yearFrom":2016,"yearTo":2020,"trust":"confirmed"}],"name":"Rear handbrake cable No.2 (4WD)"}'::jsonb);
  RAISE NOTICE '46420-B1120: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN
    RAISE NOTICE '46420-B1120: already on file for both 4WD cars, skipped';
  ELSE
    RAISE;
  END IF;
END $$;

-- NEW: 46430-B1120 (diagram 4601)
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"c1000002-0000-4000-8000-000000000006","brand":"Toyota","partNumber":"46430-B1120","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/catalog/toyota/diagram/JP/2019/TANK-ROOMY/M910A-AGBME/category/2/diagram/4601","fitMode":"specific","listings":[{"vehicleId":"7c71d591-6a4a-4763-a858-f3850129fba2","position":"Rear","catalogueNumber":3,"yearFrom":2016,"yearTo":2020,"trust":"confirmed"},{"vehicleId":"05d10289-3147-4092-9497-dabb039a08ed","position":"Rear","catalogueNumber":3,"yearFrom":2016,"yearTo":2020,"trust":"confirmed"}],"name":"Rear handbrake cable No.3 (4WD)"}'::jsonb);
  RAISE NOTICE '46430-B1120: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN
    RAISE NOTICE '46430-B1120: already on file for both 4WD cars, skipped';
  ELSE
    RAISE;
  END IF;
END $$;

-- NEW: 89545-B1100 (diagram 8414)
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"c1000002-0000-4000-8000-000000000007","brand":"Toyota","partNumber":"89545-B1100","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/catalog/toyota/diagram/JP/2019/TANK-ROOMY/M910A-AGBME/category/4/diagram/8414/illustration/84L855","fitMode":"specific","listings":[{"vehicleId":"7c71d591-6a4a-4763-a858-f3850129fba2","position":"Rear","side":"right","yearFrom":2016,"yearTo":2020,"trust":"confirmed"},{"vehicleId":"05d10289-3147-4092-9497-dabb039a08ed","position":"Rear","side":"right","yearFrom":2016,"yearTo":2020,"trust":"confirmed"}],"name":"Rear ABS wheel sensor, right (4WD)"}'::jsonb);
  RAISE NOTICE '89545-B1100: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN
    RAISE NOTICE '89545-B1100: already on file for both 4WD cars, skipped';
  ELSE
    RAISE;
  END IF;
END $$;

-- NEW: 89546-B1100 (diagram 8414)
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"c1000002-0000-4000-8000-000000000007","brand":"Toyota","partNumber":"89546-B1100","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/catalog/toyota/diagram/JP/2019/TANK-ROOMY/M910A-AGBME/category/4/diagram/8414/illustration/84L855","fitMode":"specific","listings":[{"vehicleId":"7c71d591-6a4a-4763-a858-f3850129fba2","position":"Rear","side":"left","yearFrom":2016,"yearTo":2020,"trust":"confirmed"},{"vehicleId":"05d10289-3147-4092-9497-dabb039a08ed","position":"Rear","side":"left","yearFrom":2016,"yearTo":2020,"trust":"confirmed"}],"name":"Rear ABS wheel sensor, left (4WD)"}'::jsonb);
  RAISE NOTICE '89546-B1100: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN
    RAISE NOTICE '89546-B1100: already on file for both 4WD cars, skipped';
  ELSE
    RAISE;
  END IF;
END $$;

COMMIT;

-- Check: every 4WD fit just saved (expect 40 rows: 20 per car, all trust = confirmed).
SELECT c.model, pm.oem_part_number, pm.name, pl.position, pl.side, pl.catalogue_number AS no, pl.trust
FROM public.part_listing pl
JOIN public.part_master pm ON pm.interchange_group_id = pl.interchange_group_id AND pm.manufacturer = 'Toyota'
JOIN public.vehicle_catalog c ON c.id = pl.vehicle_catalog_id
WHERE pl.vehicle_catalog_id IN ('7c71d591-6a4a-4763-a858-f3850129fba2', '05d10289-3147-4092-9497-dabb039a08ed')
  AND pm.oem_part_number IN ('04491-B1190', '47730-B1021', '47750-B1021', '43512-B1081', '90049-22289', '90049-22290', '47201-B1190', '46410-B1011', '89542-B1040', '89543-B1050', '47560-B5010', '04495-B1051', '42431-97502', '90049-22186', '46420-B1120', '46430-B1120', '89545-B1100', '89546-B1100')
ORDER BY c.model, pl.position, pm.oem_part_number, pl.side;
