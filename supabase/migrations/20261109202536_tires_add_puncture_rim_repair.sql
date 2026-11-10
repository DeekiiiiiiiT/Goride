-- Tires & wheels: add Puncture Repair and Wheel Straightening & Refurbishing as loggable jobs.
-- Services, not parts (is_part = false), so they appear in Log service and never in Find parts.
-- Position-aware (front/rear, left/right) so the log says which wheel was repaired.

INSERT INTO public.maintenance_service_categories (
  code, name, plain_name, description, icon_key, field_schema, quick_job_eligible, sort_order,
  parent_id, kind, op_code, position_aware, is_part, part_type_status, position_scheme, status
)
SELECT v.code, v.name, v.name, v.description, v.icon_key, v.field_schema::jsonb, true, v.sort_order,
       sys.id, 'component', v.op_code, true, false, 'active', 'axle_left_right', 'active'
FROM (VALUES
  ('puncture_repair', 'Puncture Repair',
   'Fixing a flat tire by sealing a hole in the tread area from the inside out using a combination rubber patch and plug.',
   'tires',
   '{"fields":[{"key":"labor","type":"number","label":"Labor","required":false},{"key":"material","type":"number","label":"Parts / materials (patch + plug)","required":false}]}',
   90, 'TIRE-PUN'),
  ('wheel_straightening', 'Wheel Straightening & Refurbishing',
   'Repairing structural damage, bends, or cosmetic curbside scrapes on aluminum or alloy metal rims.',
   'wrench',
   '{"fields":[{"key":"labor","type":"number","label":"Labor","required":false},{"key":"material","type":"number","label":"Parts / materials","required":false}]}',
   100, 'TIRE-RIM')
) AS v(code, name, description, icon_key, field_schema, sort_order, op_code)
CROSS JOIN public.maintenance_service_categories sys
WHERE sys.code = 'sys_tires'
ON CONFLICT (code) DO NOTHING;
