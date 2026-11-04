-- parts_for_vehicle: sister derived tier 2, derived row guards, engine tier-3 years, ORDER BY, badge dedupe
-- Depends on 20261107240000_parts_for_vehicle_universal.sql



CREATE OR REPLACE FUNCTION public.parts_for_vehicle(
  p_catalog_id uuid,
  p_component_id uuid DEFAULT NULL,
  p_vehicle_year integer DEFAULT NULL
)
RETURNS TABLE (
  tier integer,
  part_id uuid,
  part_name text,
  oem_part_number text,
  manufacturer text,
  part_kind text,
  fit_scope text,
  rule_source text,
  "position" text,
  interchange_group_id uuid,
  maintenance_component_id uuid,
  category_id uuid,
  sister_names text,
  source_make text,
  reference_oem text,
  reference_manufacturer text,
  also_known_as text[],
  confirmed_installs integer,
  description text,
  evidence_url text,
  match_reason_code text,
  match_reason_params jsonb,
  match_status text,
  fit_source text,
  via text,
  part_badge_code text,
  part_badge_params jsonb,
  derived_id uuid,
  side text,
  wva text,
  checking_note text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH cat AS (
    SELECT
      vc.id,
      vc.make,
      vc.model,
      vc.platform_id,
      vc.engine_family_id,
      vc.chassis_code,
      vc.engine_code,
      vc.production_start_year,
      vc.production_end_year,
      COALESCE(p_vehicle_year, vc.production_start_year) AS match_year
    FROM public.vehicle_catalog vc
    WHERE vc.id = p_catalog_id
  ),
  family AS (
    SELECT p.id
    FROM public.vehicle_platform p
    JOIN cat ON true
    LEFT JOIN public.vehicle_platform mine ON mine.id = cat.platform_id
    WHERE p.id = cat.platform_id
       OR p.id = mine.parent_id
       OR p.parent_id = cat.platform_id
       OR (mine.parent_id IS NOT NULL AND p.parent_id = mine.parent_id)
  ),
  sister AS (
    SELECT string_agg(DISTINCT (vc.make || ' ' || vc.model), ', ' ORDER BY (vc.make || ' ' || vc.model)) AS names
    FROM public.vehicle_catalog vc
    JOIN cat ON vc.platform_id IN (SELECT id FROM family)
    WHERE lower(vc.make || ' ' || vc.model) <> lower(cat.make || ' ' || cat.model)
  ),
  listings AS (
    SELECT
      pl.interchange_group_id AS group_id,
      pl.vehicle_catalog_id AS listed_id,
      pl.position,
      pl.side,
      pl.origin,
      pl.year_from,
      pl.year_to,
      g.fit_scope,
      lvc.make AS listed_make,
      lvc.model AS listed_model,
      lvc.chassis_code AS listed_chassis,
      lvc.engine_family_id AS listed_engine,
      lvc.platform_id AS listed_platform,
      (lvc.make || ' ' || lvc.model || ' ' || coalesce(lvc.chassis_code, '')) AS listed_label,
      pl.evidence_url,
      pl.id AS listing_id
    FROM public.part_listing pl
    JOIN public.part_interchange_group g ON g.id = pl.interchange_group_id
    JOIN public.vehicle_catalog lvc ON lvc.id = pl.vehicle_catalog_id
    CROSS JOIN cat
    WHERE NOT public.part_listing_exclusion_blocks(
      pl.interchange_group_id, cat.id, pl.position, pl.side, cat.match_year
    )
  ),
  scored AS (
    SELECT
      listings.*,
      CASE
        WHEN listings.listed_id = cat.id
          AND (listings.year_from IS NULL OR cat.match_year IS NULL OR cat.match_year >= listings.year_from)
          AND (listings.year_to IS NULL OR cat.match_year IS NULL OR cat.match_year <= listings.year_to) THEN 1
        WHEN lower(listings.listed_make) = lower(cat.make)
          AND lower(listings.listed_model) = lower(cat.model)
          AND upper(trim(coalesce(listings.listed_chassis, ''))) = upper(trim(coalesce(cat.chassis_code, '')))
          AND (
            listings.fit_scope IS DISTINCT FROM 'powertrain'
            OR listings.listed_engine IS NOT DISTINCT FROM cat.engine_family_id
          )
          AND (listings.year_from IS NULL OR cat.match_year IS NULL OR cat.match_year >= listings.year_from)
          AND (listings.year_to IS NULL OR cat.match_year IS NULL OR cat.match_year <= listings.year_to) THEN 1
        WHEN listings.listed_platform IN (SELECT id FROM family)
          AND (
            listings.fit_scope IS DISTINCT FROM 'powertrain'
            OR listings.listed_engine IS NOT DISTINCT FROM cat.engine_family_id
          )
          AND (listings.year_from IS NULL OR cat.match_year IS NULL OR cat.match_year >= listings.year_from)
          AND (listings.year_to IS NULL OR cat.match_year IS NULL OR cat.match_year <= listings.year_to) THEN 2
        WHEN listings.fit_scope = 'powertrain'
          AND listings.listed_engine IS NOT NULL
          AND listings.listed_engine = cat.engine_family_id
          AND (listings.listed_platform IS NULL OR listings.listed_platform NOT IN (SELECT id FROM family))
          AND (listings.year_from IS NULL OR cat.match_year IS NULL OR cat.match_year >= listings.year_from)
          AND (listings.year_to IS NULL OR cat.match_year IS NULL OR cat.match_year <= listings.year_to)
          THEN 3
        ELSE NULL
      END AS listing_tier
    FROM listings
    CROSS JOIN cat
  ),
  best_group AS (
    SELECT DISTINCT ON (group_id, position, side)
      group_id,
      listing_tier,
      position,
      side,
      origin,
      fit_scope,
      listed_label,
      evidence_url,
      listing_id
    FROM scored
    WHERE listing_tier IS NOT NULL
    ORDER BY group_id, position, side, listing_tier ASC, listed_id
  ),
  listing_hits AS (
    SELECT
      pm.id AS part_id,
      pm.name AS part_name,
      pm.oem_part_number,
      pm.manufacturer,
      pm.part_kind,
      bg.fit_scope,
      'listing'::text AS rule_source,
      bg.position,
      bg.group_id AS interchange_group_id,
      pm.maintenance_component_id,
      pm.category_id,
      pm.description,
      CASE
        WHEN pm.part_kind IN ('oe_supplier', 'aftermarket', 'reman', 'used') THEN 4
        ELSE bg.listing_tier
      END AS tier,
      bg.listed_label AS source_make,
      bg.evidence_url,
      CASE WHEN bg.origin = 'auto_match_kept' THEN 'kept' ELSE 'listed' END AS fit_source,
      CASE bg.listing_tier
        WHEN 1 THEN 'direct'
        WHEN 2 THEN 'sister'
        WHEN 3 THEN 'engine'
        ELSE 'direct'
      END AS via,
      'live'::text AS match_status,
      'listed_direct'::text AS match_reason_code,
      jsonb_build_object('part_listing_id', bg.listing_id) AS match_reason_params,
      bg.side,
      NULL::uuid AS derived_id,
      (SELECT pin.value FROM public.part_index_number pin WHERE pin.part_id = pm.id AND pin.index_type = 'wva' ORDER BY pin.created_at DESC LIMIT 1) AS wva,
      NULL::text AS checking_note
    FROM best_group bg
    JOIN public.part_master pm ON pm.interchange_group_id = bg.group_id
    WHERE pm.catalog_decision IS DISTINCT FROM 'rejected'
      AND (p_component_id IS NULL OR pm.maintenance_component_id = p_component_id)
      AND NOT EXISTS (
        SELECT 1
        FROM public.catalog_component_applicability a
        JOIN cat ON true
        WHERE a.applicable = false
          AND a.component_id = pm.maintenance_component_id
          AND (
            (a.scope = 'variant' AND a.vehicle_catalog_id = cat.id)
            OR (a.scope = 'platform' AND a.platform_id = cat.platform_id)
            OR (a.scope = 'engine_family' AND a.engine_family_id = cat.engine_family_id)
          )
      )
  ),
  derived_hits AS (
    SELECT
      pm.id AS part_id,
      pm.name AS part_name,
      pm.oem_part_number,
      pm.manufacturer,
      pm.part_kind,
      g.fit_scope,
      'derived'::text AS rule_source,
      d.position,
      d.interchange_group_id,
      pm.maintenance_component_id,
      pm.category_id,
      pm.description,
      CASE WHEN pm.part_kind IN ('oe_supplier', 'aftermarket', 'reman', 'used') THEN 4 ELSE 1 END AS tier,
      NULL::text AS source_make,
      NULL::text AS evidence_url,
      'derived'::text AS fit_source,
      'direct'::text AS via,
      d.status AS match_status,
      d.reason_code AS match_reason_code,
      d.reason_params AS match_reason_params,
      d.side,
      d.id AS derived_id,
      (SELECT pin.value FROM public.part_index_number pin WHERE pin.part_id = pm.id AND pin.index_type = 'wva' ORDER BY pin.created_at DESC LIMIT 1) AS wva,
      d.checking_note
    FROM public.part_fit_derived d
    JOIN public.part_master pm ON pm.interchange_group_id = d.interchange_group_id
    JOIN public.part_interchange_group g ON g.id = d.interchange_group_id
    JOIN cat ON cat.id = d.vehicle_catalog_id
    WHERE public.parts_auto_match_enabled()
      AND d.status IN ('live', 'needs_checking')
      AND pm.catalog_decision IS DISTINCT FROM 'rejected'
      AND (p_component_id IS NULL OR pm.maintenance_component_id = p_component_id)
      AND NOT public.part_listing_exclusion_blocks(
        d.interchange_group_id, cat.id, d.position, d.side, cat.match_year
      )
      AND (
        d.year_from IS NULL OR cat.match_year IS NULL OR cat.match_year >= d.year_from
      )
      AND (
        d.year_to IS NULL OR cat.match_year IS NULL OR cat.match_year <= d.year_to
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.catalog_component_applicability a
        WHERE a.applicable = false
          AND a.component_id = pm.maintenance_component_id
          AND (
            (a.scope = 'variant' AND a.vehicle_catalog_id = cat.id)
            OR (a.scope = 'platform' AND a.platform_id = cat.platform_id)
            OR (a.scope = 'engine_family' AND a.engine_family_id = cat.engine_family_id)
          )
      )
  ),
  tier1_fits AS (
    SELECT d.interchange_group_id, d.position, d.side, d.status AS match_status,
           d.reason_code, d.reason_params, 'derived'::text AS fit_source, d.vehicle_catalog_id
    FROM public.part_fit_derived d
    WHERE public.parts_auto_match_enabled() AND d.status IN ('live', 'needs_checking')
    UNION ALL
    SELECT pl.interchange_group_id, pl.position, pl.side, 'live'::text,
           'listed_direct'::text, jsonb_build_object('part_listing_id', pl.id),
           CASE WHEN pl.origin = 'auto_match_kept' THEN 'kept' ELSE 'listed' END,
           pl.vehicle_catalog_id
    FROM public.part_listing pl
    WHERE public.parts_auto_match_enabled()
  ),
  tier1_on_car AS (
    SELECT t.* FROM tier1_fits t JOIN cat ON cat.id = t.vehicle_catalog_id
  ),
  link_tier3_hits AS (
    SELECT
      pm.id AS part_id,
      pm.name AS part_name,
      pm.oem_part_number,
      pm.manufacturer,
      pm.part_kind,
      g.fit_scope,
      'derived'::text AS rule_source,
      t1.position,
      t1.interchange_group_id,
      pm.maintenance_component_id,
      pm.category_id,
      pm.description,
      CASE WHEN pm.part_kind IN ('oe_supplier', 'aftermarket', 'reman', 'used') THEN 4 ELSE 3 END AS tier,
      NULL::text AS source_make,
      NULL::text AS evidence_url,
      t1.fit_source,
      'platform_link'::text AS via,
      CASE
        WHEN l.scope = 'system' OR t1.match_status = 'needs_checking' THEN 'needs_checking'
        ELSE 'live'
      END AS match_status,
      'via_platform_link'::text AS match_reason_code,
      jsonb_build_object(
        'link_id', l.id,
        'platform_code', vp.code,
        'source_vehicle_id', src.id,
        'source_tier', 1
      ) AS match_reason_params,
      t1.side,
      NULL::uuid AS derived_id,
      (SELECT pin.value FROM public.part_index_number pin WHERE pin.part_id = pm.id AND pin.index_type = 'wva' ORDER BY pin.created_at DESC LIMIT 1) AS wva,
      NULL::text AS checking_note
    FROM public.platform_component_link l
    JOIN cat ON true
    JOIN public.vehicle_catalog src
      ON src.platform_id = CASE
        WHEN cat.platform_id = l.platform_a_id THEN l.platform_b_id
        ELSE l.platform_a_id
      END
    JOIN public.vehicle_platform vp ON vp.id = src.platform_id
    JOIN tier1_fits t1 ON t1.vehicle_catalog_id = src.id
    JOIN public.part_master pm ON pm.interchange_group_id = t1.interchange_group_id
    JOIN public.part_interchange_group g ON g.id = pm.interchange_group_id
    WHERE public.parts_auto_match_enabled()
      AND cat.platform_id IN (l.platform_a_id, l.platform_b_id)
      AND l.maintenance_component_id = pm.maintenance_component_id
      AND public.part_side_covers(l.position, l.side, t1.position, t1.side)
      AND NOT public.part_listing_exclusion_blocks(
        t1.interchange_group_id, cat.id, t1.position, t1.side, cat.match_year
      )
      AND (p_component_id IS NULL OR pm.maintenance_component_id = p_component_id)
      AND pm.catalog_decision IS DISTINCT FROM 'rejected'
      AND NOT EXISTS (
        SELECT 1
        FROM public.catalog_component_applicability a
        WHERE a.applicable = false
          AND a.component_id = pm.maintenance_component_id
          AND (
            (a.scope = 'variant' AND a.vehicle_catalog_id = cat.id)
            OR (a.scope = 'platform' AND a.platform_id = cat.platform_id)
            OR (a.scope = 'engine_family' AND a.engine_family_id = cat.engine_family_id)
          )
      )
      AND (
        cat.match_year IS NULL
        OR (
          cat.platform_id = l.platform_a_id
          AND (l.platform_a_year_from IS NULL OR cat.match_year >= l.platform_a_year_from)
          AND (l.platform_a_year_to IS NULL OR cat.match_year <= l.platform_a_year_to)
        )
        OR (
          cat.platform_id = l.platform_b_id
          AND (l.platform_b_year_from IS NULL OR cat.match_year >= l.platform_b_year_from)
          AND (l.platform_b_year_to IS NULL OR cat.match_year <= l.platform_b_year_to)
        )
      )
  ),
  sister_derived AS (
    SELECT
      pm.id AS part_id,
      pm.name AS part_name,
      pm.oem_part_number,
      pm.manufacturer,
      pm.part_kind,
      g.fit_scope,
      'derived'::text AS rule_source,
      d.position,
      d.interchange_group_id,
      pm.maintenance_component_id,
      pm.category_id,
      pm.description,
      2 AS tier,
      (src.make || ' ' || src.model) AS source_make,
      NULL::text AS evidence_url,
      'derived'::text AS fit_source,
      'sister'::text AS via,
      d.status AS match_status,
      d.reason_code AS match_reason_code,
      d.reason_params AS match_reason_params,
      d.side,
      d.id AS derived_id,
      (SELECT pin.value FROM public.part_index_number pin WHERE pin.part_id = pm.id AND pin.index_type = 'wva' ORDER BY pin.created_at DESC LIMIT 1) AS wva,
      d.checking_note
    FROM public.part_fit_derived d
    JOIN public.vehicle_catalog src ON src.id = d.vehicle_catalog_id
    JOIN cat ON true
    JOIN public.part_master pm ON pm.interchange_group_id = d.interchange_group_id
    JOIN public.part_interchange_group g ON g.id = d.interchange_group_id
    WHERE public.parts_auto_match_enabled()
      AND d.status IN ('live', 'needs_checking')
      AND d.vehicle_catalog_id <> cat.id
      AND src.platform_id IN (SELECT id FROM family)
      AND lower(src.make || ' ' || src.model) <> lower(cat.make || ' ' || cat.model)
      AND pm.catalog_decision IS DISTINCT FROM 'rejected'
      AND (p_component_id IS NULL OR pm.maintenance_component_id = p_component_id)
      AND NOT public.part_listing_exclusion_blocks(
        d.interchange_group_id, cat.id, d.position, d.side, cat.match_year
      )
      AND (
        d.year_from IS NULL OR cat.match_year IS NULL OR cat.match_year >= d.year_from
      )
      AND (
        d.year_to IS NULL OR cat.match_year IS NULL OR cat.match_year <= d.year_to
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.catalog_component_applicability a
        WHERE a.applicable = false
          AND a.component_id = pm.maintenance_component_id
          AND (
            (a.scope = 'variant' AND a.vehicle_catalog_id = cat.id)
            OR (a.scope = 'platform' AND a.platform_id = cat.platform_id)
            OR (a.scope = 'engine_family' AND a.engine_family_id = cat.engine_family_id)
          )
      )
  ),
  hits AS (
    SELECT * FROM listing_hits
    UNION ALL
    SELECT * FROM derived_hits
    UNION ALL
    SELECT * FROM sister_derived
    UNION ALL
    SELECT * FROM link_tier3_hits
  ),
  oem_ref AS (
    SELECT DISTINCT ON (h.interchange_group_id)
      h.interchange_group_id,
      h.oem_part_number AS reference_oem,
      h.manufacturer AS reference_manufacturer
    FROM hits h
    WHERE h.part_kind = 'oem' AND h.interchange_group_id IS NOT NULL
    ORDER BY h.interchange_group_id, h.tier ASC
  ),
  ranked AS (
    SELECT DISTINCT ON (h.part_id, h."position", h.side)
      h.*
    FROM hits h
    ORDER BY h.part_id, h."position", h.side, h.tier ASC, (h.match_status = 'live') DESC, h.rule_source
  ),
  matched AS (
    SELECT
      h.tier,
      h.part_id,
      h.part_name,
      h.oem_part_number,
      h.manufacturer,
      h.part_kind,
      h.fit_scope,
      h.rule_source,
      h.position,
      h.interchange_group_id,
      h.maintenance_component_id,
      h.category_id,
      sister.names AS sister_names,
      h.source_make,
      COALESCE(oem_ref.reference_oem, h.oem_part_number) AS reference_oem,
      COALESCE(oem_ref.reference_manufacturer, h.manufacturer) AS reference_manufacturer,
      COALESCE((
        SELECT array_agg(old.oem_part_number)
        FROM public.part_supersession s
        JOIN public.part_master old ON old.id = s.old_part_id
        WHERE s.new_part_id = h.part_id AND old.oem_part_number IS NOT NULL
      ), ARRAY[]::text[]) AS also_known_as,
      COALESCE((
        SELECT count(*)::integer
        FROM public.part_fit_feedback f
        WHERE f.part_id = h.part_id AND f.outcome = 'fit'
      ), 0) AS confirmed_installs,
      h.description,
      h.evidence_url,
      h.match_reason_code,
      h.match_reason_params,
      h.match_status,
      h.fit_source,
      h.via,
      (
        SELECT CASE WHEN m.rule = 'index' THEN 'index_badge' END
        FROM public.interchange_group_merge_log m
        WHERE m.reversed_at IS NULL
          AND m.part_id = h.part_id
          AND m.rule = 'index'
        ORDER BY m.created_at DESC
        LIMIT 1
      ) AS part_badge_code,
      (
        SELECT jsonb_build_object(
          'index_type', m.matched_key,
          'merge_log_id', m.id
        )
        FROM public.interchange_group_merge_log m
        WHERE m.reversed_at IS NULL
          AND m.part_id = h.part_id
          AND m.rule = 'index'
        ORDER BY m.created_at DESC
        LIMIT 1
      ) AS part_badge_params,
      h.derived_id,
      h.side,
      h.wva,
      h.checking_note
    FROM ranked h
    LEFT JOIN sister ON true
    LEFT JOIN oem_ref ON oem_ref.interchange_group_id = h.interchange_group_id

    UNION ALL

    SELECT
      5 AS tier,
      u.universal_part_id AS part_id,
      u.name AS part_name,
      u.part_number AS oem_part_number,
      u.manufacturer,
      'universal'::text AS part_kind,
      'universal'::text AS fit_scope,
      'universal'::text AS rule_source,
      NULL::text AS "position",
      NULL::uuid AS interchange_group_id,
      sk.component_id AS maintenance_component_id,
      NULL::uuid AS category_id,
      NULL::text AS sister_names,
      NULL::text AS source_make,
      NULL::text AS reference_oem,
      NULL::text AS reference_manufacturer,
      NULL::text[] AS also_known_as,
      NULL::integer AS confirmed_installs,
      NULL::text AS description,
      NULL::text AS evidence_url,
      'universal_spec'::text AS match_reason_code,
      jsonb_build_array(
        jsonb_build_object('spec_key', u.spec_key, 'value', u.spec_value, 'unit', u.unit)
      ) AS match_reason_params,
      'live'::text AS match_status,
      'universal'::text AS fit_source,
      'universal'::text AS via,
      NULL::text AS part_badge_code,
      NULL::jsonb AS part_badge_params,
      NULL::uuid AS derived_id,
      NULL::text AS side,
      NULL::text AS wva,
      NULL::text AS checking_note
    FROM public.universal_parts_for_variant(p_catalog_id, p_vehicle_year) u
    JOIN public.spec_key sk ON sk.key = u.spec_key
    WHERE u.universal_part_id IS NOT NULL
      AND (p_component_id IS NULL OR sk.component_id = p_component_id)
  )
  SELECT
    m.tier,
    m.part_id,
    m.part_name,
    m.oem_part_number,
    m.manufacturer,
    m.part_kind,
    m.fit_scope,
    m.rule_source,
    m.position,
    m.interchange_group_id,
    m.maintenance_component_id,
    m.category_id,
    m.sister_names,
    m.source_make,
    m.reference_oem,
    m.reference_manufacturer,
    m.also_known_as,
    m.confirmed_installs,
    m.description,
    m.evidence_url,
    m.match_reason_code,
    m.match_reason_params,
    m.match_status,
    m.fit_source,
    m.via,
    m.part_badge_code,
    m.part_badge_params,
    m.derived_id,
    m.side,
    m.wva,
    m.checking_note
  FROM matched m
  ORDER BY
    m.tier ASC NULLS LAST,
    m.part_name ASC NULLS LAST,
    m.position ASC NULLS LAST,
    m.side ASC NULLS LAST;
$$;

REVOKE ALL ON FUNCTION public.parts_for_vehicle(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.parts_for_vehicle(uuid, uuid, integer) TO service_role;

