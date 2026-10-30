-- Rev 4 parts audit.
-- Year windows apply to direct and sister matches only.
-- Closes the readiness-view grant leak, the Belta engine, and unlist-on-edit.

REVOKE ALL ON TABLE public.variant_parts_readiness FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.variant_parts_readiness TO service_role;

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
  evidence_url text
)
LANGUAGE sql
STABLE
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
      pl.year_from,
      pl.year_to,
      g.fit_scope,
      lvc.make AS listed_make,
      lvc.model AS listed_model,
      lvc.chassis_code AS listed_chassis,
      lvc.engine_family_id AS listed_engine,
      lvc.platform_id AS listed_platform,
      (lvc.make || ' ' || lvc.model || ' ' || coalesce(lvc.chassis_code, '')) AS listed_label,
      pl.evidence_url
    FROM public.part_listing pl
    JOIN public.part_interchange_group g ON g.id = pl.interchange_group_id
    JOIN public.vehicle_catalog lvc ON lvc.id = pl.vehicle_catalog_id
    CROSS JOIN cat
    WHERE NOT EXISTS (
        SELECT 1
        FROM public.part_listing_exclusion ex
        WHERE ex.interchange_group_id = pl.interchange_group_id
          AND ex.vehicle_catalog_id = cat.id
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
          THEN 3
        ELSE NULL
      END AS listing_tier
    FROM listings
    CROSS JOIN cat
  ),
  best_group AS (
    SELECT DISTINCT ON (group_id, position)
      group_id,
      listing_tier,
      position,
      fit_scope,
      listed_label,
      evidence_url
    FROM scored
    WHERE listing_tier IS NOT NULL
    ORDER BY group_id, position, listing_tier ASC, listed_id
  ),
  hits AS (
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
      bg.evidence_url
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
  oem_ref AS (
    SELECT DISTINCT ON (h.interchange_group_id)
      h.interchange_group_id,
      h.oem_part_number AS reference_oem,
      h.manufacturer AS reference_manufacturer
    FROM hits h
    WHERE h.part_kind = 'oem' AND h.interchange_group_id IS NOT NULL
    ORDER BY h.interchange_group_id, h.tier ASC
  )
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
    h.evidence_url
  FROM hits h
  LEFT JOIN sister ON true
  LEFT JOIN oem_ref ON oem_ref.interchange_group_id = h.interchange_group_id;
$$;

REVOKE ALL ON FUNCTION public.parts_for_vehicle(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.parts_for_vehicle(uuid, uuid, integer) TO service_role;

REVOKE ALL ON FUNCTION public.save_guided_part(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_guided_part(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.save_guided_part(p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_variant uuid := NULLIF(p_input->>'variantId', '')::uuid;
  v_op text := upper(trim(coalesce(p_input->>'componentOpCode', '')));
  v_from integer := NULLIF(p_input->>'yearFrom', '')::integer;
  v_to integer := NULLIF(p_input->>'yearTo', '')::integer;
  v_ticked uuid[];
  v_position text := NULLIF(trim(coalesce(p_input->>'position', '')), '');
  v_evidence text := NULLIF(btrim(coalesce(p_input->>'evidenceUrl', '')), '');
  v_note text := NULLIF(btrim(coalesce(p_input->>'note', '')), '');
  v_actor uuid := NULLIF(p_input->>'verifiedBy', '')::uuid;
  v_group uuid := NULLIF(p_input->>'groupId', '')::uuid;
  v_component uuid;
  v_category uuid;
  v_part jsonb;
  v_kind text;
  v_mfr text;
  v_number text;
  v_name text;
  v_part_id uuid;
  v_existing_group uuid;
  v_old uuid;
  v_scope text;
  v_listed uuid;
BEGIN
  IF v_variant IS NULL THEN
    RAISE EXCEPTION 'Choose a vehicle';
  END IF;
  IF v_evidence IS NULL THEN
    RAISE EXCEPTION 'A verified part needs a source link';
  END IF;
  IF v_op <> '' THEN
    SELECT id INTO v_component FROM public.maintenance_service_categories WHERE op_code = v_op;
    IF v_component IS NULL THEN
      RAISE EXCEPTION 'That job is not in the catalog';
    END IF;
  END IF;
  IF jsonb_typeof(p_input->'parts') IS DISTINCT FROM 'array' OR jsonb_array_length(p_input->'parts') = 0 THEN
    RAISE EXCEPTION 'Add at least one part number';
  END IF;
  IF p_input ? 'tickedVariantIds' AND jsonb_typeof(p_input->'tickedVariantIds') = 'array' THEN
    SELECT COALESCE(array_agg(value::uuid), ARRAY[]::uuid[])
    INTO v_ticked
    FROM jsonb_array_elements_text(p_input->'tickedVariantIds') AS value;
  END IF;

  v_category := NULLIF(p_input->>'categoryId', '')::uuid;
  IF v_category IS NULL AND v_op <> '' THEN
    v_category := public.guided_category_id(v_op);
  END IF;
  IF v_category IS NULL THEN
    RAISE EXCEPTION 'Choose a job or a category';
  END IF;

  FOR v_part IN SELECT value FROM jsonb_array_elements(p_input->'parts') AS value
  LOOP
    v_mfr := NULLIF(btrim(coalesce(v_part->>'manufacturer', '')), '');
    v_number := NULLIF(btrim(coalesce(v_part->>'partNumber', '')), '');
    v_name := COALESCE(NULLIF(btrim(coalesce(v_part->>'name', '')), ''), v_number);
    v_kind := lower(trim(coalesce(NULLIF(v_part->>'kind', ''), 'oem')));
    IF v_mfr IS NULL OR v_number IS NULL THEN
      RAISE EXCEPTION 'Each part needs a brand and a part number';
    END IF;
    IF upper(v_mfr) = 'OEM SPEC' THEN
      RAISE EXCEPTION 'OEM spec is not a brand. Enter a real brand and part number';
    END IF;
    IF v_kind = 'factory' THEN v_kind := 'oem'; END IF;
    IF v_kind = 'supplier' THEN v_kind := 'oe_supplier'; END IF;
    IF v_kind = 'other' THEN v_kind := 'aftermarket'; END IF;
    IF v_kind NOT IN ('oem', 'oe_supplier', 'aftermarket') THEN
      RAISE EXCEPTION 'Choose factory, original supplier, or other brand';
    END IF;
    SELECT pm.id, pm.interchange_group_id
    INTO v_part_id, v_existing_group
    FROM public.part_master pm
    WHERE upper(coalesce(pm.manufacturer, '')) = upper(v_mfr)
      AND pm.oem_part_number_norm = upper(regexp_replace(v_number, '[^A-Za-z0-9]', '', 'g'))
      AND pm.oem_part_number_norm <> '';
    IF v_existing_group IS NOT NULL AND v_group IS NOT NULL AND v_existing_group <> v_group THEN
      RAISE EXCEPTION 'Those part numbers are already saved under different fits. Edit each one.';
    END IF;
    IF v_group IS NULL AND v_existing_group IS NOT NULL THEN
      v_group := v_existing_group;
    END IF;
  END LOOP;

  IF v_group IS NULL THEN
    v_scope := CASE WHEN v_op <> '' AND public.is_engine_level_op(v_op) THEN 'powertrain' ELSE 'body' END;
    INSERT INTO public.part_interchange_group (code, label, fit_scope)
    VALUES (
      'GD-' || COALESCE(NULLIF(v_op, ''), 'PART') || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
      COALESCE(NULLIF(v_op, ''), 'PART'),
      v_scope
    )
    RETURNING id INTO v_group;
  END IF;

  FOR v_part IN SELECT value FROM jsonb_array_elements(p_input->'parts') AS value
  LOOP
    v_mfr := btrim(v_part->>'manufacturer');
    v_number := btrim(v_part->>'partNumber');
    v_name := COALESCE(NULLIF(btrim(coalesce(v_part->>'name', '')), ''), v_number);
    v_kind := lower(trim(coalesce(NULLIF(v_part->>'kind', ''), 'oem')));
    IF v_kind = 'factory' THEN v_kind := 'oem'; END IF;
    IF v_kind = 'supplier' THEN v_kind := 'oe_supplier'; END IF;
    IF v_kind = 'other' THEN v_kind := 'aftermarket'; END IF;
    SELECT pm.id INTO v_part_id
    FROM public.part_master pm
    WHERE upper(coalesce(pm.manufacturer, '')) = upper(v_mfr)
      AND pm.oem_part_number_norm = upper(regexp_replace(v_number, '[^A-Za-z0-9]', '', 'g'));
    IF v_part_id IS NULL THEN
      INSERT INTO public.part_master (
        category_id, name, oem_part_number, manufacturer, part_kind,
        interchange_group_id, maintenance_component_id, evidence_url, verified_by, verified_at,
        catalog_decision, updated_at
      ) VALUES (
        v_category, v_name, v_number, v_mfr, v_kind,
        v_group, v_component, v_evidence, v_actor, now(),
        'confirmed', now()
      )
      RETURNING id INTO v_part_id;
    ELSE
      UPDATE public.part_master
      SET name = v_name,
          part_kind = v_kind,
          manufacturer = v_mfr,
          interchange_group_id = v_group,
          maintenance_component_id = COALESCE(v_component, maintenance_component_id),
          category_id = v_category,
          evidence_url = v_evidence,
          verified_by = v_actor,
          verified_at = now(),
          catalog_decision = 'confirmed',
          updated_at = now()
      WHERE id = v_part_id;
    END IF;
    IF coalesce(btrim(v_part->>'supersedes'), '') <> '' THEN
      SELECT pm.id INTO v_old
      FROM public.part_master pm
      WHERE pm.oem_part_number_norm = upper(regexp_replace(v_part->>'supersedes', '[^A-Za-z0-9]', '', 'g'))
        AND pm.id <> v_part_id
      LIMIT 1;
      IF v_old IS NOT NULL THEN
        INSERT INTO public.part_supersession (old_part_id, new_part_id)
        VALUES (v_old, v_part_id)
        ON CONFLICT DO NOTHING;
      END IF;
    END IF;
  END LOOP;

  INSERT INTO public.part_listing (
    interchange_group_id, vehicle_catalog_id, position, year_from, year_to, evidence_url, note, verified_by
  ) VALUES (
    v_group, v_variant, v_position, v_from, v_to, v_evidence, v_note, v_actor
  )
  ON CONFLICT (interchange_group_id, vehicle_catalog_id, COALESCE(position, ''))
  DO UPDATE SET
    year_from = COALESCE(EXCLUDED.year_from, part_listing.year_from),
    year_to = COALESCE(EXCLUDED.year_to, part_listing.year_to),
    evidence_url = EXCLUDED.evidence_url,
    note = EXCLUDED.note,
    verified_by = EXCLUDED.verified_by,
    verified_at = now();

  IF v_ticked IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM unnest(v_ticked) AS picked(id)
      JOIN public.vehicle_catalog other ON other.id = picked.id
      JOIN public.vehicle_catalog mine ON mine.id = v_variant
      WHERE lower(coalesce(other.make, '')) IS DISTINCT FROM lower(coalesce(mine.make, ''))
         OR lower(coalesce(other.model, '')) IS DISTINCT FROM lower(coalesce(mine.model, ''))
    ) THEN
      RAISE EXCEPTION 'Also listed for must be the same make and model';
    END IF;
    FOREACH v_listed IN ARRAY v_ticked
    LOOP
      IF v_listed IS DISTINCT FROM v_variant THEN
        INSERT INTO public.part_listing (
          interchange_group_id, vehicle_catalog_id, position, year_from, year_to, evidence_url, note, verified_by
        ) VALUES (
          v_group, v_listed, v_position, v_from, v_to, v_evidence, v_note, v_actor
        )
        ON CONFLICT (interchange_group_id, vehicle_catalog_id, COALESCE(position, ''))
        DO UPDATE SET
          year_from = COALESCE(EXCLUDED.year_from, part_listing.year_from),
          year_to = COALESCE(EXCLUDED.year_to, part_listing.year_to),
          evidence_url = EXCLUDED.evidence_url,
          note = EXCLUDED.note,
          verified_by = EXCLUDED.verified_by,
          verified_at = now();
      END IF;
    END LOOP;
  END IF;

  IF NULLIF(p_input->>'groupId', '') IS NOT NULL AND v_ticked IS NOT NULL THEN
    DELETE FROM public.part_listing pl
    USING public.vehicle_catalog other, public.vehicle_catalog mine
    WHERE pl.interchange_group_id = v_group
      AND pl.vehicle_catalog_id = other.id
      AND mine.id = v_variant
      AND pl.vehicle_catalog_id IS DISTINCT FROM v_variant
      AND NOT (pl.vehicle_catalog_id = ANY (v_ticked))
      AND lower(coalesce(other.make, '')) = lower(coalesce(mine.make, ''))
      AND lower(coalesce(other.model, '')) = lower(coalesce(mine.model, ''));
  END IF;

  PERFORM public.refresh_variant_parts_readiness();
  RETURN jsonb_build_object('ok', true, 'groupId', v_group);
END;
$$;
DROP FUNCTION IF EXISTS public.listing_reach_preview(uuid, text, uuid[]);

CREATE OR REPLACE FUNCTION public.listing_reach_preview(
  p_variant uuid,
  p_ticked uuid[],
  p_op text,
  p_group uuid,
  p_year_from integer,
  p_year_to integer
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scope AS (
    SELECT COALESCE(
      CASE
        WHEN p_group IS NOT NULL THEN (
          SELECT g.fit_scope FROM public.part_interchange_group g WHERE g.id = p_group
        )
        WHEN btrim(coalesce(p_op, '')) <> '' AND public.is_engine_level_op(p_op) THEN 'powertrain'
        ELSE 'body'
      END,
      'body'
    ) AS fit_scope
  ),
  listed AS (
    SELECT vc.id, vc.make, vc.model, vc.chassis_code, vc.engine_family_id, vc.platform_id,
           vc.production_start_year, vc.production_end_year
    FROM public.vehicle_catalog vc
    WHERE vc.id = p_variant
       OR vc.id = ANY (COALESCE(p_ticked, ARRAY[]::uuid[]))
  ),
  family AS (
    SELECT cat.id AS cat_id, p.id AS platform_id
    FROM public.vehicle_catalog cat
    LEFT JOIN public.vehicle_platform mine ON mine.id = cat.platform_id
    JOIN public.vehicle_platform p ON p.id = cat.platform_id
      OR p.id = mine.parent_id
      OR p.parent_id = cat.platform_id
      OR (mine.parent_id IS NOT NULL AND p.parent_id = mine.parent_id)
  ),
  scored AS (
    SELECT
      cat.id,
      trim(both ' ' FROM concat_ws(' ', cat.make, cat.model, nullif(trim(cat.chassis_code), '')))
        || CASE
          WHEN cat.production_start_year IS NULL AND cat.production_end_year IS NULL THEN ''
          WHEN cat.production_start_year IS NOT DISTINCT FROM cat.production_end_year
            THEN ' (' || cat.production_start_year::text || ')'
          ELSE ' (' || concat_ws('–', cat.production_start_year::text, cat.production_end_year::text) || ')'
        END AS label,
      MIN(
        CASE
          WHEN listed.id = cat.id
            AND (
              p_year_from IS NULL OR cat.production_end_year IS NULL OR cat.production_end_year >= p_year_from
            )
            AND (
              p_year_to IS NULL OR cat.production_start_year IS NULL OR cat.production_start_year <= p_year_to
            ) THEN 1
          WHEN lower(listed.make) = lower(cat.make)
            AND lower(listed.model) = lower(cat.model)
            AND upper(trim(coalesce(listed.chassis_code, ''))) = upper(trim(coalesce(cat.chassis_code, '')))
            AND (
              (SELECT fit_scope FROM scope) IS DISTINCT FROM 'powertrain'
              OR listed.engine_family_id IS NOT DISTINCT FROM cat.engine_family_id
            )
            AND (
              p_year_from IS NULL OR cat.production_end_year IS NULL OR cat.production_end_year >= p_year_from
            )
            AND (
              p_year_to IS NULL OR cat.production_start_year IS NULL OR cat.production_start_year <= p_year_to
            ) THEN 1
          WHEN EXISTS (
            SELECT 1 FROM family f
            WHERE f.cat_id = cat.id AND f.platform_id = listed.platform_id
          )
            AND (
              (SELECT fit_scope FROM scope) IS DISTINCT FROM 'powertrain'
              OR listed.engine_family_id IS NOT DISTINCT FROM cat.engine_family_id
            )
            AND (
              p_year_from IS NULL OR cat.production_end_year IS NULL OR cat.production_end_year >= p_year_from
            )
            AND (
              p_year_to IS NULL OR cat.production_start_year IS NULL OR cat.production_start_year <= p_year_to
            ) THEN 2
          WHEN (SELECT fit_scope FROM scope) = 'powertrain'
            AND listed.engine_family_id IS NOT NULL
            AND listed.engine_family_id = cat.engine_family_id
            AND NOT EXISTS (
              SELECT 1 FROM family f
              WHERE f.cat_id = cat.id AND f.platform_id = listed.platform_id
            ) THEN 3
          ELSE NULL
        END
      ) AS tier
    FROM public.vehicle_catalog cat
    JOIN listed ON true
    GROUP BY cat.id, cat.make, cat.model, cat.chassis_code, cat.production_start_year, cat.production_end_year
  )
  SELECT jsonb_build_object(
    'sister', COALESCE((
      SELECT jsonb_agg(label ORDER BY label) FROM (SELECT DISTINCT label FROM scored WHERE tier = 2) s
    ), '[]'::jsonb),
    'engine', COALESCE((
      SELECT jsonb_agg(label ORDER BY label) FROM (SELECT DISTINCT label FROM scored WHERE tier = 3) s
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.listing_reach_preview(uuid, uuid[], text, uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.listing_reach_preview(uuid, uuid[], text, uuid, integer, integer) TO service_role;
-- Belta SCP92 is the 1.3 L 2SZ-FE. KSP92 is the 1.0 L 1KR-FE.
-- Source: https://www.toyota.co.jp/jpn/company/history/75years/vehicle_lineage/car/id60012570/index.html
UPDATE public.vehicle_catalog vc
SET engine_code = '2SZ-FE',
    engine_family_id = ef.id,
    engine_displacement_cc = 1296,
    engine_displacement_l = 1.3,
    engine_configuration = 'Inline-4'
FROM public.engine_family ef
WHERE upper(ef.code) = '2SZ-FE'
  AND lower(vc.make) = 'toyota'
  AND lower(vc.model) = 'belta'
  AND upper(coalesce(vc.chassis_code, '')) = 'SCP92';

INSERT INTO public.vehicle_platform (code, label, maker)
SELECT 'KSP92', 'KSP92 — Toyota Belta', 'Toyota'
WHERE NOT EXISTS (
  SELECT 1 FROM public.vehicle_platform WHERE maker = 'Toyota' AND code = 'KSP92'
);

INSERT INTO public.vehicle_catalog (
  make, model, year, chassis_code, engine_code,
  engine_displacement_cc, engine_displacement_l, engine_configuration,
  fuel_type, transmission, drivetrain, body_type, vehicle_class,
  production_start_year, production_end_year, platform_id, engine_family_id
)
SELECT
  src.make,
  src.model,
  COALESCE(src.year, 2005),
  'KSP92',
  '1KR-FE',
  996,
  1.0,
  'Inline-3',
  src.fuel_type,
  COALESCE(NULLIF(btrim(src.transmission), ''), 'CVT'),
  COALESCE(NULLIF(btrim(src.drivetrain), ''), '2WD'),
  src.body_type,
  src.vehicle_class,
  2005,
  2012,
  plat.id,
  ef.id
FROM public.vehicle_catalog src
JOIN public.engine_family ef ON upper(ef.code) = '1KR-FE'
JOIN public.vehicle_platform plat ON plat.maker = 'Toyota' AND plat.code = 'KSP92'
WHERE lower(src.make) = 'toyota'
  AND lower(src.model) = 'belta'
  AND upper(coalesce(src.chassis_code, '')) = 'SCP92'
  AND NOT EXISTS (
    SELECT 1
    FROM public.vehicle_catalog existing
    WHERE lower(existing.make) = 'toyota'
      AND lower(existing.model) = 'belta'
      AND upper(coalesce(existing.chassis_code, '')) = 'KSP92'
  )
LIMIT 1;

-- D1: MANN-FILTER HU 6006 z crosses Toyota 04152-40060.
-- https://www.mann-filter.com/en/catalog/search-results/product.html/hu6006z_mann-filter.html
DO $$
DECLARE
  v_roomy uuid;
  v_group uuid;
  v_evidence text;
BEGIN
  SELECT pl.vehicle_catalog_id, pl.interchange_group_id, pl.evidence_url
  INTO v_roomy, v_group, v_evidence
  FROM public.part_master pm
  JOIN public.part_listing pl ON pl.interchange_group_id = pm.interchange_group_id
  JOIN public.vehicle_catalog vc ON vc.id = pl.vehicle_catalog_id
  WHERE pm.oem_part_number_norm = '0415240060'
    AND pm.part_kind = 'oem'
    AND lower(vc.make) = 'toyota'
    AND lower(vc.model) = 'roomy'
    AND upper(coalesce(vc.chassis_code, '')) = 'M900A'
  ORDER BY pl.verified_at DESC NULLS LAST
  LIMIT 1;

  IF v_group IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.part_master
    WHERE interchange_group_id = v_group
      AND oem_part_number_norm = 'HU6006Z'
  ) THEN
    PERFORM public.save_guided_part(jsonb_build_object(
      'variantId', v_roomy,
      'groupId', v_group,
      'componentOpCode', 'ENG-OIL',
      'evidenceUrl', 'https://www.mann-filter.com/en/catalog/search-results/product.html/hu6006z_mann-filter.html',
      'parts', jsonb_build_array(
        jsonb_build_object(
          'manufacturer', 'MANN-FILTER',
          'partNumber', 'HU 6006 z',
          'name', 'Oil filter',
          'kind', 'aftermarket'
        )
      )
    ));
    UPDATE public.part_listing
    SET evidence_url = v_evidence
    WHERE interchange_group_id = v_group
      AND vehicle_catalog_id = v_roomy
      AND evidence_url IS DISTINCT FROM v_evidence;
  END IF;
END $$;

-- D2: real bottles and blades for the sizes already on the Roomy.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.spec_key WHERE key = 'engine_oil_grade') THEN
    PERFORM public.save_universal_part(jsonb_build_object(
      'specKey', 'engine_oil_grade', 'specValue', '0W-20',
      'manufacturer', 'Toyota', 'partNumber', '08880-WA001', 'name', 'Engine oil 0W-20 1 L',
      'evidenceUrl', 'https://autoparts.toyota.com/products/product/eo-sp-c5-0w-20-1l-08880wa001'
    ));
  END IF;
  IF EXISTS (SELECT 1 FROM public.spec_key WHERE key = 'wiper_driver_mm') THEN
    PERFORM public.save_universal_part(jsonb_build_object(
      'specKey', 'wiper_driver_mm', 'specValue', '525',
      'manufacturer', 'NWB', 'partNumber', '35-021R', 'name', 'Wiper blade 525 mm',
      'evidenceUrl', 'https://www.nwb.co.jp/product_e/aqua.html'
    ));
  END IF;
  IF EXISTS (SELECT 1 FROM public.spec_key WHERE key = 'wiper_passenger_mm') THEN
    PERFORM public.save_universal_part(jsonb_build_object(
      'specKey', 'wiper_passenger_mm', 'specValue', '475',
      'manufacturer', 'NWB', 'partNumber', '35-019R', 'name', 'Wiper blade 475 mm',
      'evidenceUrl', 'https://www.nwb.co.jp/product_e/aqua.html'
    ));
  END IF;
  IF EXISTS (SELECT 1 FROM public.spec_key WHERE key = 'wiper_rear_mm') THEN
    PERFORM public.save_universal_part(jsonb_build_object(
      'specKey', 'wiper_rear_mm', 'specValue', '350',
      'manufacturer', 'NWB', 'partNumber', '35-014R', 'name', 'Wiper blade 350 mm',
      'evidenceUrl', 'https://www.nwb.co.jp/product_e/aqua.html'
    ));
  END IF;
  IF EXISTS (SELECT 1 FROM public.spec_key WHERE key = 'transmission_fluid') THEN
    PERFORM public.save_universal_part(jsonb_build_object(
      'specKey', 'transmission_fluid', 'specValue', 'CVT Fluid FE',
      'manufacturer', 'Toyota', 'partNumber', '08886-02505', 'name', 'CVT Fluid FE 4 L',
      'evidenceUrl', 'https://parts.elmhursttoyota.com/oem-parts/toyota-genuine-toyota-cvt-fe-transmission-fluid-4-liters-4-22-quarts-888602505'
    ));
  END IF;
END $$;

-- D3: wipers and CVT fluid on the 4WD family. Both sources list M910A.
DO $$
DECLARE
  v_m910 uuid;
  v_row record;
BEGIN
  SELECT vc.id INTO v_m910
  FROM public.vehicle_catalog vc
  JOIN public.vehicle_platform child ON child.id = vc.platform_id
  JOIN public.vehicle_platform parent ON parent.id = child.parent_id
  WHERE lower(vc.make) = 'toyota'
    AND lower(vc.model) = 'roomy'
    AND upper(coalesce(vc.chassis_code, '')) = 'M910A'
    AND parent.label = 'Roomy / Tank / Thor / Justy · 4WD (M910)'
  ORDER BY vc.production_start_year NULLS LAST
  LIMIT 1;
  IF v_m910 IS NULL THEN
    RETURN;
  END IF;

  FOR v_row IN
    SELECT spec_key, value, evidence_url
    FROM (
      VALUES
        ('wiper_driver_mm', '525', 'https://wiper-wiper.com/2023/07/14/roomy/'),
        ('wiper_passenger_mm', '475', 'https://wiper-wiper.com/2023/07/14/roomy/'),
        ('wiper_rear_mm', '350', 'https://wiper-wiper.com/2023/07/14/roomy/'),
        ('transmission_fluid', 'CVT Fluid FE', 'http://www.toyota-club.net/files/techdata/ttx/tank.htm')
    ) AS seed(spec_key, value, evidence_url)
  LOOP
    IF EXISTS (SELECT 1 FROM public.spec_key WHERE key = v_row.spec_key) THEN
      PERFORM public.save_catalog_spec(jsonb_build_object(
        'variantId', v_m910,
        'specKey', v_row.spec_key,
        'value', v_row.value,
        'scope', 'platform',
        'evidenceUrl', v_row.evidence_url
      ));
    END IF;
  END LOOP;
END $$;

REVOKE ALL ON TABLE public.variant_parts_readiness FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.variant_parts_readiness TO service_role;
