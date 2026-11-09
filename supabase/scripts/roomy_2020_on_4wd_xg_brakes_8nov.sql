-- RB-28: 2020-on 4WD Roomy X / G grades (hand lever), 1KR-FE (ddf1d527).
-- Source: Toyota's catalogue on Partsouq opened by model code M910A-GBGE (G type, 4WD, production 2020-09 to 2026-05),
-- lines marked Variant "M910..G,X" (ABS from illustration 84L855, "no electric parking brake").
-- Saved Needs checking with a grade reason, because the catalogue row also covers Custom G cars.
-- Also renames the two 2020-on 4WD wheel cylinders without a side (they swap sides by grade).
-- All-or-nothing. Running it twice changes nothing.

BEGIN;

UPDATE public.part_master SET name = 'Rear wheel cylinder (2020-on 4WD)', updated_at = now()
WHERE manufacturer = 'Toyota' AND oem_part_number IN ('47550-B1010', '47570-B1010');

-- X/G 4WD: 47550-B1010
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"c1000002-0000-4000-8000-000000000003","brand":"Toyota","partNumber":"47550-B1010","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/catalog/toyota/diagram/JP/2022/TANK-ROOMY/M910A-GBGE/category/2/diagram/4706","fitMode":"specific","listings":[{"vehicleId":"ddf1d527-2c5d-4665-95e5-a097a1f30dd8","position":"Rear","side":"right","yearFrom":2020,"trust":"needs_checking","reason":"X and G grades only (hand lever): this side. On Custom G this cylinder sits on the other side."}]}'::jsonb);
  RAISE NOTICE '47550-B1010: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN RAISE NOTICE '47550-B1010: already on file, skipped'; ELSE RAISE; END IF;
END $$;

-- X/G 4WD: 47570-B1010
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"c1000002-0000-4000-8000-000000000003","brand":"Toyota","partNumber":"47570-B1010","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/catalog/toyota/diagram/JP/2022/TANK-ROOMY/M910A-GBGE/category/2/diagram/4706","fitMode":"specific","listings":[{"vehicleId":"ddf1d527-2c5d-4665-95e5-a097a1f30dd8","position":"Rear","side":"left","yearFrom":2020,"trust":"needs_checking","reason":"X and G grades only (hand lever): this side. On Custom G this cylinder sits on the other side."}]}'::jsonb);
  RAISE NOTICE '47570-B1010: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN RAISE NOTICE '47570-B1010: already on file, skipped'; ELSE RAISE; END IF;
END $$;

-- X/G 4WD: 04495-B5080
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"f5a10001-0000-4000-8000-000000000002","brand":"Toyota","partNumber":"04495-B5080","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/catalog/toyota/diagram/JP/2022/TANK-ROOMY/M910A-GBGE/category/2/diagram/4706","fitMode":"specific","listings":[{"vehicleId":"ddf1d527-2c5d-4665-95e5-a097a1f30dd8","position":"Rear","yearFrom":2020,"trust":"needs_checking","reason":"X and G grades only (hand lever). Custom G has the electric parking brake and uses a different part."}],"name":"Rear brake shoes (2020-on 4WD, hand lever)"}'::jsonb);
  RAISE NOTICE '04495-B5080: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN RAISE NOTICE '04495-B5080: already on file, skipped'; ELSE RAISE; END IF;
END $$;

-- X/G 4WD: 42431-B5020
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"c1000002-0000-4000-8000-000000000002","brand":"Toyota","partNumber":"42431-B5020","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/catalog/toyota/diagram/JP/2022/TANK-ROOMY/M910A-GBGE/category/2/diagram/4102","fitMode":"specific","listings":[{"vehicleId":"ddf1d527-2c5d-4665-95e5-a097a1f30dd8","position":"Rear","yearFrom":2020,"trust":"needs_checking","reason":"X and G grades only (hand lever). Custom G has the electric parking brake and uses a different part."}],"name":"Rear brake drum (2020-on 4WD, hand lever)"}'::jsonb);
  RAISE NOTICE '42431-B5020: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN RAISE NOTICE '42431-B5020: already on file, skipped'; ELSE RAISE; END IF;
END $$;

-- X/G 4WD: 46410-B1011
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"c1000002-0000-4000-8000-000000000006","brand":"Toyota","partNumber":"46410-B1011","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/catalog/toyota/diagram/JP/2022/TANK-ROOMY/M910A-GBGE/category/2/diagram/4601","fitMode":"specific","listings":[{"vehicleId":"ddf1d527-2c5d-4665-95e5-a097a1f30dd8","position":"Front","catalogueNumber":1,"yearFrom":2020,"trust":"needs_checking","reason":"X and G grades only (hand lever). Custom G has the electric parking brake and uses a different part."}]}'::jsonb);
  RAISE NOTICE '46410-B1011: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN RAISE NOTICE '46410-B1011: already on file, skipped'; ELSE RAISE; END IF;
