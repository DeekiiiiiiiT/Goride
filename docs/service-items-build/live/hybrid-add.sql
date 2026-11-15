-- Hybrid high-voltage jobs (owner-reviewed list: docs/service-items-build/hybrid-suggestions.md, 15 Nov 2026).
-- Paste ALL into the Supabase SQL editor (live project) and Run. Safe to run again.
-- Adds: the "Hybrid & electric" group, 7 jobs, 1 new supply (Hybrid Inverter Coolant), 10 supply links
-- and 1 part link. Requires: the Fleet tick fix (commit 367dcb07 or later) deployed first (done 15 Nov, then this ran).
-- Full-EV jobs (charging, traction motor, DC-DC) come later in the same group.

BEGIN;

-- New top-level group (the EV file adds to it later)
INSERT INTO public.maintenance_service_categories (
  id, code, name, plain_name, description, icon_key, field_schema, quick_job_eligible, sort_order,
  parent_id, kind, op_code, position_aware, is_part, part_type_status, position_scheme, status
)
VALUES (
  gen_random_uuid(), 'sys_hybrid', 'Hybrid & electric', 'Hybrid & electric',
  'High-voltage parts on hybrid and electric cars: the drive battery, its cooling, and the inverter. High-voltage work: the system must be made safe (lockout) first.',
  'spark', '{"fields":[]}'::jsonb, true, 1107,
  NULL, 'system', 'HEV', false, true, 'active', 'none', 'active'
)
ON CONFLICT (code) DO NOTHING;

-- New supply: the inverter loop needs its own coolant, not engine coolant
INSERT INTO public.maintenance_supply (name, description, unit_id, icon_key)
SELECT 'Hybrid Inverter Coolant (Low-Conductivity)',
       'Low-conductivity coolant for the hybrid inverter / motor cooling loop (for example Toyota SLLC, Honda Type 2). Use the type the car maker specifies; do not top up with ordinary engine coolant.',
       u.id, 'thermometer'
FROM public.maintenance_unit u
WHERE u.code = 'litre'
  AND NOT EXISTS (SELECT 1 FROM public.maintenance_supply s
                  WHERE lower(s.name) = lower('Hybrid Inverter Coolant (Low-Conductivity)') AND s.status = 'active');

-- Jobs
INSERT INTO public.maintenance_service_categories (
  code, name, plain_name, description, icon_key, field_schema, quick_job_eligible, sort_order,
  parent_id, kind, op_code, position_aware, is_part, part_type_status, position_scheme, status,
  default_action, default_fit_mode, editor_hint
)
SELECT j.code, j.name, j.name, j.description, j.icon_key,
       CASE WHEN j.is_part
            THEN '{"fields":[{"key":"qty","type":"number","label":"Quantity","required":false},{"key":"unit_price","type":"number","label":"Unit price","required":false},{"key":"labor","type":"number","label":"Labor","required":false}]}'::jsonb
            ELSE '{"fields":[{"key":"labor","type":"number","label":"Labor","required":false}]}'::jsonb END,
       true, j.sort_order, sys.id, 'component', j.op_code, false, j.is_part, 'active', 'none', 'active',
       j.action, CASE WHEN j.is_part THEN 'specific' END, j.hint
