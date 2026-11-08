-- RB-27 (part 2): 2020-on 2WD Roomy X / G grades (hand lever), 1KR-FE (3ed7c48e).
-- Source: Toyota's catalogue on Partsouq, frame M900A-0571644 (2021, grade X): Variant "M900..G,X".
-- These parts are the same numbers as the 2016-2020 / 2019-2020 2WD; they now also fit the 2020-on X / G.
-- Saved Needs checking with a grade reason, because the catalogue row also covers Custom G cars.
-- All-or-nothing. Running it twice changes nothing.

BEGIN;

-- X/G: 47550-B1030
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"c1000002-0000-4000-8000-000000000003","brand":"Toyota","partNumber":"47550-B1030","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/search/all?q=M900A-0571644","fitMode":"specific","listings":[{"vehicleId":"3ed7c48e-76f2-4024-92f5-ac291a8dff87","position":"Rear","side":"right","yearFrom":2020,"trust":"needs_checking","reason":"X and G grades only (hand lever): this side. On Custom G this cylinder sits on the other side."}]}'::jsonb);
  RAISE NOTICE '47550-B1030: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN RAISE NOTICE '47550-B1030: already on file, skipped'; ELSE RAISE; END IF;
END $$;

-- X/G: 47570-B1020
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"c1000002-0000-4000-8000-000000000003","brand":"Toyota","partNumber":"47570-B1020","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/search/all?q=M900A-0571644","fitMode":"specific","listings":[{"vehicleId":"3ed7c48e-76f2-4024-92f5-ac291a8dff87","position":"Rear","side":"left","yearFrom":2020,"trust":"needs_checking","reason":"X and G grades only (hand lever): this side. On Custom G this cylinder sits on the other side."}]}'::jsonb);
  RAISE NOTICE '47570-B1020: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN RAISE NOTICE '47570-B1020: already on file, skipped'; ELSE RAISE; END IF;
END $$;

-- X/G: 04495-B2430
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"f5a10001-0000-4000-8000-000000000002","brand":"Toyota","partNumber":"04495-B2430","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/search/all?q=M900A-0571644","fitMode":"specific","listings":[{"vehicleId":"3ed7c48e-76f2-4024-92f5-ac291a8dff87","position":"Rear","yearFrom":2020,"trust":"needs_checking","reason":"X and G grades only (hand lever). Custom G has the electric parking brake and uses a different part."}]}'::jsonb);
  RAISE NOTICE '04495-B2430: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN RAISE NOTICE '04495-B2430: already on file, skipped'; ELSE RAISE; END IF;
END $$;

-- X/G: 46410-B1011
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"c1000002-0000-4000-8000-000000000006","brand":"Toyota","partNumber":"46410-B1011","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/search/all?q=M900A-0571644","fitMode":"specific","listings":[{"vehicleId":"3ed7c48e-76f2-4024-92f5-ac291a8dff87","position":"Front","catalogueNumber":1,"yearFrom":2020,"trust":"needs_checking","reason":"X and G grades only (hand lever). Custom G has the electric parking brake and uses a different part."}]}'::jsonb);
  RAISE NOTICE '46410-B1011: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN RAISE NOTICE '46410-B1011: already on file, skipped'; ELSE RAISE; END IF;
END $$;

-- X/G: 46420-B1090
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"c1000002-0000-4000-8000-000000000006","brand":"Toyota","partNumber":"46420-B1090","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/search/all?q=M900A-0571644","fitMode":"specific","listings":[{"vehicleId":"3ed7c48e-76f2-4024-92f5-ac291a8dff87","position":"Rear","catalogueNumber":2,"yearFrom":2020,"trust":"needs_checking","reason":"X and G grades only (hand lever). Custom G has the electric parking brake and uses a different part."}]}'::jsonb);
  RAISE NOTICE '46420-B1090: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN RAISE NOTICE '46420-B1090: already on file, skipped'; ELSE RAISE; END IF;
END $$;

-- X/G: 46430-B1090
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"c1000002-0000-4000-8000-000000000006","brand":"Toyota","partNumber":"46430-B1090","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/search/all?q=M900A-0571644","fitMode":"specific","listings":[{"vehicleId":"3ed7c48e-76f2-4024-92f5-ac291a8dff87","position":"Rear","catalogueNumber":3,"yearFrom":2020,"trust":"needs_checking","reason":"X and G grades only (hand lever). Custom G has the electric parking brake and uses a different part."}]}'::jsonb);
  RAISE NOTICE '46430-B1090: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN RAISE NOTICE '46430-B1090: already on file, skipped'; ELSE RAISE; END IF;
END $$;

COMMIT;

-- Check (expect 6 rows, all needs_checking with the X / G reason).
SELECT pm.oem_part_number, pm.name, pl.position, pl.side, pl.catalogue_number AS no, pl.trust, pl.trust_reason
FROM public.part_listing pl
JOIN public.part_master pm ON pm.interchange_group_id = pl.interchange_group_id AND pm.manufacturer = 'Toyota'
WHERE pl.vehicle_catalog_id = '3ed7c48e-76f2-4024-92f5-ac291a8dff87' AND pl.trust_reason LIKE 'X and G grades only%'
ORDER BY pl.position, pm.oem_part_number;
