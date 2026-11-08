-- RB-27: Toyota genuine brake parts for the 2020-on Roomy (facelift), 2WD and 4WD.
-- Sources (Toyota's catalogue on Partsouq):
--   2WD: frame M900A-0669946 (2022, Custom G, 1KR-FE, production 2020-09 to 2026-05), model code M900A-GBVE
--   4WD: frame M910A-0108951 (2021, Custom G, 1KR-FE, production 2020-09 to 2026-05), model code M910A-GBVE
-- Cars: 2WD 1KR-FE (3ed7c48e), 2WD 1KR-VET turbo (007d4cad), 4WD 1KR-FE (ddf1d527); years 2020 on.
-- Parts every grade uses are Confirmed. Parts Toyota marks "Custom G, electric parking brake" are saved
-- Needs checking with the reason: Custom G only (electric parking brake). X and G grades use a different part.
-- (each catalogue row covers X, G and Custom G cars). The X / G (hand lever) parts are a separate lookup.
-- All-or-nothing. A part that already has every fit is skipped, so running it twice changes nothing.

BEGIN;

-- ALL: 04491-B1190
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"a1000000-0000-4000-8000-00000000000a","brand":"Toyota","partNumber":"04491-B1190","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/catalog/toyota/diagram/JP/2022/TANK-ROOMY/M900A-GBVE/category/2/diagram/4705","fitMode":"specific","listings":[{"vehicleId":"3ed7c48e-76f2-4024-92f5-ac291a8dff87","position":"Front","yearFrom":2020,"trust":"confirmed"},{"vehicleId":"007d4cad-f47f-41d1-8354-442108af3902","position":"Front","yearFrom":2020,"trust":"confirmed"},{"vehicleId":"ddf1d527-2c5d-4665-95e5-a097a1f30dd8","position":"Front","yearFrom":2020,"trust":"confirmed"}]}'::jsonb);
  RAISE NOTICE '04491-B1190: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN
    RAISE NOTICE '04491-B1190: already on file, skipped';
  ELSE
    RAISE;
  END IF;
END $$;

-- ALL: 47730-B1021
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"c1000002-0000-4000-8000-000000000001","brand":"Toyota","partNumber":"47730-B1021","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/catalog/toyota/diagram/JP/2022/TANK-ROOMY/M900A-GBVE/category/2/diagram/4705","fitMode":"specific","listings":[{"vehicleId":"3ed7c48e-76f2-4024-92f5-ac291a8dff87","position":"Front","side":"right","yearFrom":2020,"trust":"confirmed"},{"vehicleId":"007d4cad-f47f-41d1-8354-442108af3902","position":"Front","side":"right","yearFrom":2020,"trust":"confirmed"},{"vehicleId":"ddf1d527-2c5d-4665-95e5-a097a1f30dd8","position":"Front","side":"right","yearFrom":2020,"trust":"confirmed"}]}'::jsonb);
  RAISE NOTICE '47730-B1021: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN
    RAISE NOTICE '47730-B1021: already on file, skipped';
  ELSE
    RAISE;
  END IF;
END $$;

-- ALL: 47750-B1021
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"c1000002-0000-4000-8000-000000000001","brand":"Toyota","partNumber":"47750-B1021","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/catalog/toyota/diagram/JP/2022/TANK-ROOMY/M900A-GBVE/category/2/diagram/4705","fitMode":"specific","listings":[{"vehicleId":"3ed7c48e-76f2-4024-92f5-ac291a8dff87","position":"Front","side":"left","yearFrom":2020,"trust":"confirmed"},{"vehicleId":"007d4cad-f47f-41d1-8354-442108af3902","position":"Front","side":"left","yearFrom":2020,"trust":"confirmed"},{"vehicleId":"ddf1d527-2c5d-4665-95e5-a097a1f30dd8","position":"Front","side":"left","yearFrom":2020,"trust":"confirmed"}]}'::jsonb);
  RAISE NOTICE '47750-B1021: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN
    RAISE NOTICE '47750-B1021: already on file, skipped';
  ELSE
    RAISE;
  END IF;
END $$;

