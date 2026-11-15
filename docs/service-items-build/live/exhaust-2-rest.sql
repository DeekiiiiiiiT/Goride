-- Exhaust & emissions, PART 2: everything else. Run ONLY after exhaust-1-pilot.sql and the pilot check
-- in Fleet passed. Owner-reviewed list: docs/service-items-build/exhaust-emissions-suggestions.md.
-- Paste ALL into the Supabase SQL editor (live project) and Run. Safe to run again.
--
-- Adds: 17 more jobs (9 petrol incl. 1 part type, 8 diesel), 2 diesel supplies, the rest of the
-- May-need links, and moves Tire Valve Stem from supply to part type (it comes in sizes).

BEGIN;

-- Diesel supplies (AdBlue already exists as "AdBlue (Diesel Exhaust Fluid)")
INSERT INTO public.maintenance_supply (name, description, unit_id, icon_key)
SELECT v.name, v.description, u.id, v.icon_key
FROM (VALUES
  ('DPF Cleaning Fluid', 'Solvent flush that clears soot from a diesel particulate filter, on or off the car.', 'can', 'wind'),
  ('DPF Regeneration Additive', 'Fuel additive that helps a diesel particulate filter burn off soot at a lower temperature.', 'bottle', 'droplet')
) AS v(name, description, unit_code, icon_key)
JOIN public.maintenance_unit u ON u.code = v.unit_code
WHERE NOT EXISTS (SELECT 1 FROM public.maintenance_supply s WHERE lower(s.name) = lower(v.name) AND s.status = 'active');

-- Jobs. is_part = true: part job (asks for the part on the job line, shows in Find parts).
-- is_part = false: service (labor only on the line; supplies carry material cost).
INSERT INTO public.maintenance_service_categories (
  code, name, plain_name, description, icon_key, field_schema, quick_job_eligible, sort_order,
  parent_id, kind, op_code, position_aware, is_part, part_type_status, position_scheme, status,
  default_action, default_fit_mode, editor_hint
)
SELECT j.code, j.name, j.name, j.description, j.icon_key,
       CASE WHEN j.is_part THEN '{"fields":[{"key":"qty","type":"number","label":"Quantity","required":false},{"key":"unit_price","type":"number","label":"Unit price","required":false},{"key":"labor","type":"number","label":"Labor","required":false}]}'::jsonb
            ELSE '{"fields":[{"key":"labor","type":"number","label":"Labor","required":false}]}'::jsonb END,
       true, j.sort_order, sys.id, 'component', j.op_code, false, j.is_part, 'active', j.scheme, 'active',
       j.action, CASE WHEN j.is_part THEN j.fit_mode END, j.hint