FROM (VALUES
  ('hv_battery_health_check', 'HV Battery Health Check', 'HEV-HCHK', 10, false, 'inspect', 'spark', 'Labor only.',
   'Testing the hybrid drive battery: module voltages, internal resistance and stored fault codes. Labor only.'),
  ('hv_battery_fan_filter', 'HV Battery Cooling Fan Filter', 'HEV-FFLT', 20, true, 'replace', 'wind', 'Usually under or beside the rear seat.',
   'The filter on the air intake that cools the hybrid battery. A blocked one makes the battery run hot and wear out early.'),
  ('hv_battery_fan_cleaning', 'HV Battery Cooling Fan & Duct Cleaning', 'HEV-FCLN', 30, false, 'clean', 'wind', NULL,
   'Cleaning dust and lint out of the hybrid battery cooling fan and its duct so the battery stays cool. High-voltage area: lockout first if the cover comes off.'),
  ('inverter_coolant_service', 'Inverter Coolant Service', 'HEV-ICS', 40, false, 'flush', 'thermometer', 'Separate loop from the engine.',
   'Draining and refilling the coolant loop that cools the hybrid inverter and motor. It is a separate loop from the engine coolant on most hybrids.'),
  ('inverter_coolant_pump', 'Inverter Coolant Pump', 'HEV-ICP', 50, true, 'replace', 'thermometer', 'Electric pump.',
   'The electric pump that moves coolant through the inverter loop. If it fails, the hybrid system overheats and shuts down.'),
  ('hv_battery_module', 'HV Battery Module Replacement', 'HEV-MOD', 60, true, 'replace', 'spark', 'High-voltage: lockout first.',
   'Replacing one or more failed modules inside the hybrid drive battery. High-voltage work: lockout first.'),
  ('hv_battery_pack', 'HV Battery Pack Replacement', 'HEV-PACK', 70, true, 'replace', 'spark', 'High-voltage: lockout first.',
   'Replacing the whole hybrid drive battery. High-voltage work: lockout first.')
) AS j(code, name, op_code, sort_order, is_part, action, icon_key, hint, description)
JOIN public.maintenance_service_categories sys ON sys.code = 'sys_hybrid'
ON CONFLICT (code) DO NOTHING;

-- May-need links
WITH wanted (job_code, supply_name, part_code, need, qty_hint, note, sort_order) AS (VALUES
  ('hv_battery_fan_filter', 'Cabin Filter Housing Cleaner', NULL, 'sometimes', 1::numeric, 'Clean the filter housing.', 10),
  ('hv_battery_fan_cleaning', 'Cabin Filter Housing Cleaner', NULL, 'usually', 1::numeric, 'Fan and duct.', 10),
  ('hv_battery_fan_cleaning', 'Electrical Contact Cleaner', NULL, 'sometimes', 1::numeric, 'Fan motor connector.', 20),
  ('hv_battery_fan_cleaning', NULL, 'hv_battery_fan_filter', 'sometimes', 1::numeric, 'If the filter is dirty or torn.', 30),
  ('inverter_coolant_service', 'Hybrid Inverter Coolant (Low-Conductivity)', NULL, 'usually', NULL::numeric, 'Amount depends on the car. Use the type the car maker specifies.', 10),
  ('inverter_coolant_service', 'Distilled Water', NULL, 'sometimes', NULL::numeric, 'Only if the coolant is a concentrate.', 20),
  ('inverter_coolant_pump', 'Hybrid Inverter Coolant (Low-Conductivity)', NULL, 'usually', NULL::numeric, 'Refill after the pump is changed.', 10),
  ('inverter_coolant_pump', 'Electrical Contact Cleaner', NULL, 'sometimes', 1::numeric, NULL, 20),
  ('inverter_coolant_pump', 'Dielectric Grease', NULL, 'sometimes', 1::numeric, 'Pump connector.', 30),
  ('hv_battery_module', 'Electrical Contact Cleaner', NULL, 'usually', 1::numeric, 'Bus bars and terminals.', 10),
  ('hv_battery_pack', 'Electrical Contact Cleaner', NULL, 'sometimes', 1::numeric, 'Main connectors.', 10)
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

COMMIT;

-- Check: 7 rows. Supplies/part items: 0/0, 1/0, 2/1, 2/0, 3/0, 1/0, 1/0.
SELECT j.name AS job, CASE WHEN j.is_part THEN 'part job' ELSE 'service' END AS kind,
  count(x.supply_id) AS supplies, count(x.part_type_id) AS part_items
FROM public.maintenance_service_categories j
JOIN public.maintenance_service_categories sys ON sys.id = j.parent_id
LEFT JOIN public.maintenance_job_item x ON x.job_id = j.id AND x.removed_at IS NULL
WHERE sys.code = 'sys_hybrid'
GROUP BY j.name, j.is_part, j.sort_order
ORDER BY j.sort_order;