-- ALL: 43512-B1081
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"79a131ec-f1db-480a-9e70-3f0400ae59b3","brand":"Toyota","partNumber":"43512-B1081","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/catalog/toyota/diagram/JP/2022/TANK-ROOMY/M900A-GBVE/category/2/diagram/4303","fitMode":"specific","listings":[{"vehicleId":"3ed7c48e-76f2-4024-92f5-ac291a8dff87","position":"Front","yearFrom":2020,"yearTo":2024,"trust":"confirmed"},{"vehicleId":"007d4cad-f47f-41d1-8354-442108af3902","position":"Front","yearFrom":2020,"yearTo":2024,"trust":"confirmed"},{"vehicleId":"ddf1d527-2c5d-4665-95e5-a097a1f30dd8","position":"Front","yearFrom":2020,"yearTo":2024,"trust":"confirmed"}]}'::jsonb);
  RAISE NOTICE '43512-B1081: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN
    RAISE NOTICE '43512-B1081: already on file, skipped';
  ELSE
    RAISE;
  END IF;
END $$;

-- ALL: 90049-22289
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"c1000002-0000-4000-8000-000000000004","brand":"Toyota","partNumber":"90049-22289","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/catalog/toyota/diagram/JP/2022/TANK-ROOMY/M900A-GBVE/category/2/diagram/4708","fitMode":"specific","listings":[{"vehicleId":"3ed7c48e-76f2-4024-92f5-ac291a8dff87","position":"Front","catalogueNumber":1,"yearFrom":2020,"trust":"confirmed"},{"vehicleId":"007d4cad-f47f-41d1-8354-442108af3902","position":"Front","catalogueNumber":1,"yearFrom":2020,"trust":"confirmed"},{"vehicleId":"ddf1d527-2c5d-4665-95e5-a097a1f30dd8","position":"Front","catalogueNumber":1,"yearFrom":2020,"trust":"confirmed"}]}'::jsonb);
  RAISE NOTICE '90049-22289: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN
    RAISE NOTICE '90049-22289: already on file, skipped';
  ELSE
    RAISE;
  END IF;
END $$;

-- ALL: 90049-22290
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"c1000002-0000-4000-8000-000000000004","brand":"Toyota","partNumber":"90049-22290","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/catalog/toyota/diagram/JP/2022/TANK-ROOMY/M900A-GBVE/category/2/diagram/4708","fitMode":"specific","listings":[{"vehicleId":"3ed7c48e-76f2-4024-92f5-ac291a8dff87","position":"Front","catalogueNumber":2,"yearFrom":2020,"trust":"confirmed"},{"vehicleId":"007d4cad-f47f-41d1-8354-442108af3902","position":"Front","catalogueNumber":2,"yearFrom":2020,"trust":"confirmed"},{"vehicleId":"ddf1d527-2c5d-4665-95e5-a097a1f30dd8","position":"Front","catalogueNumber":2,"yearFrom":2020,"trust":"confirmed"}]}'::jsonb);
  RAISE NOTICE '90049-22290: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN
    RAISE NOTICE '90049-22290: already on file, skipped';
  ELSE
    RAISE;
  END IF;
END $$;

-- ALL: 47201-B1190
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"c1000002-0000-4000-8000-000000000005","brand":"Toyota","partNumber":"47201-B1190","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/catalog/toyota/diagram/JP/2022/TANK-ROOMY/M900A-GBVE/category/2/diagram/4702","fitMode":"specific","listings":[{"vehicleId":"3ed7c48e-76f2-4024-92f5-ac291a8dff87","yearFrom":2020,"trust":"confirmed"},{"vehicleId":"007d4cad-f47f-41d1-8354-442108af3902","yearFrom":2020,"trust":"confirmed"},{"vehicleId":"ddf1d527-2c5d-4665-95e5-a097a1f30dd8","yearFrom":2020,"trust":"confirmed"}]}'::jsonb);
  RAISE NOTICE '47201-B1190: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN
    RAISE NOTICE '47201-B1190: already on file, skipped';
  ELSE
    RAISE;
  END IF;
END $$;

