-- Double-log rule on jobs that were already live (Rev 2, 15 Nov 2026). Job DESCRIPTION text only, APPENDED
-- (never replaced); targets are matched by job CODE, not by name. Nothing else changes.
-- Rule: a fluid used to refill a replaced part is logged on the part job, not on the separate fluid service.
-- Paste ALL into the Supabase SQL editor (live project) and Run. Safe to run again (each note is added once).
--
-- Targets: 20 jobs that refill a fluid (18 part jobs + 2 services: Engine Overhaul, Walnut Blasting) and
-- 8 fluid services = 28. Not targeted on purpose: Oil filter (it goes WITH an oil change; its link note
-- already says so), and the 4 pairs that already have their own note (Battery Coolant Pump / Battery Thermal
-- Management Coolant Service, Inverter Coolant Pump / Inverter Coolant Service, Electric A/C Compressor /
-- A/C Recharge).
--
-- Extraction query used to build the list (run it to reproduce; six fluids):
--   SELECT j.code, j.name, j.is_part, string_agg(s.name || ' (' || x.need || ')', '; ') AS fluids,
--          (j.description ILIKE '%log both%' OR j.description ILIKE '%also log%') AS has_note
--   FROM public.maintenance_job_item x
--   JOIN public.maintenance_supply s ON s.id = x.supply_id
--   JOIN public.maintenance_service_categories j ON j.id = x.job_id
--   WHERE x.removed_at IS NULL AND j.status = 'active'
--     AND s.name IN ('Engine Oil','Coolant / Antifreeze','Brake Fluid','Transmission Fluid',
--                    'EV Battery Coolant','EV Reduction Gear Oil','Hybrid Inverter Coolant (Low-Conductivity)')
--   GROUP BY j.code, j.name, j.is_part, j.description ORDER BY j.code;
--
-- Checks (last query): changed_other = 0 (no other row touched), not_appended = 0 (every target still starts
-- with its old text), refill_jobs_with_note = 20, fluid_services_with_note = 8.

BEGIN;

DROP TABLE IF EXISTS dl_before;
CREATE TEMP TABLE dl_before AS
SELECT id, code, coalesce(description, '') AS d,
       md5(coalesce(name, '') || coalesce(editor_hint, '') || coalesce(status, '') || coalesce(is_part::text, '')) AS other
FROM public.maintenance_service_categories;

DROP TABLE IF EXISTS dl_targets;
CREATE TEMP TABLE dl_targets (code text PRIMARY KEY, kind text NOT NULL);
INSERT INTO dl_targets VALUES
  -- refill jobs (18 part jobs)
  ('brake_caliper','refill'), ('brake_hose','refill'), ('brake_master_cylinder','refill'), ('brake_wheel_cylinder','refill'),
  ('head_gasket','refill'), ('oil_pan_gasket','refill'), ('timing_chain','refill'), ('timing_belt','refill'),
  ('thermostat','refill'), ('water_pump','refill'), ('piston_rings','refill'), ('piston_replacement','refill'),
  ('rod_bearings','refill'), ('main_bearings','refill'), ('valve_stem_seals','refill'),
  ('ev_onboard_charger','refill'), ('ev_dc_dc_converter','refill'), ('ev_traction_motor','refill'),
  -- refill jobs (2 services)
  ('engine_overhaul','refill'), ('walnut_blasting','refill'),
  -- fluid services (8)
  ('brake_fluid','fluid'), ('oil','fluid'), ('engine_oil_part','fluid'), ('coolant_part','fluid'),
  ('coolant_flush','fluid'), ('fluids','fluid'), ('transmission','fluid'), ('ev_reduction_gear_oil','fluid');

UPDATE public.maintenance_service_categories c
SET description = coalesce(c.description, '') ||
  ' Fluid used to refill after this job (oil, coolant, brake fluid or gear oil) is logged here; don''t also log a separate fluid service for the same visit.'
FROM dl_targets t
WHERE t.code = c.code AND t.kind = 'refill'
  AND coalesce(c.description, '') NOT LIKE '%don''t also log a separate fluid service%';

UPDATE public.maintenance_service_categories c
SET description = coalesce(c.description, '') ||
  ' If a part that holds this fluid is replaced in the same visit (for example a water pump, brake caliper, oil pan gasket or traction motor), log the fluid on that part''s job instead; don''t log both.'
FROM dl_targets t
WHERE t.code = c.code AND t.kind = 'fluid'
  AND coalesce(c.description, '') NOT LIKE '%log the fluid on that part''s job instead%';

-- Safety: if any check is wrong, stop here. The error undoes EVERYTHING above, so nothing is saved.
DO $chk$
DECLARE other_n int; lost_n int; refill_n int; fluid_n int;
BEGIN
  SELECT count(*) INTO other_n FROM public.maintenance_service_categories c JOIN dl_before b ON b.id = c.id
    WHERE (b.d <> coalesce(c.description, '') AND c.code NOT IN (SELECT code FROM dl_targets))
       OR b.other <> md5(coalesce(c.name, '') || coalesce(c.editor_hint, '') || coalesce(c.status, '') || coalesce(c.is_part::text, ''));
  SELECT count(*) INTO lost_n FROM public.maintenance_service_categories c JOIN dl_before b ON b.id = c.id
    JOIN dl_targets t ON t.code = c.code WHERE position(b.d IN coalesce(c.description, '')) <> 1;
  SELECT count(*) INTO refill_n FROM public.maintenance_service_categories WHERE description LIKE '%don''t also log a separate fluid service%';
  SELECT count(*) INTO fluid_n FROM public.maintenance_service_categories WHERE description LIKE '%log the fluid on that part''s job instead%';
  IF other_n <> 0 OR lost_n <> 0 OR refill_n <> 20 OR fluid_n <> 8 THEN
    RAISE EXCEPTION 'Stopped, nothing saved: changed_other=%, not_appended=%, refill=% (want 20), fluid=% (want 8)', other_n, lost_n, refill_n, fluid_n;
  END IF;
END $chk$;

COMMIT;

-- Checks
SELECT
  (SELECT count(*) FROM public.maintenance_service_categories c JOIN dl_before b ON b.id = c.id
    WHERE (b.d <> coalesce(c.description, '') AND c.code NOT IN (SELECT code FROM dl_targets))
       OR b.other <> md5(coalesce(c.name, '') || coalesce(c.editor_hint, '') || coalesce(c.status, '') || coalesce(c.is_part::text, ''))
  ) AS changed_other,
  (SELECT count(*) FROM public.maintenance_service_categories c JOIN dl_before b ON b.id = c.id
    JOIN dl_targets t ON t.code = c.code
    WHERE position(b.d IN coalesce(c.description, '')) <> 1) AS not_appended,
  (SELECT count(*) FROM public.maintenance_service_categories WHERE description LIKE '%don''t also log a separate fluid service%') AS refill_jobs_with_note,
  (SELECT count(*) FROM public.maintenance_service_categories WHERE description LIKE '%log the fluid on that part''s job instead%') AS fluid_services_with_note;
