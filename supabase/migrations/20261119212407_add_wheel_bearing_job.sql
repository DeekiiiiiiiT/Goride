-- Owner 19 Nov (real Roomy inspection): there was no "Wheel bearing" job, so a worn rear wheel bearing couldn't be logged.
-- Adds it to Suspension & steering, set up like Shock absorber: a part, Replace, one corner at a time
-- (Front left / Front right / Rear left / Rear right). Safe to run twice.

INSERT INTO public.maintenance_service_categories (
  code, kind, name, plain_name, status, is_part, op_code, icon_key, parent_id, sort_order, trade_term,
  description, editor_hint, field_schema, default_action, position_aware, position_scheme, default_fit_mode,
  part_type_status, records_findings, quick_job_eligible, is_high_voltage
)
SELECT
  'wheel_bearing', 'component', 'Wheel bearing', 'Wheel bearing', 'active', true, 'SUS-WHLBRG', 'suspension',
  sys.id, 1096, 'hub bearing',
  'The bearing in each front or rear wheel hub that lets the wheel spin smoothly. A worn one hums or growls louder with speed.',
  'One corner at a time.', '{"fields":[]}'::jsonb, 'replace', false, 'four_corners', 'specific',
  'active', false, true, false
FROM public.maintenance_service_categories sys
WHERE sys.code = 'sys_suspension'
  AND NOT EXISTS (SELECT 1 FROM public.maintenance_service_categories c WHERE c.code = 'wheel_bearing');

-- Self-check
DO $check$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.maintenance_service_categories c
    JOIN public.maintenance_service_categories sys ON sys.id = c.parent_id AND sys.code = 'sys_suspension'
    WHERE c.code = 'wheel_bearing' AND c.status = 'active' AND c.position_scheme = 'four_corners' AND c.is_part
  ) THEN
    RAISE EXCEPTION 'wheel_bearing job missing or not set up';
  END IF;
END;
$check$;
