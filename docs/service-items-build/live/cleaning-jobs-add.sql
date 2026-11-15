-- Cleaning jobs (owner-reviewed list: docs/service-items-build/cleaning-jobs-suggestions.md, 15 Nov 2026).
-- Paste ALL into the Supabase SQL editor (live project) and Run. Safe to run again: anything that
-- already exists is skipped. The checks at the bottom should come back empty.
--
-- Step 1: 5 new supplies. Step 2: 10 new cleaning jobs. Step 3: Engine jobs go into their Engine
-- section (existing sections, nothing new created). Step 4: 20 May-need links on the new jobs, plus
-- 9 extras on existing jobs.
-- Rev 2 (15 Nov): carbon job is walnut blasting only (chemical method = existing Induction Service job).

BEGIN;

-- Step 1 — new supplies
INSERT INTO public.maintenance_supply (name, description, unit_id, icon_key)
SELECT v.name, v.description, u.id, v.icon_key
FROM (VALUES
  ('EGR & Carbon Cleaner', 'Strong spray cleaner for carbon on the EGR valve, EGR passages and turbo; stronger than throttle body cleaner.', 'can', 'wind'),
  ('Walnut Blasting Media', 'Crushed walnut shell blasted onto intake valves to scrub off carbon (direct-injection engines).', 'pack', 'wind'),
  ('A/C Evaporator Cleaner Foam', 'Foam pushed into the A/C evaporator to clean out mould and the musty smell.', 'can', 'wind'),
  ('A/C Disinfectant Fogger', 'Fogger run inside the car with the A/C on to disinfect the vents and ducts.', 'can', 'wind'),
  ('Battery Terminal Cleaner', 'Spray that dissolves corrosion on battery posts and clamps (works like baking soda and water).', 'can', 'spark')
) AS v(name, description, unit_code, icon_key)
JOIN public.maintenance_unit u ON u.code = v.unit_code
WHERE NOT EXISTS (
  SELECT 1 FROM public.maintenance_supply s
  WHERE lower(s.name) = lower(v.name) AND s.status = 'active'
);

-- Step 2 — new cleaning jobs (services, not parts: never in Find parts; Log service asks for labor only,
-- the supplies carry the material cost — same as Throttle Body Cleaning).
INSERT INTO public.maintenance_service_categories (
  code, name, plain_name, description, icon_key, field_schema, quick_job_eligible, sort_order,
  parent_id, kind, op_code, position_aware, is_part, part_type_status, position_scheme, status, default_action
)
SELECT j.code, j.name, j.name, j.description, j.icon_key,
       '{"fields":[{"key":"labor","type":"number","label":"Labor","required":false}]}'::jsonb,
       true, j.sort_order, sys.id, 'component', j.op_code, false, false, 'active', 'none', 'active', 'clean'