-- ALL: 89542-B1040
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"c1000002-0000-4000-8000-000000000007","brand":"Toyota","partNumber":"89542-B1040","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/catalog/toyota/diagram/JP/2022/TANK-ROOMY/M900A-GBVE/category/4/diagram/8414","fitMode":"specific","listings":[{"vehicleId":"3ed7c48e-76f2-4024-92f5-ac291a8dff87","position":"Front","side":"right","yearFrom":2020,"trust":"confirmed"},{"vehicleId":"007d4cad-f47f-41d1-8354-442108af3902","position":"Front","side":"right","yearFrom":2020,"trust":"confirmed"},{"vehicleId":"ddf1d527-2c5d-4665-95e5-a097a1f30dd8","position":"Front","side":"right","yearFrom":2020,"trust":"confirmed"}]}'::jsonb);
  RAISE NOTICE '89542-B1040: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN
    RAISE NOTICE '89542-B1040: already on file, skipped';
  ELSE
    RAISE;
  END IF;
END $$;

-- ALL: 89543-B1050
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"c1000002-0000-4000-8000-000000000007","brand":"Toyota","partNumber":"89543-B1050","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/catalog/toyota/diagram/JP/2022/TANK-ROOMY/M900A-GBVE/category/4/diagram/8414","fitMode":"specific","listings":[{"vehicleId":"3ed7c48e-76f2-4024-92f5-ac291a8dff87","position":"Front","side":"left","yearFrom":2020,"trust":"confirmed"},{"vehicleId":"007d4cad-f47f-41d1-8354-442108af3902","position":"Front","side":"left","yearFrom":2020,"trust":"confirmed"},{"vehicleId":"ddf1d527-2c5d-4665-95e5-a097a1f30dd8","position":"Front","side":"left","yearFrom":2020,"trust":"confirmed"}]}'::jsonb);
  RAISE NOTICE '89543-B1050: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN
    RAISE NOTICE '89543-B1050: already on file, skipped';
  ELSE
    RAISE;
  END IF;
END $$;

-- 2WD: 90049-22193
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"c1000002-0000-4000-8000-000000000004","brand":"Toyota","partNumber":"90049-22193","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/catalog/toyota/diagram/JP/2022/TANK-ROOMY/M900A-GBVE/category/2/diagram/4708","fitMode":"specific","listings":[{"vehicleId":"3ed7c48e-76f2-4024-92f5-ac291a8dff87","position":"Rear","side":"left","yearFrom":2020,"trust":"confirmed"},{"vehicleId":"007d4cad-f47f-41d1-8354-442108af3902","position":"Rear","side":"left","yearFrom":2020,"trust":"confirmed"},{"vehicleId":"3ed7c48e-76f2-4024-92f5-ac291a8dff87","position":"Rear","side":"right","yearFrom":2020,"trust":"confirmed"},{"vehicleId":"007d4cad-f47f-41d1-8354-442108af3902","position":"Rear","side":"right","yearFrom":2020,"trust":"confirmed"}]}'::jsonb);
  RAISE NOTICE '90049-22193: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN
    RAISE NOTICE '90049-22193: already on file, skipped';
  ELSE
    RAISE;
  END IF;
END $$;

-- 2WD: 42431-B1021
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"c1000002-0000-4000-8000-000000000002","brand":"Toyota","partNumber":"42431-B1021","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/catalog/toyota/diagram/JP/2022/TANK-ROOMY/M900A-GBVE/category/2/diagram/4102","fitMode":"specific","listings":[{"vehicleId":"3ed7c48e-76f2-4024-92f5-ac291a8dff87","position":"Rear","yearFrom":2020,"trust":"confirmed"},{"vehicleId":"007d4cad-f47f-41d1-8354-442108af3902","position":"Rear","yearFrom":2020,"trust":"confirmed"}]}'::jsonb);
  RAISE NOTICE '42431-B1021: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN
    RAISE NOTICE '42431-B1021: already on file, skipped';
  ELSE
    RAISE;
  END IF;
END $$;

