-- Maintenance rebuild step 13: the driver's pre-shift checklist. Paste into the Supabase SQL editor (project csfllzzastacofsvcdsc). One run.

-- Maintenance rebuild step 13 (MER-17): the driver's pre-shift check gets its own checklist.
--
-- The Driver app's pre-shift check used "whatever template happens to be first". The templates are the garage's
-- inspection templates, one per system, so the first one is "Engine inspection" with 2 items: a driver was asked
-- about the engine instead of tyres, brakes and lights. This adds one walk-around checklist, code 'pre_shift',
-- with the 10 items of the Stitch design (docs/stitch/maintenance-rebuild-driver, screens 6–7). Safety items stop
-- the car when they fail (the server already does that for safety_critical items).
--
-- The garage's inspection list never shows it (the server leaves 'pre_shift' out unless it is asked for by code).
-- A template is master data: edit these rows to change the walk-around for every fleet.

INSERT INTO public.maintenance_inspection_templates (code, name, sort_order)
SELECT 'pre_shift', 'Pre-shift check', 0
WHERE NOT EXISTS (SELECT 1 FROM public.maintenance_inspection_templates WHERE code = 'pre_shift');

INSERT INTO public.maintenance_inspection_items (template_id, label, sort_order, safety_critical, default_action)
SELECT t.id, v.label, v.sort_order, v.safety_critical, 'inspect'
FROM public.maintenance_inspection_templates t
CROSS JOIN (VALUES
  ('Tires and tire pressure', 1, true),
  ('Brakes', 2, true),
  ('Lights and indicators', 3, true),
  ('Windscreen and wipers', 4, true),
  ('Seat belts', 5, true),
  ('Warning lights on the dashboard', 6, true),
  ('Mirrors', 7, false),
  ('Horn', 8, false),
  ('Leaks under the car', 9, false),
  ('Body damage', 10, false)
) AS v(label, sort_order, safety_critical)
WHERE t.code = 'pre_shift'
  AND NOT EXISTS (
    SELECT 1 FROM public.maintenance_inspection_items i WHERE i.template_id = t.id AND i.label = v.label
  );

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261127230038', 'mm_pre_shift_check') ON CONFLICT (version) DO NOTHING;