FROM (VALUES
  -- petrol exhaust + EVAP
  ('exhaust_manifold', 'Exhaust Manifold / Header', 'EXH-MANI', 10, true, 'replace', 'engine', 'none', 'wind', NULL,
   'The heavy pipe bolted to the engine that collects the exhaust from every cylinder. Cracks cause ticking and fume leaks.'),
  ('exhaust_manifold_gasket', 'Exhaust Manifold Gasket', 'EXH-MGSK', 20, true, 'replace', 'engine', 'none', 'wind', 'Gasket-only work.',
   'The gasket between the engine and the exhaust manifold. Log this job only for gasket-only work; when the manifold is replaced, the gasket is an item on the Exhaust Manifold / Header job.'),
  ('catalytic_converter', 'Catalytic Converter', 'EXH-CAT', 30, true, 'replace', 'specific', 'none', 'wind', 'Cat',
   'The part that cleans harmful gases out of the exhaust. A failed one causes a check-engine light and fails emissions.'),
  ('resonator', 'Resonator', 'EXH-RES', 50, true, 'replace', 'specific', 'none', 'wind', NULL,
   'A small silencer in the middle of the exhaust that takes out drone at cruising speed.'),
  ('flex_pipe', 'Flex Pipe', 'EXH-FLEX', 60, true, 'replace', 'specific', 'none', 'wind', 'Braided joint.',
   'The bendy braided section that lets the exhaust move with the engine. A torn one is loud and leaks fumes.'),
  ('exhaust_pipe', 'Exhaust Pipe / Tailpipe', 'EXH-PIPE', 70, true, 'replace', 'specific', 'none', 'wind', NULL,
   'The straight runs of exhaust pipe, including the tailpipe at the back.'),
  ('exhaust_inspection', 'Exhaust System Inspection', 'EXH-INSP', 80, false, 'inspect', NULL, 'none', 'wind', NULL,
   'Checking the whole exhaust for leaks, rust, loose hangers and damage. Labor only.'),
  ('evap_canister', 'EVAP / Charcoal Canister', 'EXH-EVAP', 90, true, 'replace', 'specific', 'none', 'droplet', NULL,
   'The canister that traps petrol fumes from the tank so they are burned instead of let out. A bad one causes a check-engine light and a fuel smell.'),
  ('purge_valve', 'Purge Valve', 'EXH-PURGE', 100, true, 'replace', 'engine', 'none', 'droplet', 'Canister purge solenoid.',
   'The valve that lets the engine draw the trapped petrol fumes out of the EVAP canister.'),
  ('exhaust_flange_gasket', 'Exhaust Flange Gasket', 'EXH-FGSK', 110, true, 'replace', 'spec', 'none', 'wind', 'Pick by flange size.',
   'Gasket that seals two bolted exhaust flanges, such as at the catalytic converter or DPF. Comes in sizes.'),
  -- diesel
  ('dpf_cleaning', 'DPF Cleaning / Regeneration', 'EXH-DPFC', 200, false, 'clean', NULL, 'none', 'wind', NULL,
   'Clearing soot out of a blocked diesel particulate filter: a forced regeneration, an additive, a fluid flush, or off-car machine cleaning. Diesel only.'),
  ('dpf_replacement', 'DPF Replacement', 'EXH-DPF', 210, true, 'replace', 'specific', 'none', 'wind', 'Diesel particulate filter.',
   'Fitting a new diesel particulate filter when the old one can no longer be cleaned. Diesel only.'),
  ('scr_service', 'SCR / AdBlue System Service', 'EXH-SCR', 220, false, 'inspect', NULL, 'none', 'droplet', NULL,
   'Checking and fixing the AdBlue system (tank, pump, injector, lines) that cuts NOx from diesel exhaust. Diesel only.'),
  ('adblue_topup', 'AdBlue / DEF Top-up', 'EXH-DEF', 230, false, 'top_up', NULL, 'none', 'droplet', NULL,
   'Filling the AdBlue tank on a diesel that uses it. Diesel only.'),
  ('nox_sensor', 'NOx Sensor', 'EXH-NOX', 240, true, 'replace', 'engine', 'before_after_catalyst', 'wind', NULL,
   'Sensor that measures NOx in diesel exhaust so the AdBlue system doses correctly. Diesel only.'),
  ('glow_plugs', 'Glow Plugs', 'EXH-GLOW', 250, true, 'replace', 'engine', 'none', 'spark', 'Diesel cold-start.',
   'Heaters that warm the cylinders so a diesel starts cleanly from cold. Bad ones cause hard starts and white smoke. Diesel only.'),
  ('egt_sensor', 'Exhaust Gas Temperature (EGT) Sensor', 'EXH-EGT', 260, true, 'replace', 'engine', 'none', 'thermometer', NULL,
   'Sensor that reads exhaust temperature to protect the turbo and run DPF regeneration. Diesel only.'),
  ('dpf_pressure_sensor', 'DPF Differential Pressure Sensor', 'EXH-DPFP', 270, true, 'replace', 'engine', 'none', 'gauge', NULL,
   'Sensor that tells the engine how full of soot the DPF is. Diesel only.')
) AS j(code, name, op_code, sort_order, is_part, action, fit_mode, scheme, icon_key, hint, description)
JOIN public.maintenance_service_categories sys ON sys.code = 'sys_exhaust'
ON CONFLICT (code) DO NOTHING;

-- Tire Valve Stem: becomes a part type in Tires & wheels (it comes in sizes)
INSERT INTO public.maintenance_service_categories (
  code, name, plain_name, description, icon_key, field_schema, quick_job_eligible, sort_order,
  parent_id, kind, op_code, position_aware, is_part, part_type_status, position_scheme, status,
  default_action, default_fit_mode, editor_hint
)
SELECT 'tire_valve_stem', 'Tire Valve Stem', 'Tire Valve Stem',
       'The valve the tire is pumped through. Snap-in rubber or TPMS sensor stems come in sizes for the rim.',
       'tires', '{"fields":[{"key":"qty","type":"number","label":"Quantity","required":false},{"key":"unit_price","type":"number","label":"Unit price","required":false},{"key":"labor","type":"number","label":"Labor","required":false}]}'::jsonb, true, 200, sys.id, 'component', 'TIR-STEM', false, true, 'active', 'none', 'active',
       'replace', 'spec', 'Pick by rim hole and type.'
FROM public.maintenance_service_categories sys WHERE sys.code = 'sys_tires'
ON CONFLICT (code) DO NOTHING;

