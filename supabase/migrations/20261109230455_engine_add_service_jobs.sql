-- Engine: add the 14 engine jobs the owner's service list had that Log service lacked.
-- Services (is_part = false) get the short form (cost only) and never show in Find parts.
-- Parts (is_part = true) copy Spark Plugs' setup: quantity, unit price, labour; fit by engine.

INSERT INTO public.maintenance_service_categories (
  code, name, plain_name, description, icon_key, field_schema, quick_job_eligible, sort_order,
  parent_id, kind, op_code, position_aware, is_part, default_fit_mode, part_type_status, position_scheme, status
)
SELECT v.code, v.name, v.name, v.description,
       CASE WHEN v.is_part THEN 'gears' ELSE 'wrench' END,
       CASE WHEN v.is_part
         THEN '{"fields":[{"key":"qty","type":"number","label":"Quantity","required":false},{"key":"unit_price","type":"number","label":"Unit price","required":false},{"key":"labor","type":"number","label":"Labor","required":false}]}'::jsonb
         ELSE '{"fields":[{"key":"labor","type":"number","label":"Labor","required":false},{"key":"material","type":"number","label":"Parts / materials","required":false}]}'::jsonb
       END,
       true, v.sort_order,
       sys.id, 'component', v.op_code, false, v.is_part,
       CASE WHEN v.is_part THEN 'engine' ELSE NULL END,
       'active', 'none', 'active'
FROM (VALUES
  ('leak_inspection', 'Leak Inspection', false, 'ENG-LEAK', 170,
   'Checking around the engine for oil, coolant or fuel seeping from gaskets and seals before it becomes a bigger problem.'),
  ('fuel_induction_service', 'Fuel Injection / Intake Cleaning', false, 'ENG-IND', 180,
   'Cleaning carbon out of the fuel injectors, intake valves and combustion chambers to bring back power and fuel economy.'),
  ('spark_plug_wires', 'Spark Plug Wires', true, 'ENG-PLW', 190,
   'The wires that carry the spark from the coil to each plug. Worn wires cause misfires; usually changed with the plugs.'),
  ('pcv_valve', 'PCV Valve', true, 'ENG-PCV', 200,
   'A small valve that lets gases out of the engine''s crankcase so pressure and sludge don''t build up inside.'),
  ('timing_belt', 'Timing Belt', true, 'ENG-TBELT', 210,
   'The rubber belt that keeps the engine''s valves and pistons in step. If it snaps on many engines it causes major damage, so it is replaced on schedule.'),
  ('timing_chain', 'Timing Chain & Tensioner', true, 'ENG-TCHN', 220,
   'The metal chain (and the part that keeps it tight) that keeps the valves and pistons in step. Replaced when it stretches or gets noisy.'),
  ('valve_clearance_adjustment', 'Valve Clearance Adjustment', false, 'ENG-VLV', 230,
   'Setting the small gap between the valves and the camshaft so the engine runs quietly and seals properly.'),
  ('valve_cover_gasket', 'Valve Cover Gasket', true, 'ENG-VCG', 240,
   'The seal under the cover on top of the engine. A worn one leaks oil down the side of the engine.'),
  ('oil_pan_gasket', 'Oil Pan Gasket', true, 'ENG-OPG', 250,
   'The seal between the engine and the oil pan underneath. A worn one drips oil under the car.'),
  ('intake_manifold_gasket', 'Intake Manifold Gasket', true, 'ENG-IMG', 260,
   'The seal where the air intake joins the engine. A leak causes rough idle and can leak coolant on some engines.'),
  ('head_gasket', 'Head Gasket', true, 'ENG-HG', 270,
   'The seal between the engine block and the cylinder head. Usually fails after overheating; causes coolant loss or white smoke.'),
  ('cylinder_head_recondition', 'Cylinder Head Reconditioning', false, 'ENG-CHR', 280,
   'Machining a warped cylinder head, replacing valve seals and grinding the valves so the head seals and runs like new.'),
  ('piston_rings_bearings', 'Piston Rings & Engine Bearings', true, 'ENG-PRB', 290,
   'Replacing worn piston rings and engine bearings to bring back compression and oil pressure.'),
  ('engine_overhaul', 'Engine Overhaul / Rebuild', false, 'ENG-OVH', 300,
   'Taking the whole engine apart, machining it and replacing all the moving parts inside.')
) AS v(code, name, is_part, op_code, sort_order, description)
CROSS JOIN public.maintenance_service_categories sys
WHERE sys.code = 'sys_engine'
ON CONFLICT (code) DO NOTHING;
