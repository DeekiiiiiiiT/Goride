-- AP-07: spec keys for washer fluid, tail bulb, indicator bulb, tire size

INSERT INTO public.spec_key (key, label, value_type, unit, component_id)
SELECT v.key, v.label, v.value_type, v.unit, c.id
FROM (VALUES
  ('washer_fluid', 'Washer fluid', 'text', NULL::text, 'FLD-WASH'),
  ('tail_bulb', 'Brake and tail bulb', 'text', NULL::text, 'LGT-TAIL'),
  ('indicator_bulb', 'Indicator bulb', 'text', NULL::text, 'LGT-IND'),
  ('tire_size', 'Tire size', 'text', NULL::text, 'TIRE-REPL')
) AS v(key, label, value_type, unit, op_code)
JOIN public.maintenance_service_categories c ON c.op_code = v.op_code AND c.is_part IS TRUE
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  value_type = EXCLUDED.value_type,
  unit = EXCLUDED.unit,
  component_id = EXCLUDED.component_id;

INSERT INTO public.part_type_spec_field (part_type_id, spec_key, label, data_type, required, example, sort_order)
SELECT c.id, v.spec_key, v.label, 'text', true, v.example, 1
FROM (VALUES
  ('FLD-WASH', 'washer_fluid', 'Washer fluid type', 'All-season'),
  ('LGT-TAIL', 'tail_bulb', 'Bulb size', 'W21/5W'),
  ('LGT-IND', 'indicator_bulb', 'Bulb size', 'WY21W'),
  ('TIRE-REPL', 'tire_size', 'Tire size', '165/65R14 79S')
) AS v(op, spec_key, label, example)
JOIN public.maintenance_service_categories c ON c.op_code = v.op AND c.is_part IS TRUE
JOIN public.spec_key sk ON sk.key = v.spec_key
ON CONFLICT (part_type_id, spec_key) DO NOTHING;
