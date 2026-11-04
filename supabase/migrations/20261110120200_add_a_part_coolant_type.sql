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
