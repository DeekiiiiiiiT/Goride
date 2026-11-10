-- Engine: add Throttle Body Cleaning as a loggable job.
-- A service, not a part (is_part = false): short Log service form (cost only), never in Find parts.

INSERT INTO public.maintenance_service_categories (
  code, name, plain_name, description, icon_key, field_schema, quick_job_eligible, sort_order,
  parent_id, kind, op_code, position_aware, is_part, part_type_status, position_scheme, status
)
SELECT 'throttle_body_cleaning', 'Throttle Body Cleaning', 'Throttle Body Cleaning',
       'Cleaning carbon and dirt out of the throttle body (the valve that lets air into the engine) so the engine idles smoothly and responds properly.',
       'wrench',
       '{"fields":[{"key":"labor","type":"number","label":"Labor","required":false},{"key":"material","type":"number","label":"Parts / materials (cleaner)","required":false}]}'::jsonb,
       true, 160,
       sys.id, 'component', 'ENG-TBC', false, false, 'active', 'none', 'active'
FROM public.maintenance_service_categories sys
WHERE sys.code = 'sys_engine'
ON CONFLICT (code) DO NOTHING;