-- 2WD EPB: 47570-B1020
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"c1000002-0000-4000-8000-000000000003","brand":"Toyota","partNumber":"47570-B1020","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/catalog/toyota/diagram/JP/2022/TANK-ROOMY/M900A-GBVE/category/2/diagram/4706/illustration/47C676E","fitMode":"specific","listings":[{"vehicleId":"3ed7c48e-76f2-4024-92f5-ac291a8dff87","position":"Rear","side":"right","yearFrom":2020,"trust":"needs_checking","reason":"Custom G only (electric parking brake). X and G grades use a different part."},{"vehicleId":"007d4cad-f47f-41d1-8354-442108af3902","position":"Rear","side":"right","yearFrom":2020,"trust":"needs_checking","reason":"Custom G only (electric parking brake). X and G grades use a different part."}]}'::jsonb);
  RAISE NOTICE '47570-B1020: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN
    RAISE NOTICE '47570-B1020: already on file, skipped';
  ELSE
    RAISE;
  END IF;
END $$;

-- 2WD EPB: 47550-B1030
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"c1000002-0000-4000-8000-000000000003","brand":"Toyota","partNumber":"47550-B1030","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/catalog/toyota/diagram/JP/2022/TANK-ROOMY/M900A-GBVE/category/2/diagram/4706/illustration/47C676E","fitMode":"specific","listings":[{"vehicleId":"3ed7c48e-76f2-4024-92f5-ac291a8dff87","position":"Rear","side":"left","yearFrom":2020,"trust":"needs_checking","reason":"Custom G only (electric parking brake). X and G grades use a different part."},{"vehicleId":"007d4cad-f47f-41d1-8354-442108af3902","position":"Rear","side":"left","yearFrom":2020,"trust":"needs_checking","reason":"Custom G only (electric parking brake). X and G grades use a different part."}]}'::jsonb);
  RAISE NOTICE '47550-B1030: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN
    RAISE NOTICE '47550-B1030: already on file, skipped';
  ELSE
    RAISE;
  END IF;
END $$;

-- 2WD EPB: 04495-B2480
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"f5a10001-0000-4000-8000-000000000002","brand":"Toyota","partNumber":"04495-B2480","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/catalog/toyota/diagram/JP/2022/TANK-ROOMY/M900A-GBVE/category/2/diagram/4706/illustration/47C676E","fitMode":"specific","listings":[{"vehicleId":"3ed7c48e-76f2-4024-92f5-ac291a8dff87","position":"Rear","yearFrom":2020,"trust":"needs_checking","reason":"Custom G only (electric parking brake). X and G grades use a different part."},{"vehicleId":"007d4cad-f47f-41d1-8354-442108af3902","position":"Rear","yearFrom":2020,"trust":"needs_checking","reason":"Custom G only (electric parking brake). X and G grades use a different part."}],"name":"Rear brake shoes (2020-on, electric parking brake)"}'::jsonb);
  RAISE NOTICE '04495-B2480: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN
    RAISE NOTICE '04495-B2480: already on file, skipped';
  ELSE
    RAISE;
  END IF;
END $$;

-- 2WD EPB: 890C0-B1010
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"c1000002-0000-4000-8000-000000000007","brand":"Toyota","partNumber":"890C0-B1010","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/catalog/toyota/diagram/JP/2022/TANK-ROOMY/M900A-GBVE/category/4/diagram/8414","fitMode":"specific","listings":[{"vehicleId":"3ed7c48e-76f2-4024-92f5-ac291a8dff87","position":"Rear","side":"right","yearFrom":2020,"trust":"needs_checking","reason":"Custom G only (electric parking brake). X and G grades use a different part."},{"vehicleId":"007d4cad-f47f-41d1-8354-442108af3902","position":"Rear","side":"right","yearFrom":2020,"trust":"needs_checking","reason":"Custom G only (electric parking brake). X and G grades use a different part."}],"name":"Rear ABS wheel sensor, right (2020-on, electric parking brake)"}'::jsonb);
  RAISE NOTICE '890C0-B1010: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN
    RAISE NOTICE '890C0-B1010: already on file, skipped';
  ELSE
    RAISE;
  END IF;
END $$;