FROM (VALUES
  ('egr_cleaning', 'EGR Valve Cleaning', 'sys_engine', 'ENG-EGR', 'wind', 1100,
   'Cleaning carbon off the EGR valve and its passages so it doesn''t stick. A stuck EGR valve causes rough idle and a check-engine light.'),
  ('walnut_blasting', 'Intake Valve Carbon Cleaning (Walnut Blasting)', 'sys_engine', 'ENG-WALNUT', 'wind', 1110,
   'Blasting crushed walnut shell onto the intake valves to scrub off carbon. Needed on direct-injection engines; brings back lost power and smooth running. The spray-in chemical method is the Fuel Injector Cleaning / Induction Service job.'),
  ('maf_map_sensor_cleaning', 'MAF / MAP Sensor Cleaning', 'sys_engine', 'ENG-MAF', 'wind', 1120,
   'Cleaning the air flow and air pressure sensors so the engine mixes fuel and air correctly. Often done with an air filter change.'),
  ('engine_bay_degreasing', 'Engine Bay Degreasing', 'sys_engine', 'ENG-BAY', 'oil', 1130,
   'Washing oil, grease and dirt off the engine and engine bay so leaks are easy to spot and work is easier.'),
  ('carburetor_cleaning', 'Carburetor Cleaning', 'sys_engine', 'ENG-CARBY', 'droplet', 1140,
   'Taking the carburetor apart and cleaning out varnish and dirt. Only for older engines that have a carburetor.'),
  ('intercooler_cleaning', 'Intercooler Cleaning', 'sys_engine', 'ENG-ICC', 'wind', 1150,
   'Cleaning oil and carbon out of the intercooler so it cools the air going into a turbo engine.'),
  ('turbo_decoking', 'Turbo Decoking', 'sys_engine', 'ENG-TURBO', 'wind', 1160,
   'Cleaning carbon out of the turbocharger so it builds full boost again. Only for turbo engines.'),
  ('ac_evaporator_cleaning', 'A/C Evaporator Cleaning', 'sys_hvac', 'HVAC-EVAP', 'wind', 100,
   'Cleaning mould and bacteria out of the A/C evaporator, which stops the musty smell from the vents.'),
  ('ac_disinfection', 'A/C Vent Disinfection', 'sys_hvac', 'HVAC-DISINF', 'wind', 110,
   'Fogging the A/C system to disinfect the vents and ducts.'),
  ('battery_terminal_cleaning', 'Battery Terminal Cleaning', 'sys_electrical', 'ELEC-TERM', 'spark', 100,
   'Cleaning corrosion off the battery posts and clamps, then spraying on a protector. Fixes slow starts caused by a bad connection.')
) AS j(code, name, sys_code, op_code, icon_key, sort_order, description)
JOIN public.maintenance_service_categories sys ON sys.code = j.sys_code
ON CONFLICT (code) DO NOTHING;

-- Step 3 — Engine cleaning jobs go into their Engine section
INSERT INTO public.maintenance_job_section_members (section_id, category_id, sort_order)
SELECT s.id, c.id, m.sort_order
FROM (VALUES
  ('eng_air_intake', 'maf_map_sensor_cleaning', 100),
  ('eng_air_intake', 'walnut_blasting', 110),
  ('eng_air_intake', 'intercooler_cleaning', 120),
  ('eng_air_intake', 'turbo_decoking', 130),
  ('eng_fuel', 'carburetor_cleaning', 100),
  ('eng_fluids', 'egr_cleaning', 100),
  ('eng_fluids', 'engine_bay_degreasing', 110)
) AS m(section_code, job_code, sort_order)
JOIN public.maintenance_job_sections s ON s.code = m.section_code
JOIN public.maintenance_service_categories c ON c.code = m.job_code
WHERE NOT EXISTS (
  SELECT 1 FROM public.maintenance_job_section_members x WHERE x.category_id = c.id
);

