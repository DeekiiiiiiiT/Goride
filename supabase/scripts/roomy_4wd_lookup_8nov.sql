-- READ-ONLY. RB-23 prep: what the 4WD script needs from live. Changes nothing.
-- Paste the whole result back to Claude.

-- A) The Roomy / Tank catalogue rows (to pick the 4WD 2016–2020 ones)
SELECT 'car' AS what, c.id::text AS id,
       c.make || ' ' || c.model || ' ' || coalesce(c.chassis_code, '') AS label,
       concat_ws(' · ', c.production_start_year || '–' || coalesce(c.production_end_year::text, ''),
                 c.drivetrain, c.engine_code, c.status) AS detail
FROM public.vehicle_catalog c
WHERE c.make = 'Toyota' AND c.model IN ('Roomy', 'Tank')

UNION ALL
-- B) How each 2WD brake part is saved today (type, position, side, No.)
SELECT 'listing', pm.maintenance_component_id::text,
       pm.manufacturer || ' ' || pm.oem_part_number || ' · ' || coalesce(pm.name, ''),
       concat_ws(' · ', 'pos=' || coalesce(pl.position, '-'), 'side=' || coalesce(pl.side, '-'),
                 'no=' || coalesce(pl.catalogue_number::text, '-'), 'car=' || pl.vehicle_catalog_id::text)
FROM public.part_listing pl
JOIN public.part_master pm ON pm.interchange_group_id = pl.interchange_group_id
WHERE pl.vehicle_catalog_id = '3cd9cbf3-a804-4817-82db-400cf6abf13a'
  AND pm.manufacturer = 'Toyota'

UNION ALL
-- C) Brake part types
SELECT 'type', t.id::text, t.name, concat_ws(' · ', t.op_code, t.position_scheme)
FROM public.maintenance_service_categories t
JOIN public.maintenance_service_categories a ON a.id = t.parent_id
WHERE t.is_part IS TRUE AND t.kind = 'component' AND t.part_type_status = 'active'
  AND (a.name ILIKE '%brake%' OR t.name ILIKE '%brake%' OR t.name ILIKE '%abs%')

ORDER BY 1, 3;