-- 2WD EPB: 890C0-B1020
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"c1000002-0000-4000-8000-000000000007","brand":"Toyota","partNumber":"890C0-B1020","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/catalog/toyota/diagram/JP/2022/TANK-ROOMY/M900A-GBVE/category/4/diagram/8414","fitMode":"specific","listings":[{"vehicleId":"3ed7c48e-76f2-4024-92f5-ac291a8dff87","position":"Rear","side":"left","yearFrom":2020,"trust":"needs_checking","reason":"Custom G only (electric parking brake). X and G grades use a different part."},{"vehicleId":"007d4cad-f47f-41d1-8354-442108af3902","position":"Rear","side":"left","yearFrom":2020,"trust":"needs_checking","reason":"Custom G only (electric parking brake). X and G grades use a different part."}],"name":"Rear ABS wheel sensor, left (2020-on, electric parking brake)"}'::jsonb);
  RAISE NOTICE '890C0-B1020: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN
    RAISE NOTICE '890C0-B1020: already on file, skipped';
  ELSE
    RAISE;
  END IF;
END $$;

-- 4WD: 90049-22332
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"c1000002-0000-4000-8000-000000000004","brand":"Toyota","partNumber":"90049-22332","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/catalog/toyota/diagram/JP/2021/TANK-ROOMY/M910A-GBVE/category/2/diagram/4708","fitMode":"specific","listings":[{"vehicleId":"ddf1d527-2c5d-4665-95e5-a097a1f30dd8","position":"Rear","side":"left","yearFrom":2020,"trust":"confirmed"},{"vehicleId":"ddf1d527-2c5d-4665-95e5-a097a1f30dd8","position":"Rear","side":"right","yearFrom":2020,"trust":"confirmed"}],"name":"Rear brake hose (2020-on 4WD)"}'::jsonb);
  RAISE NOTICE '90049-22332: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN
    RAISE NOTICE '90049-22332: already on file, skipped';
  ELSE
    RAISE;
  END IF;
END $$;

-- 4WD EPB: 47570-B1010
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"c1000002-0000-4000-8000-000000000003","brand":"Toyota","partNumber":"47570-B1010","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/catalog/toyota/diagram/JP/2021/TANK-ROOMY/M910A-GBVE/category/2/diagram/4706","fitMode":"specific","listings":[{"vehicleId":"ddf1d527-2c5d-4665-95e5-a097a1f30dd8","position":"Rear","side":"right","yearFrom":2020,"trust":"needs_checking","reason":"Custom G only (electric parking brake). X and G grades use a different part."}],"name":"Rear wheel cylinder, right (2020-on 4WD, electric parking brake)"}'::jsonb);
  RAISE NOTICE '47570-B1010: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN
    RAISE NOTICE '47570-B1010: already on file, skipped';
  ELSE
    RAISE;
  END IF;
END $$;

-- 4WD EPB: 47550-B1010
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"c1000002-0000-4000-8000-000000000003","brand":"Toyota","partNumber":"47550-B1010","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/catalog/toyota/diagram/JP/2021/TANK-ROOMY/M910A-GBVE/category/2/diagram/4706","fitMode":"specific","listings":[{"vehicleId":"ddf1d527-2c5d-4665-95e5-a097a1f30dd8","position":"Rear","side":"left","yearFrom":2020,"trust":"needs_checking","reason":"Custom G only (electric parking brake). X and G grades use a different part."}],"name":"Rear wheel cylinder, left (2020-on 4WD, electric parking brake)"}'::jsonb);
  RAISE NOTICE '47550-B1010: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN
    RAISE NOTICE '47550-B1010: already on file, skipped';
  ELSE
    RAISE;
  END IF;
END $$;

-- 4WD EPB: 04495-B2470
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"f5a10001-0000-4000-8000-000000000002","brand":"Toyota","partNumber":"04495-B2470","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/catalog/toyota/diagram/JP/2021/TANK-ROOMY/M910A-GBVE/category/2/diagram/4706","fitMode":"specific","listings":[{"vehicleId":"ddf1d527-2c5d-4665-95e5-a097a1f30dd8","position":"Rear","yearFrom":2020,"trust":"needs_checking","reason":"Custom G only (electric parking brake). X and G grades use a different part."}],"name":"Rear brake shoes (2020-on 4WD, electric parking brake)"}'::jsonb);
  RAISE NOTICE '04495-B2470: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN
    RAISE NOTICE '04495-B2470: already on file, skipped';
  ELSE
    RAISE;
  END IF;
