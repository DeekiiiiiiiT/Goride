-- Every part group needs a catalogue area (part_category.area_id), or the part save refuses with
-- "This part type has no catalogue area yet". Three groups had none on 26 Nov 2026: HVAC (cabin filter held on the
-- Roomy heater page), Exhaust & emissions and Hybrid & electric. Additive and safe to run twice.

-- 1. HVAC: the "Cabin climate" area already exists but was never linked to its group.
UPDATE public.part_category pc
SET area_id = g.id, updated_at = now()
FROM public.maintenance_service_categories g
WHERE pc.slug = 'hvac'
  AND pc.area_id IS NULL
  AND g.kind = 'system' AND g.parent_id IS NULL AND g.name = 'HVAC'
  AND NOT EXISTS (SELECT 1 FROM public.part_category x WHERE x.area_id = g.id);

-- 2. Any part group still without an area gets one named after it (Exhaust & emissions, Hybrid & electric on
--    production; a fresh replay may have none of these, and then nothing is inserted).
INSERT INTO public.part_category (slug, label, area_id, parent_id, sort_order)
SELECT s.slug, g.name, g.id, NULL, 100
FROM public.maintenance_service_categories g
JOIN (VALUES ('HVAC', 'hvac-area'), ('Exhaust & emissions', 'exh'), ('Hybrid & electric', 'hyb')) AS s (group_name, slug)
  ON s.group_name = g.name
WHERE g.kind = 'system' AND g.parent_id IS NULL AND g.is_part
  AND NOT EXISTS (SELECT 1 FROM public.part_category x WHERE x.area_id = g.id)
  AND NOT EXISTS (SELECT 1 FROM public.part_category x WHERE x.slug = s.slug);
