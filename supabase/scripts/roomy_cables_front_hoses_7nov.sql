-- One-shot: 5 Toyota genuine handbrake cables + front brake hoses (Roomy pre-facelift + Tank 1st Gen).
-- Run in Supabase SQL Editor on live AFTER migration 20261107213549_part_position_catalogue_number.sql.
-- All-or-nothing: BEGIN/COMMIT. If one save fails, none are kept.

BEGIN;

SELECT public.save_self_serve_part(jsonb_build_object(
  'actorId', '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823',
  'partTypeId', 'c1000002-0000-4000-8000-000000000006',
  'brand', 'Toyota',
  'partNumber', '46410-B1011',
  'sourceType', 'car_maker_catalogue',
  'partKind', 'oem',
  'catalogCarMaker', 'Toyota',
  'evidenceUrl', 'https://partsouq.com/en/catalog/toyota/diagram/JP/2019/TANK-ROOMY/M900A-AGBGE/category/2/diagram/4601/illustration/461556B',
  'fitMode', 'specific',
  'listings', jsonb_build_array(
    jsonb_build_object(
      'vehicleId', '3cd9cbf3-a804-4817-82db-400cf6abf13a',
      'position', 'Front',
      'catalogueNumber', 1,
      'yearFrom', 2016,
      'yearTo', 2020,
      'trust', 'confirmed'
    ),
    jsonb_build_object(
      'vehicleId', 'a72af492-48f6-420f-92b3-69452f01c186',
      'position', 'Front',
      'catalogueNumber', 1,
      'yearFrom', 2016,
      'yearTo', 2020,
      'trust', 'confirmed'
    )
  )
));

SELECT public.save_self_serve_part(jsonb_build_object(
  'actorId', '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823',
  'partTypeId', 'c1000002-0000-4000-8000-000000000006',
  'brand', 'Toyota',
  'partNumber', '46420-B1090',
  'sourceType', 'car_maker_catalogue',
  'partKind', 'oem',
  'catalogCarMaker', 'Toyota',
  'evidenceUrl', 'https://partsouq.com/en/catalog/toyota/diagram/JP/2019/TANK-ROOMY/M900A-AGBGE/category/2/diagram/4601/illustration/461556B',
  'fitMode', 'specific',
  'listings', jsonb_build_array(
    jsonb_build_object(
      'vehicleId', '3cd9cbf3-a804-4817-82db-400cf6abf13a',
      'position', 'Rear',
      'catalogueNumber', 2,
      'yearFrom', 2016,
      'yearTo', 2020,
      'trust', 'confirmed'
    ),
    jsonb_build_object(
      'vehicleId', 'a72af492-48f6-420f-92b3-69452f01c186',
      'position', 'Rear',
      'catalogueNumber', 2,
      'yearFrom', 2016,
      'yearTo', 2020,
      'trust', 'confirmed'
    )
  )
));

SELECT public.save_self_serve_part(jsonb_build_object(
  'actorId', '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823',
  'partTypeId', 'c1000002-0000-4000-8000-000000000006',
  'brand', 'Toyota',
  'partNumber', '46430-B1090',
  'sourceType', 'car_maker_catalogue',
  'partKind', 'oem',
  'catalogCarMaker', 'Toyota',
  'evidenceUrl', 'https://partsouq.com/en/catalog/toyota/diagram/JP/2019/TANK-ROOMY/M900A-AGBGE/category/2/diagram/4601/illustration/461556B',
  'fitMode', 'specific',
  'listings', jsonb_build_array(
    jsonb_build_object(
      'vehicleId', '3cd9cbf3-a804-4817-82db-400cf6abf13a',
      'position', 'Rear',
      'catalogueNumber', 3,
      'yearFrom', 2016,
      'yearTo', 2020,
      'trust', 'confirmed'
    ),
    jsonb_build_object(
      'vehicleId', 'a72af492-48f6-420f-92b3-69452f01c186',
      'position', 'Rear',
      'catalogueNumber', 3,
      'yearFrom', 2016,
      'yearTo', 2020,
      'trust', 'confirmed'
    )
  )
));

SELECT public.save_self_serve_part(jsonb_build_object(
  'actorId', '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823',
  'partTypeId', 'c1000002-0000-4000-8000-000000000004',
  'brand', 'Toyota',
  'partNumber', '90049-22289',
  'sourceType', 'car_maker_catalogue',
  'partKind', 'oem',
  'catalogCarMaker', 'Toyota',
  'evidenceUrl', 'https://partsouq.com/en/catalog/toyota/diagram/JP/2019/TANK-ROOMY/M900A-AGBGE/category/2/diagram/4708/illustration/47A574D',
  'fitMode', 'specific',
  'listings', jsonb_build_array(
    jsonb_build_object(
      'vehicleId', '3cd9cbf3-a804-4817-82db-400cf6abf13a',
      'position', 'Front',
      'catalogueNumber', 1,
      'yearFrom', 2016,
      'yearTo', 2020,
      'trust', 'confirmed'
    ),
    jsonb_build_object(
      'vehicleId', 'a72af492-48f6-420f-92b3-69452f01c186',
      'position', 'Front',
      'catalogueNumber', 1,
      'yearFrom', 2016,
      'yearTo', 2020,
      'trust', 'confirmed'
    )
  )
));

SELECT public.save_self_serve_part(jsonb_build_object(
  'actorId', '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823',
  'partTypeId', 'c1000002-0000-4000-8000-000000000004',
  'brand', 'Toyota',
  'partNumber', '90049-22290',
  'sourceType', 'car_maker_catalogue',
  'partKind', 'oem',
  'catalogCarMaker', 'Toyota',
  'evidenceUrl', 'https://partsouq.com/en/catalog/toyota/diagram/JP/2019/TANK-ROOMY/M900A-AGBGE/category/2/diagram/4708/illustration/47A574D',
  'fitMode', 'specific',
  'listings', jsonb_build_array(
    jsonb_build_object(
      'vehicleId', '3cd9cbf3-a804-4817-82db-400cf6abf13a',
      'position', 'Front',
      'catalogueNumber', 2,
      'yearFrom', 2016,
      'yearTo', 2020,
      'trust', 'confirmed'
    ),
    jsonb_build_object(
      'vehicleId', 'a72af492-48f6-420f-92b3-69452f01c186',
      'position', 'Front',
      'catalogueNumber', 2,
      'yearFrom', 2016,
      'yearTo', 2020,
      'trust', 'confirmed'
    )
  )
));

COMMIT;

SELECT pm.oem_part_number AS part_number,
       pm.name,
       pl.position,
       pl.catalogue_number AS catalogue_no,
       pl.trust
FROM public.part_master pm
JOIN public.part_listing pl ON pl.interchange_group_id = pm.interchange_group_id
WHERE pm.oem_part_number IN (
  '46410-B1011',
  '46420-B1090',
  '46430-B1090',
  '90049-22289',
  '90049-22290'
)
ORDER BY pm.oem_part_number, pl.vehicle_catalog_id;