END $$;

-- 4WD EPB: 42431-B1060
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"c1000002-0000-4000-8000-000000000002","brand":"Toyota","partNumber":"42431-B1060","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/catalog/toyota/diagram/JP/2021/TANK-ROOMY/M910A-GBVE/category/2/diagram/4102","fitMode":"specific","listings":[{"vehicleId":"ddf1d527-2c5d-4665-95e5-a097a1f30dd8","position":"Rear","yearFrom":2020,"trust":"needs_checking","reason":"Custom G only (electric parking brake). X and G grades use a different part."}],"name":"Rear brake drum (2020-on 4WD, electric parking brake)"}'::jsonb);
  RAISE NOTICE '42431-B1060: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN
    RAISE NOTICE '42431-B1060: already on file, skipped';
  ELSE
    RAISE;
  END IF;
END $$;

-- 4WD EPB: 890C0-B1030
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"c1000002-0000-4000-8000-000000000007","brand":"Toyota","partNumber":"890C0-B1030","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/catalog/toyota/diagram/JP/2021/TANK-ROOMY/M910A-GBVE/category/4/diagram/8414","fitMode":"specific","listings":[{"vehicleId":"ddf1d527-2c5d-4665-95e5-a097a1f30dd8","position":"Rear","side":"right","yearFrom":2020,"trust":"needs_checking","reason":"Custom G only (electric parking brake). X and G grades use a different part."}],"name":"Rear ABS wheel sensor, right (2020-on 4WD, electric parking brake)"}'::jsonb);
  RAISE NOTICE '890C0-B1030: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN
    RAISE NOTICE '890C0-B1030: already on file, skipped';
  ELSE
    RAISE;
  END IF;
END $$;

-- 4WD EPB: 890C0-B1040
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"c1000002-0000-4000-8000-000000000007","brand":"Toyota","partNumber":"890C0-B1040","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/catalog/toyota/diagram/JP/2021/TANK-ROOMY/M910A-GBVE/category/4/diagram/8414","fitMode":"specific","listings":[{"vehicleId":"ddf1d527-2c5d-4665-95e5-a097a1f30dd8","position":"Rear","side":"left","yearFrom":2020,"trust":"needs_checking","reason":"Custom G only (electric parking brake). X and G grades use a different part."}],"name":"Rear ABS wheel sensor, left (2020-on 4WD, electric parking brake)"}'::jsonb);
  RAISE NOTICE '890C0-B1040: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN
    RAISE NOTICE '890C0-B1040: already on file, skipped';
  ELSE
    RAISE;
  END IF;
END $$;

COMMIT;

-- Check: every 2020-on fit just saved (expect 51 rows).
SELECT c.model || ' ' || c.drivetrain || ' ' || c.engine_code AS car, pm.oem_part_number, pm.name,
       pl.position, pl.side, pl.catalogue_number AS no, pl.year_from || '-' || coalesce(pl.year_to::text, 'now') AS years, pl.trust
FROM public.part_listing pl
JOIN public.part_master pm ON pm.interchange_group_id = pl.interchange_group_id AND pm.manufacturer = 'Toyota'
JOIN public.vehicle_catalog c ON c.id = pl.vehicle_catalog_id
WHERE pl.vehicle_catalog_id IN ('3ed7c48e-76f2-4024-92f5-ac291a8dff87', '007d4cad-f47f-41d1-8354-442108af3902', 'ddf1d527-2c5d-4665-95e5-a097a1f30dd8')
  AND pm.oem_part_number IN ('04491-B1190', '47730-B1021', '47750-B1021', '43512-B1081', '90049-22289', '90049-22290', '47201-B1190', '89542-B1040', '89543-B1050', '90049-22193', '42431-B1021', '47570-B1020', '47550-B1030', '04495-B2480', '890C0-B1010', '890C0-B1020', '90049-22332', '47570-B1010', '47550-B1010', '04495-B2470', '42431-B1060', '890C0-B1030', '890C0-B1040')
ORDER BY 1, pl.trust, pl.position, pm.oem_part_number, pl.side;
