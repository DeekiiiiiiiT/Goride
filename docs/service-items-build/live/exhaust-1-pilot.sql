-- Exhaust & emissions, PART 1 (PILOT): the new group, the Muffler job, and the first two part types
-- (Exhaust Clamp, Exhaust Hanger) linked as May-need part items. Owner-reviewed list:
-- docs/service-items-build/exhaust-emissions-suggestions.md (15 Nov 2026).
-- Paste ALL into the Supabase SQL editor (live project) and Run. Safe to run again.
-- Then do the pilot check in Fleet (see the list file) BEFORE running exhaust-2-rest.sql.

BEGIN;

-- New top-level group
INSERT INTO public.maintenance_service_categories (
  id, code, name, plain_name, description, icon_key, field_schema, quick_job_eligible, sort_order,
  parent_id, kind, op_code, position_aware, is_part, part_type_status, position_scheme, status
)
VALUES (
  gen_random_uuid(), 'sys_exhaust', 'Exhaust & emissions', 'Exhaust & emissions',
  'The pipes, silencers and parts that carry and clean the exhaust, on petrol and diesel cars.',
  'wind', '{"fields":[]}'::jsonb, true, 1105,
  NULL, 'system', 'EXH', false, true, 'active', 'none', 'active'
)
ON CONFLICT (code) DO NOTHING;

-- New supply
INSERT INTO public.maintenance_supply (name, description, unit_id, icon_key)
SELECT 'Exhaust Gasket Sealant / Muffler Cement',
       'Heat-proof paste for exhaust slip joints and flanges that have no gasket.', u.id, 'wrench'
FROM public.maintenance_unit u
WHERE u.code = 'tube'
  AND NOT EXISTS (SELECT 1 FROM public.maintenance_supply s
                  WHERE lower(s.name) = lower('Exhaust Gasket Sealant / Muffler Cement') AND s.status = 'active');

-- Muffler (part job) + the two part types
INSERT INTO public.maintenance_service_categories (
  code, name, plain_name, description, icon_key, field_schema, quick_job_eligible, sort_order,
  parent_id, kind, op_code, position_aware, is_part, part_type_status, position_scheme, status,
  default_action, default_fit_mode, editor_hint
)
SELECT j.code, j.name, j.name, j.description, 'wind', '{"fields":[{"key":"qty","type":"number","label":"Quantity","required":false},{"key":"unit_price","type":"number","label":"Unit price","required":false},{"key":"labor","type":"number","label":"Labor","required":false}]}'::jsonb, true, j.sort_order,
       sys.id, 'component', j.op_code, false, true, 'active', 'none', 'active',
       'replace', j.fit_mode, j.hint
FROM (VALUES
  ('muffler', 'Muffler', 'EXH-MUFF', 40, 'specific', 'Silencer',
   'The silencer at the back of the exhaust that keeps the car quiet. A blown muffler is loud and can let fumes in.'),
  ('exhaust_clamp', 'Exhaust Clamp', 'EXH-CLAMP', 120, 'spec', 'Pick by pipe size.',
   'Clamp that holds two exhaust pipes, or a pipe and a muffler, together. Comes in pipe sizes.'),
  ('exhaust_hanger', 'Exhaust Hanger / Rubber Isolator', 'EXH-HANG', 130, 'spec', 'Pick by shape and size.',
   'Rubber mount that hangs the exhaust under the car. A perished one lets the exhaust knock or droop.')
) AS j(code, name, op_code, sort_order, fit_mode, hint, description)
JOIN public.maintenance_service_categories sys ON sys.code = 'sys_exhaust'
ON CONFLICT (code) DO NOTHING;

-- Muffler May-need: 3 supplies + 2 part types
WITH wanted (job_code, supply_name, part_code, need, qty_hint, note, sort_order) AS (VALUES
  ('muffler', 'Penetrating Oil', NULL, 'usually', 1::numeric, NULL, 10),
  ('muffler', 'Exhaust Gasket Sealant / Muffler Cement', NULL, 'usually', 1::numeric, 'Slip joints.', 20),
  ('muffler', 'Anti-Seize Compound', NULL, 'sometimes', 1::numeric, NULL, 30),
  ('muffler', NULL, 'exhaust_clamp', 'usually', 1::numeric, NULL, 40),
  ('muffler', NULL, 'exhaust_hanger', 'sometimes', 1::numeric, 'If the old one is perished.', 50)
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

-- Check: should show Muffler with 5 items (3 supplies, 2 part types).
SELECT j.name AS job, coalesce(s.name, p.name) AS item,
  CASE WHEN x.part_type_id IS NOT NULL THEN 'part' ELSE 'supply' END AS kind, x.need, x.note
FROM public.maintenance_job_item x
JOIN public.maintenance_service_categories j ON j.id = x.job_id
LEFT JOIN public.maintenance_supply s ON s.id = x.supply_id
LEFT JOIN public.maintenance_service_categories p ON p.id = x.part_type_id
WHERE j.code = 'muffler' AND x.removed_at IS NULL
ORDER BY x.sort_order;
