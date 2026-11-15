-- Double-log rule on jobs that were already live (15 Nov 2026). Description text only; nothing else changes.
-- Rule: a fluid used to refill a replaced part is logged on the part job, not on the separate fluid service.
-- Paste ALL into the Supabase SQL editor (live project) and Run. Safe to run again (each note is added once).
-- The list came from live: every active job offering Engine Oil, Coolant / Antifreeze, Brake Fluid or
-- Transmission Fluid. Oil filter is left out on purpose: it goes WITH an oil change, and its May-need note
-- already says "When the oil is not logged as its own job."
--
-- Snapshot check (the reviewer's before/after diff): the last query must show changed_other = 0 and
-- part_jobs_with_note = 17, fluid_services_with_note = 7.

BEGIN;

DROP TABLE IF EXISTS dl_before;
CREATE TEMP TABLE dl_before AS
SELECT id, code, md5(coalesce(description, '')) AS d, md5(coalesce(name, '') || coalesce(editor_hint, '') || coalesce(status, '')) AS other
FROM public.maintenance_service_categories;

-- 17 part / repair jobs that refill a fluid
UPDATE public.maintenance_service_categories
SET description = coalesce(description, '') ||
  ' Oil, coolant or brake fluid used to refill after this job is logged here; don''t also log a separate oil change, coolant or brake-fluid service for the same visit.'
WHERE code IN ('brake_caliper','brake_hose','brake_master_cylinder','brake_wheel_cylinder',
               'rod_bearings','main_bearings','engine_overhaul','head_gasket','walnut_blasting','oil_pan_gasket',
               'piston_replacement','piston_rings','thermostat','timing_belt','timing_chain','valve_stem_seals','water_pump')
  AND coalesce(description, '') NOT LIKE '%don''t also log a separate oil change%';

-- 7 fluid services
UPDATE public.maintenance_service_categories
SET description = coalesce(description, '') ||
  ' If a part that holds this fluid is replaced in the same visit (for example a water pump, brake caliper or oil pan gasket), log the fluid on that part''s job instead; don''t log both.'
WHERE code IN ('brake_fluid','oil','engine_oil_part','coolant_part','coolant_flush','fluids','transmission')
  AND coalesce(description, '') NOT LIKE '%log the fluid on that part''s job instead%';

COMMIT;

-- Check
SELECT
  (SELECT count(*) FROM public.maintenance_service_categories c JOIN dl_before b ON b.id = c.id
    WHERE (b.d <> md5(coalesce(c.description, '')) AND c.code NOT IN (
      'brake_caliper','brake_hose','brake_master_cylinder','brake_wheel_cylinder','rod_bearings','main_bearings',
      'engine_overhaul','head_gasket','walnut_blasting','oil_pan_gasket','piston_replacement','piston_rings',
      'thermostat','timing_belt','timing_chain','valve_stem_seals','water_pump',
      'brake_fluid','oil','engine_oil_part','coolant_part','coolant_flush','fluids','transmission'))
       OR b.other <> md5(coalesce(c.name, '') || coalesce(c.editor_hint, '') || coalesce(c.status, ''))) AS changed_other,
  (SELECT count(*) FROM public.maintenance_service_categories WHERE description LIKE '%don''t also log a separate oil change%') AS part_jobs_with_note,
  (SELECT count(*) FROM public.maintenance_service_categories WHERE description LIKE '%log the fluid on that part''s job instead%') AS fluid_services_with_note;