END $$;

-- X/G 4WD: 46420-B1150
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"c1000002-0000-4000-8000-000000000006","brand":"Toyota","partNumber":"46420-B1150","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/catalog/toyota/diagram/JP/2022/TANK-ROOMY/M910A-GBGE/category/2/diagram/4601","fitMode":"specific","listings":[{"vehicleId":"ddf1d527-2c5d-4665-95e5-a097a1f30dd8","position":"Rear","catalogueNumber":2,"yearFrom":2020,"trust":"needs_checking","reason":"X and G grades only (hand lever). Custom G has the electric parking brake and uses a different part."}],"name":"Rear handbrake cable No.2 (2020-on 4WD)"}'::jsonb);
  RAISE NOTICE '46420-B1150: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN RAISE NOTICE '46420-B1150: already on file, skipped'; ELSE RAISE; END IF;
END $$;

-- X/G 4WD: 46430-B1150
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"c1000002-0000-4000-8000-000000000006","brand":"Toyota","partNumber":"46430-B1150","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/catalog/toyota/diagram/JP/2022/TANK-ROOMY/M910A-GBGE/category/2/diagram/4601","fitMode":"specific","listings":[{"vehicleId":"ddf1d527-2c5d-4665-95e5-a097a1f30dd8","position":"Rear","catalogueNumber":3,"yearFrom":2020,"trust":"needs_checking","reason":"X and G grades only (hand lever). Custom G has the electric parking brake and uses a different part."}],"name":"Rear handbrake cable No.3 (2020-on 4WD)"}'::jsonb);
  RAISE NOTICE '46430-B1150: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN RAISE NOTICE '46430-B1150: already on file, skipped'; ELSE RAISE; END IF;
END $$;

-- X/G 4WD: 89545-B1100
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"c1000002-0000-4000-8000-000000000007","brand":"Toyota","partNumber":"89545-B1100","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/catalog/toyota/diagram/JP/2022/TANK-ROOMY/M910A-GBGE/category/4/diagram/8414/illustration/84L855","fitMode":"specific","listings":[{"vehicleId":"ddf1d527-2c5d-4665-95e5-a097a1f30dd8","position":"Rear","side":"right","yearFrom":2020,"trust":"needs_checking","reason":"X and G grades only (hand lever). Custom G has the electric parking brake and uses a different part."}]}'::jsonb);
  RAISE NOTICE '89545-B1100: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN RAISE NOTICE '89545-B1100: already on file, skipped'; ELSE RAISE; END IF;
END $$;

-- X/G 4WD: 89546-B1100
DO $$
BEGIN
  PERFORM public.save_self_serve_part('{"actorId":"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823","partTypeId":"c1000002-0000-4000-8000-000000000007","brand":"Toyota","partNumber":"89546-B1100","sourceType":"car_maker_catalogue","partKind":"oem","catalogCarMaker":"Toyota","evidenceUrl":"https://partsouq.com/en/catalog/toyota/diagram/JP/2022/TANK-ROOMY/M910A-GBGE/category/4/diagram/8414/illustration/84L855","fitMode":"specific","listings":[{"vehicleId":"ddf1d527-2c5d-4665-95e5-a097a1f30dd8","position":"Rear","side":"left","yearFrom":2020,"trust":"needs_checking","reason":"X and G grades only (hand lever). Custom G has the electric parking brake and uses a different part."}]}'::jsonb);
  RAISE NOTICE '89546-B1100: saved';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'Nothing new to save%' THEN RAISE NOTICE '89546-B1100: already on file, skipped'; ELSE RAISE; END IF;
END $$;

COMMIT;

-- Check (expect 9 rows, all needs_checking with the X / G reason).
SELECT pm.oem_part_number, pm.name, pl.position, pl.side, pl.catalogue_number AS no, pl.trust, left(pl.trust_reason, 40) AS reason
FROM public.part_listing pl
JOIN public.part_master pm ON pm.interchange_group_id = pl.interchange_group_id AND pm.manufacturer = 'Toyota'
WHERE pl.vehicle_catalog_id = 'ddf1d527-2c5d-4665-95e5-a097a1f30dd8' AND pl.trust_reason LIKE 'X and G grades only%'
ORDER BY pl.position, pm.oem_part_number;
