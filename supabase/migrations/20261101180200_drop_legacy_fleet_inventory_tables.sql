-- Drop legacy fleet.inventory / fleet.equipment after inv_* cutover (R5-11 / final release only).

DROP VIEW IF EXISTS public.fleet_inventory;
DROP VIEW IF EXISTS public.fleet_equipment;

DROP TABLE IF EXISTS fleet.inventory;
DROP TABLE IF EXISTS fleet.equipment;
