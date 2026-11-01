-- Drop legacy fleet.inventory / fleet.equipment after inv_* cutover (R5-11 / final release only).

DROP VIEW IF EXISTS public.fleet_inventory;
DROP VIEW IF EXISTS public.fleet_equipment;
DROP VIEW IF EXISTS public.fleet_inv_inventory;
DROP VIEW IF EXISTS public.fleet_inv_equipment;

DROP TABLE IF EXISTS fleet.inventory CASCADE;
DROP TABLE IF EXISTS fleet.equipment CASCADE;
