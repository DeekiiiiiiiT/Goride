-- Fresh-database fix (4 Nov 2026): the 11 top-level system groups exist in prod but were never created by a migration.
INSERT INTO public.maintenance_service_categories (id, code, name, plain_name, parent_id, kind, sort_order, icon_key, is_part)
VALUES
  ('b1000000-0000-4000-8000-000000000001','sys_engine','Engine','Engine',NULL,'system',1000,'oil',true),
  ('b1000000-0000-4000-8000-000000000002','sys_filters','Filters','Filters',NULL,'system',1010,'filter',true),
  ('b1000000-0000-4000-8000-000000000003','sys_tires','Tires & wheels','Tires & wheels',NULL,'system',1020,'tires',true),
  ('b1000000-0000-4000-8000-000000000004','sys_brakes','Brakes','Brakes',NULL,'system',1030,'brakes',true),
  ('b1000000-0000-4000-8000-000000000005','sys_fluids','Fluids','Fluids',NULL,'system',1040,'droplet',true),
  ('b1000000-0000-4000-8000-000000000006','sys_belts','Belts & hoses','Belts & hoses',NULL,'system',1050,'belt',true),
  ('b1000000-0000-4000-8000-000000000007','sys_lighting','Lighting & visibility','Lighting & visibility',NULL,'system',1060,'lightbulb',true),
  ('b1000000-0000-4000-8000-000000000008','sys_suspension','Suspension & steering','Suspension & steering',NULL,'system',1070,'suspension',true),
  ('b1000000-0000-4000-8000-000000000009','sys_transmission','Transmission','Transmission',NULL,'system',1080,'gears',true),
  ('b1000000-0000-4000-8000-00000000000a','sys_hvac','HVAC','HVAC',NULL,'system',1090,'wind',true),
  ('b1000000-0000-4000-8000-00000000000b','sys_electrical','Battery & electrical','Battery & electrical',NULL,'system',1100,'spark',true)
ON CONFLICT DO NOTHING;

-- AS-03 follow-up: FLD-COOL is already the "Coolant flush" service (is_part = false),
-- so the Coolant part type was skipped. Create it under its own code and point coolant_type at it.

INSERT INTO public.maintenance_service_categories (
  id, code, name, plain_name, parent_id, icon_key, sort_order, is_part, op_code, position_aware, kind,
  default_fit_mode, position_scheme, trade_term, editor_hint, part_type_status
)
VALUES (
  'a1000001-0000-4000-8000-000000000102', 'coolant_part', 'Coolant', 'Coolant',
  'b1000000-0000-4000-8000-000000000005', 'water_drop', 41, true, 'FLD-COOLANT', false, 'component',
  'spec', 'none', 'coolant type', 'Coolant specification on the bottle.', 'active'
)
ON CONFLICT (id) DO UPDATE SET
  op_code = EXCLUDED.op_code,
  is_part = true,
  kind = 'component',
  parent_id = EXCLUDED.parent_id,
  default_fit_mode = EXCLUDED.default_fit_mode,
  position_scheme = EXCLUDED.position_scheme,
  trade_term = EXCLUDED.trade_term,
  editor_hint = EXCLUDED.editor_hint,
  part_type_status = 'active';

UPDATE public.spec_key
SET component_id = 'a1000001-0000-4000-8000-000000000102'::uuid
WHERE key = 'coolant_type';

INSERT INTO public.part_type_spec_field (part_type_id, spec_key, label, data_type, required, example, sort_order)
VALUES ('a1000001-0000-4000-8000-000000000102', 'coolant_type', 'Coolant type', 'text', true, 'Super Long Life', 1)
ON CONFLICT (part_type_id, spec_key) DO NOTHING;
