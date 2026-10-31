-- Full database search. The database returns one page plus chip counts.
-- Callers never scan the catalog in the app.

CREATE OR REPLACE FUNCTION public.admin_catalog_master_search(
  p_q text DEFAULT '',
  p_match text DEFAULT 'all',
  p_brand text DEFAULT '',
  p_assembly text DEFAULT '',
  p_variant_id uuid DEFAULT NULL,
  p_status text DEFAULT '',
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_q text := replace(replace(btrim(coalesce(p_q, '')), '%', ''), '_', '');
  v_match text := lower(btrim(coalesce(p_match, 'all')));
  v_brand text := btrim(coalesce(p_brand, ''));
  v_assembly text := btrim(coalesce(p_assembly, ''));
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 50);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_rows jsonb;
  v_total integer;
  v_chips jsonb;
  v_facets jsonb;
BEGIN
  IF v_match NOT IN ('all', 'oem', 'sister', 'engine', 'aftermarket', 'universal') THEN
    v_match := 'all';
  END IF;
  IF v_status NOT IN ('', 'verified', 'needs_checking') THEN
    v_status := '';
  END IF;

  DROP TABLE IF EXISTS tmp_master;
  CREATE TEMP TABLE tmp_master ON COMMIT DROP AS
  SELECT
    pm.id AS part_id,
    pm.interchange_group_id AS group_id,
    coalesce(pm.name, '') AS name,
    coalesce(pm.oem_part_number, '') AS number,
    coalesce(pm.manufacturer, '') AS brand,
    CASE
      WHEN pm.part_kind IN ('oe_supplier', 'aftermarket', 'reman', 'used') THEN 4
      WHEN coalesce(g.fit_scope, '') = 'powertrain'
        AND NOT EXISTS (
          SELECT 1 FROM public.part_listing listed
          WHERE listed.interchange_group_id = pm.interchange_group_id
        ) THEN 3
      ELSE 1
    END AS tier,
    coalesce(pc.label, mc.plain_name, mc.name, '') AS assembly,
    CASE WHEN pm.catalog_decision = 'confirmed' THEN 'verified' ELSE 'needs_checking' END AS status,
    pm.updated_at
  FROM public.part_master pm
  LEFT JOIN public.part_interchange_group g ON g.id = pm.interchange_group_id
  LEFT JOIN public.part_category pc ON pc.id = pm.category_id
  LEFT JOIN public.maintenance_service_categories mc ON mc.id = pm.maintenance_component_id
  WHERE pm.catalog_decision IS DISTINCT FROM 'rejected'
    AND (v_brand = '' OR pm.manufacturer ILIKE v_brand)
    AND (v_assembly = '' OR coalesce(pc.label, mc.plain_name, mc.name, '') ILIKE v_assembly)
    AND (
      v_status = ''
      OR (v_status = 'verified' AND pm.catalog_decision = 'confirmed')
      OR (v_status = 'needs_checking' AND pm.catalog_decision IS DISTINCT FROM 'confirmed')
    )
    AND (
      p_variant_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.part_listing pl
        WHERE pl.interchange_group_id = pm.interchange_group_id
          AND pl.vehicle_catalog_id = p_variant_id
      )
    )
    AND (
      v_q = ''
      OR pm.name ILIKE '%' || v_q || '%'
      OR coalesce(pm.oem_part_number, '') ILIKE '%' || v_q || '%'
      OR coalesce(pm.manufacturer, '') ILIKE '%' || v_q || '%'
      OR EXISTS (
        SELECT 1
        FROM public.part_listing pl
        JOIN public.vehicle_catalog vc ON vc.id = pl.vehicle_catalog_id
        WHERE pl.interchange_group_id = pm.interchange_group_id
          AND (
            vc.make ILIKE '%' || v_q || '%'
            OR vc.model ILIKE '%' || v_q || '%'
            OR coalesce(vc.chassis_code, '') ILIKE '%' || v_q || '%'
          )
      )
    );

  SELECT jsonb_build_object(
    'all', (SELECT count(*) FROM tmp_master WHERE tier IN (1, 3, 4)),
    'oem', (SELECT count(*) FROM tmp_master WHERE tier = 1),
    'engine', (SELECT count(*) FROM tmp_master WHERE tier = 3),
    'aftermarket', (SELECT count(*) FROM tmp_master WHERE tier = 4),
    'sister', (
      SELECT count(*) FROM public.vehicle_platform parent
      WHERE parent.parent_id IS NULL
        AND EXISTS (SELECT 1 FROM public.vehicle_platform child WHERE child.parent_id = parent.id)
    ),
    'universal', (SELECT count(*) FROM public.universal_part)
  ) INTO v_chips;

  SELECT count(*)::integer INTO v_total
  FROM tmp_master
  WHERE v_match IN ('sister', 'universal')
     OR (v_match = 'all' AND tier IN (1, 3, 4))
     OR (v_match = 'oem' AND tier = 1)
     OR (v_match = 'engine' AND tier = 3)
     OR (v_match = 'aftermarket' AND tier = 4);

  IF v_match IN ('sister', 'universal') THEN
    v_rows := '[]'::jsonb;
    v_total := 0;
  ELSE
    SELECT coalesce(jsonb_agg(to_jsonb(page_rows)), '[]'::jsonb) INTO v_rows
    FROM (
      SELECT
        t.part_id AS "partId",
        t.group_id AS "groupId",
        t.name,
        t.number,
        t.brand,
        t.tier,
        t.assembly,
        coalesce((
          SELECT string_agg(label, ', ')
          FROM (
            SELECT DISTINCT trim(vc.make || ' ' || vc.model) AS label
            FROM public.part_listing pl
            JOIN public.vehicle_catalog vc ON vc.id = pl.vehicle_catalog_id
            WHERE pl.interchange_group_id = t.group_id
            ORDER BY 1
            LIMIT 3
          ) names
        ), '') AS "fittedCars",
        coalesce((
          SELECT count(*)::integer FROM public.part_listing pl
          WHERE pl.interchange_group_id = t.group_id
        ), 0) AS "versionCount",
        t.status,
        t.updated_at AS "updatedAt"
      FROM tmp_master t
      WHERE (v_match = 'all' AND t.tier IN (1, 3, 4))
         OR (v_match = 'oem' AND t.tier = 1)
         OR (v_match = 'engine' AND t.tier = 3)
         OR (v_match = 'aftermarket' AND t.tier = 4)
      ORDER BY t.updated_at DESC NULLS LAST, t.name
      LIMIT v_limit OFFSET v_offset
    ) page_rows;
  END IF;

  SELECT jsonb_build_object(
    'brands', coalesce((
      SELECT jsonb_agg(brand ORDER BY brand)
      FROM (
        SELECT DISTINCT brand FROM tmp_master WHERE brand <> '' ORDER BY brand LIMIT 40
      ) b
    ), '[]'::jsonb),
    'assemblies', coalesce((
      SELECT jsonb_agg(assembly ORDER BY assembly)
      FROM (
        SELECT DISTINCT assembly FROM tmp_master WHERE assembly <> '' ORDER BY assembly LIMIT 40
      ) a
    ), '[]'::jsonb),
    'cars', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', vc.id,
        'label', trim(vc.make || ' ' || vc.model || coalesce(' (' || nullif(vc.chassis_code, '') || ')', ''))
      ) ORDER BY vc.make, vc.model)
      FROM (
        SELECT DISTINCT vc.id, vc.make, vc.model, vc.chassis_code
        FROM public.vehicle_catalog vc
        WHERE EXISTS (
          SELECT 1 FROM public.part_listing pl WHERE pl.vehicle_catalog_id = vc.id
        )
        ORDER BY vc.make, vc.model
        LIMIT 80
      ) vc
    ), '[]'::jsonb)
  ) INTO v_facets;

  RETURN jsonb_build_object(
    'rows', coalesce(v_rows, '[]'::jsonb),
    'total', coalesce(v_total, 0),
    'chips', v_chips,
    'facets', v_facets
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_catalog_master_part(p_part_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group uuid;
  v_part jsonb;
  v_fits jsonb;
BEGIN
  SELECT jsonb_build_object(
    'partId', pm.id,
    'groupId', pm.interchange_group_id,
    'name', coalesce(pm.name, ''),
    'number', coalesce(pm.oem_part_number, ''),
    'brand', coalesce(pm.manufacturer, ''),
    'tier', CASE
      WHEN pm.part_kind IN ('oe_supplier', 'aftermarket', 'reman', 'used') THEN 4
      WHEN coalesce(g.fit_scope, '') = 'powertrain'
        AND NOT EXISTS (
          SELECT 1 FROM public.part_listing listed
          WHERE listed.interchange_group_id = pm.interchange_group_id
        ) THEN 3
      ELSE 1
    END,
    'status', CASE WHEN pm.catalog_decision = 'confirmed' THEN 'verified' ELSE 'needs_checking' END,
    'evidenceUrl', coalesce(pm.evidence_url, (
      SELECT pl.evidence_url FROM public.part_listing pl
      WHERE pl.interchange_group_id = pm.interchange_group_id
      ORDER BY pl.verified_at DESC NULLS LAST
      LIMIT 1
    )),
    'note', coalesce(pm.description, (
      SELECT pl.note FROM public.part_listing pl
      WHERE pl.interchange_group_id = pm.interchange_group_id AND coalesce(pl.note, '') <> ''
      LIMIT 1
    ), '')
  ), pm.interchange_group_id
  INTO v_part, v_group
  FROM public.part_master pm
  LEFT JOIN public.part_interchange_group g ON g.id = pm.interchange_group_id
  WHERE pm.id = p_part_id
    AND pm.catalog_decision IS DISTINCT FROM 'rejected';

  IF v_part IS NULL THEN
    RETURN jsonb_build_object('error', 'Part not on file');
  END IF;

  SELECT coalesce(jsonb_agg(fit ORDER BY fit->>'linkType', fit->>'make', fit->>'model'), '[]'::jsonb)
  INTO v_fits
  FROM (
    SELECT jsonb_build_object(
      'variantId', vc.id,
      'make', vc.make,
      'model', vc.model,
      'chassis', coalesce(vc.chassis_code, ''),
      'years', CASE
        WHEN pl.year_from IS NULL AND pl.year_to IS NULL THEN trim(both FROM
          coalesce(vc.production_start_year::text, '') ||
          CASE WHEN vc.production_end_year IS NULL THEN '–present' ELSE '–' || vc.production_end_year::text END
        )
        ELSE coalesce(pl.year_from::text, '') || '–' || coalesce(pl.year_to::text, 'present')
      END,
      'position', coalesce(pl.position, ''),
      'linkType', 'DIRECT'
    ) AS fit
    FROM public.part_listing pl
    JOIN public.vehicle_catalog vc ON vc.id = pl.vehicle_catalog_id
    WHERE pl.interchange_group_id = v_group
    LIMIT 40
  ) direct;

  IF v_group IS NOT NULL THEN
    v_fits := coalesce(v_fits, '[]'::jsonb) || coalesce((
    SELECT jsonb_agg(fit)
    FROM (
      SELECT jsonb_build_object(
        'variantId', vc.id,
        'make', vc.make,
        'model', vc.model,
        'chassis', coalesce(vc.chassis_code, ''),
        'years', trim(both FROM coalesce(vc.production_start_year::text, '') ||
          CASE WHEN vc.production_end_year IS NULL THEN '–present' ELSE '–' || vc.production_end_year::text END),
        'position', '',
        'linkType', 'PLATFORM TWIN'
      ) AS fit
      FROM public.vehicle_catalog vc
      WHERE vc.platform_id IN (
        SELECT family.id
        FROM public.vehicle_platform family
        WHERE family.parent_id IN (
          SELECT coalesce(vp.parent_id, vp.id)
          FROM public.part_listing pl
          JOIN public.vehicle_catalog listed ON listed.id = pl.vehicle_catalog_id
          JOIN public.vehicle_platform vp ON vp.id = listed.platform_id
          WHERE pl.interchange_group_id = v_group
        )
        OR family.id IN (
          SELECT coalesce(vp.parent_id, vp.id)
          FROM public.part_listing pl
          JOIN public.vehicle_catalog listed ON listed.id = pl.vehicle_catalog_id
          JOIN public.vehicle_platform vp ON vp.id = listed.platform_id
          WHERE pl.interchange_group_id = v_group
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.part_listing pl
        WHERE pl.interchange_group_id = v_group AND pl.vehicle_catalog_id = vc.id
      )
      LIMIT 12
    ) twins
    ), '[]'::jsonb);
  END IF;

  RETURN v_part || jsonb_build_object('fits', coalesce(v_fits, '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_catalog_master_search(text, text, text, text, uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_catalog_master_part(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_catalog_master_search(text, text, text, text, uuid, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_catalog_master_part(uuid) TO service_role;
