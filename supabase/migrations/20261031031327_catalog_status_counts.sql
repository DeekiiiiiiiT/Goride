-- Status facet counts parts only.
-- Sister families and size-based parts have no status, so they must not inflate All.
-- Invariant: facets.statusCounts.all = verified + needs_checking
-- (both counted from tmp_master, before the status radio filter).

CREATE OR REPLACE FUNCTION public.admin_catalog_master_search(
  p_q text DEFAULT '',
  p_match text DEFAULT 'all',
  p_brand text DEFAULT '',
  p_assembly text DEFAULT '',
  p_variant_id uuid DEFAULT NULL,
  p_status text DEFAULT '',
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0,
  p_make text DEFAULT '',
  p_model text DEFAULT '',
  p_year integer DEFAULT NULL
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
  v_make text := btrim(coalesce(p_make, ''));
  v_model text := btrim(coalesce(p_model, ''));
  v_year integer := p_year;
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 50);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_rows jsonb;
  v_total integer;
  v_chips jsonb;
  v_facets jsonb;
  v_groups jsonb;
  v_empty jsonb;
  v_oem integer;
  v_engine integer;
  v_after integer;
  v_sister integer;
  v_universal integer;
BEGIN
  IF v_match NOT IN ('all', 'oem', 'sister', 'engine', 'aftermarket', 'universal') THEN
    v_match := 'all';
  END IF;
  IF v_status NOT IN ('', 'verified', 'needs_checking') THEN
    v_status := '';
  END IF;
  IF v_year IS NOT NULL AND v_year < 1950 THEN
    v_year := NULL;
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
    AND (
      v_brand = ''
      OR pm.manufacturer ILIKE v_brand
      OR EXISTS (
        SELECT 1 FROM unnest(string_to_array(v_brand, ',')) AS piece(val)
        WHERE btrim(piece.val) <> '' AND pm.manufacturer ILIKE btrim(piece.val)
      )
    )
    AND (v_assembly = '' OR coalesce(pc.label, mc.plain_name, mc.name, '') ILIKE v_assembly)
    AND (
      p_variant_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.part_listing pl
        WHERE pl.interchange_group_id = pm.interchange_group_id
          AND pl.vehicle_catalog_id = p_variant_id
      )
    )
    AND (
      v_make = '' AND v_model = '' AND v_year IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.part_listing pl
        JOIN public.vehicle_catalog vc ON vc.id = pl.vehicle_catalog_id
        WHERE pl.interchange_group_id = pm.interchange_group_id
          AND (v_make = '' OR vc.make ILIKE v_make)
          AND (v_model = '' OR vc.model ILIKE v_model)
          AND (
            v_year IS NULL
            OR (
              coalesce(vc.production_start_year, 0) <= v_year
              AND coalesce(vc.production_end_year, vc.production_start_year, v_year) >= v_year
            )
          )
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

  DROP TABLE IF EXISTS tmp_parts;
  CREATE TEMP TABLE tmp_parts ON COMMIT DROP AS
  SELECT * FROM tmp_master
  WHERE v_status = ''
     OR (v_status = 'verified' AND status = 'verified')
     OR (v_status = 'needs_checking' AND status = 'needs_checking');

  DROP TABLE IF EXISTS tmp_sister;
  CREATE TEMP TABLE tmp_sister ON COMMIT DROP AS
  SELECT
    parent.id,
    coalesce(parent.label, parent.code, '') AS label,
    coalesce((
      SELECT string_agg(child.code, ' · ' ORDER BY child.code)
      FROM public.vehicle_platform child
      WHERE child.parent_id = parent.id AND coalesce(child.code, '') <> ''
    ), '') AS chassis_codes,
    coalesce((
      SELECT jsonb_agg(car_name ORDER BY car_name)
      FROM (
        SELECT DISTINCT trim(vc.make || ' ' || vc.model) AS car_name
        FROM public.vehicle_platform child
        JOIN public.vehicle_catalog vc ON vc.platform_id = child.id
        WHERE child.parent_id = parent.id
          AND trim(vc.make || ' ' || vc.model) <> ''
      ) names
    ), '[]'::jsonb) AS cars
  FROM public.vehicle_platform parent
  WHERE parent.parent_id IS NULL
    AND EXISTS (SELECT 1 FROM public.vehicle_platform child WHERE child.parent_id = parent.id)
    AND v_status = ''
    AND v_assembly = ''
    AND (
      v_q = ''
      OR coalesce(parent.label, parent.code, '') ILIKE '%' || v_q || '%'
      OR EXISTS (
        SELECT 1 FROM public.vehicle_platform child
        WHERE child.parent_id = parent.id AND coalesce(child.code, '') ILIKE '%' || v_q || '%'
      )
    )
    AND (
      v_brand = ''
      OR EXISTS (
        SELECT 1 FROM public.vehicle_platform child
        WHERE child.parent_id = parent.id
          AND (
            coalesce(child.maker, '') ILIKE v_brand
            OR EXISTS (
              SELECT 1 FROM unnest(string_to_array(v_brand, ',')) AS piece(val)
              WHERE btrim(piece.val) <> '' AND coalesce(child.maker, '') ILIKE btrim(piece.val)
            )
          )
      )
    )
    AND (
      v_make = '' AND v_model = '' AND v_year IS NULL AND p_variant_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.vehicle_platform child
        JOIN public.vehicle_catalog vc ON vc.platform_id = child.id
        WHERE child.parent_id = parent.id
          AND (p_variant_id IS NULL OR vc.id = p_variant_id)
          AND (v_make = '' OR vc.make ILIKE v_make)
          AND (v_model = '' OR vc.model ILIKE v_model)
          AND (
            v_year IS NULL
            OR (
              coalesce(vc.production_start_year, 0) <= v_year
              AND coalesce(vc.production_end_year, vc.production_start_year, v_year) >= v_year
            )
          )
      )
    );

  DROP TABLE IF EXISTS tmp_universal;
  CREATE TEMP TABLE tmp_universal ON COMMIT DROP AS
  SELECT
    up.id,
    coalesce(up.name, '') AS name,
    coalesce(up.part_number, '') AS number,
    coalesce(up.manufacturer, '') AS brand,
    trim(coalesce(sk.label, up.spec_key, '') || ' ' || coalesce(up.spec_value, '')) AS fits,
    coalesce(up.evidence_url, '') AS source
  FROM public.universal_part up
  LEFT JOIN public.spec_key sk ON sk.key = up.spec_key
  WHERE v_status = ''
    AND (
      v_brand = ''
      OR up.manufacturer ILIKE v_brand
      OR EXISTS (
        SELECT 1 FROM unnest(string_to_array(v_brand, ',')) AS piece(val)
        WHERE btrim(piece.val) <> '' AND up.manufacturer ILIKE btrim(piece.val)
      )
    )
    AND (
      v_assembly = ''
      OR coalesce(sk.label, up.spec_key, '') ILIKE '%' || v_assembly || '%'
      OR coalesce(up.name, '') ILIKE '%' || v_assembly || '%'
    )
    AND (
      v_q = ''
      OR coalesce(up.name, '') ILIKE '%' || v_q || '%'
      OR coalesce(up.part_number, '') ILIKE '%' || v_q || '%'
      OR coalesce(up.manufacturer, '') ILIKE '%' || v_q || '%'
    )
    AND (
      v_make = '' AND v_model = '' AND v_year IS NULL AND p_variant_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM (
          SELECT vc.id, vc.production_start_year
          FROM public.vehicle_catalog vc
          WHERE (p_variant_id IS NULL OR vc.id = p_variant_id)
            AND (v_make = '' OR vc.make ILIKE v_make)
            AND (v_model = '' OR vc.model ILIKE v_model)
            AND (
              v_year IS NULL
              OR (
                coalesce(vc.production_start_year, 0) <= v_year
                AND coalesce(vc.production_end_year, vc.production_start_year, v_year) >= v_year
              )
            )
          LIMIT 40
        ) vc
        JOIN LATERAL public.universal_parts_for_variant(vc.id, coalesce(v_year, vc.production_start_year)) hit
          ON hit.universal_part_id = up.id
      )
    );

  SELECT count(*) INTO v_oem FROM tmp_parts WHERE tier = 1;
  SELECT count(*) INTO v_engine FROM tmp_parts WHERE tier = 3;
  SELECT count(*) INTO v_after FROM tmp_parts WHERE tier = 4;
  SELECT count(*) INTO v_sister FROM tmp_sister;
  SELECT count(*) INTO v_universal FROM tmp_universal;

  SELECT jsonb_build_object(
    'all', v_oem + v_engine + v_after + v_sister + v_universal,
    'oem', v_oem,
    'engine', v_engine,
    'aftermarket', v_after,
    'sister', v_sister,
    'universal', v_universal
  ) INTO v_chips;

  v_total := CASE v_match
    WHEN 'oem' THEN v_oem
    WHEN 'engine' THEN v_engine
    WHEN 'aftermarket' THEN v_after
    WHEN 'sister' THEN v_sister
    WHEN 'universal' THEN v_universal
    ELSE v_oem + v_engine + v_after + v_sister + v_universal
  END;

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
    FROM tmp_parts t
    WHERE (v_match = 'all' AND t.tier IN (1, 3, 4))
       OR (v_match = 'oem' AND t.tier = 1)
       OR (v_match = 'engine' AND t.tier = 3)
       OR (v_match = 'aftermarket' AND t.tier = 4)
    ORDER BY t.updated_at DESC NULLS LAST, t.name
    LIMIT v_limit OFFSET v_offset
  ) page_rows;

  v_groups := jsonb_build_object(
    'oem', CASE WHEN v_match IN ('all', 'oem') THEN (
      SELECT coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb) FROM (
        SELECT t.part_id AS "partId", t.group_id AS "groupId", t.name, t.number, t.brand, t.tier, t.assembly,
          coalesce((
            SELECT string_agg(label, ', ') FROM (
              SELECT DISTINCT trim(vc.make || ' ' || vc.model) AS label
              FROM public.part_listing pl
              JOIN public.vehicle_catalog vc ON vc.id = pl.vehicle_catalog_id
              WHERE pl.interchange_group_id = t.group_id
              ORDER BY 1 LIMIT 3
            ) names
          ), '') AS "fittedCars",
          coalesce((SELECT count(*)::integer FROM public.part_listing pl WHERE pl.interchange_group_id = t.group_id), 0) AS "versionCount",
          t.status, t.updated_at AS "updatedAt"
        FROM tmp_parts t WHERE t.tier = 1
        ORDER BY t.updated_at DESC NULLS LAST, t.name
        LIMIT v_limit OFFSET CASE WHEN v_match = 'oem' THEN v_offset ELSE 0 END
      ) g
    ) ELSE '[]'::jsonb END,
    'engine', CASE WHEN v_match IN ('all', 'engine') THEN (
      SELECT coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb) FROM (
        SELECT t.part_id AS "partId", t.group_id AS "groupId", t.name, t.number, t.brand, t.tier, t.assembly,
          coalesce((
            SELECT string_agg(label, ', ') FROM (
              SELECT DISTINCT trim(vc.make || ' ' || vc.model) AS label
              FROM public.part_listing pl
              JOIN public.vehicle_catalog vc ON vc.id = pl.vehicle_catalog_id
              WHERE pl.interchange_group_id = t.group_id
              ORDER BY 1 LIMIT 3
            ) names
          ), '') AS "fittedCars",
          coalesce((SELECT count(*)::integer FROM public.part_listing pl WHERE pl.interchange_group_id = t.group_id), 0) AS "versionCount",
          t.status, t.updated_at AS "updatedAt"
        FROM tmp_parts t WHERE t.tier = 3
        ORDER BY t.updated_at DESC NULLS LAST, t.name
        LIMIT v_limit OFFSET CASE WHEN v_match = 'engine' THEN v_offset ELSE 0 END
      ) g
    ) ELSE '[]'::jsonb END,
    'aftermarket', CASE WHEN v_match IN ('all', 'aftermarket') THEN (
      SELECT coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb) FROM (
        SELECT t.part_id AS "partId", t.group_id AS "groupId", t.name, t.number, t.brand, t.tier, t.assembly,
          coalesce((
            SELECT string_agg(label, ', ') FROM (
              SELECT DISTINCT trim(vc.make || ' ' || vc.model) AS label
              FROM public.part_listing pl
              JOIN public.vehicle_catalog vc ON vc.id = pl.vehicle_catalog_id
              WHERE pl.interchange_group_id = t.group_id
              ORDER BY 1 LIMIT 3
            ) names
          ), '') AS "fittedCars",
          coalesce((SELECT count(*)::integer FROM public.part_listing pl WHERE pl.interchange_group_id = t.group_id), 0) AS "versionCount",
          t.status, t.updated_at AS "updatedAt"
        FROM tmp_parts t WHERE t.tier = 4
        ORDER BY t.updated_at DESC NULLS LAST, t.name
        LIMIT v_limit OFFSET CASE WHEN v_match = 'aftermarket' THEN v_offset ELSE 0 END
      ) g
    ) ELSE '[]'::jsonb END,
    'sister', CASE WHEN v_match IN ('all', 'sister') THEN (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id,
        'label', s.label,
        'chassisCodes', s.chassis_codes,
        'cars', s.cars
      ) ORDER BY s.label), '[]'::jsonb)
      FROM (
        SELECT * FROM tmp_sister
        ORDER BY label
        LIMIT v_limit OFFSET CASE WHEN v_match = 'sister' THEN v_offset ELSE 0 END
      ) s
    ) ELSE '[]'::jsonb END,
    'universal', CASE WHEN v_match IN ('all', 'universal') THEN (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', u.id,
        'name', u.name,
        'number', u.number,
        'brand', u.brand,
        'fits', u.fits,
        'source', u.source
      ) ORDER BY u.name), '[]'::jsonb)
      FROM (
        SELECT * FROM tmp_universal
        ORDER BY name
        LIMIT v_limit OFFSET CASE WHEN v_match = 'universal' THEN v_offset ELSE 0 END
      ) u
    ) ELSE '[]'::jsonb END
  );

  SELECT coalesce(jsonb_agg(label), '[]'::jsonb) INTO v_empty
  FROM (
    VALUES
      ('oem', v_oem, 'Made for the car'),
      ('sister', v_sister, 'Same car, different badge'),
      ('engine', v_engine, 'Fits the engine'),
      ('aftermarket', v_after, 'Other brands'),
      ('universal', v_universal, 'Fits by size')
  ) AS empty_row(kind, n, label)
  WHERE v_match = 'all' AND n = 0;

  SELECT jsonb_build_object(
    'brands', coalesce((
      SELECT jsonb_agg(brand ORDER BY brand)
      FROM (SELECT DISTINCT brand FROM tmp_master WHERE brand <> '' ORDER BY brand LIMIT 40) b
    ), '[]'::jsonb),
    'brandCounts', coalesce((
      SELECT jsonb_agg(jsonb_build_object('name', brand, 'count', n) ORDER BY n DESC, brand)
      FROM (SELECT brand, count(*)::integer AS n FROM tmp_parts WHERE brand <> '' GROUP BY brand ORDER BY n DESC, brand LIMIT 40) b
    ), '[]'::jsonb),
    'assemblies', coalesce((
      SELECT jsonb_agg(assembly ORDER BY assembly)
      FROM (SELECT DISTINCT assembly FROM tmp_master WHERE assembly <> '' ORDER BY assembly LIMIT 40) a
    ), '[]'::jsonb),
    'areaCounts', coalesce((
      SELECT jsonb_agg(jsonb_build_object('name', assembly, 'count', n) ORDER BY n DESC, assembly)
      FROM (SELECT assembly, count(*)::integer AS n FROM tmp_parts WHERE assembly <> '' GROUP BY assembly) a
    ), '[]'::jsonb),
    'statusCounts', jsonb_build_object(
      'all', (SELECT count(*) FROM tmp_master),
      'verified', (SELECT count(*) FROM tmp_master WHERE status = 'verified'),
      'needs_checking', (SELECT count(*) FROM tmp_master WHERE status = 'needs_checking')
    ),
    'cars', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', vc.id,
        'label', trim(vc.make || ' ' || vc.model || coalesce(' (' || nullif(vc.chassis_code, '') || ')', ''))
      ) ORDER BY vc.make, vc.model)
      FROM (
        SELECT DISTINCT vc.id, vc.make, vc.model, vc.chassis_code
        FROM public.vehicle_catalog vc
        WHERE EXISTS (SELECT 1 FROM public.part_listing pl WHERE pl.vehicle_catalog_id = vc.id)
        ORDER BY vc.make, vc.model
        LIMIT 80
      ) vc
    ), '[]'::jsonb)
  ) INTO v_facets;

  RETURN jsonb_build_object(
    'rows', coalesce(v_rows, '[]'::jsonb),
    'total', coalesce(v_total, 0),
    'chips', v_chips,
    'facets', v_facets,
    'groups', v_groups,
    'emptyTiers', coalesce(v_empty, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_catalog_master_search(text, text, text, text, uuid, text, integer, integer, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_catalog_master_search(text, text, text, text, uuid, text, integer, integer, text, text, integer) TO service_role;