-- Step 4 — May-need supplies
WITH wanted (job_code, supply_name, need, qty_hint, note, sort_order) AS (VALUES
  -- new jobs
  ('egr_cleaning', 'EGR & Carbon Cleaner', 'usually', 1::numeric, NULL, 10),
  ('egr_cleaning', 'Penetrating Oil', 'sometimes', 1::numeric, 'For seized bolts.', 20),
  ('egr_cleaning', 'Brake Cleaner', 'sometimes', 1::numeric, 'Clean the gasket faces.', 30),
  ('walnut_blasting', 'Walnut Blasting Media', 'usually', NULL::numeric, 'Amount depends on the engine size.', 10),
  ('walnut_blasting', 'Engine Oil', 'sometimes', NULL::numeric, 'Oil is often changed after a carbon clean.', 20),
  ('maf_map_sensor_cleaning', 'MAF Sensor Cleaner', 'usually', 1::numeric, NULL, 10),
  ('maf_map_sensor_cleaning', 'Electrical Contact Cleaner', 'sometimes', 1::numeric, 'For the MAP sensor and plugs.', 20),
  ('engine_bay_degreasing', 'Degreaser', 'usually', 2::numeric, NULL, 10),
  ('carburetor_cleaning', 'Carburetor Cleaner', 'usually', 1::numeric, NULL, 10),
  ('intercooler_cleaning', 'Degreaser', 'usually', 1::numeric, NULL, 10),
  ('intercooler_cleaning', 'Brake Cleaner', 'sometimes', 1::numeric, NULL, 20),
  ('turbo_decoking', 'Induction / Fuel Injector Cleaner', 'usually', 1::numeric, NULL, 10),
  ('turbo_decoking', 'EGR & Carbon Cleaner', 'sometimes', 1::numeric, NULL, 20),
  ('ac_evaporator_cleaning', 'A/C Evaporator Cleaner Foam', 'usually', 1::numeric, NULL, 10),
  ('ac_evaporator_cleaning', 'Cabin Filter Housing Cleaner', 'sometimes', 1::numeric, 'If the cabin filter housing is cleaned too.', 20),
  ('ac_evaporator_cleaning', 'A/C Disinfectant Fogger', 'sometimes', 1::numeric, 'If the vents are disinfected at the same time.', 30),
  ('ac_disinfection', 'A/C Disinfectant Fogger', 'usually', 1::numeric, NULL, 10),
  ('battery_terminal_cleaning', 'Battery Terminal Cleaner', 'usually', 1::numeric, NULL, 10),
  ('battery_terminal_cleaning', 'Battery Terminal Protector', 'usually', 1::numeric, NULL, 20),
  ('battery_terminal_cleaning', 'Dielectric Grease', 'sometimes', 1::numeric, NULL, 30),
  -- extras on existing jobs
  ('fuel_induction_service', 'EGR & Carbon Cleaner', 'sometimes', 1::numeric, 'For heavy carbon.', 10),
  ('transmission', 'Brake Cleaner', 'sometimes', 1::numeric, 'Clean the pan and magnet.', 10),
  ('suspension', 'Degreaser', 'sometimes', 1::numeric, 'Clean parts to check for wear.', 10),
  ('shock_absorber', 'Degreaser', 'sometimes', 1::numeric, 'Clean parts to check for wear.', 10),
  ('front_stabilizer_bar', 'Degreaser', 'sometimes', 1::numeric, 'Clean parts to check for wear.', 10),
  ('front_stabilizer_link', 'Degreaser', 'sometimes', 1::numeric, 'Clean parts to check for wear.', 10),
  ('rear_stabilizer_bar', 'Degreaser', 'sometimes', 1::numeric, 'Clean parts to check for wear.', 10),
  ('rear_stabilizer_link', 'Degreaser', 'sometimes', 1::numeric, 'Clean parts to check for wear.', 10),
  ('ELEC-BATT', 'Battery Terminal Cleaner', 'sometimes', 1::numeric, 'For corroded terminals.', 10)
)
INSERT INTO public.maintenance_job_item (job_id, supply_id, need, qty_hint, note, sort_order)
SELECT j.id, s.id, w.need, w.qty_hint, w.note,
  w.sort_order + coalesce((SELECT max(x.sort_order) FROM public.maintenance_job_item x WHERE x.job_id = j.id AND x.removed_at IS NULL), 0)
FROM wanted w
JOIN public.maintenance_service_categories j ON j.code = w.job_code AND j.kind = 'component'
JOIN public.maintenance_supply s ON lower(s.name) = lower(w.supply_name) AND s.status = 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM public.maintenance_job_item x
  WHERE x.job_id = j.id AND x.supply_id = s.id AND x.removed_at IS NULL
);

COMMIT;

-- Check 1: the 10 cleaning jobs and how many May-need supplies each has (should be 10 rows, none with 0).
SELECT c.name AS job, p.name AS "group", sec.name AS engine_section,
  (SELECT count(*) FROM public.maintenance_job_item x WHERE x.job_id = c.id AND x.removed_at IS NULL) AS supplies
FROM public.maintenance_service_categories c
JOIN public.maintenance_service_categories p ON p.id = c.parent_id
LEFT JOIN public.maintenance_job_section_members m ON m.category_id = c.id
LEFT JOIN public.maintenance_job_sections sec ON sec.id = m.section_id
WHERE c.code IN ('egr_cleaning','walnut_blasting','maf_map_sensor_cleaning','engine_bay_degreasing','carburetor_cleaning',
                 'intercooler_cleaning','turbo_decoking','ac_evaporator_cleaning','ac_disinfection','battery_terminal_cleaning')
ORDER BY p.name, c.sort_order;