-- May-need links (supplies and part types)
WITH wanted (job_code, supply_name, part_code, need, qty_hint, note, sort_order) AS (VALUES
  ('exhaust_manifold', 'Penetrating Oil', NULL, 'usually', 1::numeric, 'Rusted studs and nuts.', 10),
  ('exhaust_manifold', 'Anti-Seize Compound', NULL, 'usually', 1::numeric, 'On studs and flange faces.', 20),
  ('exhaust_manifold', NULL, 'exhaust_manifold_gasket', 'usually', 1::numeric, 'Log it here, not as its own job too.', 30),
  ('exhaust_manifold', 'Exhaust Gasket Sealant / Muffler Cement', NULL, 'sometimes', 1::numeric, 'If no gasket is used.', 40),
  ('exhaust_manifold', 'Brake Cleaner', NULL, 'sometimes', 1::numeric, 'Clean the mating faces.', 50),
  ('exhaust_manifold', 'Thread-Locking Fluid', NULL, 'sometimes', 1::numeric, NULL, 60),
  ('exhaust_manifold_gasket', 'Anti-Seize Compound', NULL, 'usually', 1::numeric, NULL, 10),
  ('exhaust_manifold_gasket', 'Penetrating Oil', NULL, 'sometimes', 1::numeric, NULL, 20),
  ('exhaust_manifold_gasket', 'Brake Cleaner', NULL, 'sometimes', 1::numeric, 'Clean the sealing faces.', 30),
  ('catalytic_converter', 'Penetrating Oil', NULL, 'usually', 1::numeric, NULL, 10),
  ('catalytic_converter', 'Anti-Seize Compound', NULL, 'usually', 1::numeric, 'Flange and sensor threads.', 20),
  ('catalytic_converter', NULL, 'exhaust_flange_gasket', 'sometimes', 1::numeric, NULL, 30),
  ('catalytic_converter', 'Exhaust Gasket Sealant / Muffler Cement', NULL, 'sometimes', 1::numeric, NULL, 40),
  ('resonator', 'Penetrating Oil', NULL, 'usually', 1::numeric, NULL, 10),
  ('resonator', NULL, 'exhaust_clamp', 'usually', 1::numeric, NULL, 20),
  ('resonator', NULL, 'exhaust_hanger', 'sometimes', 1::numeric, NULL, 30),
  ('flex_pipe', 'Penetrating Oil', NULL, 'usually', 1::numeric, NULL, 10),
  ('flex_pipe', 'Exhaust Gasket Sealant / Muffler Cement', NULL, 'sometimes', 1::numeric, NULL, 20),
  ('flex_pipe', NULL, 'exhaust_clamp', 'sometimes', 1::numeric, NULL, 30),
  ('exhaust_pipe', 'Penetrating Oil', NULL, 'usually', 1::numeric, NULL, 10),
  ('exhaust_pipe', NULL, 'exhaust_clamp', 'usually', 1::numeric, NULL, 20),
  ('exhaust_pipe', NULL, 'exhaust_hanger', 'sometimes', 1::numeric, NULL, 30),
  ('evap_canister', 'Brake Cleaner', NULL, 'sometimes', 1::numeric, 'Clean the mounting area.', 10),
  ('evap_canister', 'Electrical Contact Cleaner', NULL, 'sometimes', 1::numeric, 'Purge valve connector.', 20),
  ('evap_canister', 'Penetrating Oil', NULL, 'sometimes', 1::numeric, 'Rusted fasteners.', 30),
  ('purge_valve', 'Electrical Contact Cleaner', NULL, 'sometimes', 1::numeric, NULL, 10),
  ('purge_valve', 'Dielectric Grease', NULL, 'sometimes', 1::numeric, 'Connector seal.', 20),
  -- diesel
  ('dpf_cleaning', 'DPF Cleaning Fluid', NULL, 'sometimes', 1::numeric, 'Fluid flush only; machine cleaning and forced regeneration use none.', 10),
  ('dpf_cleaning', 'EGR & Carbon Cleaner', NULL, 'sometimes', 1::numeric, 'Heavy soot on the housing.', 20),
  ('dpf_cleaning', 'DPF Regeneration Additive', NULL, 'sometimes', 1::numeric, 'Additive-assisted regeneration only.', 30),
  ('dpf_replacement', 'Penetrating Oil', NULL, 'usually', 1::numeric, NULL, 10),
  ('dpf_replacement', 'Anti-Seize Compound', NULL, 'usually', 1::numeric, NULL, 20),
  ('dpf_replacement', NULL, 'exhaust_flange_gasket', 'usually', 1::numeric, NULL, 30),
  ('dpf_replacement', NULL, 'exhaust_clamp', 'sometimes', 1::numeric, NULL, 40),
  ('scr_service', 'AdBlue (Diesel Exhaust Fluid)', NULL, 'usually', NULL::numeric, 'Amount depends on the car.', 10),
  ('scr_service', 'Electrical Contact Cleaner', NULL, 'sometimes', 1::numeric, 'Pump and sensor connectors.', 20),
  ('scr_service', 'Brake Cleaner', NULL, 'sometimes', 1::numeric, 'Clean the mounting area.', 30),
  ('adblue_topup', 'AdBlue (Diesel Exhaust Fluid)', NULL, 'usually', NULL::numeric, 'Amount depends on the car.', 10),
  ('nox_sensor', 'Anti-Seize Compound', NULL, 'usually', 1::numeric, 'Only if the new sensor is not pre-coated.', 10),
  ('nox_sensor', 'Penetrating Oil', NULL, 'sometimes', 1::numeric, 'For a seized old sensor.', 20),
  ('nox_sensor', 'Electrical Contact Cleaner', NULL, 'sometimes', 1::numeric, NULL, 30),
  ('nox_sensor', 'Dielectric Grease', NULL, 'sometimes', 1::numeric, NULL, 40),
  ('glow_plugs', 'Anti-Seize Compound', NULL, 'usually', 1::numeric, 'On the plug threads.', 10),
  ('glow_plugs', 'Penetrating Oil', NULL, 'sometimes', 1::numeric, 'Soak a seized plug before removal.', 20),
  ('glow_plugs', 'Dielectric Grease', NULL, 'sometimes', 1::numeric, NULL, 30),
  ('egt_sensor', 'Anti-Seize Compound', NULL, 'usually', 1::numeric, NULL, 10),
  ('egt_sensor', 'Penetrating Oil', NULL, 'sometimes', 1::numeric, NULL, 20),
  ('egt_sensor', 'Electrical Contact Cleaner', NULL, 'sometimes', 1::numeric, NULL, 30),
  ('dpf_pressure_sensor', 'Electrical Contact Cleaner', NULL, 'sometimes', 1::numeric, NULL, 10),
  ('dpf_pressure_sensor', 'Dielectric Grease', NULL, 'sometimes', 1::numeric, NULL, 20),
  -- Tire Change: valve stem is now a part item
  ('tires', NULL, 'tire_valve_stem', 'sometimes', 1::numeric, 'One per tire.', 100)
)
INSERT INTO public.maintenance_job_item (job_id, supply_id, part_type_id, need, qty_hint, note, sort_order)
SELECT j.id, s.id, p.id, w.need, w.qty_hint, w.note, w.sort_order
FROM wanted w
JOIN public.maintenance_service_categories j ON j.code = w.job_code AND j.kind = 'component'
LEFT JOIN public.maintenance_supply s ON lower(s.name) = lower(w.supply_name) AND s.status = 'active'
LEFT JOIN public.maintenance_service_categories p ON p.code = w.part_code AND p.kind = 'component'
WHERE (s.id IS NOT NULL OR p.id IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM public.maintenance_job_item x
    WHERE x.job_id = j.id AND x.removed_at IS NULL
      AND (x.supply_id = s.id OR x.part_type_id = p.id)
  );

-- Retire the old Tire Valve Stem supply (never used on a saved service) and take it off Tire Change
UPDATE public.maintenance_job_item x
SET removed_at = now()
FROM public.maintenance_supply s
WHERE x.supply_id = s.id AND s.name = 'Tire Valve Stem' AND x.removed_at IS NULL;

UPDATE public.maintenance_supply SET status = 'retired'
WHERE name = 'Tire Valve Stem' AND status = 'active';

COMMIT;

-- Check: every Exhaust & emissions job with its item counts (21 rows), then Tire Change.
SELECT j.name AS job, CASE WHEN j.is_part THEN 'part job' ELSE 'service' END AS kind,
  count(x.supply_id) AS supplies, count(x.part_type_id) AS part_items
FROM public.maintenance_service_categories j
JOIN public.maintenance_service_categories sys ON sys.id = j.parent_id
LEFT JOIN public.maintenance_job_item x ON x.job_id = j.id AND x.removed_at IS NULL
WHERE sys.code = 'sys_exhaust' OR j.code = 'tires'
GROUP BY j.name, j.is_part, j.sort_order, sys.code
ORDER BY sys.code, j.sort_order;
