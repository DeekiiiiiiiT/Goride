-- Tires & wheels: add Wheel Alignment and Wheel Balancing as loggable jobs.
-- Services, not parts (is_part = false), same shape as Rotate Tires, so they
-- appear in Log service → Tires & wheels and never in Find parts.

INSERT INTO public.maintenance_service_categories (
  code, name, plain_name, icon_key, field_schema, quick_job_eligible, sort_order,
  parent_id, kind, op_code, position_aware, is_part, part_type_status, position_scheme, status
)
SELECT v.code, v.name, v.name, v.icon_key, v.field_schema::jsonb, true, v.sort_order,
       sys.id, 'component', v.op_code, false, false, 'active', 'none', 'active'
FROM (VALUES
  ('wheel_alignment', 'Wheel Alignment', 'suspension',
   '{"fields":[{"key":"labor","type":"number","label":"Labor","required":false}]}', 70, 'TIRE-ALN'),
  ('wheel_balancing', 'Wheel Balancing', 'tires',
   '{"fields":[{"key":"labor","type":"number","label":"Labor","required":false},{"key":"material","type":"number","label":"Parts / materials (wheel weights)","required":false}]}', 80, 'TIRE-BAL')
) AS v(code, name, icon_key, field_schema, sort_order, op_code)
CROSS JOIN public.maintenance_service_categories sys
WHERE sys.code = 'sys_tires'
ON CONFLICT (code) DO NOTHING;
