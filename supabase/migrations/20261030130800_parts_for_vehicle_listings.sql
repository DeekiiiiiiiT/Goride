CREATE OR REPLACE FUNCTION public.parts_for_vehicle(p_catalog_id uuid, p_component_id uuid DEFAULT NULL, p_vehicle_year integer DEFAULT NULL)
RETURNS TABLE (tier integer, part_id uuid, part_name text, oem_part_number text, manufacturer text, part_kind text, fit_scope text, rule_source text, "position" text, interchange_group_id uuid, maintenance_component_id uuid, category_id uuid, sister_names text, source_make text, reference_oem text, reference_manufacturer text, also_known_as text[], confirmed_installs integer, description text)
LANGUAGE sql STABLE AS $$
  WITH cat AS (
    SELECT vc.id, vc.make, vc.model, vc.platform_id, vc.engine_family_id, vc.chassis_code, vc.engine_code,
      COALESCE(p_vehicle_year, vc.production_start_year) AS match_year
    FROM public.vehicle_catalog vc WHERE vc.id = p_catalog_id
  ),
  family AS (
    SELECT p.id FROM public.vehicle_platform p JOIN cat ON true
    LEFT JOIN public.vehicle_platform mine ON mine.id = cat.platform_id
    WHERE p.id = cat.platform_id OR p.id = mine.parent_id OR p.parent_id = cat.platform_id
      OR (mine.parent_id IS NOT NULL AND p.parent_id = mine.parent_id)
  ),
  sister AS (
    SELECT string_agg(DISTINCT (vc.make || ' ' || vc.model), ', ' ORDER BY (vc.make || ' ' || vc.model)) AS names
    FROM public.vehicle_catalog vc JOIN cat ON vc.platform_id IN (SELECT id FROM family)
    WHERE lower(vc.make || ' ' || vc.model) <> lower(cat.make || ' ' || cat.model)
  ),
  listings AS (
    SELECT pl.interchange_group_id AS group_id, pl.vehicle_catalog_id AS listed_id, pl.position, pl.year_from, pl.year_to,
      g.fit_scope, lvc.make AS listed_make, lvc.model AS listed_model, lvc.chassis_code AS listed_chassis,
      lvc.engine_family_id AS listed_engine, lvc.platform_id AS listed_platform,
      (lvc.make || ' ' || lvc.model || ' ' || coalesce(lvc.chassis_code, '')) AS listed_label
    FROM public.part_listing pl
    JOIN public.part_interchange_group g ON g.id = pl.interchange_group_id
    JOIN public.vehicle_catalog lvc ON lvc.id = pl.vehicle_catalog_id
    CROSS JOIN cat
    WHERE (pl.year_from IS NULL OR cat.match_year IS NULL OR cat.match_year >= pl.year_from)
      AND (pl.year_to IS NULL OR cat.match_year IS NULL OR cat.match_year <= pl.year_to)
      AND NOT EXISTS (SELECT 1 FROM public.part_listing_exclusion ex WHERE ex.interchange_group_id = pl.interchange_group_id AND ex.vehicle_catalog_id = cat.id)
  ),
  scored AS (
    SELECT listings.*, CASE
      WHEN listings.listed_id = cat.id THEN 1
      WHEN lower(listings.listed_make) = lower(cat.make) AND lower(listings.listed_model) = lower(cat.model)
        AND upper(trim(coalesce(listings.listed_chassis, ''))) = upper(trim(coalesce(cat.chassis_code, '')))
        AND (listings.fit_scope IS DISTINCT FROM 'powertrain' OR listings.listed_engine IS NOT DISTINCT FROM cat.engine_family_id) THEN 1
      WHEN listings.listed_platform IN (SELECT id FROM family)
        AND (listings.fit_scope IS DISTINCT FROM 'powertrain' OR listings.listed_engine IS NOT DISTINCT FROM cat.engine_family_id) THEN 2
      WHEN listings.fit_scope = 'powertrain' AND listings.listed_engine IS NOT NULL AND listings.listed_engine = cat.engine_family_id
        AND (listings.listed_platform IS NULL OR listings.listed_platform NOT IN (SELECT id FROM family)) THEN 3
      ELSE NULL END AS listing_tier
    FROM listings CROSS JOIN cat
  ),
  best_group AS (
    SELECT DISTINCT ON (group_id, position) group_id, listing_tier, position, fit_scope, listed_label
    FROM scored WHERE listing_tier IS NOT NULL
    ORDER BY group_id, position, listing_tier ASC, listed_id
  ),
  hits AS (
    SELECT pm.id AS part_id, pm.name AS part_name, pm.oem_part_number, pm.manufacturer, pm.part_kind, bg.fit_scope,
      'listing'::text AS rule_source, bg.position, bg.group_id AS interchange_group_id, pm.maintenance_component_id, pm.category_id, pm.description,
      CASE WHEN pm.part_kind IN ('oe_supplier', 'aftermarket', 'reman', 'used') THEN 4 ELSE bg.listing_tier END AS tier,
      bg.listed_label AS source_make
    FROM best_group bg
    JOIN public.part_master pm ON pm.interchange_group_id = bg.group_id
    WHERE pm.catalog_decision IS DISTINCT FROM 'rejected'
      AND (p_component_id IS NULL OR pm.maintenance_component_id = p_component_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.catalog_component_applicability a JOIN cat ON true
        WHERE a.applicable = false AND a.component_id = pm.maintenance_component_id
          AND ((a.scope = 'variant' AND a.vehicle_catalog_id = cat.id) OR (a.scope = 'platform' AND a.platform_id = cat.platform_id) OR (a.scope = 'engine_family' AND a.engine_family_id = cat.engine_family_id))
      )
  ),
  oem_ref AS (
    SELECT DISTINCT ON (h.interchange_group_id) h.interchange_group_id, h.oem_part_number AS reference_oem, h.manufacturer AS reference_manufacturer
    FROM hits h WHERE h.part_kind = 'oem' AND h.interchange_group_id IS NOT NULL
    ORDER BY h.interchange_group_id, h.tier ASC
  )
  SELECT h.tier, h.part_id, h.part_name, h.oem_part_number, h.manufacturer, h.part_kind, h.fit_scope, h.rule_source, h.position,
    h.interchange_group_id, h.maintenance_component_id, h.category_id, sister.names AS sister_names, h.source_make,
    COALESCE(oem_ref.reference_oem, h.oem_part_number), COALESCE(oem_ref.reference_manufacturer, h.manufacturer),
    COALESCE((SELECT array_agg(old.oem_part_number) FROM public.part_supersession s JOIN public.part_master old ON old.id = s.old_part_id WHERE s.new_part_id = h.part_id AND old.oem_part_number IS NOT NULL), ARRAY[]::text[]),
    COALESCE((SELECT count(*)::integer FROM public.part_fit_feedback f WHERE f.part_id = h.part_id AND f.outcome = 'fit'), 0),
    h.description
  FROM hits h LEFT JOIN sister ON true LEFT JOIN oem_ref ON oem_ref.interchange_group_id = h.interchange_group_id;
$$;;
